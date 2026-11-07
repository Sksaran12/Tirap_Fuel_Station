import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { r2, R2_BUCKET } from './r2.js'
import { prisma, audit } from './db.js'

// ─── allowed file types ────────────────────────────────────────────────────

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
]

const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

// ─── schemas ───────────────────────────────────────────────────────────────

const presignSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().refine((t) => ALLOWED_TYPES.includes(t), {
    message: `Allowed types: ${ALLOWED_TYPES.join(', ')}`,
  }),
  size: z.number().int().min(1).max(MAX_SIZE_BYTES, {
    message: 'File must be under 20 MB.',
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tag: z.string().trim().max(80).optional(),
})

const confirmSchema = z.object({
  key: z.string().min(1).max(500),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().min(1).max(100),
  size: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tag: z.string().trim().max(80).optional(),
})

// ─── handlers ──────────────────────────────────────────────────────────────

/**
 * POST /api/uploads/presign
 * Returns a presigned S3 PUT URL valid for 5 minutes.
 * The browser uploads the file directly to R2 — bytes never touch this server.
 */
export async function presignUpload(req, res) {
  const parsed = presignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request.', issues: parsed.error.issues })
  }

  const { filename, contentType, size, date, tag } = parsed.data
  const ext = path.extname(filename).toLowerCase()
  const key = `uploads/${date ?? 'misc'}/${randomUUID()}${ext}`

  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn: 300 }, // 5 minutes
  )

  res.json({ uploadUrl, key, expiresInSeconds: 300 })
}

/**
 * POST /api/uploads/confirm
 * Called by the browser after a successful direct upload to R2.
 * Saves file metadata to the database.
 */
export async function confirmUpload(req, res) {
  const parsed = confirmSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request.', issues: parsed.error.issues })
  }

  const { key, filename, contentType, size, date, tag } = parsed.data

  const doc = await prisma.document.create({
    data: {
      key,
      filename,
      contentType,
      size,
      date: date ?? null,
      tag: tag ?? null,
    },
  })

  await audit('document.upload', 'document', doc.id, { filename: doc.filename, key: doc.key, date })
  res.status(201).json({ document: doc })
}

/**
 * GET /api/uploads
 * List all documents. Optional query param: ?date=YYYY-MM-DD
 */
export async function listUploads(req, res) {
  const date = typeof req.query.date === 'string' ? req.query.date : undefined
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined

  const docs = await prisma.document.findMany({
    where: {
      ...(date ? { date } : {}),
      ...(tag ? { tag } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ documents: docs })
}

/**
 * GET /api/uploads/day/:date/url
 * Generate a fresh presigned GET URL for downloading the day's archived report sheet.
 */
export async function getDayReportDownloadUrl(req, res) {
  const { date } = req.params
  const doc = await prisma.document.findFirst({
    where: { date, tag: 'daily-report-csv' },
    orderBy: { createdAt: 'desc' },
  })
  if (!doc) {
    return res.status(404).json({ error: `No archived report found for date ${date}.` })
  }

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: doc.key,
      ResponseContentDisposition: `attachment; filename="${doc.filename}"`,
    }),
    { expiresIn: 900 },
  )

  res.json({ url, filename: doc.filename, key: doc.key })
}

/**
 * GET /api/uploads/:id/url
 * Generate a fresh presigned GET URL (valid 15 min) for downloading a file.
 */
export async function getDownloadUrl(req, res) {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
  if (!doc) return res.status(404).json({ error: 'Document not found.' })

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: doc.key,
      ResponseContentDisposition: `attachment; filename="${doc.filename}"`,
    }),
    { expiresIn: 900 }, // 15 minutes
  )

  res.json({ url, expiresInSeconds: 900, document: doc })
}

/**
 * DELETE /api/uploads/:id
 * Deletes from R2 and removes the metadata row from the database.
 */
export async function deleteUpload(req, res) {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
  if (!doc) return res.status(404).json({ error: 'Document not found.' })

  // Remove from R2 first; if this fails, the DB row is preserved for retry.
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: doc.key }))
  await prisma.document.delete({ where: { id: doc.id } })
  await audit('document.delete', 'document', doc.id, { filename: doc.filename })

  res.json({ ok: true })
}

