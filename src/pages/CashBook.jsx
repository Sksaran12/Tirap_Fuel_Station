import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { api } from '../lib/api'
import { addMonths, dateLabel, inr, money, monthKey, monthLabel, weekdayLabel } from '../lib/format'
import { useResource } from '../lib/useResource'
import { useDay } from '../context/DayContext'
import DateNav from '../components/DateNav'
import {
  Button,
  Card,
  CardHeader,
  Empty,
  InlineError,
  InlineNotice,
  Money,
  Spinner,
  StatusPill,
  TableScroll,
  Td,
  Th,
} from '../components/ui'

function Line({ label, value, sign, strong, tone }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-[6px] ${strong ? 'border-t border-[#E2E4E6] pt-2' : 'border-b border-[#EFF1F3] last:border-0'}`}>
      <span className={`text-[12px] ${strong ? 'font-medium text-[#0D0F14]' : 'text-[#4E525A]'}`}>
        {sign ? <span className="mr-1 inline-block w-2 text-[11px] text-[#9BA0A6]">{sign}</span> : null}
        {label}
      </span>
      <Money value={value} tone={tone} className={`text-[12.5px] ${strong ? 'text-[14px] font-semibold' : 'font-medium'}`} />
    </div>
  )
}

export default function CashBook() {
  const { date, setDate } = useDay()
  const month = monthKey(date)
  const { data, loading, error } = useResource(() => api.get(`/reports/monthly?month=${month}`), [month])

  const day = useMemo(() => (data?.days ?? []).find((row) => row.date === date) ?? null, [data, date])
  const cash = day?.totals?.cash
  const expenses = day?.totals?.expenses

  const monthTotals = useMemo(() => {
    const days = data?.days ?? []
    return {
      fuel: days.reduce((sum, row) => sum + row.fuelAmount, 0),
      lube: days.reduce((sum, row) => sum + row.lube, 0),
      expenses: days.reduce((sum, row) => sum + row.expenses, 0),
      totalCash: days.reduce((sum, row) => sum + row.totalCash, 0),
      difference: days.reduce((sum, row) => sum + row.difference, 0),
    }
  }, [data])

  return (
    <div className="px-4 pb-10 pt-4 sm:px-[19px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <DateNav date={date} onChange={setDate} label={`${weekdayLabel(date)} · ${monthLabel(month)}`}>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => setDate(`${addMonths(month, -1)}-01`)}>
              {monthLabel(addMonths(month, -1))}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDate(`${addMonths(month, 1)}-01`)}>
              {monthLabel(addMonths(month, 1))}
            </Button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </DateNav>
      </div>

      {error ? <InlineError>{error}</InlineError> : null}
      {loading && !data ? <Spinner label="Building the cash book" /> : null}

      {data && !day ? (
        <InlineNotice tone="warn">
          Nothing is recorded on {dateLabel(date)}. Open the day in{' '}
          <Link to="/daily-entry" className="font-medium underline underline-offset-2">
            Daily Entry
          </Link>{' '}
          to start it.
        </InlineNotice>
      ) : null}

      {day && cash ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Card>
            <CardHeader
              title={`Cash statement · ${dateLabel(date)}`}
              subtitle="The paper chain F11 → F12 → F13, exactly as the server computed it."
              actions={<StatusPill status={day.status} />}
            />
            <div className="px-4 pb-4 pt-2">
              <Line label="Opening balance (F14)" value={cash.previousBalance} sign="+" />
              <Line label="Fuel amount (F7)" value={day.fuelAmount} sign="+" />
              <Line label="Lubricants (F6)" value={day.lube} sign="+" />
              <Line label="Credit received (cash)" value={cash.creditReceived} sign="+" />
              <Line label="Expenses" value={expenses.total} sign="−" />
              <Line label="Credit given" value={cash.creditGiven} sign="−" />
              <Line label="Online receipts" value={cash.online} sign="−" />
              <Line label="POS" value={cash.pos} sign="−" />
              <Line label="Bank deposit" value={cash.bankDeposit} sign="−" />
              <Line label="Total cash (F12)" value={cash.total} strong tone={cash.total < 0 ? 'bad' : undefined} />
              <div className="mt-3 rounded-[10px] bg-[#F5F7F9] px-3 py-2.5">
                <Line label="Cash counted" value={cash.counted} />
                <Line
                  label="Cash difference (F13)"
                  value={cash.difference}
                  strong
                  tone={Math.abs(cash.difference) > 0.5 ? 'bad' : 'good'}
                />
                <p className="mt-1 text-[11px] leading-relaxed text-[#4E525A]">
                  {Math.abs(cash.difference) <= 0.5
                    ? 'The box tallies with the book.'
                    : cash.difference < 0
                      ? 'Cash is short against the book. Check expenses, credit and bank entries.'
                      : 'Cash is over the book. Check the counted figure and today’s online/POS entries.'}
                </p>
              </div>
              <div className="mt-3">
                <Line label="R/F value (F5)" value={day.rfValue} />
                <Line label="R/F + cash (F16)" value={day.totals.rfPlusCash} strong />
                <Line label="Net cash movement (F11)" value={cash.net} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-[#9BA0A6]">
                Net movement excludes the opening balance, lubricants and the bank deposit; total cash adds them back, as
                on the paper sheet. Tomorrow opens with this total once the day is closed.
              </p>
              <div className="mt-3 flex gap-3 text-[11.5px] print:hidden">
                <Link to="/daily-entry" className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                  Open in daily entry
                </Link>
                <Link to="/stock" className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                  Stock
                </Link>
                <Link to="/expenses" className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                  Expenses
                </Link>
              </div>
            </div>
          </Card>

          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Fuel', monthTotals.fuel],
                ['Expenses', monthTotals.expenses],
                ['Total cash', monthTotals.totalCash],
                ['Difference', monthTotals.difference],
              ].map(([label, value]) => (
                <Card key={label} className="px-3 py-3">
                  <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#4E525A]">{label}</span>
                  <Money
                    value={value}
                    tone={label === 'Difference' && Math.abs(value) > 0.5 ? 'bad' : undefined}
                    className="mt-1.5 block text-[16px] font-semibold"
                  />
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader title={`${monthLabel(month)} · daily cash`} subtitle="Every day recorded in this month." />
              {(data?.days ?? []).length === 0 ? (
                <Empty>No days recorded in {monthLabel(month)}.</Empty>
              ) : (
                <TableScroll className="[&>table]:min-w-[640px]">
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Status</Th>
                      <Th align="right">Fuel</Th>
                      <Th align="right">Total cash</Th>
                      <Th align="right">Counted</Th>
                      <Th align="right">Difference</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(data?.days ?? [])].reverse().map((row) => (
                      <tr key={row.date} className={`hover:bg-[#F5F7F9] ${row.date === date ? 'bg-[#F5F7F9]' : ''}`}>
                        <Td>
                          <button
                            type="button"
                            onClick={() => setDate(row.date)}
                            className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2"
                          >
                            {dateLabel(row.date)}
                          </button>
                        </Td>
                        <Td>
                          <StatusPill status={row.status} />
                        </Td>
                        <Td align="right">{money(row.fuelAmount)}</Td>
                        <Td align="right">
                          <Money value={row.totalCash} tone={row.totalCash < 0 ? 'bad' : undefined} />
                        </Td>
                        <Td align="right">{money(row.totals?.cash?.counted ?? 0)}</Td>
                        <Td align="right">
                          <span className={Math.abs(row.difference) > 0.5 ? 'font-medium text-[#B42318]' : 'text-[#147A3A]'}>
                            {money(row.difference)}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableScroll>
              )}
              <div className="border-t border-[#E2E4E6] px-4 py-2.5 text-[11px] text-[#4E525A]">
                Month totals: {inr(monthTotals.totalCash)} cash across {(data?.days ?? []).length} day(s).{' '}
                {Math.abs(monthTotals.difference) > 0.5
                  ? `${money(monthTotals.difference)} net difference needs a look.`
                  : 'All counted cash tallies.'}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  )
}
