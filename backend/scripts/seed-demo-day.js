import { prisma } from '../src/db.js'
import { computeDay } from '../src/utils/calculator.js'

async function populateDayData() {
  const date = '2026-11-06'
  console.log(`Seeding day data for ${date}...`)

  try {
    // 1. Get or create nozzles
    let nozzles = await prisma.nozzle.findMany({ where: { active: true } })
    if (nozzles.length === 0) {
      console.log('Creating default nozzles...')
      await prisma.nozzle.createMany({
        data: [
          { name: 'Nozzle 1 (MS)', product: 'MS', sortOrder: 1 },
          { name: 'Nozzle 2 (MS)', product: 'MS', sortOrder: 2 },
          { name: 'Nozzle 3 (HSD)', product: 'HSD', sortOrder: 3 },
          { name: 'Nozzle 4 (HSD)', product: 'HSD', sortOrder: 4 },
        ],
      })
      nozzles = await prisma.nozzle.findMany({ where: { active: true } })
    }

    // 2. Get or create tanks
    let tanks = await prisma.tank.findMany({ where: { active: true } })
    if (tanks.length === 0) {
      console.log('Creating default tanks...')
      await prisma.tank.createMany({
        data: [
          { name: 'Tank 1 (MS)', product: 'MS' },
          { name: 'Tank 2 (HSD)', product: 'HSD' },
        ],
      })
      tanks = await prisma.tank.findMany({ where: { active: true } })
    }

    // 3. Get or create expense category
    let category = await prisma.expenseCategory.findFirst()
    if (!category) {
      category = await prisma.expenseCategory.create({
        data: { name: 'Generator / Running', active: true },
      })
    }

    // 4. Upsert rates for today
    await prisma.rate.upsert({
      where: { product_date: { product: 'MS', date } },
      create: { product: 'MS', date, rate: 99.66 },
      update: { rate: 99.66 },
    })
    await prisma.rate.upsert({
      where: { product_date: { product: 'HSD', date } },
      create: { product: 'HSD', date, rate: 89.08 },
      update: { rate: 89.08 },
    })

    // 5. Build calculations using calculator
    const msNozzles = nozzles.filter((n) => n.product === 'MS')
    const hsdNozzles = nozzles.filter((n) => n.product === 'HSD')

    const msReadings = msNozzles.map((n, i) => ({
      nozzleId: n.id,
      opening: 10000 + i * 500,
      closing: 10000 + i * 500 + (250 + i * 120),
    }))
    const hsdReadings = hsdNozzles.map((n, i) => ({
      nozzleId: n.id,
      opening: 20000 + i * 500,
      closing: 20000 + i * 500 + (450 + i * 150),
    }))

    const calcPayload = {
      nozzles: {
        MS: msReadings.map((r) => ({ opening: r.opening, closing: r.closing })),
        HSD: hsdReadings.map((r) => ({ opening: r.opening, closing: r.closing })),
      },
      rates: { MS: 99.66, HSD: 89.08 },
      rf: { MS: 20, HSD: 30 },
      tanks: {
        MS: { opening: 12000, receipts: 0, dip: 11400 },
        HSD: { opening: 18000, receipts: 0, dip: 16800 },
      },
      lube: [{ quantity: 2, price: 350 }],
      online: [{ label: 'UPI / PhonePe', amount: 35400 }],
      pos: 12500,
      expenses: [{ type: 'running', amount: 2800 }],
      creditGiven: 14500,
      creditReceived: 4000,
      bankDeposit: 25000,
      countedCash: 42350,
      previousBalance: 30000,
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

    // 6. Upsert DailyReport
    const report = await prisma.dailyReport.upsert({
      where: { date },
      create: {
        date,
        status: 'open',
        previousBalance: 30000,
        bankDeposit: 25000,
        pos: 12500,
        countedCash: 42350,
        totals: totals,
      },
      update: {
        previousBalance: 30000,
        bankDeposit: 25000,
        pos: 12500,
        countedCash: 42350,
        totals: totals,
      },
    })

    // 7. Upsert nozzle readings
    for (const r of [...msReadings, ...hsdReadings]) {
      await prisma.nozzleReading.upsert({
        where: { dailyReportId_nozzleId: { dailyReportId: report.id, nozzleId: r.nozzleId } },
        create: {
          dailyReportId: report.id,
          nozzleId: r.nozzleId,
          opening: r.opening,
          closing: r.closing,
        },
        update: {
          opening: r.opening,
          closing: r.closing,
        },
      })
    }

    // 8. Upsert product days
    await prisma.productDay.upsert({
      where: { dailyReportId_product: { dailyReportId: report.id, product: 'MS' } },
      create: { dailyReportId: report.id, product: 'MS', rfLitres: 20 },
      update: { rfLitres: 20 },
    })
    await prisma.productDay.upsert({
      where: { dailyReportId_product: { dailyReportId: report.id, product: 'HSD' } },
      create: { dailyReportId: report.id, product: 'HSD', rfLitres: 30 },
      update: { rfLitres: 30 },
    })

    // 9. Upsert TankDay
    const msTank = tanks.find((t) => t.product === 'MS') || tanks[0]
    const hsdTank = tanks.find((t) => t.product === 'HSD') || tanks[1]
    if (msTank) {
      await prisma.tankDay.upsert({
        where: { dailyReportId_tankId: { dailyReportId: report.id, tankId: msTank.id } },
        create: { dailyReportId: report.id, tankId: msTank.id, opening: 12000, receipts: 0, dip: 11400 },
        update: { opening: 12000, receipts: 0, dip: 11400 },
      })
    }
    if (hsdTank) {
      await prisma.tankDay.upsert({
        where: { dailyReportId_tankId: { dailyReportId: report.id, tankId: hsdTank.id } },
        create: { dailyReportId: report.id, tankId: hsdTank.id, opening: 18000, receipts: 0, dip: 16800 },
        update: { opening: 18000, receipts: 0, dip: 16800 },
      })
    }

    // 10. Online receipts & lube
    await prisma.onlineReceipt.deleteMany({ where: { dailyReportId: report.id } })
    await prisma.onlineReceipt.create({
      data: { dailyReportId: report.id, label: 'UPI / PhonePe', amount: 35400 },
    })

    await prisma.lubeSale.deleteMany({ where: { dailyReportId: report.id } })
    await prisma.lubeSale.create({
      data: { dailyReportId: report.id, itemName: '2T / 4T Engine Oil', quantity: 2, price: 350 },
    })

    // 11. Add an expense for today
    await prisma.expense.deleteMany({ where: { dailyReportId: report.id } })
    await prisma.expense.create({
      data: {
        date,
        dailyReportId: report.id,
        categoryId: category.id,
        type: 'running',
        amount: 2800,
        details: 'Generator Diesel & Station Cleaning',
      },
    })

    console.log(`\n🎉 SUCCESS: Data for ${date} has been populated!`)
    console.log(`- Fuel Sale (F7): ₹${totals.fuel.totalAmount}`)
    console.log(`- Total Cash (F12): ₹${totals.cash.total}`)
    console.log(`- Net Cash (F11): ₹${totals.cash.net}`)
    console.log(`- Counted Cash: ₹42,350`)
  } catch (e) {
    console.error('Error populating day data:', e)
  } finally {
    await prisma.$disconnect()
  }
}

populateDayData()

