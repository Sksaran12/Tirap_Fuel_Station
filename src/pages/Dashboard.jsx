import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CircleAlert,
  ClipboardPenLine,
  Droplets,
  IndianRupee,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { api } from '../lib/api'
import { dateLabel, inr, litres, money, weekdayLabel } from '../lib/format'
import { useResource } from '../lib/useResource'
import { useDay } from '../context/DayContext'
import DateNav from '../components/DateNav'
import { Button, Card, CardHeader, Empty, InlineError, InlineNotice, Money, Spinner, StatusPill, TableScroll, Td, Th } from '../components/ui'

function Kpi({ icon: Icon, label, value, hint, tone }) {
  const color = tone === 'bad' ? 'text-[#B42318]' : tone === 'good' ? 'text-[#147A3A]' : 'text-[#0D0F14]'
  return (
    <Card className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#4E525A]">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-[#9BA0A6]" strokeWidth={1.75} />
      </div>
      <p className={`mt-2 text-[20px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] leading-snug text-[#9BA0A6]">{hint}</p> : null}
    </Card>
  )
}

export default function Dashboard() {
  const { date, setDate } = useDay()
  const { data, loading, error, refresh } = useResource(() => api.get(`/dashboard?date=${date}`), [date])

  if (loading && !data) return <Spinner label="Loading the station summary" />
  if (error && !data) {
    return (
      <div className="p-4">
        <InlineError>{error}</InlineError>
      </div>
    )
  }
  if (!data) return null

  const { computed, recent, dues, partiesWithDues, alerts, openDays, status, settings } = data
  const open = status === 'open'
  const variance = (computed.products.MS.variance ?? 0) + (computed.products.HSD.variance ?? 0)
  const profitKnown = Boolean(settings?.margins?.MS || settings?.margins?.HSD)

  return (
    <div className="px-4 pb-10 pt-4 sm:px-[19px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DateNav date={date} onChange={setDate} label={`${weekdayLabel(date)} · ${open ? 'open for entry' : 'closed'}`} />
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={status} />
          <Link to="/daily-entry">
            <Button variant={open ? 'primary' : 'secondary'} size="md">
              <ClipboardPenLine className="h-4 w-4" />
              {open ? 'Continue daily entry' : 'Open the daily entry'}
            </Button>
          </Link>
        </div>
      </div>

      {alerts.length ? (
        <div className="mb-4 space-y-2">
          {alerts.map((message) => (
            <InlineNotice key={message} tone="warn">
              <span className="inline-flex items-start gap-1.5">
                <CircleAlert className="mt-[1px] h-3.5 w-3.5 shrink-0" /> {message}
              </span>
            </InlineNotice>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          icon={IndianRupee}
          label="Fuel sale (F7)"
          value={money(computed.fuel.totalAmount)}
          hint={`${litres(computed.products.MS.acSale)} + ${litres(computed.products.HSD.acSale)}`}
        />
        <Kpi
          icon={Wallet}
          label="Total cash (F12)"
          value={money(computed.cash.total)}
          tone={computed.cash.total < 0 ? 'bad' : undefined}
          hint={computed.cash.difference === 0 ? 'cash tallies' : `difference ${money(computed.cash.difference)}`}
        />
        <Kpi
          icon={TrendingUp}
          label="Daily profit (F17)"
          value={profitKnown ? money(computed.profit.net) : '—'}
          hint={profitKnown ? 'margins from settings' : 'set margins in Settings'}
        />
        <Kpi
          icon={Users}
          label="Credit dues"
          value={money(dues)}
          hint={`${partiesWithDues.length} party(s) outstanding`}
        />
        <Kpi
          icon={Droplets}
          label="Stock variance"
          value={`${inr(variance, 3)} L`}
          tone={Math.abs(variance) > 0.5 ? 'bad' : 'good'}
          hint="dip − closing book stock"
        />
        <Kpi
          icon={ClipboardPenLine}
          label="R/F + cash (F16)"
          value={money(computed.rfPlusCash)}
          hint={`R/F value ${money(computed.fuel.totalRfValue)}`}
        />
      </div>

      {openDays.length ? (
        <div className="mt-4">
          <InlineNotice tone="warn">
            {openDays.length} earlier day(s) still open: {openDays.join(', ')}. Close them in order so tomorrow&apos;s
            opening cash stays right.{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => setDate(openDays[0])}
            >
              Open {openDays[0]}
            </button>
          </InlineNotice>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader
            title="Last 10 days"
            subtitle="Closed days are the record; the open day is what you are filling in now."
            actions={
              <Link to="/reports" className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                Monthly report <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {recent.length === 0 ? (
            <Empty>No days recorded yet. Start with today&apos;s entry.</Empty>
          ) : (
            <TableScroll className="[&>table]:min-w-[680px]">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Status</Th>
                  <Th align="right">MS (L)</Th>
                  <Th align="right">HSD (L)</Th>
                  <Th align="right">Fuel amount</Th>
                  <Th align="right">Total cash</Th>
                  <Th align="right">Variance</Th>
                  <Th align="right">Profit</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.date} className="hover:bg-[#F5F7F9]">
                    <Td>
                      <button
                        type="button"
                        onClick={() => setDate(row.date)}
                        className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2"
                      >
                        {dateLabel(row.date)}
                      </button>
                      <span className="ml-2 text-[11px] text-[#9BA0A6]">{weekdayLabel(row.date)}</span>
                    </Td>
                    <Td>
                      <StatusPill status={row.status} />
                    </Td>
                    <Td align="right">{inr(row.msLitres, 3)}</Td>
                    <Td align="right">{inr(row.hsdLitres, 3)}</Td>
                    <Td align="right">
                      <Money value={row.fuelAmount} />
                    </Td>
                    <Td align="right">
                      <Money value={row.totalCash} tone={row.totalCash < 0 ? 'bad' : undefined} />
                    </Td>
                    <Td align="right">
                      <span className={Math.abs(row.variance) > 0.5 ? 'text-[#B42318]' : 'text-[#4E525A]'}>
                        {inr(row.variance, 3)} L
                      </span>
                    </Td>
                    <Td align="right">
                      <Money value={row.profit} tone={row.profit < 0 ? 'bad' : undefined} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Money at the pump" subtitle="Live figures for the selected day." />
            <div className="px-4 pb-3 pt-1">
              {[
                ['Opening balance (F14)', computed.cash.previousBalance],
                ['Fuel amount (F7)', computed.fuel.totalAmount],
                ['R/F value (F5)', computed.fuel.totalRfValue],
                ['Lubricants (F6)', computed.lube.total],
                ['Expenses', -computed.expenses.total],
                ['Credit given', -computed.cash.creditGiven],
                ['Credit received', computed.cash.creditReceived],
                ['Online receipts', -computed.cash.online],
                ['POS', -computed.cash.pos],
                ['Bank deposit', -computed.cash.bankDeposit],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-[#EFF1F3] py-[5px] last:border-0">
                  <span className="text-[12px] text-[#4E525A]">{label}</span>
                  <span className="text-[12.5px] font-medium tabular-nums text-[#0D0F14]">{money(value)}</span>
                </div>
              ))}
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[#E2E4E6] pt-2">
                <span className="text-[12px] font-medium text-[#0D0F14]">Total cash (F12)</span>
                <Money value={computed.cash.total} tone={computed.cash.total < 0 ? 'bad' : undefined} className="text-[14px] font-semibold" />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-[#4E525A]">Cash counted − book (F13)</span>
                <Money
                  value={computed.cash.difference}
                  tone={Math.abs(computed.cash.difference) > 0.5 ? 'bad' : 'good'}
                  className="text-[13px] font-semibold"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-[#E2E4E6] px-4 py-3 text-[11.5px]">
              <Link to="/cash-book" className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                Cash book
              </Link>
              <Link to="/stock" className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                Stock &amp; dips
              </Link>
              <Link to="/credit" className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                Credit
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Top dues"
              subtitle="Parties with money outstanding."
              actions={
                <Link to="/credit" className="text-[11.5px] font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                  All parties
                </Link>
              }
            />
            {partiesWithDues.length === 0 ? (
              <Empty>No credit outstanding.</Empty>
            ) : (
              <ul className="divide-y divide-[#EFF1F3]">
                {partiesWithDues.map((party) => (
                  <li key={party.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-[#0D0F14]">{party.name}</span>
                      <span className="block text-[10.5px] text-[#9BA0A6]">
                        {party.oldestCreditDate ? `since ${dateLabel(party.oldestCreditDate)}` : 'opening balance'}
                      </span>
                    </span>
                    <Money value={party.outstanding} tone="bad" className="text-[12.5px] font-medium" />
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-[#E2E4E6] px-4 py-2.5 text-[11px] text-[#4E525A]">
              <button type="button" onClick={refresh} className="font-medium underline decoration-[#D2D5D9] underline-offset-2">
                Refresh figures
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
