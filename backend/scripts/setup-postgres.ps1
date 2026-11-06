<#
.SYNOPSIS
  Create the Tirap PostgreSQL role + database and point backend/.env at it.

.DESCRIPTION
  Run this once after installing PostgreSQL. It asks for the password of the
  PostgreSQL superuser (usually `postgres`), generates a strong password for the
  application role, creates the `tirap` role and `tirap` database, writes the
  matching DATABASE_URL into backend/.env, then applies the Prisma schema and
  seeds the default rows.

  The superuser password is only held in memory for the duration of this script.
  It is never written to disk.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-postgres.ps1

.EXAMPLE
  $env:PGPASSWORD = 'superuser-password'
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-postgres.ps1 -SkipSeed
#>

[CmdletBinding()]
param(
  [string]$SuperUser = 'postgres',
  [string]$Database = 'tirap',
  [string]$AppUser = 'tirap',
  [string]$DbHost = 'localhost',
  [int]$Port = 5432,
  [switch]$SkipPush,
  [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'
$backend = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $backend '.env'
$envExample = Join-Path $backend '.env.example'

function Write-Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Write-Ok($message) { Write-Host "    $message" -ForegroundColor Green }
function Write-Warn($message) { Write-Host "    $message" -ForegroundColor Yellow }

# --------------------------------------------------------------------------
# 1. Locate psql.exe (prefer the newest installed PostgreSQL major version)
# --------------------------------------------------------------------------
function Find-Psql {
  $commands = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($commands) { return $commands[0].Source }

  $root = Join-Path $env:ProgramFiles 'PostgreSQL'
  if (Test-Path $root) {
    $candidate = Get-ChildItem $root -Directory |
      Where-Object { $_.Name -match '^\d+$' } |
      Sort-Object { [int]$_.Name } -Descending |
      ForEach-Object { Join-Path $_.FullName 'bin\psql.exe' } |
      Where-Object { Test-Path $_ } |
      Select-Object -First 1
    if ($candidate) { return $candidate }
  }
  throw 'psql.exe was not found. Install PostgreSQL or add its bin folder to PATH.'
}

$psql = Find-Psql
Write-Step "Using $psql"

# --------------------------------------------------------------------------
# 2. Collect the superuser password (never echoed, never written to disk)
# --------------------------------------------------------------------------
if ($env:PGPASSWORD) {
  $superPassword = $env:PGPASSWORD
  Write-Ok 'Using the password from the PGPASSWORD environment variable.'
} else {
  $secure = Read-Host -Prompt "Password for PostgreSQL superuser '$SuperUser'" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $superPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}
if ([string]::IsNullOrWhiteSpace($superPassword)) {
  throw 'A superuser password is required.'
}

# --------------------------------------------------------------------------
# 3. Helper: run SQL as the superuser and fail loudly
# --------------------------------------------------------------------------
function Invoke-SuperSql {
  param(
    [Parameter(Mandatory)] [string]$Sql,
    [string]$DatabaseName = 'postgres',
    [switch]$TuplesOnly
  )

  $arguments = @(
    '-X', '-q', '-v', 'ON_ERROR_STOP=1',
    '-h', $DbHost, '-p', "$Port", '-U', $SuperUser, '-d', $DatabaseName
  )
  if ($TuplesOnly) { $arguments += @('-t', '-A') }
  $arguments += @('-c', $Sql)

  $previous = $env:PGPASSWORD
  $env:PGPASSWORD = $superPassword
  try {
    $output = & $psql @arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "psql failed: $($output -join [Environment]::NewLine)"
    }
    return $output
  } finally {
    $env:PGPASSWORD = $previous
  }
}

# --------------------------------------------------------------------------
# 4. Generate the application password and create role + database
# --------------------------------------------------------------------------
function New-AppPassword {
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $bytes = [byte[]]::new(28)
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

Write-Step "Checking the server on ${DbHost}:${Port}"
$version = Invoke-SuperSql -Sql 'SHOW server_version;' -TuplesOnly
Write-Ok "Connected to PostgreSQL $($version -join '')."

$appPassword = New-AppPassword

# The password only uses [A-Za-z0-9], so it is safe inside a SQL literal.
$roleSql = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$AppUser') THEN
    CREATE ROLE "$AppUser" LOGIN PASSWORD '$appPassword';
  ELSE
    ALTER ROLE "$AppUser" WITH LOGIN PASSWORD '$appPassword';
  END IF;
END
`$`$;
"@
Write-Step "Creating/updating role '$AppUser'"
Invoke-SuperSql -Sql $roleSql | Out-Null
Write-Ok "Role '$AppUser' is ready."

$dbExists = @(Invoke-SuperSql -TuplesOnly -Sql "SELECT 1 FROM pg_database WHERE datname = '$Database';").Count -gt 0
if ($dbExists) {
  Write-Warn "Database '$Database' already exists; keeping its data."
} else {
  Write-Step "Creating database '$Database' owned by '$AppUser'"
  Invoke-SuperSql -Sql "CREATE DATABASE `"$Database`" OWNER `"$AppUser`" ENCODING 'UTF8';" | Out-Null
  Write-Ok "Database '$Database' created."
}

Write-Step "Granting schema privileges to '$AppUser'"
$grantSql = @"
GRANT ALL PRIVILEGES ON DATABASE "$Database" TO "$AppUser";
ALTER SCHEMA public OWNER TO "$AppUser";
GRANT ALL ON SCHEMA public TO "$AppUser";
"@
Invoke-SuperSql -DatabaseName $Database -Sql $grantSql | Out-Null
Write-Ok 'Privileges granted.'

# --------------------------------------------------------------------------
# 5. Write DATABASE_URL into backend/.env
# --------------------------------------------------------------------------
$databaseUrl = "postgresql://${AppUser}:${appPassword}@${DbHost}:${Port}/${Database}?schema=public"

if (-not (Test-Path $envFile)) {
  if (Test-Path $envExample) {
    Copy-Item $envExample $envFile
    Write-Ok 'Created backend/.env from .env.example.'
  } else {
    New-Item -ItemType File -Path $envFile | Out-Null
  }
}

$lines = Get-Content $envFile
$urlLine = 'DATABASE_URL="' + $databaseUrl + '"'
$replaced = $false
$updated = foreach ($line in $lines) {
  if ($line -match '^\s*DATABASE_URL\s*=') {
    $replaced = $true
    $urlLine
  } else {
    $line
  }
}
if (-not $replaced) { $updated = @($updated) + $urlLine }
Set-Content -Path $envFile -Value $updated -Encoding ASCII
Write-Ok 'backend/.env now points at PostgreSQL.'

Write-Host ''
Write-Host 'DATABASE_URL written to backend/.env (password hidden):' -ForegroundColor DarkGray
$maskedUrl = "postgresql://${AppUser}:********@${DbHost}:${Port}/${Database}?schema=public"
Write-Host "  $maskedUrl" -ForegroundColor DarkGray
Write-Host ''

# --------------------------------------------------------------------------
# 6. Apply the schema and seed
# --------------------------------------------------------------------------
Push-Location $backend
try {
  if (-not $SkipPush) {
    Write-Step 'Generating the Prisma client'
    & npx prisma generate
    if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed.' }

    Write-Step 'Pushing the schema to PostgreSQL'
    & npx prisma db push
    if ($LASTEXITCODE -ne 0) { throw 'prisma db push failed.' }
  }

  if (-not $SkipSeed) {
    Write-Step 'Seeding the owner account and masters'
    & node src/seed.js
    if ($LASTEXITCODE -ne 0) { throw 'The seed script failed.' }
  }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'PostgreSQL is ready. Start the API with:' -ForegroundColor Green
Write-Host '  cd backend' -ForegroundColor Green
Write-Host '  npm run dev' -ForegroundColor Green
