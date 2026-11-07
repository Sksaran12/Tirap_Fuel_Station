import { z } from 'zod'
import { prisma, num, audit, isDateKey, monthRange, businessDate } from './db.js'
import { computedFor, ensureDay, settingsShape } from './day.js'

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

/** Closed days are immutable without an explicit reopen (PRD §9). */
async function assertOpen(date) {
  if (!isDateKey(date)) throw new HttpError(400, 'Date must be YYYY-MM-DD.')
  const report = await prisma.dailyReport.findUnique({ where: { date } })
  if (report?.status === 'closed') {
    throw new HttpError(409, `${date} is closed. Reopen it before making changes.`)
  }
}

const money = z.number().min(0).max(100000000)

/* ------------------------------- settings ------------------------------- */

export async function getSettings(req, res) {
  const setting = await prisma.setting.findUnique({ where: { id: 1 } })
  res.json({ settings: settingsShape(setting), row: setting })
}

const settingsSchema = z.object({
  rounding: z.enum(['paper', 'exact']),
  marginMS: z.number().min(0).max(1000),
  marginHSD: z.number().min(0).max(1000),
  lubeMargin: z.number().min(-100).max(500),
  stockLossValuation: z.enum(['cost', 'selling']),
  costMS: z.number().min(0).max(1000),
  costHSD: z.number().min(0).max(1000),
  varianceLimit: z.number().min(0).max(100000),
  maxMeterDigits: z.number().int().min(3).max(10),
  stationName: z.string().trim().min(1).max(80),
})

export async function putSettings(req, res) {
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, 'Invalid settings.', { issues: parsed.error.issues })
  const row = await prisma.setting.upsert({
    where: { id: 1 },
    update: parsed.data,
    create: { id: 1, ...parsed.data },
  })
  await audit('settings.update', 'settings', '1', parsed.data)
  res.json({ settings: settingsShape(row), row })
}

/* --------------------------------- stock -------------------------------- */

export async function getStock(req, res) {
  const date = req.query.date || businessDate()
  res.json(await stockPayload(date))
}

async function stockPayload(date) {
  const report = await ensureDay(date)
  const [tankDays, receipts, tanks] = await Promise.all([
    prisma.tankDay.findMany({ where: { dailyReportId: report.id }, include: { tank: true } }),
    prisma.stockReceipt.findMany({ where: { date }, include: { tank: true }, orderBy: { createdAt: 'asc' } }),
    prisma.tank.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ])
  const { computed } = await computedFor(report)
  return {
    date,
    status: report.status,
    tanks: tanks.map((tank) => {
      const day = tankDays.find((row) => row.tankId === tank.id)
      return {
        tankId: tank.id,
        name: tank.name,
        product: tank.product,
        opening: num(day?.opening),
        receipts: num(day?.receipts),
        dip: num(day?.dip),
      }
    }),
    receipts: receipts.map((row) => ({
      id: row.id,
      tankId: row.tankId,
      tankName: row.tank.name,
      invoice: row.invoice,
      litres: num(row.litres),
      amount: num(row.amount),
    })),
    computed,
  }
}

const stockSchema = z.object({
  tanks: z.array(
    z.object({
      tankId: z.string(),
      opening: z.number().min(0),
      receipts: z.number().min(0),
      dip: z.number().min(0),
    }),
  ),
  receipts: z
    .array(
      z.object({
        tankId: z.string(),
        invoice: z.string().trim().max(60).optional().default(''),
        litres: z.number().min(0),
        amount: z.number().min(0),
      }),
    )
    .optional(),
})

export async function putStock(req, res) {
  const date = req.params.date
  await assertOpen(date)
  const parsed = stockSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, 'Invalid stock values.', { issues: parsed.error.issues })

  const report = await ensureDay(date)

  await prisma.$transaction(async (tx) => {
    for (const tank of parsed.data.tanks) {
      await tx.tankDay.upsert({
        where: { dailyReportId_tankId: { dailyReportId: report.id, tankId: tank.tankId } },
        update: { opening: tank.opening, receipts: tank.receipts, dip: tank.dip },
        create: {
          dailyReportId: report.id,
          tankId: tank.tankId,
          opening: tank.opening,
          receipts: tank.receipts,
          dip: tank.dip,
        },
      })
    }

    if (parsed.data.receipts) {
      await tx.stockReceipt.deleteMany({ where: { date } })
      if (parsed.data.receipts.length) {
        await tx.stockReceipt.createMany({
          data: parsed.data.receipts.map((row) => ({
            date,
            tankId: row.tankId,
            invoice: row.invoice || null,
            litres: row.litres,
            amount: row.amount,
          })),
        })
      }
    }
  })

  const fresh = await prisma.dailyReport.findUnique({ where: { id: report.id } })
  const { computed } = await computedFor(fresh)
  await prisma.dailyReport.update({ where: { id: report.id }, data: { totals: computed } })
  await audit('stock.save', 'day', date, { date })

  res.json(await stockPayload(date))
}

/* ------------------------------- expenses ------------------------------- */

export async function listExpenses(req, res) {
  const { date, month } = req.query
  const where = date ? { date } : month ? { date: { gte: `${month}-01`, lte: `${month}-31` } } : {}
  const rows = await prisma.expense.findMany({
    where,
    include: { category: true },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: date ? 100 : 500,
  })
  res.json({
    expenses: rows.map((row) => ({
      id: row.id,
      date: row.date,
      categoryId: row.categoryId,
      category: row.category.name,
      type: row.type,
      details: row.details ?? '',
      amount: num(row.amount),
    })),
  })
}

const expenseSchema = z.object({
  date: z.string(),
  categoryId: z.string(),
  type: z.enum(['running', 'one-off']),
  details: z.string().trim().max(160).optional().default(''),
  amount: money,
})

export async function createExpense(req, res) {
  const parsed = expenseSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, 'Invalid expense.', { issues: parsed.error.issues })
  await assertOpen(parsed.data.date)
  // Attach the expense to its day when the day has already been opened, so the
  // row participates in the daily report relation while keeping the standalone
  // Expenses screen usable on a date with no report yet.
  const day = await prisma.dailyReport.findUnique({
    where: { date: parsed.data.date },
    select: { id: true },
  })
  const row = await prisma.expense.create({
    data: { ...parsed.data, dailyReportId: day?.id ?? null },
    include: { category: true },
  })
  await audit('expense.create', 'expense', row.id, parsed.data)
  res.status(201).json({
    expense: {
      id: row.id,
      date: row.date,
      categoryId: row.categoryId,
      category: row.category.name,
      type: row.type,
      details: row.details ?? '',
      amount: num(row.amount),
    },
  })
}

export async function deleteExpense(req, res) {
  const row = await prisma.expense.findUnique({ where: { id: req.params.id } })
  if (!row) throw new HttpError(404, 'Expense not found.')
  await assertOpen(row.date)
  await prisma.expense.delete({ where: { id: row.id } })
  await audit('expense.delete', 'expense', row.id, { date: row.date, amount: num(row.amount) })
  res.json({ ok: true })
}

export async function listCategories(req, res) {
  const rows = await prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  res.json({ categories: rows })
}

export async function createCategory(req, res) {
  const name = z.string().trim().min(1).max(40).safeParse(req.body?.name)
  if (!name.success) throw new HttpError(400, 'Category name is required.')
  const row = await prisma.expenseCategory.upsert({
    where: { name: name.data },
    update: { active: true },
    create: { name: name.data },
  })
  res.status(201).json({ category: row })
}

/* -------------------------------- credit -------------------------------- */

async function partyBalances() {
  const parties = await prisma.creditParty.findMany({
    where: { active: true },
    include: { transactions: { orderBy: { date: 'asc' } } },
    orderBy: { name: 'asc' },
  })
  return parties.map((party) => {
    const given = party.transactions.filter((txn) => txn.type === 'credit').reduce((sum, txn) => sum + num(txn.amount), 0)
    const paid = party.transactions.filter((txn) => txn.type === 'payment').reduce((sum, txn) => sum + num(txn.amount), 0)
    const oldest = party.transactions.find((txn) => txn.type === 'credit')?.date ?? null
    return {
      id: party.id,
      name: party.name,
      phone: party.phone ?? '',
      creditLimit: num(party.creditLimit),
      openingBalance: num(party.openingBalance),
      given,
      paid,
      outstanding: Number((num(party.openingBalance) + given - paid).toFixed(2)),
      oldestCreditDate: oldest,
    }
  })
}

export async function listCredit(req, res) {
  const { month, partyId } = req.query
  const where = {
    ...(month ? { date: { gte: `${month}-01`, lte: `${month}-31` } } : {}),
    ...(partyId ? { partyId } : {}),
  }
  const [parties, transactions] = await Promise.all([
    partyBalances(),
    prisma.creditTransaction.findMany({
      where,
      include: { party: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    }),
  ])
  res.json({
    parties,
    transactions: transactions.map((row) => ({
      id: row.id,
      date: row.date,
      partyId: row.partyId,
      partyName: row.party.name,
      type: row.type,
      mode: row.mode,
      amount: num(row.amount),
      note: row.note ?? '',
    })),
  })
}

const partySchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).optional().default(''),
  creditLimit: money.default(0),
  openingBalance: z.number().min(0).max(100000000).default(0),
})

export async function createParty(req, res) {
  const parsed = partySchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, 'Invalid party.', { issues: parsed.error.issues })
  const row = await prisma.creditParty.create({ data: parsed.data })
  await audit('party.create', 'party', row.id, parsed.data)
  res.status(201).json({ party: row })
}

export async function updateParty(req, res) {
  const parsed = partySchema.partial().safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, 'Invalid party.', { issues: parsed.error.issues })
  const row = await prisma.creditParty.update({ where: { id: req.params.id }, data: parsed.data })
  res.json({ party: row })
}

const txnSchema = z.object({
  date: z.string(),
  partyId: z.string(),
  type: z.enum(['credit', 'payment']),
  amount: z.number().positive().max(100000000),
  mode: z.enum(['cash', 'online']).default('cash'),
  note: z.string().trim().max(160).optional().default(''),
})

export async function createTransaction(req, res) {
  const parsed = txnSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, 'Invalid credit entry.', { issues: parsed.error.issues })
  await assertOpen(parsed.data.date)
  const row = await prisma.creditTransaction.create({ data: parsed.data, include: { party: true } })
  await audit('credit.create', 'credit', row.id, parsed.data)
  res.status(201).json({
    transaction: {
      id: row.id,
      date: row.date,
      partyId: row.partyId,
      partyName: row.party.name,
      type: row.type,
      mode: row.mode,
      amount: num(row.amount),
      note: row.note ?? '',
    },
  })
}

export async function deleteTransaction(req, res) {
  const row = await prisma.creditTransaction.findUnique({ where: { id: req.params.id } })
  if (!row) throw new HttpError(404, 'Entry not found.')
  await assertOpen(row.date)
  await prisma.creditTransaction.delete({ where: { id: row.id } })
  await audit('credit.delete', 'credit', row.id, { date: row.date, amount: num(row.amount) })
  res.json({ ok: true })
}

/* --------------------------------- lube --------------------------------- */

export async function listLubeItems(req, res) {
  const rows = await prisma.lubeItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  res.json({ items: rows.map((row) => ({ id: row.id, name: row.name, price: num(row.price) })) })
}

export async function createLubeItem(req, res) {
  const schema = z.object({ name: z.string().trim().min(1).max(80), price: money })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, 'Invalid lubricant item.')
  const row = await prisma.lubeItem.create({ data: parsed.data })
  res.status(201).json({ item: { id: row.id, name: row.name, price: num(row.price) } })
}

/* ------------------------------- dashboard ------------------------------ */

export async function dashboard(req, res) {
  const date = req.query.date || businessDate()
  const report = await ensureDay(date)
  const { computed, settings } = await computedFor(report)

  const recent = await prisma.dailyReport.findMany({
    where: { date: { lte: date } },
    orderBy: { date: 'desc' },
    take: 10,
  })

  const rows = recent.map((row) => {
    const computed = row.totals || {}
    const products = computed.products || {}
    const fuel = computed.fuel || {}
    const cash = computed.cash || {}
    const msVariance = products.MS?.variance ?? 0
    const hsdVariance = products.HSD?.variance ?? 0

    return {
      date: row.date,
      status: row.status,
      msLitres: products.MS?.acSale ?? 0,
      hsdLitres: products.HSD?.acSale ?? 0,
      fuelAmount: fuel.totalAmount ?? 0,
      totalCash: cash.total ?? 0,
      variance: Number((msVariance + hsdVariance).toFixed(3)),
      profit: computed.profit?.net ?? 0,
    }
  })

  const parties = await partyBalances()
  const dues = Number(parties.reduce((sum, party) => sum + Math.max(0, party.outstanding), 0).toFixed(2))
  const openDays = await prisma.dailyReport.findMany({
    where: { status: 'open', date: { lt: date } },
    orderBy: { date: 'asc' },
    select: { date: true },
  })

  res.json({
    date,
    status: report.status,
    computed,
    settings,
    recent: rows,
    dues,
    partiesWithDues: parties.filter((party) => party.outstanding > 0).slice(0, 5),
    alerts: [
      ...computed.alerts,
      ...(openDays.length ? [`${openDays.length} earlier day(s) still open: ${openDays.map((row) => row.date).join(', ')}.`] : []),
    ],
    openDays: openDays.map((row) => row.date),
  })
}

/* -------------------------------- reports ------------------------------- */

async function monthReport(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month))) throw new HttpError(400, 'Month must be YYYY-MM.')
  const { start, end } = monthRange(month)
  const reports = await prisma.dailyReport.findMany({ where: { date: { gte: start, lte: end } }, orderBy: { date: 'asc' } })

  const setting = await prisma.setting.findUnique({ where: { id: 1 } })
  const shape = settingsShape(setting)

  const days = []
  for (const report of reports) {
    const { computed } = await computedFor(report)
    days.push({
      date: report.date,
      status: report.status,
      msLitres: computed.products.MS.acSale,
      hsdLitres: computed.products.HSD.acSale,
      rateMS: computed.products.MS.rate,
      rateHSD: computed.products.HSD.rate,
      fuelAmount: computed.fuel.totalAmount,
      rfValue: computed.fuel.totalRfValue,
      lube: computed.lube.total,
      expenses: computed.expenses.total,
      oneOff: computed.expenses.oneOff,
      running: computed.expenses.running,
      creditGiven: computed.cash.creditGiven,
      creditReceived: computed.cash.creditReceived,
      online: computed.cash.online,
      pos: computed.cash.pos,
      bankDeposit: computed.cash.bankDeposit,
      totalCash: computed.cash.total,
      difference: computed.cash.difference,
      profit: computed.profit.net,
      variance: Number((computed.products.MS.variance + computed.products.HSD.variance).toFixed(3)),
      totals: computed,
    })
  }

  const [expenses, parties, audits] = await Promise.all([
    prisma.expense.findMany({
      where: { date: { gte: start, lte: end } },
      include: { category: true },
    }),
    partyBalances(),
    prisma.auditLog.findMany({ where: { createdAt: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T23:59:59Z`) } }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ])

  const byCategory = {}
  for (const row of expenses) {
    const key = row.category.name
    byCategory[key] = byCategory[key] ?? { category: key, running: 0, oneOff: 0, total: 0 }
    if (row.type === 'one-off') byCategory[key].oneOff += num(row.amount)
    else byCategory[key].running += num(row.amount)
    byCategory[key].total += num(row.amount)
  }

  const sum = (key) => Number(days.reduce((total, day) => total + (day[key] ?? 0), 0).toFixed(2))
  const totals = {
    days: days.length,
    closedDays: days.filter((day) => day.status === 'closed').length,
    msLitres: sum('msLitres'),
    hsdLitres: sum('hsdLitres'),
    fuelAmount: sum('fuelAmount'),
    rfValue: sum('rfValue'),
    lube: sum('lube'),
    expenses: sum('expenses'),
    oneOff: sum('oneOff'),
    running: sum('running'),
    creditGiven: sum('creditGiven'),
    creditReceived: sum('creditReceived'),
    online: sum('online'),
    pos: sum('pos'),
    bankDeposit: sum('bankDeposit'),
    totalCash: sum('totalCash'),
    profit: sum('profit'),
    variance: Number(days.reduce((total, day) => total + (day.variance ?? 0), 0).toFixed(3)),
    daysWithDifference: days.filter((day) => Math.abs(day.difference) > 0.5).length,
  }

  return {
    month,
    settings: shape,
    days,
    totals,
    expensesByCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
    dues: parties.filter((party) => party.outstanding > 0),
    audits,
  }
}

export async function getMonthReport(req, res) {
  res.json(await monthReport(req.query.month || businessDate().slice(0, 7)))
}

const csvCell = (value) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export async function monthReportCsv(req, res) {
  const report = await monthReport(req.query.month || businessDate().slice(0, 7))
  const header = [
    'Date',
    'Status',
    'MS litres',
    'HSD litres',
    'MS rate',
    'HSD rate',
    'Fuel amount',
    'R/F value',
    'Lubricants',
    'Expenses',
    'Credit given',
    'Credit received',
    'Online',
    'POS',
    'Bank deposit',
    'Total cash',
    'Cash difference',
    'Stock variance (L)',
    'Profit',
  ]
  const lines = [header.join(',')]
  for (const day of report.days) {
    lines.push(
      [
        day.date,
        day.status,
        day.msLitres,
        day.hsdLitres,
        day.rateMS,
        day.rateHSD,
        day.fuelAmount,
        day.rfValue,
        day.lube,
        day.expenses,
        day.creditGiven,
        day.creditReceived,
        day.online,
        day.pos,
        day.bankDeposit,
        day.totalCash,
        day.difference,
        day.variance,
        day.profit,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  const t = report.totals
  lines.push(
    ['TOTAL', '', t.msLitres, t.hsdLitres, '', '', t.fuelAmount, t.rfValue, t.lube, t.expenses, t.creditGiven, t.creditReceived, t.online, t.pos, t.bankDeposit, t.totalCash, '', t.variance, t.profit]
      .map(csvCell)
      .join(','),
  )

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="tirap-${report.month}.csv"`)
  res.send(`\uFEFF${lines.join('\r\n')}`)
}

/* --------------------------------- audit -------------------------------- */

export async function listAudit(req, res) {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
  res.json({
    entries: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      details: row.details ? JSON.parse(row.details) : null,
      createdAt: row.createdAt,
    })),
  })
}

export { HttpError }
