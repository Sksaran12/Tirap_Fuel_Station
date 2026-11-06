/**
 * Tirap Fuel Station — shared calculation engine (PRD §6, F1–F17).
 *
 * Imported by both the browser (live preview) and the API (official figures),
 * so the owner sees exactly what the server will store.
 *
 * Money is computed in rupees to 2 decimals, then "paper rounded" (floored to
 * the whole rupee) when settings.rounding === 'paper', matching the notebook.
 * Litres keep 3 decimals.
 */

export const PRODUCTS = ['MS', 'HSD']
export const PRODUCT_LABEL = { MS: 'MS (Petrol)', HSD: 'HSD (Diesel)' }

/** Round to 2 decimals without binary drift. */
export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

export function round3(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000
}

/** Paper rounding: floor to the whole rupee. */
export function floorRupee(value) {
  return Math.floor(round2(value))
}

/** Apply the configured rounding mode to a money value. */
export function money(value, mode = 'paper') {
  return mode === 'paper' ? floorRupee(value) : round2(value)
}

/** Indian digit grouping, e.g. 122039 -> 1,22,039. */
export function inr(value, { decimals = 0 } = {}) {
  const n = Number(value ?? 0)
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function litres(value) {
  return Number(round3(value ?? 0)).toLocaleString('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

const num = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Compute one business day.
 *
 * @param {object} input
 * @param {{MS: Array<{opening:number, closing:number, rollover?:boolean, replacedLitres?:number|null}>, HSD: Array<...>}} input.nozzles
 * @param {{MS:number, HSD:number}} input.rates             rate of the day per product
 * @param {{MS:number, HSD:number}} input.rf                R/F litres returned to tank
 * @param {{MS:{opening:number, receipts:number, dip:number}, HSD:{...}}} input.tanks
 * @param {Array<{quantity:number, price:number}>} input.lube
 * @param {Array<{label:string, amount:number}>} input.online
 * @param {number} input.pos
 * @param {number} input.bankDeposit
 * @param {number} input.countedCash
 * @param {number} input.previousBalance
 * @param {number} input.creditGiven
 * @param {number} input.creditReceived
 * @param {Array<{amount:number, type:'running'|'one-off'}>} input.expenses
 * @param {{rounding:'paper'|'exact', maxMeterDigits:number, lubeMargin:number, margins:{MS:number,HSD:number}, stockLossValuation:'cost'|'selling', costRates:{MS:number,HSD:number}, varianceLimit:number, profitLocked:boolean}} settings
 */
export function computeDay(input, settings = {}) {
  const mode = settings.rounding === 'exact' ? 'exact' : 'paper'
  const maxMeter = num(settings.maxMeterDigits) || 6
  const rolloverSpan = Math.pow(10, maxMeter)

  const products = {}
  const errors = []

  for (const product of PRODUCTS) {
    const rate = num(input.rates?.[product])
    const rf = Math.max(0, num(input.rf?.[product]))
    const nozzles = Array.isArray(input.nozzles?.[product]) ? input.nozzles[product] : []

    let meterSale = 0 // F1 + F2
    const nozzleRows = nozzles.map((nozzle, index) => {
      const opening = num(nozzle.opening)
      let closing = num(nozzle.closing)
      const replaced = nozzle.replacedLitres !== undefined && nozzle.replacedLitres !== null && nozzle.replacedLitres !== ''

      // §9: closing meter below opening -> rollover or replacement
      if (!replaced && closing < opening) {
        if (nozzle.rollover) {
          closing += rolloverSpan
        } else {
          errors.push(
            `${product} nozzle ${index + 1}: closing meter (${closing}) is below opening (${opening}). Choose rollover or replaced meter.`,
          )
        }
      }

      const sale = replaced ? num(nozzle.replacedLitres) : round3(closing - opening)
      meterSale += sale
      return { opening: round3(opening), closing: round3(closing), sale: round3(sale), replaced }
    })

    // F3 net / A/C sale
    const acSale = round3(meterSale - rf)
    if (rf > meterSale) {
      errors.push(`${product}: R/F litres (${rf}) cannot exceed the meter sale (${round3(meterSale)}).`)
    }

    // F4 fuel amount, F5 R/F value
    const amountExact = round2(acSale * rate)
    const rfValueExact = round2(rf * rate)
    const amount = money(amountExact, mode)
    const rfValue = money(rfValueExact, mode)

    // F8 closing stock (book) = opening + receipts - meter sale + R/F
    const opening = round3(num(input.tanks?.[product]?.opening))
    const receipts = round3(num(input.tanks?.[product]?.receipts))
    const dip = round3(num(input.tanks?.[product]?.dip))
    const closingStock = round3(opening + receipts - meterSale + rf)

    // F9 stock values
    const openingValueExact = round2(opening * rate)
    const closingValueExact = round2(closingStock * rate)

    // F10 variance
    const variance = round3(dip - closingStock)

    const lossLitres = variance < 0 ? Math.abs(variance) : 0
    const lossRate = settings.stockLossValuation === 'cost' ? num(settings.costRates?.[product]) : rate

    products[product] = {
      rate,
      rf,
      meterSale: round3(meterSale),
      acSale,
      amount,
      amountExact,
      rfValue,
      rfValueExact,
      openingStock: opening,
      receipts,
      closingStock,
      dip,
      openingValue: money(openingValueExact, mode),
      closingValue: money(closingValueExact, mode),
      openingValueExact,
      closingValueExact,
      variance,
      lossLitres: round3(lossLitres),
      lossValue: round2(lossLitres * lossRate),
      nozzles: nozzleRows,
    }
  }

  // F7 total fuel amount
  const totalFuel = round2(products.MS.amount + products.HSD.amount)
  // F5 total R/F value
  const totalRf = round2(products.MS.rfValue + products.HSD.rfValue)

  // F6 lubricant sale
  const lubeRows = (input.lube || []).map((line) => {
    const quantity = round3(num(line.quantity))
    const price = round2(num(line.price))
    return { quantity, price, amount: round2(quantity * price) }
  })
  const lubeTotal = round2(lubeRows.reduce((sum, line) => sum + line.amount, 0))

  // Expenses split (Running reduces profit, One-off does not — PRD §7)
  const expenseRows = (input.expenses || []).map((line) => ({
    type: line.type === 'one-off' ? 'one-off' : 'running',
    amount: round2(num(line.amount)),
  }))
  const expensesTotal = round2(expenseRows.reduce((sum, line) => sum + line.amount, 0))
  const runningExpenses = round2(
    expenseRows.filter((line) => line.type === 'running').reduce((sum, line) => sum + line.amount, 0),
  )
  const oneOffExpenses = round2(expensesTotal - runningExpenses)

  // Online list + POS
  const onlineRows = (input.online || []).map((line) => ({
    label: String(line.label ?? '').trim() || 'Online',
    amount: round2(num(line.amount)),
  }))
  const onlineTotal = round2(onlineRows.reduce((sum, line) => sum + line.amount, 0))
  const pos = round2(num(input.pos))
  const bankDeposit = round2(num(input.bankDeposit))
  const creditGiven = round2(num(input.creditGiven))
  const creditReceived = round2(num(input.creditReceived))
  const previousBalance = round2(num(input.previousBalance))
  const countedCash = round2(num(input.countedCash))

  // F11 net cash movement
  const netCash = round2(totalFuel - expensesTotal - creditGiven - onlineTotal - pos + creditReceived)
  // F12 total cash (book)
  const totalCash = round2(netCash + previousBalance + lubeTotal - bankDeposit)
  // F13 cash difference
  const cashDifference = round2(countedCash - totalCash)
  // F16 display-only line
  const rfPlusCash = round2(totalRf + totalCash)

  // F17 daily profit
  const marginTotal = round2(
    PRODUCTS.reduce((sum, product) => sum + products[product].acSale * num(settings.margins?.[product]), 0),
  )
  const stockLossValue = round2(products.MS.lossValue + products.HSD.lossValue)
  const lubeMargin = round2(lubeTotal * (num(settings.lubeMargin) / 100))
  const profitNet = round2(marginTotal + lubeMargin - runningExpenses - stockLossValue)

  const varianceAlerts = PRODUCTS.filter((product) => {
    const limit = Math.abs(num(settings.varianceLimit))
    return limit > 0 && Math.abs(products[product].variance) > limit
  }).map((product) => `${product} stock variance ${litres(products[product].variance)} L exceeds the limit.`)

  return {
    mode,
    products,
    fuel: { totalAmount: totalFuel, totalRfValue: totalRf },
    lube: { rows: lubeRows, total: lubeTotal },
    expenses: {
      rows: expenseRows,
      total: expensesTotal,
      running: runningExpenses,
      oneOff: oneOffExpenses,
    },
    cash: {
      previousBalance,
      net: netCash,
      total: totalCash,
      counted: countedCash,
      difference: cashDifference,
      bankDeposit,
      online: onlineTotal,
      onlineRows,
      pos,
      creditGiven,
      creditReceived,
    },
    profit: {
      marginTotal,
      lubeMargin,
      runningExpenses,
      stockLossValue,
      net: profitNet,
      set: Boolean(settings.margins?.MS || settings.margins?.HSD || settings.profitLocked === false),
    },
    rfPlusCash,
    errors,
    alerts: [
      ...(totalCash < 0 ? [`Total cash is negative (${inr(totalCash)}).`] : []),
      ...varianceAlerts,
    ],
  }
}

/** Round the resolved figure for storage: money fields follow the rounding mode. */
export function computeAndFlatten(input, settings) {
  return computeDay(input, settings)
}
