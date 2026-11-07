import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Save, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'react-toastify'
import { dateLabel, inr, money } from '../lib/format'
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
  NumberInput,
  Spinner,
  StatusPill,
  TextInput,
} from '../components/ui'

const cell = 'h-8 rounded-[8px]'

export default function Stock() {
  const { date, setDate } = useDay()
  const { data, loading, error, setData, refresh } = useResource(() => api.get(`/stock?date=${date}`), [date])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) {
      setForm({
        tanks: data.tanks.map((tank) => ({ ...tank })),
        receipts: data.receipts.map((row) => ({ ...row })),
      })
      setActionError('')
    }
  }, [data])

  useEffect(() => {
    setSaved(false)
    setActionError('')
  }, [date])

  const closed = data?.status === 'closed'
  const computed = data?.computed

  const registerTotal = (tankId) =>
    (form?.receipts ?? [])
      .filter((row) => row.tankId === tankId)
      .reduce((sum, row) => sum + (Number(row.litres) || 0), 0)

  const updateTank = (tankId, patch) =>
    setForm((current) => ({
      ...current,
      tanks: current.tanks.map((row) => (row.tankId === tankId ? { ...row, ...patch } : row)),
    }))

  const addReceipt = (tankId) =>
    setForm((current) => ({
      ...current,
      receipts: [
        ...current.receipts,
        { id: `new-${Date.now()}`, tankId, tankName: current.tanks.find((row) => row.tankId === tankId)?.name ?? '', invoice: '', litres: 0, amount: 0 },
      ],
    }))

  const removeReceipt = (index) =>
    setForm((current) => {
      const row = current.receipts[index]
      const receipts = current.receipts.filter((_, rowIndex) => rowIndex !== index)
      const total = receipts.filter((entry) => entry.tankId === row.tankId).reduce((sum, entry) => sum + (Number(entry.litres) || 0), 0)
      return {
        ...current,
        receipts,
        tanks: current.tanks.map((tank) =>
          tank.tankId === row.tankId ? { ...tank, receipts: Number(total.toFixed(3)) } : tank,
        ),
      }
    })

  const updateReceipt = (index, patch) =>
    setForm((current) => {
      const receipts = current.receipts.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
      const tankId = receipts[index].tankId
      const total = receipts.filter((row) => row.tankId === tankId).reduce((sum, row) => sum + (Number(row.litres) || 0), 0)
      return {
        ...current,
        receipts,
        tanks: current.tanks.map((tank) => (tank.tankId === tankId ? { ...tank, receipts: Number(total.toFixed(3)) } : tank)),
      }
    })

  const totals = useMemo(() => {
    if (!form) return {}
    return form.tanks.reduce((acc, tank) => {
      const key = tank.product
      acc[key] = acc[key] ?? { opening: 0, receipts: 0, dip: 0 }
      acc[key].opening += Number(tank.opening) || 0
      acc[key].receipts += Number(tank.receipts) || 0
      acc[key].dip += Number(tank.dip) || 0
      return acc
    }, {})
  }, [form])

  const save = async () => {
    setBusy(true)
    setActionError('')
    try {
      const payload = {
        tanks: form.tanks.map((tank) => ({
          tankId: tank.tankId,
          opening: Number(tank.opening) || 0,
          receipts: Number(tank.receipts) || 0,
          dip: Number(tank.dip) || 0,
        })),
        receipts: form.receipts.map((row) => ({
          tankId: row.tankId,
          invoice: row.invoice || '',
          litres: Number(row.litres) || 0,
          amount: Number(row.amount) || 0,
        })),
      }
      const next = await api.put(`/stock/${date}`, payload)
      setData(next)
      setSaved(true)
      toast.success(`Stock for ${dateLabel(date)} saved. Day totals updated.`)
    } catch (failure) {
      setActionError(failure.message)
      toast.error(failure.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Spinner label="Reading the tank book" />
  if (error && !data) {
    return (
      <div className="p-4">
        <InlineError>{error}</InlineError>
      </div>
    )
  }
  if (!data || !form) return null

  return (
    <div className="px-4 pb-10 pt-4 sm:px-[19px]">
      <div className="mb-4">
        <DateNav date={date} onChange={setDate} label={`${dateLabel(date)} · tank dips and receipts`}>
          <StatusPill status={data.status} />
          {closed ? (
            <Link to="/daily-entry">
              <Button variant="secondary">Reopen in daily entry</Button>
            </Link>
          ) : (
            <Button variant="primary" onClick={save} disabled={busy}>
              <Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save stock'}
            </Button>
          )}
        </DateNav>
      </div>

      {actionError ? (
        <div className="mb-4">
          <InlineError>{actionError}</InlineError>
        </div>
      ) : null}
      {saved ? (
        <div className="mb-4">
          <InlineNotice tone="good">Stock saved. The day totals now include the dips and receipts.</InlineNotice>
        </div>
      ) : null}
      {closed ? (
        <div className="mb-4">
          <InlineNotice>This day is closed. Reopen it from the daily entry before changing stock figures.</InlineNotice>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Tanks, dips and receipts"
          subtitle="Opening + receipts − meter sale + R/F = closing book stock (F8). Variance = dip − closing (F10)."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                <th className="h-[33px] border-b border-[#E2E4E6] px-4 text-left text-[12px] font-normal text-[#4E525A]">Tank</th>
                <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Opening (L)</th>
                <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Receipts (L)</th>
                <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Closing book (L)</th>
                <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Dip (L)</th>
                <th className="h-[33px] border-b border-[#E2E4E6] px-4 text-right text-[12px] font-normal text-[#4E525A]">Variance (L)</th>
              </tr>
            </thead>
            <tbody>
              {form.tanks.map((tank) => {
                const day = computed?.products?.[tank.product]
                return (
                  <tr key={tank.tankId} className="border-b border-[#E2E4E6]">
                    <td className="px-4 py-2 text-[12.5px] font-medium text-[#0D0F14]">
                      {tank.name}
                      <span className="ml-2 text-[10.5px] font-normal uppercase tracking-[0.06em] text-[#9BA0A6]">{tank.product}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <NumberInput
                        value={tank.opening}
                        disabled={closed}
                        aria-label={`${tank.name} opening`}
                        className={cell}
                        onChange={(value) => updateTank(tank.tankId, { opening: value })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <NumberInput
                        value={tank.receipts}
                        disabled={closed}
                        aria-label={`${tank.name} receipts`}
                        className={cell}
                        onChange={(value) => updateTank(tank.tankId, { receipts: value })}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right text-[12.5px] tabular-nums text-[#0D0F14]">
                      {day ? inr(day.closingStock, 3) : '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      <NumberInput
                        value={tank.dip}
                        disabled={closed}
                        aria-label={`${tank.name} dip`}
                        className={cell}
                        onChange={(value) => updateTank(tank.tankId, { dip: value })}
                      />
                    </td>
                    <td className="px-4 py-2 text-right text-[12.5px] tabular-nums">
                      <span className={day && Math.abs(day.variance) > 0.5 ? 'text-[#B42318]' : 'text-[#4E525A]'}>
                        {day ? inr(day.variance, 3) : '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-[#E2E4E6] px-4 py-2.5 text-[11px] leading-relaxed text-[#9BA0A6]">
          The receipts column is the total booked for the day. Adding an invoice line below sets it to the register
          total for that tank; you can still type a total without a register line.
        </p>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {['MS', 'HSD'].map((product) => {
          const day = computed?.products?.[product]
          return (
            <Card key={product}>
              <CardHeader title={`${product} stock summary`} subtitle="Product totals across every tank." />
              <div className="px-4 pb-3 pt-1">
                {[
                  ['Opening stock', day ? `${inr(day.openingStock, 3)} L` : '—'],
                  ['Receipts', day ? `${inr(day.receipts, 3)} L` : '—'],
                  ['Meter sale (F1)', day ? `${inr(day.meterSale, 3)} L` : '—'],
                  ['R/F back to tank', day ? `${inr(day.rf, 3)} L` : '—'],
                  ['Closing book (F8)', day ? `${inr(day.closingStock, 3)} L` : '—'],
                  ['Physical dip', day ? `${inr(day.dip, 3)} L` : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 border-b border-[#EFF1F3] py-[5px] last:border-0">
                    <span className="text-[12px] text-[#4E525A]">{label}</span>
                    <span className="text-[12.5px] tabular-nums text-[#0D0F14]">{value}</span>
                  </div>
                ))}
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[#E2E4E6] pt-2">
                  <span className="text-[12px] font-medium text-[#0D0F14]">Variance (F10)</span>
                  <span className={`text-[13px] font-semibold tabular-nums ${day && Math.abs(day.variance) > 0.5 ? 'text-[#B42318]' : 'text-[#147A3A]'}`}>
                    {day ? `${inr(day.variance, 3)} L` : '—'}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="text-[12px] text-[#4E525A]">Closing value (F9)</span>
                  <Money value={day?.closingValue} className="text-[13px] font-semibold" />
                </div>
                {day && day.lossLitres > 0 ? (
                  <p className="mt-2 text-[11px] text-[#B42318]">
                    Short by {inr(day.lossLitres, 3)} L · valued at {money(day.lossValue)}.
                  </p>
                ) : null}
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Receipt register"
          subtitle="Optional invoice detail for tank loads received on this date."
          actions={
            !closed ? (
              <Button
                size="sm"
                variant="muted"
                onClick={() => addReceipt(form.tanks[0]?.tankId)}
                disabled={!form.tanks.length}
              >
                <Plus className="h-3.5 w-3.5" /> Add receipt
              </Button>
            ) : null
          }
        />
        {form.receipts.length === 0 ? (
          <Empty>No receipts recorded for this day.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-4 text-left text-[12px] font-normal text-[#4E525A]">Tank</th>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-left text-[12px] font-normal text-[#4E525A]">Invoice</th>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Litres</th>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Amount</th>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Register total</th>
                  <th className="h-[33px] w-12 border-b border-[#E2E4E6] px-2 text-right text-[12px] font-normal text-[#4E525A]" />
                </tr>
              </thead>
              <tbody>
                {form.receipts.map((row, index) => (
                  <tr key={row.id} className="border-b border-[#E2E4E6]">
                    <td className="px-4 py-1.5">
                      <select
                        value={row.tankId}
                        disabled={closed}
                        aria-label="Receipt tank"
                        onChange={(event) => updateReceipt(index, { tankId: event.target.value, tankName: form.tanks.find((tank) => tank.tankId === event.target.value)?.name ?? '' })}
                        className="h-8 w-full rounded-[8px] bg-[#F5F7F9] px-2 text-[12px] text-[#0D0F14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F]"
                      >
                        {form.tanks.map((tank) => (
                          <option key={tank.tankId} value={tank.tankId}>
                            {tank.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <TextInput
                        value={row.invoice ?? ''}
                        disabled={closed}
                        aria-label="Invoice number"
                        placeholder="Invoice"
                        className={cell}
                        onChange={(event) => updateReceipt(index, { invoice: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <NumberInput
                        value={row.litres}
                        disabled={closed}
                        aria-label="Receipt litres"
                        className={cell}
                        onChange={(value) => updateReceipt(index, { litres: value })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <NumberInput
                        value={row.amount}
                        disabled={closed}
                        aria-label="Receipt amount"
                        className={cell}
                        onChange={(value) => updateReceipt(index, { amount: value })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-[12.5px] tabular-nums text-[#4E525A]">
                      {inr(registerTotal(row.tankId), 3)} L
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {!closed ? (
                        <button
                          type="button"
                          aria-label="Remove receipt"
                          onClick={() => removeReceipt(index)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#9BA0A6] hover:bg-[#FDE8E5] hover:text-[#B42318]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-[#E2E4E6] px-4 py-2.5 text-[11px] text-[#4E525A]">
          <button type="button" onClick={refresh} className="font-medium underline decoration-[#D2D5D9] underline-offset-2">
            Reload from the server
          </button>
        </div>
      </Card>
    </div>
  )
}
