import test from 'node:test'
import assert from 'node:assert/strict'
import { computeDay } from '../../shared/calc.js'

/**
 * TC-01 — the paper sheet of 24/10/2026 (PRD §6).
 * Every figure in the PRD's worked example must reproduce exactly.
 */
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
  expenses: [
    { type: 'running', amount: 5000 },
    { type: 'running', amount: 13400 },
    { type: 'running', amount: 5000 },
    { type: 'running', amount: 6500 },
    { type: 'running', amount: 5000 },
    { type: 'running', amount: 102 },
  ],
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

test('TC-01 meter sales (F1, F2)', () => {
  const day = computeDay(sheet, settings)
  assert.equal(day.products.MS.meterSale, 986)
  assert.equal(day.products.HSD.meterSale, 1456)
})

test('TC-01 A/C sale, fuel amounts and R/F values (F3, F4, F5)', () => {
  const day = computeDay(sheet, settings)
  assert.equal(day.products.MS.acSale, 930)
  assert.equal(day.products.HSD.acSale, 1370)
  assert.equal(day.products.MS.amount, 92683)
  assert.equal(day.products.MS.amountExact, 92683.8)
  assert.equal(day.products.HSD.amount, 122039)
  assert.equal(day.products.HSD.amountExact, 122039.6)
  assert.equal(day.products.MS.rfValue, 5580)
  assert.equal(day.products.HSD.rfValue, 7660)
  assert.equal(day.fuel.totalAmount, 214722)
  assert.equal(day.fuel.totalRfValue, 13240)
})

test('TC-01 stock and stock value (F8, F9, F10)', () => {
  const day = computeDay(sheet, settings)
  assert.equal(day.products.MS.closingStock, 14470)
  assert.equal(day.products.HSD.closingStock, 8930)
  assert.equal(day.products.MS.openingValue, 1534764)
  assert.equal(day.products.HSD.openingValue, 917524)
  assert.equal(day.products.MS.closingValue, 1442080)
  assert.equal(day.products.HSD.closingValue, 795484)
  assert.equal(day.products.MS.variance, 0)
  assert.equal(day.products.HSD.variance, 0)
})

test('TC-01 cash chain (F6, F11, F12, F13, F16)', () => {
  const day = computeDay(sheet, settings)
  assert.equal(day.lube.total, 580)
  assert.equal(day.expenses.total, 35002)
  assert.equal(day.cash.net, -29487)
  assert.equal(day.cash.total, 34467)
  assert.equal(day.cash.difference, 0)
  assert.equal(day.rfPlusCash, 47707)
})

test('TC-01 product breakdown balances', () => {
  const day = computeDay(sheet, settings)
  assert.equal(day.products.MS.amount + day.products.HSD.amount, day.fuel.totalAmount)
  assert.equal(day.products.MS.rfValue + day.products.HSD.rfValue, day.fuel.totalRfValue)
  assert.equal(day.errors.length, 0)
})

test('paper rounding floors, exact mode keeps paise', () => {
  const exact = computeDay(sheet, { ...settings, rounding: 'exact' })
  assert.equal(exact.products.MS.amount, 92683.8)
  assert.equal(exact.products.HSD.amount, 122039.6)
  assert.equal(exact.products.MS.rfValue, 5580.96)
})

test('R/F above meter sale is rejected', () => {
  const day = computeDay(
    { ...sheet, rf: { MS: 2000, HSD: 0 } },
    settings,
  )
  assert.ok(day.errors.some((message) => message.includes('R/F')))
})

test('closing meter below opening needs rollover or replacement (F1)', () => {
  const bad = computeDay(
    {
      ...sheet,
      nozzles: {
        MS: [{ opening: 999990, closing: 4 }],
        HSD: [{ opening: 0, closing: 0 }],
      },
      rf: { MS: 0, HSD: 0 },
    },
    settings,
  )
  assert.ok(bad.errors.some((message) => message.includes('below opening')))

  const rolled = computeDay(
    {
      ...sheet,
      nozzles: {
        MS: [{ opening: 999990, closing: 4, rollover: true }],
        HSD: [{ opening: 0, closing: 0 }],
      },
      rf: { MS: 0, HSD: 0 },
    },
    settings,
  )
  assert.equal(rolled.products.MS.meterSale, 14) // 1,000,004 - 999,990

  const replaced = computeDay(
    {
      ...sheet,
      nozzles: {
        MS: [{ opening: 999990, closing: 4, replacedLitres: 40 }],
        HSD: [{ opening: 0, closing: 0 }],
      },
      rf: { MS: 0, HSD: 0 },
    },
    settings,
  )
  assert.equal(replaced.products.MS.meterSale, 40)
  assert.equal(replaced.errors.length, 0)
})

test('daily profit combines margins, lube margin, running expenses and stock loss (F17)', () => {
  const day = computeDay(sheet, {
    ...settings,
    margins: { MS: 3.5, HSD: 3 },
    lubeMargin: 10,
    varianceLimit: 0,
  })
  // 930*3.5 + 1370*3 + 580*10% - 35,002 - 0
  assert.equal(day.profit.marginTotal, 7365)
  assert.equal(day.profit.lubeMargin, 58)
  assert.equal(day.profit.net, 7365 + 58 - 35002)
})

test('variance beyond the limit raises an alert (F10)', () => {
  const day = computeDay(
    { ...sheet, tanks: { MS: { opening: 15400, receipts: 0, dip: 14000 }, HSD: { opening: 10300, receipts: 0, dip: 8930 } } },
    { ...settings, varianceLimit: 100 },
  )
  assert.equal(day.products.MS.variance, -470)
  assert.ok(day.alerts.some((message) => message.includes('MS')))
})
