import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

export const num = (value) => {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Business date in the station's timezone (IST), as YYYY-MM-DD. */
export const businessDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))

export const shiftDate = (dateKey, days) => {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** First and last date of a YYYY-MM month. */
export function monthRange(month) {
  const [year, m] = month.split('-').map(Number)
  const start = `${year}-${String(m).padStart(2, '0')}-01`
  const end = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10)
  return { start, end }
}

export async function audit(action, entity, entityId, details) {
  await prisma.auditLog.create({
    data: {
      action,
      entity,
      entityId: entityId ?? null,
      details: details ? JSON.stringify(details) : null,
    },
  })
}
