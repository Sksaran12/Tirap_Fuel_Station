import { prisma } from '../src/db.js'
import { computeDay } from '../src/utils/calculator.js'
import { archiveDayToR2 } from '../src/archive.js'

async function populateDays() {
  console.log('--- POPULATING DATA FOR 06-NOV-2026 AND 07-NOV-2026 ---')

  const nozzles = await prisma.nozzle.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
  const tanks = await prisma.tank.findMany({ where: { active: true } })
  let category = await prisma.expenseCategory.findFirst()
  if (!category) {
    category = await prisma.expenseCategory.create({ data: { name: 'Generator / Running', active: true } })
  }

  const msNozzles = nozzles.filter((n) => n.product === 'MS')
  const hsdNozzles = nozzles.filter((n) => n.product === 'HSD')
  const msTank = tanks.find((t) => t.product === 'MS') || tanks[0]
  const hsdTank = tanks.find((t) => t.product === 'HSD') || tanks[1]

  const daysConfig = [
    {
      date: '2026-11-06',
      status: 'closed',
      rates: { MS: 99.66, HSD: 89.08 },
      rf: { MS: 20, HSD: 30 },
      msReadings: msNozzles.map((n, i) => ({
        nozzleId: n.id,
        opening: 10000 + i * 500,
        closing: 10000 + i * 500 + (250 + i * 120),
      })),
      hsdReadings: hsdNozzles.map((n, i) => ({
        nozzleId: n.id,
        opening: 20000 + i * 500,
        closing: 20000 + i * 500 + (450 + i * 150),
      })),
      tanks: {
        MS: { opening: 12000, receipts: 0, dip: 11400 },
        HSD: { opening: 18000, receipts: 0, dip: 16800 },
      },
      lube: [{ quantity: 2, price: 350 }],
      online: [{ label: 'UPI / PhonePe', amount: 35400 }],
      pos: 12500,
      expenses: [{ type: 'running', amount: 2800, details: 'Generator Diesel' }],
      creditGiven: 14500,
      creditReceived: 4000,
      bankDeposit: 25000,
      countedCash: 42350,
      previousBalance: 30000,
    },
    {
      date: '2026-11-07',
      status: 'open',
      rates: { MS: 99.75, HSD: 89.15 },
      rf: { MS: 15, HSD: 25 },
      // opening carries from 06-Nov closing!
      msReadings: msNozzles.map((n, i) => ({
        nozzleId: n.id,
        opening: 10000 + i * 500 + (250 + i * 120),
        closing: 10000 + i * 500 + (250 + i * 120) + (310 + i * 80),
      })),
      hsdReadings: hsdNozzles.map((n, i) => ({
        nozzleId: n.id,
        opening: 20000 + i * 500 + (450 + i * 150),
        closing: 20000 + i * 500 + (450 + i * 150) + (520 + i * 90),
      })),
      tanks: {
        MS: { opening: 11400, receipts: 5000, dip: 15500 },
        HSD: { opening: 16800, receipts: 8000, dip: 23600 },
      },
      lube: [{ quantity: 3, price: 350 }],
      online: [{ label: 'Google Pay', amount: 48600 }],
      pos: 18400,
      expenses: [{ type: 'running', amount: 3200, details: 'Staff Lunch & Station Supplies' }],
      creditGiven: 12000,
      creditReceived: 8000,
      bankDeposit: 40000,
      countedCash: 51200,
      previousBalance: 351765, // carried from 6th Nov total cash
    },
  ]

  for (const cfg of daysConfig) {
    const { date, status, rates, rf, msReadings, hsdReadings, tanks: tanksCfg, lube, online, pos, expenses, creditGiven, creditReceived, bankDeposit, countedCash, previousBalance } = cfg

    console.log(`Processing ${date} (${status})...`)

    // Upsert rates
    await prisma.rate.upsert({
      where: { product_date: { product: 'MS', date } },
      create: { product: 'MS', date, rate: rates.MS },
      update: { rate: rates.MS },
    })
    await prisma.rate.upsert({
      where: { product_date: { product: 'HSD', date } },
      create: { product: 'HSD', date, rate: rates.HSD },
      update: { rate: rates.HSD },
    })

    const calcPayload = {
      nozzles: {
        MS: msReadings.map((r) => ({ opening: r.opening, closing: r.closing })),
        HSD: hsdReadings.map((r) => ({ opening: r.opening, closing: r.closing })),
      },
      rates,
      rf,
      tanks: tanksCfg,
      lube,
      online,
      pos,
      expenses: expenses.map((e) => ({ type: e.type, amount: e.amount })),
      creditGiven,
      creditReceived,
      bankDeposit,
      countedCash,
      previousBalance,
    }

    const totals = computeDay(calcPayload, {
      rounding: 'paper',
      maxMeterDigits: 6,
      margins: { MS: 3.2, HSD: 2.1 },
      lubeMargin: 15,
      stockLossValuation: 'selling',
      costRates: { MS: 96.46, HSD: 86.98 },
      varianceLimit: 50,
    })

    // Upsert report
    const report = await prisma.dailyReport.upsert({
      where: { date },
      create: {
        date,
        status,
        previousBalance,
        bankDeposit,
        pos,
        countedCash,
        totals,
      },
      update: {
        status,
        previousBalance,
        bankDeposit,
        pos,
        countedCash,
        totals,
      },
    })

    // Upsert readings
    for (const r of [...msReadings, ...hsdReadings]) {
      await prisma.nozzleReading.upsert({
        where: { dailyReportId_nozzleId: { dailyReportId: report.id, nozzleId: r.nozzleId } },
        create: { dailyReportId: report.id, nozzleId: r.nozzleId, opening: r.opening, closing: r.closing },
        update: { opening: r.opening, closing: r.closing },
      })
    }

    // Upsert productDay
    await prisma.productDay.upsert({
      where: { dailyReportId_product: { dailyReportId: report.id, product: 'MS' } },
      create: { dailyReportId: report.id, product: 'MS', rfLitres: rf.MS },
      update: { rfLitres: rf.MS },
    })
    await prisma.productDay.upsert({
      where: { dailyReportId_product: { dailyReportId: report.id, product: 'HSD' } },
      create: { dailyReportId: report.id, product: 'HSD', rfLitres: rf.HSD },
      update: { rfLitres: rf.HSD },
    })

    // Upsert tankDay
    if (msTank) {
      await prisma.tankDay.upsert({
        where: { dailyReportId_tankId: { dailyReportId: report.id, tankId: msTank.id } },
        create: { dailyReportId: report.id, tankId: msTank.id, opening: tanksCfg.MS.opening, receipts: tanksCfg.MS.receipts, dip: tanksCfg.MS.dip },
        update: { opening: tanksCfg.MS.opening, receipts: tanksCfg.MS.receipts, dip: tanksCfg.MS.dip },
      })
    }
    if (hsdTank) {
      await prisma.tankDay.upsert({
        where: { dailyReportId_tankId: { dailyReportId: report.id, tankId: hsdTank.id } },
        create: { dailyReportId: report.id, tankId: hsdTank.id, opening: tanksCfg.HSD.opening, receipts: tanksCfg.HSD.receipts, dip: tanksCfg.HSD.dip },
        update: { opening: tanksCfg.HSD.opening, receipts: tanksCfg.HSD.receipts, dip: tanksCfg.HSD.dip },
      })
    }

    // Collections & lube
    await prisma.onlineReceipt.deleteMany({ where: { dailyReportId: report.id } })
    for (const o of online) {
      await prisma.onlineReceipt.create({ data: { dailyReportId: report.id, label: o.label, amount: o.amount } })
    }

    await prisma.lubeSale.deleteMany({ where: { dailyReportId: report.id } })
    for (const l of lube) {
      await prisma.lubeSale.create({ data: { dailyReportId: report.id, itemName: '2T / 4T Engine Oil', quantity: l.quantity, price: l.price } })
    }

    await prisma.expense.deleteMany({ where: { dailyReportId: report.id } })
    for (const exp of expenses) {
      await prisma.expense.create({
        data: {
          date,
          dailyReportId: report.id,
          categoryId: category.id,
          type: exp.type,
          amount: exp.amount,
          details: exp.details,
        },
      })
    }

    // Archive automatically to Cloudflare R2!
    const archivePayload = {
      date,
      status,
      rates,
      pos,
      bankDeposit,
      countedCash,
      previousBalance,
      totals,
    }
    await archiveDayToR2(date, archivePayload)
    console.log(`✅ Archived ${date} to Cloudflare R2!`)
  }

  console.log('\n🎉 ALL DONE! 06-Nov and 07-Nov are populated in Database and Cloudflare R2!')
  await prisma.$disconnect()
}

populateDays()

