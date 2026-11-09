import { z } from 'zod'
import { prisma, num, audit, isDateKey, shiftDate, businessDate } from './db.js'
import { computeDay, PRODUCTS } from './utils/calculator.js'
import { archiveDayToR2 } from './archive.js'

/* ------------------------------ validation ------------------------------- */

const moneyInput = z.number().min(0).max(100000000)

/**
 * Station masters are often wiped when the owner cleans Supabase tables for a
 * fresh start. A day cannot start without them — recreate the paper-sheet
 * defaults automatically instead of returning a page with zero nozzle rows.
 * Idempotent: only runs when the tables are empty.
 */
async function ensureMasters(client = prisma) {
  const [nozzleCount, tankCount, lubeCount, categoryCount, setting] = await Promise.all([
    client.nozzle.count(),
    client.tank.count(),
    client.lubeItem.count(),
    client.expenseCategory.count(),
    client.setting.findUnique({ where: { id: 1 } }),
  ])

  if (nozzleCount === 0) {
    await client.nozzle.createMany({
      data: ['MS', 'HSD'].flatMap((product) =>
        [1, 2, 3, 4].map((index) => ({
          name: `${product} Nozzle ${index}`,
          product,
          sortOrder: (product === 'MS' ? 0 : 10) + index,
        })),
      ),
    })
  }
  if (tankCount === 0) {
    await client.tank.createMany({
      data: [
        { name: 'MS Tank 1', product: 'MS' },
        { name: 'HSD Tank 1', product: 'HSD' },
      ],
    })
  }
  if (lubeCount === 0) {
    await client.lubeItem.createMany({
      data: [
        { name: 'M-oil 1L', price: 230 },
        { name: 'M-oil 1.2L', price: 350 },
      ],
    })
  }
  for (const name of ['Salary', 'Electricity', 'Tea & Food', 'Repairs', 'Transport', 'Stationery', 'Misc']) {
    if (categoryCount === 0) {
      await client.expenseCategory.upsert({ where: { name }, update: {}, create: { name } })
    }
  }
  if (!setting) {
    await client.setting.create({
      data: {
        id: 1,
        rounding: 'paper',
        stockLossValuation: 'selling',
        maxMeterDigits: 6,
        varianceLimit: 200,
        stationName: 'Tirap Fuel Station',
      },
    })
  }
  if (nozzleCount === 0 || tankCount === 0 || lubeCount === 0) {
    cachedMasters = null
    mastersTimestamp = 0
  }
}

const daySchema = z.object({
  rates: z.object({ MS: z.number().min(0).max(1000), HSD: z.number().min(0).max(1000) }),
  nozzles: z.array(
    z.object({
      nozzleId: z.string().min(1).max(64),
      opening: z.number().min(0).max(99999999),
      closing: z.number().min(0).max(99999999),
      rollover: z.boolean().optional().default(false),
      replacedLitres: z.number().min(0).max(99999999).nullable().optional(),
    }),
  ),
  rf: z.object({ MS: z.number().min(0).max(99999999), HSD: z.number().min(0).max(99999999) }),
  rfNote: z
    .object({
      MS: z.string().trim().max(200).optional().default(''),
      HSD: z.string().trim().max(200).optional().default(''),
    })
    .optional(),
  lube: z.array(
    z.object({
      itemId: z.string().min(1).max(64).nullable().optional(),
      itemName: z.string().trim().min(1).max(120),
      quantity: z.number().min(0).max(1000000),
      price: moneyInput,
    }),
  ),
  online: z.array(
    z.object({
      label: z.string().trim().max(80).optional().default('Online'),
      amount: moneyInput,
    }),
  ),
  pos: moneyInput,
  bankDeposit: moneyInput,
  countedCash: moneyInput,
  // Optional atomic collections. When supplied, the day route replaces that
  // date's rows inside the same transaction; when omitted, the standalone
  // Expenses/Credit screens remain the writers.
  expenses: z
    .array(
      z.object({
        categoryId: z.string().min(1).max(64),
        type: z.enum(['running', 'one-off']),
        details: z.string().trim().max(160).optional().default(''),
        amount: moneyInput,
      }),
    )
    .optional(),
  credits: z
    .array(
      z.object({
        partyId: z.string().min(1).max(64),
        type: z.enum(['credit', 'payment']),
        amount: z.number().positive().max(100000000),
        mode: z.enum(['cash', 'online']).default('cash'),
        note: z.string().trim().max(160).optional().default(''),
      }),
    )
    .optional(),
})

/* -------------------------------- helpers -------------------------------- */

const httpError = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, extra })

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

/**
 * The previous closed day is the only source of carried cash and stock.
 * Recomputing it from its stored raw rows means a tampered `totals` snapshot
 * cannot influence today's opening figures.
 */
async function previousContext(date, client = prisma) {
  const previous = await client.dailyReport.findFirst({
    where: { date: { lt: date }, status: 'closed' },
    orderBy: { date: 'desc' },
  })
  if (!previous) return { previous: null, computed: null }

  const { computed } = await computedFor(previous, client)
  return { previous, computed }
}

/* --------------------------------- reads --------------------------------- */

/** Create the day on first visit, carrying meters/stock/cash from the DB. */
export async function ensureDay(date, client = prisma) {
  await ensureMasters(client)
  let report = await client.dailyReport.findUnique({ where: { date } })
  if (report) {
    // A day created while the masters were wiped has no nozzle/tank rows.
    // Backfill them now so the serial Op/Cl/Sale/Rate/Amount table renders.
    const [readingCount, tankDayCount] = await Promise.all([
      client.nozzleReading.count({ where: { dailyReportId: report.id } }),
      client.tankDay.count({ where: { dailyReportId: report.id } }),
    ])
    if (readingCount === 0 || tankDayCount === 0) {
      const { previous, computed: previousComputed } = await previousContext(date, client)
      const [nozzles, tanks] = await Promise.all([
        client.nozzle.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
        client.tank.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      ])
      const previousReadings = previous
        ? await client.nozzleReading.findMany({ where: { dailyReportId: previous.id } })
        : []
      if (readingCount === 0 && nozzles.length) {
        await client.nozzleReading.createMany({
          data: nozzles.map((nozzle) => ({
            dailyReportId: report.id,
            nozzleId: nozzle.id,
            opening: previousReadings.find((reading) => reading.nozzleId === nozzle.id)?.closing ?? 0,
            closing: previousReadings.find((reading) => reading.nozzleId === nozzle.id)?.closing ?? 0,
          })),
        })
      }
      if (tankDayCount === 0 && tanks.length) {
        await client.tankDay.createMany({
          data: tanks.map((tank) => ({
            dailyReportId: report.id,
            tankId: tank.id,
            opening: previousComputed?.products?.[tank.product]?.closingStock ?? 0,
            receipts: 0,
            dip: 0,
          })),
        })
      }
      report = await client.dailyReport.findUnique({ where: { date } })
    }
    return report
  }

  // First visit only: the previous closed day, the active masters and the
  // previous readings are independent reads — send them together.
  const [previous, nozzles, tanks] = await Promise.all([
    client.dailyReport.findFirst({
      where: { date: { lt: date }, status: 'closed' },
      orderBy: { date: 'desc' },
    }),
    client.nozzle.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    client.tank.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ])

  const [previousComputed, previousReadings] = previous
    ? await Promise.all([
        computedFor(previous, client).then((result) => result.computed),
        client.nozzleReading.findMany({ where: { dailyReportId: previous.id } }),
      ])
    : [null, []]

  report = await client.dailyReport.create({
    data: {
      date,
      status: 'open',
      previousBalance: previousComputed?.cash?.total ?? 0,
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
        create: tanks.map((tank) => ({
          tankId: tank.id,
          opening: previousComputed?.products?.[tank.product]?.closingStock ?? 0,
          receipts: 0,
          dip: 0,
        })),
      },
    },
  })

  // Carry yesterday's rate so today starts pre-filled (PRD §4). One createMany
  // instead of one round trip per rate.
  if (previous) {
    const lastRates = await client.rate.findMany({ where: { date: previous.date } })
    if (lastRates.length) {
      await client.rate.createMany({
        data: lastRates.map((rate) => ({ product: rate.product, date, rate: rate.rate })),
      })
    }
  }

  await audit('day.open', 'day', date, { date })
  return report
}

/** Build the calculator input from every table that feeds the day. */
export async function buildInput(report, client = prisma) {
  const [readings, products, tankDays, lube, online, expenses, credits, rates] = await Promise.all([
    client.nozzleReading.findMany({ where: { dailyReportId: report.id }, include: { nozzle: true } }),
    client.productDay.findMany({ where: { dailyReportId: report.id } }),
    client.tankDay.findMany({ where: { dailyReportId: report.id }, include: { tank: true } }),
    client.lubeSale.findMany({ where: { dailyReportId: report.id } }),
    client.onlineReceipt.findMany({ where: { dailyReportId: report.id } }),
    client.expense.findMany({ where: { date: report.date } }),
    client.creditTransaction.findMany({ where: { date: report.date } }),
    client.rate.findMany({ where: { date: report.date } }),
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
    expenses: expenses.map((row) => ({
      categoryId: row.categoryId,
      type: row.type,
      details: row.details ?? '',
      amount: num(row.amount),
    })),
    credits: credits.map((row) => ({
      partyId: row.partyId,
      type: row.type,
      amount: num(row.amount),
      mode: row.mode,
      note: row.note ?? '',
    })),
  }

  return { input, readings, products, tankDays, lube, online, expenses, credits }
}

export async function computedFor(report, client = prisma) {
  // Settings and the day's rows are independent reads: run them on the wire at
  // the same time instead of two sequential round trips to the pooler.
  const [setting, built] = await Promise.all([
    client.setting.findUnique({ where: { id: 1 } }),
    buildInput(report, client),
  ])
  const shape = settingsShape(setting)
  const { input, readings, products, tankDays } = built
  return { computed: computeDay(input, shape), settings: shape, settingRow: setting, input, readings, products, tankDays }
}

let cachedMasters = null
let mastersTimestamp = 0
const MASTER_CACHE_TTL = 30000 // 30 seconds

async function getCachedMasters() {
  await ensureMasters()
  const now = Date.now()
  if (cachedMasters && now - mastersTimestamp < MASTER_CACHE_TTL) {
    return cachedMasters
  }
  const [nozzles, tanks, lubeItems, parties, categories] = await Promise.all([
    prisma.nozzle.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.tank.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.lubeItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.creditParty.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.expenseCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ])
  cachedMasters = {
    nozzles,
    tanks,
    lubeItems: lubeItems.map((row) => ({ ...row, price: num(row.price) })),
    parties: parties.map((row) => ({
      ...row,
      creditLimit: num(row.creditLimit),
      openingBalance: num(row.openingBalance),
    })),
    categories,
  }
  mastersTimestamp = now
  return cachedMasters
}

const dayPayload = async (report) => {
  // Everything here is an independent read of the same moment: settings+day
  // rows, masters and the day's neighbours all go to the wire in one batch.
  // `readings` and `products` come back from buildInput (same rows, so no
  // extra round trips for them).
  const [state, masters, previous, later] = await Promise.all([
    computedFor(report),
    getCachedMasters(),
    prisma.dailyReport.findFirst({ where: { date: { lt: report.date } }, orderBy: { date: 'desc' }, select: { date: true, status: true } }),
    prisma.dailyReport.findFirst({ where: { date: { gt: report.date }, status: 'closed' }, orderBy: { date: 'asc' }, select: { date: true } }),
  ])
  const { computed, settings, input, readings, products } = state
  const { nozzles, tanks, lubeItems, parties, categories } = masters

  return {
    date: report.date,
    status: report.status,
    closedAt: report.closedAt,
    inputs: {
      rates: input.rates,
      rf: input.rf,
      rfNote: Object.fromEntries(products.map((row) => [row.product, row.rfNote ?? ''])),
      nozzles: nozzles.map((nozzle) => {
        const reading = readings.find((row) => row.nozzleId === nozzle.id)
        return {
          nozzleId: nozzle.id,
          name: nozzle.name,
          product: nozzle.product,
          opening: num(reading?.opening),
          closing: num(reading?.closing),
          rollover: Boolean(reading?.rollover),
          replacedLitres:
            reading?.replacedLitres === null || reading?.replacedLitres === undefined
              ? null
              : num(reading.replacedLitres),
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
      credits: input.credits ?? [],
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

/* --------------------------------- writes -------------------------------- */

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

  try {
    // A day save touches ~25 rows across 8 tables. Over a remote pooler that
    // can exceed Prisma's 5 s default, which closes the transaction mid-write.
    await prisma.$transaction(
      async (tx) => {
        const current = await tx.dailyReport.findUnique({ where: { id: report.id } })
        if (!current || current.status === 'closed') {
          throw httpError(409, 'This day is closed. Reopen it before editing.')
        }

      // Carried cash always comes from the last closed day in PostgreSQL.
      const { computed: previousComputed } = await previousContext(date, tx)
      const previousBalance = previousComputed?.cash?.total ?? 0

      await tx.dailyReport.update({
        where: { id: report.id },
        data: {
          pos: body.pos,
          bankDeposit: body.bankDeposit,
          countedCash: body.countedCash,
          previousBalance,
        },
      })

      const requestedNozzles = [...new Set(body.nozzles.map((row) => row.nozzleId))]
      const knownNozzles = await tx.nozzle.findMany({
        where: { id: { in: requestedNozzles }, active: true },
        select: { id: true },
      })
      if (knownNozzles.length !== requestedNozzles.length) {
        throw httpError(400, 'One or more nozzles are unknown or inactive.')
      }

      for (const product of PRODUCTS) {
        await tx.rate.upsert({
          where: { product_date: { product, date } },
          update: { rate: body.rates[product] ?? 0 },
          create: { product, date, rate: body.rates[product] ?? 0 },
        })
        await tx.productDay.upsert({
          where: { dailyReportId_product: { dailyReportId: report.id, product } },
          update: {
            rfLitres: body.rf[product] ?? 0,
            rfNote: body.rfNote?.[product] || null,
          },
          create: {
            dailyReportId: report.id,
            product,
            rfLitres: body.rf[product] ?? 0,
            rfNote: body.rfNote?.[product] || null,
          },
        })
      }

      // One delete + one insert instead of one round-trip per nozzle. Only the
      // nozzles present in the payload are replaced, so an omitted nozzle keeps
      // its stored reading.
      if (body.nozzles.length) {
        await tx.nozzleReading.deleteMany({
          where: { dailyReportId: report.id, nozzleId: { in: requestedNozzles } },
        })
        await tx.nozzleReading.createMany({
          data: body.nozzles.map((nozzle) => ({
            dailyReportId: report.id,
            nozzleId: nozzle.nozzleId,
            opening: nozzle.opening,
            closing: nozzle.closing,
            rollover: Boolean(nozzle.rollover),
            replacedLitres: nozzle.replacedLitres ?? null,
          })),
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

      if (body.expenses !== undefined) {
        await tx.expense.deleteMany({ where: { date } })
        if (body.expenses.length) {
          await tx.expense.createMany({
            data: body.expenses.map((line) => ({
              date,
              categoryId: line.categoryId,
              dailyReportId: report.id,
              type: line.type,
              details: line.details || null,
              amount: line.amount,
            })),
          })
        }
      }

      if (body.credits !== undefined) {
        await tx.creditTransaction.deleteMany({ where: { date } })
        if (body.credits.length) {
          await tx.creditTransaction.createMany({
            data: body.credits.map((line) => ({
              date,
              partyId: line.partyId,
              type: line.type,
              amount: line.amount,
              mode: line.mode,
              note: line.note || null,
            })),
          })
        }
      }

      // Recalculate from what is now in PostgreSQL, inside the transaction.
      const fresh = await tx.dailyReport.findUnique({ where: { id: report.id } })
      const { computed } = await computedFor(fresh, tx)
      if (computed.errors.length) {
        throw httpError(422, computed.errors[0], { issues: computed.errors })
      }

      await tx.dailyReport.update({
        where: { id: report.id },
        data: { totals: computed },
      })
      },
      { maxWait: 15000, timeout: 30000 },
    )
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, ...(error.extra ?? {}) })
    }
    throw error
  }

  const fresh = await prisma.dailyReport.findUnique({ where: { id: report.id } })
  await audit('day.save', 'day', date, { totalCash: num(fresh.totals?.cash?.total) })
  const payload = await dayPayload(fresh)

  // Automatically archive the calculated day data as a CSV file to Cloudflare R2 on save
  archiveDayToR2(date, payload).catch((err) => console.error('[day.save archive error]', err))

  res.json(payload)
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

  // Refresh the carried balance from the last closed day, then recompute.
  const { computed: previousComputed } = await previousContext(date)
  await prisma.dailyReport.update({
    where: { id: report.id },
    data: { previousBalance: previousComputed?.cash?.total ?? 0 },
  })

  const { computed } = await computedFor(await prisma.dailyReport.findUnique({ where: { id: report.id } }))
  if (computed.errors.length) {
    return res.status(422).json({ error: computed.errors[0], issues: computed.errors })
  }

  const updated = await prisma.dailyReport.update({
    where: { id: report.id },
    data: { status: 'closed', closedAt: new Date(), totals: computed },
  })
  await audit('day.close', 'day', date, { totalCash: computed.cash.total })
  const closedPayload = await dayPayload(updated)

  // Automatically archive the finalized closed day to Cloudflare R2
  archiveDayToR2(date, closedPayload).catch((err) => console.error('[day.close archive error]', err))

  // The next open day starts from today's total cash (F14).
  const next = await prisma.dailyReport.findFirst({
    where: { date: { gt: date }, status: 'open' },
    orderBy: { date: 'asc' },
  })
  if (next) {
    await prisma.dailyReport.update({ where: { id: next.id }, data: { previousBalance: computed.cash.total } })
    const { computed: nextComputed } = await computedFor(
      await prisma.dailyReport.findUnique({ where: { id: next.id } }),
    )
    await prisma.dailyReport.update({ where: { id: next.id }, data: { totals: nextComputed } })
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
