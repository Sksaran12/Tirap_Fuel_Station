/** Business date helpers — the station runs on IST (PRD: daily close). */

const istDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const todayKey = () => istDate.format(new Date())

export const dateLabel = (key) => {
  if (!key) return ''
  const date = new Date(`${key}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export const weekdayLabel = (key) =>
  key
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(
        new Date(`${key}T00:00:00Z`),
      )
    : ''

export const monthKey = (key = todayKey()) => key.slice(0, 7)

export const monthLabel = (key) => {
  if (!key) return ''
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${key}-01T00:00:00Z`),
  )
}

export const addDays = (key, days) => {
  const date = new Date(`${key}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export const addMonths = (key, months) => {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + months, 1))
  return date.toISOString().slice(0, 7)
}

export const inr = (value, decimals = 0) =>
  Number(value ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

export const money = (value, decimals = 0) =>
  `₹${Number(value ?? 0) < 0 ? '−' : ''}${inr(Math.abs(Number(value ?? 0)), decimals)}`

export const litres = (value) =>
  `${Number(value ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} L`

export const qty = (value) =>
  Number(value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

export const percent = (value) => `${Number(value ?? 0).toFixed(1)}%`
