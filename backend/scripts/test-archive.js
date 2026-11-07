import { prisma } from '../src/db.js'
import { archiveDayToR2 } from '../src/archive.js'

async function triggerArchive() {
  const date = '2026-11-06'
  const report = await prisma.dailyReport.findUnique({ where: { date } })
  if (!report) {
    console.log('No report found for', date)
    return
  }

  const rates = await prisma.rate.findMany({ where: { date } })
  const ratesObj = {}
  rates.forEach((r) => { ratesObj[r.product] = Number(r.rate) })

  const mockPayload = {
    date: report.date,
    status: report.status,
    rates: ratesObj,
    pos: Number(report.pos),
    bankDeposit: Number(report.bankDeposit),
    countedCash: Number(report.countedCash),
    previousBalance: Number(report.previousBalance),
    totals: report.totals,
  }

  console.log('Archiving daily calculated register to Cloudflare R2...')
  const doc = await archiveDayToR2(date, mockPayload)
  console.log('Archive complete:', doc?.key)

  await prisma.$disconnect()
}

triggerArchive()

