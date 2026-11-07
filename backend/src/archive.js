import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2, R2_BUCKET } from './r2.js'
import { prisma, audit, num } from './db.js'

/**
 * Format numbers cleanly for CSV
 */
function fmt(val, decimals = 2) {
  const n = num(val)
  return Number.isFinite(n) ? n.toFixed(decimals) : '0.00'
}

function fmtInt(val) {
  const n = num(val)
  return Number.isFinite(n) ? Math.round(n).toString() : '0'
}

/**
 * Generate a clean, comprehensive paper-style CSV matching the owner's register
 */
export function generateDayCsv(date, payload) {
  const computed = payload.computed || payload.totals || {}
  const inputs = payload.inputs || {}
  const rates = inputs.rates || computed.rates || {}
  const products = computed.products || {}
  const cash = computed.cash || {}
  const fuel = computed.fuel || {}
  const lube = computed.lube || {}
  const expenses = computed.expenses || {}

  const ms = products.MS || {}
  const hsd = products.HSD || {}

  const lines = [
    `=============================================================`,
    `TIRAP FUEL STATION (BHARAT PETROLEUM DEALER)`,
    `DAILY REGISTER & RECONCILIATION SHEET`,
    `=============================================================`,
    `Date,${date}`,
    `Register Status,${(payload.status || 'open').toUpperCase()}`,
    `Generated At,${new Date().toISOString()}`,
    ``,
    `-------------------------------------------------------------`,
    `1. RATES OF THE DAY`,
    `-------------------------------------------------------------`,
    `Product,Rate (Rs/L)`,
    `MS (Petrol),${fmt(rates.MS || ms.rate, 2)}`,
    `HSD (Diesel),${fmt(rates.HSD || hsd.rate, 2)}`,
    ``,
    `-------------------------------------------------------------`,
    `2. FUEL DISPENSING & SALES (F1 - F7)`,
    `-------------------------------------------------------------`,
    `Item,MS (Petrol),HSD (Diesel),Total`,
    `Meter Sale (Litres),${fmt(ms.meterSale, 3)},${fmt(hsd.meterSale, 3)},${fmt(num(ms.meterSale) + num(hsd.meterSale), 3)} L`,
    `Testing / Return to Tank (R/F),${fmt(ms.rf, 3)},${fmt(hsd.rf, 3)},${fmt(num(ms.rf) + num(hsd.rf), 3)} L`,
    `Actual Fuel Sold (A/C Sale),${fmt(ms.acSale, 3)},${fmt(hsd.acSale, 3)},${fmt(num(ms.acSale) + num(hsd.acSale), 3)} L`,
    `Fuel Sale Amount (Rs),${fmtInt(ms.amount)},${fmtInt(hsd.amount)},Rs ${fmtInt(fuel.totalAmount)}`,
    `R/F Value (Rs),${fmtInt(ms.rfValue)},${fmtInt(hsd.rfValue)},Rs ${fmtInt(fuel.totalRfValue)}`,
    ``,
    `-------------------------------------------------------------`,
    `3. TANK STOCK & PHYSICAL DIP (F8 - F10)`,
    `-------------------------------------------------------------`,
    `Particulars,MS (Petrol),HSD (Diesel)`,
    `Opening Stock (L),${fmt(ms.openingStock, 3)},${fmt(hsd.openingStock, 3)}`,
    `Tanker Receipts (L),${fmt(ms.receipts, 3)},${fmt(hsd.receipts, 3)}`,
    `Closing Book Stock (L),${fmt(ms.closingStock, 3)},${fmt(hsd.closingStock, 3)}`,
    `Physical Dip Reading (L),${fmt(ms.dip, 3)},${fmt(hsd.dip, 3)}`,
    `Stock Variance (Dip - Book),${fmt(ms.variance, 3)} L,${fmt(hsd.variance, 3)} L`,
    `Opening Stock Value (Rs),${fmtInt(ms.openingValue)},${fmtInt(hsd.openingValue)}`,
    `Closing Stock Value (Rs),${fmtInt(ms.closingValue)},${fmtInt(hsd.closingValue)}`,
    ``,
    `-------------------------------------------------------------`,
    `4. CASH BOOK & DAILY RECONCILIATION CHAIN (F11 - F16)`,
    `-------------------------------------------------------------`,
    `Cash Chain Items,Amount (Rs)`,
    `Total Fuel Sales Amount (F7),+ ${fmtInt(fuel.totalAmount)}`,
    `Lubricants (M-Oil) Sales (F6),+ ${fmtInt(lube.total)}`,
    `Credit Payments Received in Cash,+ ${fmtInt(cash.creditReceived)}`,
    `Total Running Expenses,- ${fmtInt(expenses.total)}`,
    `Credit Sales Given to Parties,- ${fmtInt(cash.creditGiven)}`,
    `Online / UPI Collections,- ${fmtInt(cash.online)}`,
    `POS Card Machine Swipes,- ${fmtInt(cash.pos)}`,
    `-------------------------------------------------------------`,
    `Net Cash Movement of the Day (F11),Rs ${fmtInt(cash.net)}`,
    `Carried Opening Cash Balance (F14),+ Rs ${fmtInt(cash.previousBalance || inputs.previousBalance)}`,
    `Bank Cash Deposit Made,- Rs ${fmtInt(cash.bankDeposit || inputs.bankDeposit)}`,
    `-------------------------------------------------------------`,
    `Expected Closing Cash in Drawer (F12),Rs ${fmtInt(cash.total)}`,
    `Physical Cash Counted in Drawer,Rs ${fmtInt(cash.counted || inputs.countedCash)}`,
    `Cash Shortage / Excess (F13),Rs ${fmtInt(cash.difference)}`,
    `R/F Value + Closing Cash (F16),Rs ${fmtInt(computed.rfPlusCash)}`,
    ``,
    `-------------------------------------------------------------`,
    `5. PROFITABILITY ESTIMATE (F17)`,
    `-------------------------------------------------------------`,
    `Estimated Net Daily Profit,Rs ${fmtInt(computed.profit?.net)}`,
  ]

  return lines.join('\n')
}

/**
 * Automatically archives the day's calculated register as a CSV file in Cloudflare R2
 * and registers it in the Document table.
 */
export async function archiveDayToR2(date, payload) {
  if (!process.env.CF_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID) {
    console.warn('[r2-archive] Cloudflare R2 credentials not configured, skipping archive.')
    return null
  }

  try {
    const filename = `daily-report-${date}.csv`
    const key = `reports/${date}/${filename}`
    const csvContent = generateDayCsv(date, payload)
    const buffer = Buffer.from(csvContent, 'utf-8')

    // 1. Upload to Cloudflare R2
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'text/csv; charset=utf-8',
      })
    )

    // 2. Upsert record in PostgreSQL document table
    const existing = await prisma.document.findFirst({
      where: { date, tag: 'daily-report-csv' },
    })

    let doc
    if (existing) {
      doc = await prisma.document.update({
        where: { id: existing.id },
        data: {
          key,
          filename,
          size: buffer.byteLength,
          contentType: 'text/csv',
        },
      })
    } else {
      doc = await prisma.document.create({
        data: {
          key,
          filename,
          contentType: 'text/csv',
          size: buffer.byteLength,
          date,
          tag: 'daily-report-csv',
        },
      })
    }

    await audit('report.archive_r2', 'document', doc.id, { date, key })
    console.log(`[r2-archive] Successfully saved clean daily report ${filename} to Cloudflare R2!`)
    return doc
  } catch (error) {
    console.error('[r2-archive] Failed to archive day to R2:', error)
    return null
  }
}
