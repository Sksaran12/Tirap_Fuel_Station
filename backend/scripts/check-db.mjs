#!/usr/bin/env node
/**
 * Diagnose DATABASE_URL before you deploy.
 *
 * Checks the URL shape (Supabase direct host, missing sslmode, pooler username)
 * and then runs a real query. Prints no secrets.
 *
 * Usage:
 *   cd backend
 *   npm run check:db
 */
import 'dotenv/config'
import { prisma } from '../src/db.js'

const url = process.env.DATABASE_URL || ''
let failed = false

const ok = (message) => console.log(`  OK   ${message}`)
const warn = (message) => console.log(`  WARN ${message}`)
const bad = (message) => { console.log(`  FAIL ${message}`); failed = true }

if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

let parsed
try {
  parsed = new URL(url)
} catch {
  console.error('DATABASE_URL is not a valid URL.')
  process.exit(1)
}

const host = parsed.hostname
const user = decodeURIComponent(parsed.username)
const isSupabase = host.endsWith('.supabase.co') || host.endsWith('.supabase.com')

console.log('DATABASE_URL')
ok(`host ${host}:${parsed.port || 5432}, database ${parsed.pathname.slice(1) || 'postgres'}`)

if (user.includes('.')) {
  ok(`pooler username "${user.split('.')[0]}.<project-ref>"`)
} else if (host.includes('pooler.supabase.com')) {
  bad(`pooler username must be "<role>.<project-ref>", got "${user}"`)
} else {
  ok(`username "${user}"`)
}

if (host.startsWith('db.') && host.endsWith('.supabase.co')) {
  bad('this is the Supabase DIRECT host (IPv6-only) — use the session pooler on port 5432')
}

if (isSupabase && !parsed.searchParams.get('sslmode')) {
  bad('Supabase requires SSL — add ?sslmode=require')
} else if (isSupabase) {
  ok(`sslmode=${parsed.searchParams.get('sslmode')}`)
}

if (parsed.port === '6543') {
  warn('transaction pooler: Prisma needs ?pgbouncer=true, and the CLI needs a separate direct URL')
}

console.log('\nConnection')
try {
  const [info] = await prisma.$queryRaw`
    SELECT current_database() AS db, current_user AS usr, version() AS version`
  ok(`connected to "${info.db}" as "${info.usr}"`)
  ok(info.version.split(',')[0])

  const [{ count }] = await prisma.$queryRaw`
    SELECT count(*)::int AS count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  if (count >= 19) ok(`${count} tables in the public schema`)
  else bad(`only ${count} tables — run "npx prisma db push"`)

  const [{ size }] = await prisma.$queryRaw`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS size`
  ok(`database size ${size}`)

  const [owner] = await prisma.user.findMany({ take: 1, select: { username: true } })
  if (owner) ok(`owner account "${owner.username}" exists`)
  else warn('no users yet — run "npm run db:seed"')
} catch (error) {
  bad(`${error.code || error.name}: ${error.message.split('\n')[0]}`)
}

console.log(failed ? '\nResult: fix the items above.' : '\nResult: database is ready.')
await prisma.$disconnect()
process.exit(failed ? 1 : 0)
