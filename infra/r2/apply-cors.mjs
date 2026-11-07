#!/usr/bin/env node
/**
 * Apply the R2 bucket CORS policy required for browser presigned PUT uploads.
 *
 * The browser uploads directly to:
 *   https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<bucket>/<key>
 * That is a different origin from the app, so the bucket must explicitly allow
 * the app origin, the PUT method and the Content-Type header.
 *
 * Usage (PowerShell):
 *   $env:CLOUDFLARE_API_TOKEN = '...'
 *   $env:CF_ACCOUNT_ID        = '...'   # same value the backend uses
 *   $env:R2_BUCKET            = 'tirap-docs'
 *   $env:APP_ORIGIN           = 'https://app.yourdomain.com'
 *   node infra/r2/apply-cors.mjs
 *
 * The account ID is read from CF_ACCOUNT_ID (the name backend/src/r2.js uses)
 * and falls back to R2_ACCOUNT_ID for compatibility with older notes.
 *
 * Optional origins (Render URL, local Vite):
 *   node infra/r2/apply-cors.mjs --extra-origin http://localhost:5173 `
 *        --extra-origin https://your-service.onrender.com
 *
 * Dry run (prints the API body, calls nothing):
 *   node infra/r2/apply-cors.mjs --dry-run
 *
 * Token permission: Account > Workers R2 Storage > Edit.
 * The token is read from the environment and is never written to disk.
 */

const { CLOUDFLARE_API_TOKEN, R2_BUCKET, APP_ORIGIN } = process.env

// backend/src/r2.js reads CF_ACCOUNT_ID; older docs used R2_ACCOUNT_ID.
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.R2_ACCOUNT_ID

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

const extraOrigins = []
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--extra-origin') {
    const value = args[index + 1]
    if (!value || value.startsWith('--')) fail('--extra-origin needs a value')
    extraOrigins.push(value)
  }
}

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

function assertOrigin(value, label) {
  // A bare origin only: scheme + host (+ optional port). No trailing slash, no path.
  if (!/^https?:\/\/[^/]+$/.test(value)) {
    fail(`${label} must be a bare origin, e.g. https://app.yourdomain.com`)
  }
}

if (!APP_ORIGIN) fail('APP_ORIGIN is required, e.g. https://app.yourdomain.com')
assertOrigin(APP_ORIGIN, 'APP_ORIGIN')

const origins = [APP_ORIGIN]
for (const origin of extraOrigins) {
  assertOrigin(origin, '--extra-origin')
  if (!origins.includes(origin)) origins.push(origin)
}

const body = {
  rules: [
    {
      allowed: {
        origins,
        // PUT is the upload; GET/HEAD are for previews and downloads.
        methods: ['PUT', 'GET', 'HEAD'],
        // The presigned PUT signs Content-Type, so the browser sends it.
        headers: ['Content-Type'],
      },
      exposeHeaders: ['ETag'],
      maxAgeSeconds: 3600,
    },
  ],
}

if (dryRun) {
  console.log(JSON.stringify(body, null, 2))
  process.exit(0)
}

if (!CLOUDFLARE_API_TOKEN) {
  fail('CLOUDFLARE_API_TOKEN is required (Account > Workers R2 Storage > Edit)')
}
if (!ACCOUNT_ID) fail('CF_ACCOUNT_ID is required (R2_ACCOUNT_ID also accepted)')
if (!R2_BUCKET) fail('R2_BUCKET is required')

const endpoint =
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}` +
  `/r2/buckets/${encodeURIComponent(R2_BUCKET)}/cors`

async function call(method) {
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    ...(method === 'PUT' ? { body: JSON.stringify(body) } : {}),
  })

  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }

  if (!response.ok || json?.success === false) {
    console.error(`Cloudflare responded ${response.status}`)
    console.error(JSON.stringify(json, null, 2))
    process.exit(1)
  }

  return json
}

console.log(`Applying CORS to bucket "${R2_BUCKET}" for: ${origins.join(', ')}`)
await call('PUT')

const current = await call('GET')
console.log('Current policy:')
console.log(JSON.stringify(current.result ?? current, null, 2))
console.log('\nDone. Run the OPTIONS preflight check in infra/r2/README.md.')
