import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { login, logout, me, changePassword, requireAuth } from './auth.js'
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
app.use(express.json({ limit: '200kb' }))
app.use(cookieParser())
app.use(
  cors({
    origin: ORIGIN,
    credentials: true,
  }),
)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

/**
 * Liveness + database readiness. The DB probe is a real round-trip through
 * Prisma, so a stale DATABASE_URL or a stopped database is reported as 503
 * instead of a misleading 200.
 */
app.get('/api/health', async (req, res) => {
  const url = process.env.DATABASE_URL || ''
  const engine = url.startsWith('postgres') ? 'PostgreSQL' : url.startsWith('file:') ? 'SQLite' : 'unknown'
  const started = Date.now()

  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      ok: true,
      service: 'tirap-api',
      db: { engine, status: 'connected', latencyMs: Date.now() - started },
      time: new Date().toISOString(),
    })
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: 'tirap-api',
      db: { engine, status: 'unreachable', latencyMs: Date.now() - started },
      error: 'Database connection failed.',
      time: new Date().toISOString(),
    })
  }
})

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

// Built frontend (npm run build), when present.
const dist = path.resolve(__dirname, '../../dist')
app.use(express.static(dist))
app.get(/^(?!\/api).*/, (req, res, next) => {
  res.sendFile(path.join(dist, 'index.html'), (error) => {
    if (error) next()
  })
})

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
