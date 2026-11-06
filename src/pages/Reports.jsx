import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'
import { api, downloadCsv } from '../lib/api'
import { addMonths, dateLabel, inr, money, monthKey, monthLabel, weekdayLabel } from '../lib/format'
import { useResource } from '../lib/useResource'
import { useDay } from '../context/DayContext'
import { Button, Card, CardHeader, Empty, InlineError, InlineNotice, Money, Spinner, StatusPill, TableScroll, Td, Th } from '../components/ui'

export default function Reports() {
  const { date, setDate } = useDay()
  const month = monthKey(date)
  const { data, loading, error } = useResource(() => api.get(`/reports/monthly?month=${month}`), [month])

  if (loading && !data) return <Spinner label="Building the monthly report" />
  if (error && !data) {
    return (
      <div className="p-4">
        <InlineError>{error}</InlineError>
      </div>
    )
  }
  if (!data) return null

  const { days, totals, expensesByCategory, dues, audits } = data
  const empty = days.length === 0

  const summary = [
    ['Days recorded', `${totals.days}`, `${totals.closedDays} closed · ${totals.days - totals.closedDays} open`],
    ['Fuel amount (F7)', money(totals.fuelAmount), `${inr(totals.msLitres, 3)} L MS · ${inr(totals.hsdLitres, 3)} L HSD`],
    ['Total cash (F12)', money(totals.totalCash), `bank ${money(totals.bankDeposit)}`],
    ['Expenses', money(totals.expenses), `running ${money(totals.running)} · one-off ${money(totals.oneOff)}`],
    ['Credit', money(totals.creditGiven), `given · ${money(totals.creditReceived)} received`],
    ['Daily profit (F17)', money(totals.profit), 'margins from Settings'],
  ]

  return (
    <div className="px-4 pb-10 pt-4 sm:px-[19px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" aria-label="Previous month" onClick={() => setDate(`${addMonths(month, -1)}-01`)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] text-center text-[13px] font-semibold text-[#0D0F14]">{monthLabel(month)}</span>
            <Button variant="secondary" size="sm" aria-label="Next month" onClick={() => setDate(`${addMonths(month, 1)}-01`)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDate(`${monthKey()}-01`)}>
              This month
            </Button>
          </div>
          <span className="text-[12px] text-[#4E525A]">
            {dateLabel(days[0]?.date ?? `${month}-01`)} — {dateLabel(days[days.length - 1]?.date ?? `${month}-28`)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="primary" onClick={() => downloadCsv(month)} disabled={empty}>
            <Download className="h-4 w-4" /> Download CSV
          </Button>
        </div>
      </div>

      <div className="mb-3 hidden print:block">
        <p className="text-[12px] text-[#4E525A]">
          Tirap Fuel Station · monthly report · {monthLabel(month)} · generated from closed-day records.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {summary.map(([label, value, hint]) => (
          <Card key={label} className="px-4 py-3">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#4E525A]">{label}</span>
            <p className="mt-1.5 text-[17px] font-semibold leading-none tracking-[-0.01em] tabular-nums text-[#0D0F14]">{value}</p>
            <p className="mt-1 text-[10.5px] leading-snug text-[#9BA0A6]">{hint}</p>
          </Card>
        ))}
      </div>

      {empty ? (
        <div className="mt-4">
          <InlineNotice>
            No days recorded in {monthLabel(month)}.{' '}
            <Link to="/daily-entry" className="font-medium underline underline-offset-2">
              Start today&apos;s entry
            </Link>
            .
          </InlineNotice>
        </div>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Day-by-day register"
          subtitle="Every figure is the stored close (or the live open day). Totals are the month sum."
        />
        <TableScroll className="[&>table]:min-w-[1180px]">
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Status</Th>
              <Th align="right">MS (L)</Th>
              <Th align="right">HSD (L)</Th>
              <Th align="right">Rates</Th>
              <Th align="right">Fuel</Th>
              <Th align="right">R/F</Th>
              <Th align="right">Lube</Th>
              <Th align="right">Expenses</Th>
              <Th align="right">Credit −/+</Th>
              <Th align="right">Online</Th>
              <Th align="right">POS</Th>
              <Th align="right">Bank</Th>
              <Th align="right">Total cash</Th>
              <Th align="right">Diff.</Th>
              <Th align="right">Variance</Th>
              <Th align="right">Profit</Th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date} className="hover:bg-[#F5F7F9]">
                <Td>
                  <button
                    type="button"
                    onClick={() => setDate(day.date)}
                    className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2"
                  >
                    {dateLabel(day.date)}
                  </button>
                  <span className="ml-1.5 text-[10.5px] text-[#9BA0A6]">{weekdayLabel(day.date)}</span>
                </Td>
                <Td>
                  <StatusPill status={day.status} />
                </Td>
                <Td align="right">{inr(day.msLitres, 3)}</Td>
                <Td align="right">{inr(day.hsdLitres, 3)}</Td>
                <Td align="right">
                  {day.rateMS.toFixed(2)} / {day.rateHSD.toFixed(2)}
                </Td>
                <Td align="right">{money(day.fuelAmount)}</Td>
                <Td align="right">{money(day.rfValue)}</Td>
                <Td align="right">{money(day.lube)}</Td>
                <Td align="right">{money(day.expenses)}</Td>
                <Td align="right">
                  {money(day.creditGiven)} / {money(day.creditReceived)}
                </Td>
                <Td align="right">{money(day.online)}</Td>
                <Td align="right">{money(day.pos)}</Td>
                <Td align="right">{money(day.bankDeposit)}</Td>
                <Td align="right">
                  <Money value={day.totalCash} tone={day.totalCash < 0 ? 'bad' : undefined} />
                </Td>
                <Td align="right">
                  <span className={Math.abs(day.difference) > 0.5 ? 'font-medium text-[#B42318]' : 'text-[#147A3A]'}>
                    {money(day.difference)}
                  </span>
                </Td>
                <Td align="right">
                  <span className={Math.abs(day.variance) > 0.5 ? 'text-[#B42318]' : 'text-[#4E525A]'}>
                    {inr(day.variance, 3)} L
                  </span>
                </Td>
                <Td align="right">
                  <Money value={day.profit} tone={day.profit < 0 ? 'bad' : undefined} />
                </Td>
              </tr>
            ))}
          </tbody>
          {days.length ? (
            <tfoot>
              <tr className="bg-[#F5F7F9]">
                <Td className="font-semibold text-[#0D0F14]">TOTAL</Td>
                <Td>{totals.days} day(s)</Td>
                <Td align="right">{inr(totals.msLitres, 3)}</Td>
                <Td align="right">{inr(totals.hsdLitres, 3)}</Td>
                <Td align="right">—</Td>
                <Td align="right">
                  <span className="font-semibold text-[#0D0F14]">{money(totals.fuelAmount)}</span>
                </Td>
                <Td align="right">{money(totals.rfValue)}</Td>
                <Td align="right">{money(totals.lube)}</Td>
                <Td align="right">{money(totals.expenses)}</Td>
                <Td align="right">
                  {money(totals.creditGiven)} / {money(totals.creditReceived)}
                </Td>
                <Td align="right">{money(totals.online)}</Td>
                <Td align="right">{money(totals.pos)}</Td>
                <Td align="right">{money(totals.bankDeposit)}</Td>
                <Td align="right">
                  <span className="font-semibold text-[#0D0F14]">{money(totals.totalCash)}</span>
                </Td>
                <Td align="right">{totals.daysWithDifference} day(s) off</Td>
                <Td align="right">{inr(totals.variance, 3)} L</Td>
                <Td align="right">
                  <span className="font-semibold text-[#0D0F14]">{money(totals.profit)}</span>
                </Td>
              </tr>
            </tfoot>
          ) : null}
        </TableScroll>
        {!days.length ? <Empty>Nothing to show for {monthLabel(month)}.</Empty> : null}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Expenses by category" subtitle={`${monthLabel(month)} · running and one-off.`} />
          {expensesByCategory.length === 0 ? (
            <Empty>No expenses in this month.</Empty>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th align="right">Running</Th>
                  <Th align="right">One-off</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {expensesByCategory.map((row) => (
                  <tr key={row.category} className="border-b border-[#E2E4E6]">
                    <Td className="font-medium text-[#0D0F14]">{row.category}</Td>
                    <Td align="right">{money(row.running)}</Td>
                    <Td align="right">{money(row.oneOff)}</Td>
                    <Td align="right">
                      <Money value={row.total} className="font-semibold" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <CardHeader title="Credit outstanding" subtitle="All parties with a positive balance, as of today." />
          {dues.length === 0 ? (
            <Empty>No credit outstanding.</Empty>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Party</Th>
                  <Th>Oldest credit</Th>
                  <Th align="right">Outstanding</Th>
                </tr>
              </thead>
              <tbody>
                {dues.map((party) => (
                  <tr key={party.id} className="border-b border-[#E2E4E6]">
                    <Td className="font-medium text-[#0D0F14]">
                      {party.name}
                      <span className="ml-1.5 text-[10.5px] text-[#9BA0A6]">{party.phone}</span>
                    </Td>
                    <Td>{party.oldestCreditDate ? dateLabel(party.oldestCreditDate) : 'opening'}</Td>
                    <Td align="right">
                      <Money value={party.outstanding} tone="bad" className="font-semibold" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Audit trail" subtitle="Closes, reopens, saves and edits in this month. Newest first." />
        {audits.length === 0 ? (
          <Empty>No audited actions recorded in this month.</Empty>
        ) : (
          <ul className="divide-y divide-[#EFF1F3]">
            {audits.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="inline-flex h-[22px] shrink-0 items-center rounded-[6px] bg-[#EFF1F3] px-1.5 text-[10px] font-medium uppercase tracking-[0.4px] text-[#4E525A]">
                    {entry.action}
                  </span>
                  <span className="truncate text-[12px] text-[#4E525A]">
                    {entry.entity}
                    {entry.entityId ? ` · ${entry.entityId}` : ''}
                    {entry.details?.date ? ` · ${entry.details.date}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-[#9BA0A6]">
                  {new Intl.DateTimeFormat('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Kolkata',
                  }).format(new Date(entry.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-[11px] leading-relaxed text-[#9BA0A6]">
        CSV includes the same day rows and a TOTAL line, so it can be filed with the dealer&apos;s monthly papers. Every
        figure is in rupees unless the column says litres.
      </p>
    </div>
  )
}
