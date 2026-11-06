import { S3Client } from '@aws-sdk/client-s3'

if (!process.env.CF_ACCOUNT_ID) {
  console.warn('[r2] CF_ACCOUNT_ID not set — file uploads will be unavailable.')
}

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
})

export const R2_BUCKET = process.env.R2_BUCKET ?? 'tirap-docs'

