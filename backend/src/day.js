import { z } from 'zod'
import { prisma, num, audit, isDateKey, shiftDate, businessDate } from './db.js'
import { computeDay, PRODUCTS } from '../../shared/calc.js'

const daySchema = z.object({
  rates: z.object({ MS: z.number().min(0).max(1000), HSD: z.number().min(0).max(1000) }),
  nozzles: z.array(
    z.object({
      nozzleId: z.string(),
      opening: z.number().min(0),
      closing: z.number().min(0),
      rollover: z.boolean().optional().default(false),
      replacedLitres: z.number().min(0).nullable().optional(),
    }),
  ),
  rf: z.object({ MS: z.number().min(0), HSD: z.number().min(0) }),
  lube: z.array(
    z.object({
      itemId: z.string().nullable().optional(),
      itemName: z.string().trim().min(1).max(120),
      quantity: z.number().min(0),
      price: z.number().min(0),
    }),
  ),
  online: z.array(
    z.object({
      label: z.string().trim().max(80).optional().default('Online'),
      amount: z.number().min(0),
    }),
  ),
  pos: z.number().min(0),
  bankDeposit: z.number().min(0),
  countedCash: z.number().min(0),
})

export function settingsShape(setting) {
  return {
    rounding: setting?.rounding ?? 'paper',
    maxMeterDigits: setting?.maxMeterDigits ?? 6,
    margins: { MS: num(setting?.marginMS), HSD: num(setting?.marginHSD) },
    lubeMargin: num(setting?.lubeMargin),
    stockLossValuation: setting?.stockLossValuation ?? 'selling',
    costRates: { MS: num(setting?.costMS), HSD: num(setting?.costHSD) },
    varianceLimit: num(setting?.varianceLimit),
  }
}

async function loadSettings() {
  const setting = await prisma.setting.findUnique({ where: { id: 1 } })
  return { row: setting, shape: settingsShape(setting) }
}

/** Create the day on first visit, carrying meters/stock/cash from the last closed day. */
export async function ensureDay(date) {
  let report = await prisma.dailyReport.findUnique({ where: { date } })
  if (report) return report

  const previous = await prisma.dailyReport.findFirst({
    where: { date: { lt: date }, status: 'closed' },
    orderBy: { date: 'desc' },
  })
  const previousTotals = previous?.totals ? JSON.parse(previous.totals) : null

  const nozzles = await prisma.nozzle.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
  const tanks = await prisma.tank.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  const previousReadings = previous
    ? await prisma.nozzleReading.findMany({ where: { dailyReportId: previous.id } })
    : []
  const previousTankDays = previous
    ? await prisma.tankDay.findMany({ where: { dailyReportId: previous.id } })
    : []

  report = await prisma.dailyReport.create({
    data: {
      date,
      status: 'open',
      previousBalance: previousTotals?.cash?.total ?? 0,
      readings: {
        create: nozzles.map((nozzle) => ({
          nozzleId: nozzle.id,
          opening: previousReadings.find((reading) => reading.nozzleId === nozzle.id)?.closing ?? 0,
          closing: previousReadings.find((reading) => reading.nozzleId === nozzle.id)?.closing ?? 0,
        })),
      },
      products: {
        create: PRODUCTS.map((product) => ({ product, rfLitres: 0 })),
      },
      tanks: {
        create: tanks.map((tank) => {
          const productTotals = previousTotals?.products?.[tank.product]
          return {
            tankId: tank.id,
            opening: productTotals?.closingStock ?? 0,
            receipts: 0,
            dip: 0,
          }
        }),
      },
    },
  })

  // Carry yesterday's rate so today starts pre-filled (PRD §4).
  const lastRates = previous
    ? await prisma.rate.findMany({ where: { date: previous.date } })
    : []
  for (const rate of lastRates) {
    await prisma.rate.create({ data: { product: rate.product, date, rate: rate.rate } })
  }

  await audit('day.open', 'day', date, { date })
  return report
}

/** Build the shared-calc input from every table that feeds the day. */
export async function buildInput(report) {
  const [readings, products, tankDays, lube, online, expenses, credits, rates] = await Promise.all([
    prisma.nozzleReading.findMany({ where: { dailyReportId: report.id }, include: { nozzle: true } }),
    prisma.productDay.findMany({ where: { dailyReportId: report.id } }),
    prisma.tankDay.findMany({ where: { dailyReportId: report.id }, include: { tank: true } }),
    prisma.lubeSale.findMany({ where: { dailyReportId: report.id } }),
    prisma.onlineReceipt.findMany({ where: { dailyReportId: report.id } }),
    prisma.expense.findMany({ where: { date: report.date } }),
    prisma.creditTransaction.findMany({ where: { date: report.date } }),
    prisma.rate.findMany({ where: { date: report.date } }),
  ])

  const rateOf = (product) => num(rates.find((row) => row.product === product)?.rate)

  const creditGiven = credits
    .filter((txn) => txn.type === 'credit')
    .reduce((sum, txn) => sum + num(txn.amount), 0)
  const creditReceived = credits
    .filter((txn) => txn.type === 'payment' && txn.mode === 'cash')
    .reduce((sum, txn) => sum + num(txn.amount), 0)

  const tankByProduct = {}
  for (const day of tankDays) {
    const product = day.tank.product
    if (!tankByProduct[product]) {
      tankByProduct[product] = { opening: 0, receipts: 0, dip: 0 }
    }
    tankByProduct[product].opening += num(day.opening)
    tankByProduct[product].receipts += num(day.receipts)
    tankByProduct[product].dip += num(day.dip)
  }

  const input = {
    nozzles: {
      MS: readings
        .filter((reading) => reading.nozzle.product === 'MS')
        .sort((a, b) => a.nozzle.sortOrder - b.nozzle.sortOrder)
        .map((reading) => ({
          opening: num(reading.opening),
          closing: num(reading.closing),
          rollover: reading.rollover,
          replacedLitres: reading.replacedLitres === null ? null : num(reading.replacedLitres),
        })),
      HSD: readings
        .filter((reading) => reading.nozzle.product === 'HSD')
        .sort((a, b) => a.nozzle.sortOrder - b.nozzle.sortOrder)
        .map((reading) => ({
          opening: num(reading.opening),
          closing: num(reading.closing),
          rollover: reading.rollover,
          replacedLitres: reading.replacedLitres === null ? null : num(reading.replacedLitres),
        })),
    },
    rates: { MS: rateOf('MS'), HSD: rateOf('HSD') },
    rf: {
      MS: num(products.find((row) => row.product === 'MS')?.rfLitres),
      HSD: num(products.find((row) => row.product === 'HSD')?.rfLitres),
    },
    tanks: {
      MS: tankByProduct.MS ?? { opening: 0, receipts: 0, dip: 0 },
      HSD: tankByProduct.HSD ?? { opening: 0, receipts: 0, dip: 0 },
    },
    lube: lube.map((row) => ({ quantity: num(row.quantity), price: num(row.price) })),
    online: online.map((row) => ({ label: row.label, amount: num(row.amount) })),
    pos: num(report.pos),
    bankDeposit: num(report.bankDeposit),
    countedCash: num(report.countedCash),
    previousBalance: num(report.previousBalance),
    creditGiven,
    creditReceived,
    expenses: expenses.map((row) => ({ type: row.type, amount: num(row.amount) })),
  }

  return { input, readings, products, tankDays, lube, online, expenses, credits }
}

export async function computedFor(report) {
  const { row, shape } = await loadSettings()
  const { input } = await buildInput(report)
  return { computed: computeDay(input, shape), settings: shape, settingRow: row, input }
}

const dayPayload = async (report) => {
  const { computed, settings, input } = await computedFor(report)
  const [nozzles, tanks, lubeItems, parties, categories, previous, later] = await Promise.all([
    prisma.nozzle.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.tank.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.lubeItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.creditParty.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.dailyReport.findFirst({ where: { date: { lt: report.date } }, orderBy: { date: 'desc' } }),
    prisma.dailyReport.findFirst({ where: { date: { gt: report.date }, status: 'closed' }, orderBy: { date: 'asc' } }),
  ])

  const readings = await prisma.nozzleReading.findMany({ where: { dailyReportId: report.id } })

  return {
    date: report.date,
    status: report.status,
    closedAt: report.closedAt,
    inputs: {
      rates: input.rates,
      rf: input.rf,
      nozzles: nozzles.map((nozzle) => {
        const reading = readings.find((row) => row.nozzleId === nozzle.id)
        return {
          nozzleId: nozzle.id,
          name: nozzle.name,
          product: nozzle.product,
          opening: num(reading?.opening),
          closing: num(reading?.closing),
          rollover: Boolean(reading?.rollover),
          replacedLitres: reading?.replacedLitres === null || reading?.replacedLitres === undefined ? null : num(reading.replacedLitres),
        }
      }),
      tanks: input.tanks,
      lube: input.lube,
      online: input.online.map((row) => ({ label: row.label, amount: row.amount })),
      pos: input.pos,
      bankDeposit: input.bankDeposit,
      countedCash: input.countedCash,
      previousBalance: input.previousBalance,
      creditGiven: input.creditGiven,
      creditReceived: input.creditReceived,
      expenses: input.expenses,
    },
    computed,
    settings,
    masters: {
      nozzles,
      tanks,
      lubeItems: lubeItems.map((row) => ({ ...row, price: num(row.price) })),
      parties: parties.map((row) => ({
        ...row,
        creditLimit: num(row.creditLimit),
        openingBalance: num(row.openingBalance),
      })),
      categories,
    },
    flags: {
      previousDate: previous?.date ?? null,
      previousClosed: previous ? previous.status === 'closed' : true,
      laterClosedDate: later?.date ?? null,
      canReopen: !later,
    },
  }
}

export async function getDay(req, res) {
  const date = req.params.date
  if (!isDateKey(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' })
  const report = await ensureDay(date)
  res.json(await dayPayload(report))
}

export async function saveDay(req, res) {
  const date = req.params.date
  if (!isDateKey(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' })

  const parsed = daySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid day values.', issues: parsed.error.issues })
  }

  const report = await ensureDay(date)
  if (report.status === 'closed') {
    return res.status(409).json({ error: 'This day is closed. Reopen it before editing.' })
  }

  const body = parsed.data

  await prisma.$transaction(async (tx) => {
    await tx.dailyReport.update({
      where: { id: report.id },
      data: {
        pos: body.pos,
        bankDeposit: body.bankDeposit,
        countedCash: body.countedCash,
      },
    })

    for (const product of PRODUCTS) {
      await tx.rate.upsert({
        where: { product_date: { product, date } },
        update: { rate: body.rates[product] ?? 0 },
        create: { product, date, rate: body.rates[product] ?? 0 },
      })
      await tx.productDay.upsert({
        where: { dailyReportId_product: { dailyReportId: report.id, product } },
        update: { rfLitres: body.rf[product] ?? 0 },
        create: { dailyReportId: report.id, product, rfLitres: body.rf[product] ?? 0 },
      })
    }

    for (const nozzle of body.nozzles) {
      await tx.nozzleReading.upsert({
        where: { dailyReportId_nozzleId: { dailyReportId: report.id, nozzleId: nozzle.nozzleId } },
        update: {
          opening: nozzle.opening,
          closing: nozzle.closing,
          rollover: Boolean(nozzle.rollover),
          replacedLitres: nozzle.replacedLitres ?? null,
        },
        create: {
          dailyReportId: report.id,
          nozzleId: nozzle.nozzleId,
          opening: nozzle.opening,
          closing: nozzle.closing,
          rollover: Boolean(nozzle.rollover),
          replacedLitres: nozzle.replacedLitres ?? null,
        },
      })
    }

    await tx.lubeSale.deleteMany({ where: { dailyReportId: report.id } })
    if (body.lube.length) {
      await tx.lubeSale.createMany({
        data: body.lube.map((line) => ({
          dailyReportId: report.id,
          itemId: line.itemId || null,
          itemName: line.itemName,
          quantity: line.quantity,
          price: line.price,
        })),
      })
    }

    await tx.onlineReceipt.deleteMany({ where: { dailyReportId: report.id } })
    if (body.online.length) {
      await tx.onlineReceipt.createMany({
        data: body.online.map((line) => ({
          dailyReportId: report.id,
          label: line.label || 'Online',
          amount: line.amount,
        })),
      })
    }
  })

  const fresh = await prisma.dailyReport.findUnique({ where: { id: report.id } })
  const { computed } = await computedFor(fresh)
  const total = computed.cash.total
  await prisma.dailyReport.update({ where: { id: fresh.id }, data: { totals: JSON.stringify(computed) } })
  await audit('day.save', 'day', date, { totalCash: total })

  res.json(await dayPayload(await prisma.dailyReport.findUnique({ where: { id: report.id } })))
}

export async function closeDay(req, res) {
  const date = req.params.date
  if (!isDateKey(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' })

  const report = await ensureDay(date)
  if (report.status === 'closed') return res.status(409).json({ error: 'This day is already closed.' })

  const previous = await prisma.dailyReport.findFirst({
    where: { date: { lt: date } },
    orderBy: { date: 'desc' },
  })
  if (previous && previous.status !== 'closed') {
    return res.status(409).json({ error: `Close ${previous.date} before closing ${date}.` })
  }

  const { computed } = await computedFor(report)
  if (computed.errors.length) {
    return res.status(422).json({ error: computed.errors[0], issues: computed.errors })
  }

  const updated = await prisma.dailyReport.update({
    where: { id: report.id },
    data: { status: 'closed', closedAt: new Date(), totals: JSON.stringify(computed) },
  })
  await audit('day.close', 'day', date, { totalCash: computed.cash.total })

  // The next open day starts from today's total cash (F14).
  const next = await prisma.dailyReport.findFirst({
    where: { date: { gt: date }, status: 'open' },
    orderBy: { date: 'asc' },
  })
  if (next) {
    await prisma.dailyReport.update({ where: { id: next.id }, data: { previousBalance: computed.cash.total } })
    const { computed: nextComputed } = await computedFor(await prisma.dailyReport.findUnique({ where: { id: next.id } }))
    await prisma.dailyReport.update({ where: { id: next.id }, data: { totals: JSON.stringify(nextComputed) } })
  }

  res.json(await dayPayload(updated))
}

export async function reopenDay(req, res) {
  const date = req.params.date
  if (!isDateKey(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' })

  const report = await prisma.dailyReport.findUnique({ where: { date } })
  if (!report) return res.status(404).json({ error: 'Day not found.' })
  if (report.status !== 'closed') return res.status(409).json({ error: 'This day is already open.' })

  // Guard the F14 chain: never reopen behind a closed day.
  const later = await prisma.dailyReport.findFirst({
    where: { date: { gt: date }, status: 'closed' },
    orderBy: { date: 'asc' },
  })
  if (later) {
    return res.status(409).json({
      error: `Reopen ${later.date} first — a later day is already closed and depends on this one.`,
    })
  }

  const updated = await prisma.dailyReport.update({
    where: { id: report.id },
    data: { status: 'open', closedAt: null },
  })
  await audit('day.reopen', 'day', date, {
    previous: 'closed',
    note: req.body?.note ?? 'Reopened by owner',
  })

  res.json(await dayPayload(updated))
}

/** Check whether a later day exists (dashboard alert). */
export async function openDaysCount() {
  return prisma.dailyReport.count({ where: { status: 'open' } })
}

export const today = () => businessDate()
export { shiftDate }
