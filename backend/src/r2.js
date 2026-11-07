import { S3Client } from '@aws-sdk/client-s3'

const accountId = process.env.CF_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

export const R2_BUCKET = process.env.R2_BUCKET || 'tirap-docs'

const missing = [
  ['CF_ACCOUNT_ID', accountId],
  ['R2_ACCESS_KEY_ID', accessKeyId],
  ['R2_SECRET_ACCESS_KEY', secretAccessKey],
]
  .filter(([, value]) => !value || !String(value).trim())
  .map(([name]) => name)

/**
 * Uploads are only offered when every R2 variable is present. Callers must
 * check this flag and return 503 instead of signing a URL against `undefined`.
 */
export const r2Configured = missing.length === 0

if (!r2Configured) {
  console.warn(`[r2] File uploads unavailable: missing ${missing.join(', ')}.`)
} else if (!/^[a-f0-9]{32}$/i.test(accountId.trim())) {
  console.warn('[r2] CF_ACCOUNT_ID does not look like a Cloudflare account ID (expected 32 hex chars).')
}

export const r2 = new S3Client({
  region: 'auto',
  endpoint: accountId
    ? `https://${accountId.trim()}.r2.cloudflarestorage.com`
    : 'https://unconfigured.invalid',
  credentials: {
    accessKeyId: accessKeyId?.trim() ?? '',
    secretAccessKey: secretAccessKey?.trim() ?? '',
  },
})
