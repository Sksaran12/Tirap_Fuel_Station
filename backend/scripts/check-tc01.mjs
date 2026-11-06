/**
 * Print the TC-01 paper sheet (24/10/2026) through the real server engine.
 *
 *   cd backend
 *   npm run check:tc01
 *
 * No database is needed: this runs `computeDay()` directly and prints the same
 * figures the API stores in daily_reports.totals. Use `/api/day/:date` or
 * Prisma Studio to compare a saved day against this table.
 */
import { computeDay } from '../src/utils/calculator.js'

const sheet = {
  nozzles: {
    MS: [248, 541, 165, 32].map((sale, i) => ({ opening: 100000 + i * 1000, closing: 100000 + i * 1000 + sale })),
    HSD: [604, 630, 110, 112].map((sale, i) => ({ opening: 200000 + i * 1000, closing: 200000 + i * 1000 + sale })),
  },
  rates: { MS: 99.66, HSD: 89.08 },
  rf: { MS: 56, HSD: 86 },
  tanks: {
    MS: { opening: 15400, receipts: 0, dip: 14470 },
    HSD: { opening: 10300, receipts: 0, dip: 8930 },
  },
  lube: [
    { quantity: 1, price: 230 },
    { quantity: 1, price: 350 },
  ],
  online: [
    { label: 'Online 1', amount: 145669 },
    { label: 'Dkpr', amount: 15143 },
  ],
  pos: 13300,
  expenses: [5000, 13400, 5000, 6500, 5000, 102].map((amount) => ({ type: 'running', amount })),
  creditGiven: 41095,
  creditReceived: 6000,
  bankDeposit: 0,
  countedCash: 34467,
  previousBalance: 63374,
}

const settings = {
  rounding: 'paper',
  maxMeterDigits: 6,
  margins: { MS: 0, HSD: 0 },
  lubeMargin: 0,
  stockLossValuation: 'selling',
  costRates: { MS: 0, HSD: 0 },
  varianceLimit: 0,
}

const day = computeDay(sheet, settings)
const rows = [
  ['F2 meter sale', `${day.products.MS.meterSale} / ${day.products.HSD.meterSale} L`],
  ['F3 A/C sale', `${day.products.MS.acSale} / ${day.products.HSD.acSale} L`],
  ['F4 fuel amount', `${day.products.MS.amount} / ${day.products.HSD.amount}`],
  ['F5 R/F value', `${day.products.MS.rfValue} / ${day.products.HSD.rfValue}`],
  ['F6 lubricants', day.lube.total],
  ['F7 total fuel', day.fuel.totalAmount],
  ['F8 closing stock', `${day.products.MS.closingStock} / ${day.products.HSD.closingStock} L`],
  ['F9 opening value', `${day.products.MS.openingValue} / ${day.products.HSD.openingValue}`],
  ['F9 closing value', `${day.products.MS.closingValue} / ${day.products.HSD.closingValue}`],
  ['F10 variance', `${day.products.MS.variance} / ${day.products.HSD.variance} L`],
  ['F11 net cash', day.cash.net],
  ['F12 total cash', day.cash.total],
  ['F13 cash difference', day.cash.difference],
  ['F16 R/F + cash', day.rfPlusCash],
  ['F17 daily profit', day.profit.net],
  ['errors', day.errors.length],
]

console.log('TC-01 — 24/10/2026 — paper rounding')
console.table(rows.map(([figure, value]) => ({ figure, value })))

console.log('Manual arithmetic:')
console.log(`  F4 MS  = floor(930 x 99.66)       = ${Math.floor(930 * 99.66)}`)
console.log(`  F4 HSD = floor(1370 x 89.08)      = ${Math.floor(1370 * 89.08)}`)
console.log(`  F11    = 214722 - 35002 - 41095 - 160812 - 13300 + 6000 = ${day.cash.net}`)
console.log(`  F12    = ${day.cash.net} + 63374 + 580 - 0 = ${day.cash.total}`)
console.log(`  F13    = 34467 - ${day.cash.total} = ${day.cash.difference}`)
