#!/usr/bin/env node
/**
 * Verify the Cloudflare R2 configuration in backend/.env.
 *
 * Checks, in order:
 *   1. every required variable is present
 *   2. the bucket exists and the API token can read it
 *   3. the browser CORS policy allows PUT from APP_ORIGIN
 *
 * Usage:
 *   cd backend
 *   npm run check:r2
 *
 * Prints no secrets. Exit code 1 means uploads will not work.
 */
import 'dotenv/config'
import { HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { r2, R2_BUCKET, r2Configured } from '../src/r2.js'

let failed = false
function ok(message) { console.log(`  OK   ${message}`) }
function warn(message) { console.log(`  WARN ${message}`) }
function bad(message) { console.log(`  FAIL ${message}`); failed = true }

console.log('R2 configuration')
if (r2Configured) {
  ok(`all variables present, bucket "${R2_BUCKET}"`)
} else {
  bad('missing credentials or bucket name — see backend/.env.example')
}

if (r2Configured) {
  console.log('\nBucket access')
  try {
    await r2.send(new HeadBucketCommand({ Bucket: R2_BUCKET }))
    ok('HeadBucket succeeded (bucket exists, token is valid)')
  } catch (error) {
    bad(`HeadBucket failed: ${error.name}`)
  }

  try {
    const list = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 }))
    ok(`ListObjectsV2 succeeded (${list.KeyCount ?? 0} object(s) returned in probe)`)
  } catch (error) {
    bad(`ListObjectsV2 failed: ${error.name}`)
  }

  console.log('\nBrowser CORS (needed for direct uploads)')
  const origin = process.env.APP_ORIGIN
  if (!origin) {
    bad('APP_ORIGIN is not set, cannot probe the preflight')
  } else {
    const endpoint =
      `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/` +
      `${R2_BUCKET}/cors-probe.txt`
    try {
      const response = await fetch(endpoint, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type',
        },
      })
      const allowedOrigin = response.headers.get('access-control-allow-origin')
      const allowedMethods = response.headers.get('access-control-allow-methods') ?? ''
      if (allowedOrigin === origin && allowedMethods.toUpperCase().includes('PUT')) {
        ok(`preflight allows ${origin}`)
      } else if (allowedOrigin) {
        bad(`preflight returned ${allowedOrigin} / ${allowedMethods}`)
      } else {
        bad(`preflight for ${origin} returned ${response.status} without Access-Control-Allow-Origin`)
        console.log('       Apply the policy: npm run r2:cors (from the repo root)')
      }
    } catch (error) {
      bad(`preflight request failed: ${error.message}`)
    }
  }
}

console.log(failed ? '\nResult: uploads are NOT ready.' : '\nResult: uploads are ready.')
process.exit(failed ? 1 : 0)
