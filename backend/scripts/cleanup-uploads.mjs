#!/usr/bin/env node
/**
 * Delete pending uploads older than 24 hours.
 *
 * A `pending` row means the browser asked for a presigned URL but never
 * confirmed the upload. Those rows (and any object that did land) are orphans.
 *
 * Usage:
 *   node scripts/cleanup-uploads.mjs            # delete
 *   node scripts/cleanup-uploads.mjs --dry-run  # report only
 *
 * Safe to run from a Render cron job:
 *   node backend/scripts/cleanup-uploads.mjs
 */
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Load backend/.env no matter which directory the job is started from.
// Render cron runs `node backend/scripts/cleanup-uploads.mjs` from the repo root,
// where a bare `import 'dotenv/config'` would look for the wrong file.
const here = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(here, '../.env') })
config() // fallback for a .env in the current working directory

const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
const { prisma } = await import('../src/db.js')
const { r2, R2_BUCKET, r2Configured } = await import('../src/r2.js')

const dryRun = process.argv.includes('--dry-run')
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

// `pending` rows come from presigning: the browser asked but never confirmed.
// Server-side archives (tag === 'daily-report-csv') are excluded so an old
// invalid tag can never cost the station its archived register sheets.
// The tag check runs in JavaScript on purpose: in SQL, `tag <> 'daily-report-csv'`
// is NULL for a NULL tag, which would silently drop untagged rows from the result.
const candidates = await prisma.document.findMany({
  where: {
    status: 'pending',
    createdAt: { lt: cutoff },
  },
  select: { id: true, key: true, filename: true, createdAt: true, tag: true },
})

const stale = candidates.filter((doc) => doc.tag !== 'daily-report-csv')
const skippedArchives = candidates.length - stale.length
if (skippedArchives > 0) {
  console.log(`skipped ${skippedArchives} protected archive row(s) (${skippedArchives === 1 ? '1 row is' : 'rows are'} tagged daily-report-csv)`)
}

console.log(`pending rows older than 24h: ${stale.length}`)
for (const doc of stale) {
  console.log(` - ${doc.id} | ${doc.filename} | key=${doc.key}`)
}

if (dryRun || stale.length === 0) {
  await prisma.$disconnect()
  process.exit(0)
}

let objectsDeleted = 0
let rowsDeleted = 0

for (const doc of stale) {
  if (r2Configured) {
    try {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: doc.key }))
      objectsDeleted += 1
    } catch (error) {
      if (error?.name !== 'NoSuchKey' && error?.name !== 'NotFound') {
        console.error(`  could not delete ${doc.key}:`, error?.name)
        continue // keep the row so the next run retries
      }
    }
  }

  await prisma.document.delete({ where: { id: doc.id } })
  rowsDeleted += 1
}

console.log(`deleted objects: ${objectsDeleted}, rows: ${rowsDeleted}`)
await prisma.$disconnect()
