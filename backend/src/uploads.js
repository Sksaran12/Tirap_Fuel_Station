import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { r2, R2_BUCKET, r2Configured } from './r2.js'
import { prisma, audit } from './db.js'

// ─── limits ────────────────────────────────────────────────────────────────

const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB
const PRESIGN_TTL_SECONDS = 300
const DOWNLOAD_TTL_SECONDS = 900
const PRESIGN_LIMIT = 20
const PRESIGN_WINDOW_MS = 10 * 60 * 1000

// The extension comes from the validated content type, never from the filename,
// so a file called "invoice.exe" cannot be stored under an .exe extension.
const EXTENSION_BY_TYPE = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}
const ALLOWED_TYPES = Object.keys(EXTENSION_BY_TYPE)

// ─── schemas ───────────────────────────────────────────────────────────────

const presignSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().refine((type) => ALLOWED_TYPES.includes(type), {
    message: `Allowed types: ${ALLOWED_TYPES.join(', ')}`,
  }),
  size: z.number().int().min(1).max(MAX_SIZE_BYTES, {
    message: 'File must be under 20 MB.',
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tag: z.string().trim().max(80).optional(),
})

// The browser may only name a pending row. Everything else is server-owned.
const confirmSchema = z.object({ id: z.string().trim().min(1).max(64) })

// ─── helpers ───────────────────────────────────────────────────────────────

function unavailable(res) {
  return res.status(503).json({ error: 'File storage is not configured.' })
}

function safeFilename(name) {
  const base = path.basename(name.trim()).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
  return base.slice(0, 200) || 'file'
}

// RFC 6266-safe: ASCII only, no quotes or backslashes that break the header.
function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"`
}

function signatureMatches(buffer, contentType) {
  const startsWith = (...bytes) => bytes.every((byte, index) => buffer[index] === byte)

  switch (contentType) {
    case 'application/pdf':
      return buffer.subarray(0, 5).toString('latin1') === '%PDF-'
    case 'image/jpeg':
      return startsWith(0xff, 0xd8, 0xff)
    case 'image/png':
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    case 'image/webp':
      return (
        buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
        buffer.subarray(8, 12).toString('latin1') === 'WEBP'
      )
    case 'application/msword':
      return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return startsWith(0x50, 0x4b, 0x03, 0x04) || startsWith(0x50, 0x4b, 0x05, 0x06)
    default:
      return false
  }
}

async function readFirstBytes(key, length = 16) {
  const response = await r2.send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key, Range: `bytes=0-${length - 1}` }),
  )
  const chunks = []
  for await (const chunk of response.Body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function discard(key) {
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
  } catch (error) {
    if (error?.name !== 'NoSuchKey' && error?.name !== 'NotFound') {
      console.error('[r2] could not delete object', key, error?.name)
    }
  }
}

// In-memory sliding window: one session cannot mint unlimited signed URLs.
const presignHits = new Map()

function allowPresign(userId) {
  const now = Date.now()
  const hits = (presignHits.get(userId) ?? []).filter((time) => now - time < PRESIGN_WINDOW_MS)
  if (hits.length >= PRESIGN_LIMIT) {
    presignHits.set(userId, hits)
    return false
  }
  hits.push(now)
  presignHits.set(userId, hits)

  if (presignHits.size > 1000) {
    for (const [key, times] of presignHits) {
      if (!times.some((time) => now - time < PRESIGN_WINDOW_MS)) presignHits.delete(key)
    }
  }
  return true
}

// ─── handlers ──────────────────────────────────────────────────────────────

/**
 * POST /api/uploads/presign
 * Creates a `pending` row, then signs a 5-minute PUT for a key the server
 * chose. The browser uploads the bytes straight to R2.
 */
export async function presignUpload(req, res) {
  if (!r2Configured) return unavailable(res)

  const parsed = presignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request.', issues: parsed.error.issues })
  }

  if (!allowPresign(req.user.id)) {
    res.set('Retry-After', String(Math.ceil(PRESIGN_WINDOW_MS / 1000)))
    return res.status(429).json({ error: 'Too many uploads. Try again later.' })
  }

  const { filename, contentType, size, date, tag } = parsed.data
  const day = date ?? new Date().toISOString().slice(0, 10)
  const key = `uploads/${day}/${randomUUID()}${EXTENSION_BY_TYPE[contentType]}`

  const doc = await prisma.document.create({
    data: { key, filename: safeFilename(filename), contentType, size, date: date ?? null, tag: tag ?? null },
  })

  try {
    const uploadUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: contentType, // must match the browser header exactly
        ContentLength: size, // signed: the object cannot exceed the declared size
      }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    )

    res.json({ id: doc.id, uploadUrl, key, expiresInSeconds: PRESIGN_TTL_SECONDS })
  } catch (error) {
    await prisma.document.delete({ where: { id: doc.id } }).catch(() => {})
    throw error
  }
}

/**
 * POST /api/uploads/confirm  { id }
 * Verifies what actually landed in R2, then flips pending → ready.
 */
export async function confirmUpload(req, res) {
  if (!r2Configured) return unavailable(res)

  const parsed = confirmSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request.' })

  const doc = await prisma.document.findUnique({ where: { id: parsed.data.id } })
  if (!doc) return res.status(404).json({ error: 'Upload not found.' })
  if (doc.status !== 'pending') {
    return res.status(409).json({ error: 'Upload was already confirmed.' })
  }

  let head
  try {
    head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: doc.key }))
  } catch (error) {
    if (error?.name === 'NotFound' || error?.name === 'NoSuchKey') {
      return res.status(409).json({ error: 'File was not uploaded to storage.' })
    }
    throw error
  }

  const actualSize = head.ContentLength ?? 0
  const actualType = (head.ContentType ?? '').split(';')[0].trim().toLowerCase()

  if (actualSize < 1 || actualSize > MAX_SIZE_BYTES) {
    await discard(doc.key)
    await prisma.document.delete({ where: { id: doc.id } })
    return res.status(413).json({ error: 'File is empty or larger than 20 MB.' })
  }

  if (actualType && actualType !== doc.contentType) {
    await discard(doc.key)
    await prisma.document.delete({ where: { id: doc.id } })
    return res.status(415).json({ error: 'Stored file type does not match what was declared.' })
  }

  try {
    const bytes = await readFirstBytes(doc.key)
    if (!signatureMatches(bytes, doc.contentType)) {
      await discard(doc.key)
      await prisma.document.delete({ where: { id: doc.id } })
      return res.status(415).json({ error: 'File content does not match its declared type.' })
    }
  } catch (error) {
    console.error('[r2] could not verify file signature', error?.name)
    return res.status(502).json({ error: 'Could not verify the uploaded file.' })
  }

  const ready = await prisma.document.update({
    where: { id: doc.id },
    data: { status: 'ready', size: actualSize, uploadedAt: new Date() },
  })

  await audit('document.upload', 'document', ready.id, {
    filename: ready.filename,
    key: ready.key,
    size: ready.size,
    date: ready.date,
  })

  res.status(201).json({ document: ready })
}

/** GET /api/uploads — only confirmed files are listed. */
export async function listUploads(req, res) {
  if (!r2Configured) return unavailable(res)

  const date = typeof req.query.date === 'string' ? req.query.date : undefined
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined

  const documents = await prisma.document.findMany({
    where: {
      status: 'ready',
      ...(date ? { date } : {}),
      ...(tag ? { tag } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ documents })
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

/** GET /api/uploads/:id/url — fresh 15-minute signed GET. */
export async function getDownloadUrl(req, res) {
  if (!r2Configured) return unavailable(res)

  const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
  if (!doc || doc.status !== 'ready') {
    return res.status(404).json({ error: 'Document not found.' })
  }

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: doc.key,
      ResponseContentDisposition: contentDisposition(doc.filename),
    }),
    { expiresIn: DOWNLOAD_TTL_SECONDS },
  )

  res.json({ url, expiresInSeconds: DOWNLOAD_TTL_SECONDS, document: doc })
}

/** DELETE /api/uploads/:id — removes the object (if any) and the row. */
export async function deleteUpload(req, res) {
  if (!r2Configured) return unavailable(res)

  const doc = await prisma.document.findUnique({ where: { id: req.params.id } })
  if (!doc) return res.status(404).json({ error: 'Document not found.' })

  await discard(doc.key)
  await prisma.document.delete({ where: { id: doc.id } })
  await audit('document.delete', 'document', doc.id, { filename: doc.filename })

  res.json({ ok: true })
}
