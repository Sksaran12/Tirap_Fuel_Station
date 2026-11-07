import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { login, logout, me, changePassword, requireAuth } from './auth.js'
import { presignUpload, confirmUpload, listUploads, getDownloadUrl, getDayReportDownloadUrl, deleteUpload } from './uploads.js'
import { prisma } from './db.js'
import { getDay, saveDay, closeDay, reopenDay } from './day.js'
import {
  getSettings,
  putSettings,
  getStock,
  putStock,
  listExpenses,
  createExpense,
  deleteExpense,
  listCategories,
  createCategory,
  listCredit,
  createParty,
  updateParty,
  createTransaction,
  deleteTransaction,
  listLubeItems,
  createLubeItem,
  dashboard,
  getMonthReport,
  monthReportCsv,
  listAudit,
  HttpError,
} from './modules.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT) || 4000
const ORIGIN = process.env.APP_ORIGIN || 'http://localhost:5173'

app.disable('x-powered-by')
// Render terminates TLS and forwards the real client IP, so trust one hop.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)
app.use(express.json({ limit: '200kb' }))
app.use(cookieParser())
app.use(
  cors({
    origin: ORIGIN,
    credentials: true,
  }),
)

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Google Fonts stylesheet + React inline style attributes.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  // Direct browser uploads go to R2, a different origin.
  "connect-src 'self' https://*.r2.cloudflarestorage.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    res.setHeader('Content-Security-Policy', CSP)
  }
  next()
})

// ── Health Check (lightweight, no database dependency) ───────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'tirap-api',
    message: 'Tirap Fuel Station Backend Running',
    time: new Date().toISOString(),
  })
})

/**
 * Deep Readiness / Diagnostics probe (real round-trip through Prisma).
 * Accessible at GET /api/health (and GET /ready)
 */
const deepHealthHandler = async (req, res) => {
  const url = process.env.DATABASE_URL || ''
  const engine = url.startsWith('postgres') ? 'PostgreSQL' : url.startsWith('file:') ? 'SQLite' : 'unknown'
  const started = Date.now()

  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      ok: true,
      service: 'tirap-api',
      status: 'healthy',
      db: { engine, status: 'connected', latencyMs: Date.now() - started },
      time: new Date().toISOString(),
    })
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: 'tirap-api',
      status: 'degraded',
      db: { engine, status: 'unreachable', latencyMs: Date.now() - started },
      error: 'Database connection failed.',
      time: new Date().toISOString(),
    })
  }
}

app.get('/api/health', deepHealthHandler)
app.get('/ready', deepHealthHandler)

app.post('/api/auth/login', login)
app.post('/api/auth/logout', logout)
app.get('/api/auth/me', requireAuth, me)
app.post('/api/auth/password', requireAuth, changePassword)

app.use('/api', requireAuth)

app.get('/api/day/:date', getDay)
app.put('/api/day/:date', saveDay)
app.post('/api/day/:date/close', closeDay)
app.post('/api/day/:date/reopen', reopenDay)

app.get('/api/stock', getStock)
app.put('/api/stock/:date', putStock)

app.get('/api/expenses', listExpenses)
app.post('/api/expenses', createExpense)
app.delete('/api/expenses/:id', deleteExpense)
app.get('/api/expense-categories', listCategories)
app.post('/api/expense-categories', createCategory)

app.get('/api/credit', listCredit)
app.post('/api/credit/parties', createParty)
app.put('/api/credit/parties/:id', updateParty)
app.post('/api/credit/transactions', createTransaction)
app.delete('/api/credit/transactions/:id', deleteTransaction)

app.get('/api/lube-items', listLubeItems)
app.post('/api/lube-items', createLubeItem)

app.get('/api/settings', getSettings)
app.put('/api/settings', putSettings)

app.get('/api/dashboard', dashboard)
app.get('/api/reports/monthly', getMonthReport)
app.get('/api/reports/monthly.csv', monthReportCsv)
app.get('/api/audit', listAudit)

// File attachments (Cloudflare R2 via presigned URLs)
app.post('/api/uploads/presign',         presignUpload)
app.post('/api/uploads/confirm',         confirmUpload)
app.get('/api/uploads',                  listUploads)
app.get('/api/uploads/day/:date/url',    getDayReportDownloadUrl)
app.get('/api/uploads/:id/url',          getDownloadUrl)
app.delete('/api/uploads/:id',           deleteUpload)

// 404 handler for unmatched routes (Pure API backend)
app.use((req, res) => res.status(404).json({ error: 'Not found.' }))

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  const status = error instanceof HttpError ? error.status : error.status || 500
  if (status >= 500) console.error(error)
  res.status(status).json({
    error: error.message || 'Something went wrong.',
    ...(error.extra ?? {}),
  })
})

app.listen(PORT, () => {
  console.log(`Tirap API on http://localhost:${PORT} (origin ${ORIGIN})`)
})

// Warm the pooler connection now, not on the first user request: a Supabase
// session-pooler connect can cost ~0.5-1 s, which the very first visitor (or a
// freshly deployed instance) would otherwise pay inside their first call.
prisma.$queryRaw`SELECT 1`.catch((error) => {
  console.warn('[warmup] initial DB ping failed (server still works):', error?.message?.slice(0, 120))
})
