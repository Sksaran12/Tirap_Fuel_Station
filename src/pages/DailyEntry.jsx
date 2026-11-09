import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  Lock,
  Plus,
  Save,
  Unlock,
  X,
} from 'lucide-react'
import { computeDay } from '../../shared/calc'
import { api } from '../lib/api'
import { toast } from 'react-toastify'
import { addDays, dateLabel, inr, litres, money, todayKey } from '../lib/format'
import { useResource } from '../lib/useResource'
import { useDay } from '../context/DayContext'
import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  InlineError,
  InlineNotice,
  Money,
  NumberInput,
  Select,
  Spinner,
  StatusPill,
  TextInput,
} from '../components/ui'

const rowInput = 'h-9 rounded-[8px]'

function SummaryRow({ label, value, strong, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]">
      <span className={`text-[12px] ${strong ? 'font-medium text-[#0D0F14]' : 'text-[#4E525A]'}`}>{label}</span>
      <Money value={value} tone={tone} className={`text-[13px] ${strong ? 'font-semibold' : 'font-medium'}`} />
    </div>
  )
}

// Expense row: Name / Details + Type + Price.
function ExpenseCard({ form, data, closed, updateExpense, removeExpense, addExpense, busy }) {
  const catId = data.masters?.categories?.[0]?.id ?? ''
  const total = form.expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  return (
    <Card>
      <CardHeader
        title="Expenses — names + prices"
        subtitle="Manual daily rule-book entries. Total updates automatically. Saving writes them with the day."
        actions={
          <Button
            size="sm"
            variant="muted"
            disabled={closed || !catId}
            onClick={() => addExpense(catId)}
          >
            <Plus className="h-3.5 w-3.5" /> Add expense
          </Button>
        }
      />
      <div className="space-y-2 p-4">
        {form.expenses.length === 0 ? (
          <p className="text-[12px] text-[#9BA0A6]">No expenses today. Add the names and prices you spent.</p>
        ) : null}
        {form.expenses.map((row, index) => (
          <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_110px_110px_32px]">
            <TextInput
              value={row.details ?? ''}
              disabled={closed}
              aria-label="Expense name"
              placeholder="Name — e.g. Generator diesel, Salary"
              onChange={(e) => updateExpense(index, { details: e.target.value })}
              className={rowInput}
            />
            <Select
              value={row.type}
              disabled={closed}
              aria-label="Expense type"
              className={rowInput}
              onChange={(e) => updateExpense(index, { type: e.target.value })}
            >
              <option value="running">Running</option>
              <option value="one-off">One-off</option>
            </Select>
            <NumberInput
              value={row.amount}
              disabled={closed}
              aria-label="Expense price"
              placeholder="Price ₹"
              onChange={(v) => updateExpense(index, { amount: v })}
              className={rowInput}
            />
            <button
              type="button"
              aria-label="Remove expense"
              disabled={closed}
              onClick={() => removeExpense(index)}
              className="flex h-9 w-8 items-center justify-center text-[#9BA0A6] hover:text-[#B42318] disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-[#E2E4E6] bg-[#F5F7F9] px-3 py-2.5">
          <span className="text-[12px] text-[#4E525A]">{form.expenses.length} item(s) · Total EXP</span>
          <span className="rounded-[10px] bg-[#0D0F14] px-4 py-1.5 text-[13px] font-bold tabular-nums text-white">{money(total)}</span>
        </div>
      </div>
    </Card>
  )
}

// Credit collection box: party + price, received (green) vs pending (red).
function CreditCard({ form, data, closed, updateCredit, addCredit, removeCredit }) {
  const parties = data.masters?.parties ?? []
  const given = form.credits.filter((r) => r.type === 'credit').reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const received = form.credits.filter((r) => r.type === 'payment').reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const pending = given - received
  return (
    <Card>
      <CardHeader
        title="Credit parties — collection"
        subtitle="Manual entries with names + prices. Green = received, Red = pending."
        actions={
          <Button size="sm" variant="muted" disabled={closed || !parties.length} onClick={addCredit}>
            <Plus className="h-3.5 w-3.5" /> Add row
          </Button>
        }
      />
      <div className="space-y-2 p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-[10px] border border-[#F3C9C9] bg-[#FDEEEC] px-3 py-2">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#B42318]">Credit given · Pending (red)</p>
            <p className="mt-0.5 text-[16px] font-bold tabular-nums text-[#B42318]">{money(given)}</p>
          </div>
          <div className="rounded-[10px] border border-[#CBE7D3] bg-[#EAF6EE] px-3 py-2">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#147A3A]">Received · Paid (green)</p>
            <p className="mt-0.5 text-[16px] font-bold tabular-nums text-[#147A3A]">{money(received)}</p>
          </div>
          <div className="rounded-[10px] bg-[#0D0F14] px-3 py-2 text-white">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-white/70">Pending balance</p>
            <p className="mt-0.5 text-[16px] font-bold tabular-nums">{money(pending)}</p>
          </div>
        </div>
        {form.credits.length === 0 ? (
          <p className="text-[12px] text-[#9BA0A6]">No credit collection today. Add party names + prices.</p>
        ) : null}
        {form.credits.map((row, index) => (
          <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.4fr)_110px_90px_100px_32px]">
            <Select
              value={row.partyId ?? ''}
              disabled={closed}
              aria-label="Credit party"
              className={`${rowInput} col-span-2 sm:col-span-1`}
              onChange={(e) => updateCredit(index, { partyId: e.target.value })}
            >
              <option value="">Choose party…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Select
              value={row.type}
              disabled={closed}
              aria-label="Credit type"
              className={rowInput}
              onChange={(e) => updateCredit(index, { type: e.target.value })}
            >
              <option value="credit">Credit given</option>
              <option value="payment">Payment in</option>
            </Select>
            <Select
              value={row.mode}
              disabled={closed}
              aria-label="Credit mode"
              className={rowInput}
              onChange={(e) => updateCredit(index, { mode: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="online">Online</option>
            </Select>
            <NumberInput
              value={row.amount}
              disabled={closed}
              aria-label="Credit price"
              placeholder="Price ₹"
              onChange={(v) => updateCredit(index, { amount: v })}
              className={rowInput}
            />
            <button
              type="button"
              aria-label="Remove credit row"
              disabled={closed}
              onClick={() => removeCredit(index)}
              className="flex h-9 w-8 items-center justify-center text-[#9BA0A6] hover:text-[#B42318] disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
            <TextInput
              value={row.note ?? ''}
              disabled={closed}
              aria-label="Credit note"
              placeholder="Note / receipt"
              onChange={(e) => updateCredit(index, { note: e.target.value })}
              className={`${rowInput} col-span-2`}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function DailyEntry() {
  const { date, setDate } = useDay()
  const { data, loading, error, setData, refresh } = useResource(() => api.get(`/day/${date}`), [date])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [downloading, setDownloading] = useState(false)

  const downloadR2Archive = async () => {
    setDownloading(true)
    try {
      const res = await api.get(`/uploads/day/${date}/url`)
      if (res?.url) {
        window.open(res.url, '_blank')
        toast.success(`Register sheet for ${dateLabel(date)} is downloading.`)
      } else {
        toast.warn('No archived file found for this day yet. Click Save to create one.')
      }
    } catch (err) {
      toast.error(err.message || 'No archived file found for this day yet. Click Save to create one!')
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    if (data?.inputs) {
      setForm(JSON.parse(JSON.stringify(data.inputs)))
      setActionError('')
      setConfirm(null)
    }
  }, [data])

  const closed = data?.status === 'closed'
  const isFutureDate = date > todayKey()

  const hasEnteredData = Boolean(
    data?.inputs &&
      (data.inputs.rates?.MS > 0 ||
        data.inputs.rates?.HSD > 0 ||
        data.inputs.nozzles?.some((n) => n.closing > n.opening) ||
        data.computed?.fuel?.totalAmount > 0 ||
        data.computed?.cash?.total > 0 ||
        data.status === 'closed')
  )
  const preview = useMemo(() => {
    if (!form || !data) return null
    const credits = form.credits ?? []
    const expenses = form.expenses ?? data.inputs.expenses
    const input = {
      rates: form.rates,
      rf: form.rf,
      nozzles: {
        MS: form.nozzles.filter((row) => row.product === 'MS'),
        HSD: form.nozzles.filter((row) => row.product === 'HSD'),
      },
      tanks: data.inputs.tanks,
      lube: form.lube,
      online: form.online,
      pos: form.pos,
      bankDeposit: form.bankDeposit,
      countedCash: form.countedCash,
      previousBalance: data.inputs.previousBalance,
      creditGiven: credits.filter((r) => r.type === 'credit').reduce((s, r) => s + (Number(r.amount) || 0), 0),
      creditReceived: credits.filter((r) => r.type === 'payment' && r.mode === 'cash').reduce((s, r) => s + (Number(r.amount) || 0), 0),
      expenses,
    }
    return computeDay(input, data.settings)
  }, [form, data])

  const update = (patch) => setForm((current) => ({ ...current, ...patch }))
  const updateNozzle = (index, patch) =>
    setForm((current) => ({
      ...current,
      nozzles: current.nozzles.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }))
  const updateLube = (index, patch) =>
    setForm((current) => ({
      ...current,
      lube: current.lube.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }))
  const updateOnline = (index, patch) =>
    setForm((current) => ({
      ...current,
      online: current.online.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }))
  const updateExpense = (index, patch) =>
    setForm((current) => ({
      ...current,
      expenses: current.expenses.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }))
  const updateCredit = (index, patch) =>
    setForm((current) => ({
      ...current,
      credits: current.credits.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }))

  const catId = data?.masters?.categories?.[0]?.id ?? ''

  const buildPayload = () => ({
    rates: form.rates,
    nozzles: form.nozzles.map((row) => ({
      nozzleId: row.nozzleId,
      opening: Number(row.opening) || 0,
      closing: Number(row.closing) || 0,
      rollover: Boolean(row.rollover),
      replacedLitres: row.replacedLitres === null || row.replacedLitres === '' ? null : Number(row.replacedLitres),
    })),
    rf: form.rf,
    lube: form.lube
      .filter((row) => row.itemName && Number(row.quantity) > 0)
      .map((row) => ({
        itemId: row.itemId || null,
        itemName: row.itemName,
        quantity: Number(row.quantity) || 0,
        price: Number(row.price) || 0,
      })),
    online: form.online.filter((row) => Number(row.amount) > 0),
    pos: Number(form.pos) || 0,
    bankDeposit: Number(form.bankDeposit) || 0,
    countedCash: Number(form.countedCash) || 0,
    expenses: (form.expenses ?? [])
      .filter((row) => Number(row.amount) > 0)
      .map((row) => ({
        categoryId: row.categoryId || catId,
        type: row.type === 'one-off' ? 'one-off' : 'running',
        details: row.details || '',
        amount: Number(row.amount) || 0,
      })),
    credits: (form.credits ?? [])
      .filter((row) => row.partyId && Number(row.amount) > 0)
      .map((row) => ({
        partyId: row.partyId,
        type: row.type,
        amount: Number(row.amount) || 0,
        mode: row.mode,
        note: row.note || '',
      })),
  })

  const save = async () => {
    setBusy('save')
    setActionError('')
    try {
      const next = await api.put(`/day/${date}`, buildPayload())
      setData(next)
      toast.success(`Day ${dateLabel(date)} saved.`)
    } catch (failure) {
      setActionError(failure.message)
      toast.error(failure.message)
    } finally {
      setBusy('')
    }
  }

  const closeDay = async () => {
    setBusy('close')
    setActionError('')
    try {
      const saved = await api.put(`/day/${date}`, buildPayload())
      setData(saved)
      const next = await api.post(`/day/${date}/close`)
      setData(next)
      setConfirm(null)
      toast.success(`Day ${dateLabel(date)} saved & closed. The register is now locked.`)
    } catch (failure) {
      setActionError(failure.message)
      toast.error(failure.message)
      setConfirm(null)
    } finally {
      setBusy('')
    }
  }

  const runAction = async (path, body) => {
    setBusy(path)
    setActionError('')
    try {
      const next = await api.post(path, body)
      setData(next)
      setConfirm(null)
      if (path.endsWith('/reopen')) toast.success(`Day ${dateLabel(date)} reopened. It can be edited again.`)
    } catch (failure) {
      setActionError(failure.message)
      toast.error(failure.message)
      setConfirm(null)
    } finally {
      setBusy('')
    }
  }

  if (loading && !data) return <Spinner label="Opening the day" />
  if (error && !data) return <div className="p-4"><InlineError>{error}</InlineError></div>
  if (!data || !form) return null

  return (
    <div className="px-4 pb-10 pt-4 sm:px-[19px]">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA0A6]" />
            <input
              type="date"
              value={date}
              onChange={(event) => event.target.value && setDate(event.target.value)}
              className="h-8 rounded-[10px] border border-[#E2E4E6] bg-white pl-8 pr-2 text-[12.5px] font-medium text-[#0D0F14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F]"
              aria-label="Business date"
            />
          </div>
          <Button variant="secondary" size="sm" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {date !== todayKey() ? (
            <Button variant="ghost" size="sm" onClick={() => setDate(todayKey())}>
              Today
            </Button>
          ) : null}
        </div>

        <StatusPill status={data.status} />
        <span className="text-[12px] text-[#4E525A]">
          {dateLabel(date)} · {data.status === 'closed' ? 'locked' : 'live entry'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {!isFutureDate && hasEnteredData ? (
            <Button
              variant="ghost"
              onClick={downloadR2Archive}
              disabled={downloading}
              title="Download archived day register from Cloudflare R2"
            >
              <Download className="h-4 w-4" /> {downloading ? 'Fetching…' : 'Download Sheet (R2)'}
            </Button>
          ) : null}

          {closed ? (
            <Button variant="primary" onClick={() => setConfirm('reopen')}>
              <Unlock className="h-4 w-4" /> Reopen day
            </Button>
          ) : !isFutureDate ? (
            <>
              <Button variant="secondary" onClick={save} disabled={busy === 'save'}>
                <Save className="h-4 w-4" /> {busy === 'save' ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="primary" onClick={() => setConfirm('close')} disabled={!hasEnteredData}>
                <Lock className="h-4 w-4" /> Close day
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {confirm ? (
        <div className="mb-4">
          <InlineNotice tone={confirm === 'close' ? 'warn' : 'neutral'}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {confirm === 'close'
                  ? 'Close this day? It becomes read-only until you reopen it, and the reopen is audited.'
                  : 'Reopen this day for correction? Every reopen and close is written to the audit log.'}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    confirm === 'close'
                      ? closeDay()
                      : runAction(`/day/${date}/reopen`, { note: 'Owner reopened the day' })
                  }
                  disabled={Boolean(busy)}
                >
                  {confirm === 'close' ? (busy === 'close' ? 'Saving & closing…' : 'Close day') : 'Reopen day'}
                </Button>
              </span>
            </div>
          </InlineNotice>
        </div>
      ) : null}

      {actionError ? <div className="mb-4"><InlineError>{actionError}</InlineError></div> : null}
      {closed ? (
        <div className="mb-4">
          <InlineNotice>
            This day is closed. Reopen it to correct a meter, a rate or any cash figure.
          </InlineNotice>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {/* Rates */}
          <Card>
            <CardHeader title="Rates of the day" subtitle="MS and HSD are priced separately; tomorrow starts from these." />
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              {['MS', 'HSD'].map((product) => (
                <label key={product} className="block">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">
                    {product} rate (₹/L)
                  </span>
                  <NumberInput
                    value={form.rates[product]}
                    onChange={(value) => update({ rates: { ...form.rates, [product]: value } })}
                    disabled={closed}
                    aria-label={`${product} rate`}
                    placeholder={product === 'MS' ? '99.66' : '89.08'}
                    className="text-left"
                  />
                </label>
              ))}
            </div>
            {preview ? (
              <div className="grid grid-cols-1 gap-2 border-t border-[#E2E4E6] px-4 py-3 sm:grid-cols-2">
                {['MS', 'HSD'].map((product) => (
                  <div key={product} className="rounded-[10px] bg-[#F5F7F9] px-3 py-2 text-[11.5px] leading-relaxed text-[#4E525A]">
                    <span className="font-semibold text-[#0D0F14]">{product} sale box:</span>{' '}
                    {inr(preview.products[product].acSale, 3)} L × ₹{Number(preview.products[product].rate || 0).toFixed(2)} ={' '}
                    <span className="font-semibold tabular-nums text-[#0D0F14]">{money(preview.products[product].amount)}</span>
                    <span className="block text-[10.5px] text-[#9BA0A6]">A/C sale × rate (F4)</span>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          {/* Nozzles — paper sheet columns: OP, Cl, Sale, R/F, A/C Sale, Rate, Amount */}
          <Card>
            <CardHeader
              title="Nozzle meters — paper sheet"
              subtitle="OP Meter | Cl Meter | Sale | R/F | A/C Sale | Rate | Amount. Sale − R/F = A/C (F3). A/C × rate = amount (F4)."
              actions={<Pill litres={preview} />}
            />
            {form.nozzles.length === 0 ? (
              <div className="border-b border-[#F3E0BC] bg-[#FBF0DA] px-4 py-3 text-[12px] leading-relaxed text-[#A66A08]">
                <strong>No nozzle rows.</strong> The nozzle masters were deleted from Supabase. The server now recreates MS Nozzle 1–4 + HSD Nozzle 1–4 automatically — click Reload and serial rows 1–8 will reappear to fill Op / Cl / Sale / Rate / Amount.
                <div className="mt-2">
                  <Button variant="primary" size="sm" onClick={refresh}>Reload masters</Button>
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse">
                <thead>
                  <tr>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-2 text-center text-[12px] font-normal text-[#4E525A] w-[44px]">Sl No</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-4 text-left text-[12px] font-normal text-[#4E525A]">Nozzle</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">OP Meter</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Cl Meter</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Sale</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">R/F</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">A/C Sale</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Rate</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Amount</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-4 text-left text-[12px] font-normal text-[#4E525A]">Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {form.nozzles.map((row, index) => {
                    const computed = preview?.products?.[row.product]?.nozzles?.[
                      form.nozzles.filter((item) => item.product === row.product).findIndex((item) => item.nozzleId === row.nozzleId)
                    ]
                    const below = Number(row.closing) < Number(row.opening) && row.replacedLitres === null
                    const sale = computed ? computed.sale : 0
                    const rate = preview?.products?.[row.product]?.rate ?? form.rates[row.product] ?? 0
                    const amount = sale * rate
                    const isLastOfProduct =
                      index === form.nozzles.length - 1 || form.nozzles[index + 1]?.product !== row.product
                    return (
                      <React.Fragment key={row.nozzleId}>
                      <tr className={`border-b border-[#E2E4E6] ${row.product === 'HSD' ? 'bg-[#FBFCFD]' : ''}`}>
                        <td className="px-2 py-1.5 text-center text-[12px] tabular-nums text-[#4E525A]">{index + 1}</td>
                        <td className="px-4 py-1.5 text-[12.5px] font-medium text-[#0D0F14]">
                          {row.name}
                          <span className="ml-2 text-[10.5px] font-normal uppercase tracking-[0.06em] text-[#9BA0A6]">
                            {row.product}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <NumberInput
                            value={row.opening}
                            onChange={(value) => updateNozzle(index, { opening: value })}
                            disabled={closed}
                            aria-label={`${row.name} opening`}
                            className={rowInput}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <NumberInput
                            value={row.closing}
                            onChange={(value) => updateNozzle(index, { closing: value })}
                            disabled={closed}
                            aria-label={`${row.name} closing`}
                            className={rowInput}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right text-[12.5px] tabular-nums text-[#0D0F14] font-medium">
                          {computed ? inr(computed.sale, 3) : '0.000'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[12px] text-[#9BA0A6]">—</td>
                        <td className="px-3 py-1.5 text-right text-[12.5px] tabular-nums text-[#4E525A]">
                          {computed ? inr(computed.sale, 3) : '0.000'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[12.5px] tabular-nums text-[#4E525A]">
                          {Number(rate).toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[12.5px] tabular-nums text-[#0D0F14]">
                          {computed ? money(amount) : '₹0'}
                        </td>
                        <td className="px-4 py-1.5">
                          {below ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Checkbox
                                checked={row.rollover}
                                onChange={(value) => updateNozzle(index, { rollover: value })}
                                label="Rolled over"
                              />
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="Litres sold"
                                aria-label={`${row.name} replaced meter litres`}
                                disabled={closed}
                                value={row.replacedLitres ?? ''}
                                onChange={(event) => {
                                  const raw = event.target.value.replace(/[^0-9.]/g, '')
                                  updateNozzle(index, { replacedLitres: raw === '' ? null : Number(raw) })
                                }}
                                className="h-8 w-[92px] rounded-[8px] bg-[#F5F7F9] px-2 text-[12px] tabular-nums text-[#0D0F14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F]"
                              />
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#9BA0A6]">—</span>
                          )}
                        </td>
                      </tr>
                      {isLastOfProduct ? (
                        <tr className={row.product === 'MS' ? 'bg-[#F5F7F9] border-b-2 border-[#0D0F14]/10' : 'bg-[#EEF3F8] border-b-2 border-[#0D0F14]/10'}>
                          <td colSpan={4} className="px-4 py-2 text-[12px] font-semibold text-[#0D0F14]">
                            {row.product} TOTAL — {form.nozzles.filter((n) => n.product === row.product).length} nozzles · Meter − R/F = A/C
                          </td>
                          <td className="px-3 py-2 text-right text-[12.5px] font-bold tabular-nums text-[#0D0F14]">
                            {preview ? inr(preview.products[row.product].meterSale, 3) : '0.000'}
                          </td>
                          <td className="px-3 py-1.5">
                            <NumberInput
                              value={form.rf[row.product]}
                              disabled={closed}
                              aria-label={`${row.product} R/F litres`}
                              onChange={(value) => update({ rf: { ...form.rf, [row.product]: value } })}
                              className={rowInput}
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-[12.5px] font-bold tabular-nums text-[#0D0F14]">
                            {preview ? inr(preview.products[row.product].acSale, 3) : '0.000'}
                          </td>
                          <td className="px-3 py-2 text-right text-[12px] tabular-nums text-[#4E525A]">
                            × ₹{Number(preview?.products[row.product]?.rate ?? 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right text-[12.5px] font-bold tabular-nums text-[#0D0F14]">
                            {preview ? money(preview.products[row.product].amount) : '₹0'}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-[#4E525A]">Meter − R/F = A/C</td>
                        </tr>
                      ) : null}
                      </React.Fragment>
                    )
                  })}
                  <tr className="bg-[#0D0F14] text-white">
                    <td colSpan={4} className="px-4 py-2.5 text-[12px] font-bold tracking-wide">
                      GRAND TOTAL — A/C × RATE (F7)
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums">
                      {preview ? inr(preview.products.MS.acSale + preview.products.HSD.acSale, 3) : '0.000'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-white/70">
                      {preview ? inr(preview.products.MS.rf + preview.products.HSD.rf, 3) : '0.000'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums">
                      {preview ? inr(preview.products.MS.acSale + preview.products.HSD.acSale, 3) : '0.000'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-white/70">—</td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums">
                      {preview ? money(preview.fuel.totalAmount) : '₹0'}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-white/70">
                      {preview ? `MS ${money(preview.products.MS.amount)} + HSD ${money(preview.products.HSD.amount)}` : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {preview ? (
              <div className="grid grid-cols-1 gap-2 border-t border-[#E2E4E6] px-4 py-3 sm:grid-cols-3">
                {['MS', 'HSD'].map((product) => (
                  <div key={product} className="rounded-[10px] border border-[#E2E4E6] bg-[#F5F7F9] px-3 py-2 text-[11.5px] leading-relaxed">
                    <p className="font-semibold text-[#0D0F14]">{product} SALE box</p>
                    <p className="mt-0.5 text-[#4E525A]">
                      A/C {inr(preview.products[product].acSale, 3)} L × ₹{Number(preview.products[product].rate || 0).toFixed(2)} ={' '}
                      <strong className="tabular-nums text-[#0D0F14]">{money(preview.products[product].amount)}</strong>
                    </p>
                    <p className="text-[10.5px] text-[#9BA0A6]">Meter − R/F = A/C (F3) → A/C × rate (F4)</p>
                  </div>
                ))}
                <div className="rounded-[10px] bg-[#0D0F14] px-3 py-2 text-[11.5px] leading-relaxed text-white">
                  <p className="font-semibold">R/F value (F5) · Total (F7)</p>
                  <p className="mt-0.5 tabular-nums">{money(preview.products.MS.rfValue)} + {money(preview.products.HSD.rfValue)} = {money(preview.fuel.totalRfValue)}</p>
                  <p className="text-[12px] font-bold tabular-nums">F7 = {money(preview.fuel.totalAmount)}</p>
                </div>
              </div>
            ) : null}
            {preview ? (
              <div className="border-t border-[#E2E4E6] px-4 py-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4E525A]">Stocks — Op × Rate / Cl × Rate (F9) + Recv</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-[12px]">
                    <thead>
                      <tr>
                        <th className="border-b border-[#E2E4E6] px-3 py-1.5 text-left font-medium text-[#4E525A]">Product</th>
                        <th className="border-b border-[#E2E4E6] px-3 py-1.5 text-right font-medium text-[#4E525A]">Op Stock (L)</th>
                        <th className="border-b border-[#E2E4E6] px-3 py-1.5 text-right font-medium text-[#4E525A]">Recv (L)</th>
                        <th className="border-b border-[#E2E4E6] px-3 py-1.5 text-right font-medium text-[#4E525A]">Rate (₹/L)</th>
                        <th className="border-b border-[#E2E4E6] px-3 py-1.5 text-right font-medium text-[#4E525A]">Op Amount</th>
                        <th className="border-b border-[#E2E4E6] px-3 py-1.5 text-right font-medium text-[#4E525A]">Cl Stock (L)</th>
                        <th className="border-b border-[#E2E4E6] px-3 py-1.5 text-right font-medium text-[#4E525A]">Cl Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['MS', 'HSD'].map((product) => (
                        <tr key={product} className="border-b border-[#EFF1F3]">
                          <td className="px-3 py-1.5 font-semibold text-[#0D0F14]">
                            {product} ({product === 'MS' ? 'Petrol' : 'Diesel'})
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{inr(preview.products[product].openingStock, 3)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{inr(preview.products[product].receipts, 3)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{Number(preview.products[product].rate || 0).toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{money(preview.products[product].openingValue)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{inr(preview.products[product].closingStock, 3)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{money(preview.products[product].closingValue)}</td>
                        </tr>
                      ))}
                      <tr className="bg-[#F5F7F9] font-semibold">
                        <td className="px-3 py-1.5">TOTAL</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {inr(preview.products.MS.openingStock + preview.products.HSD.openingStock, 3)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {inr(preview.products.MS.receipts + preview.products.HSD.receipts, 3)}
                        </td>
                        <td className="px-3 py-1.5 text-right">—</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {money(preview.products.MS.openingValue + preview.products.HSD.openingValue)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {inr(preview.products.MS.closingStock + preview.products.HSD.closingStock, 3)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {money(preview.products.MS.closingValue + preview.products.HSD.closingValue)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[10.5px] text-[#9BA0A6]">MS and HSD shown separately. Cl = Op + Recv − Meter sale + R/F (F8).</p>
              </div>
            ) : null}
          </Card>

          {/* M-Oil */}
          <Card>
            <CardHeader
              title="M-Oil — names + prices"
              subtitle="Type brand names manually. Total below updates automatically (qty × price)."
              actions={
                <Button
                  size="sm"
                  variant="muted"
                  disabled={closed}
                  onClick={() =>
                    update({ lube: [...form.lube, { itemId: null, itemName: '', quantity: 1, price: 0 }] })
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add row
                </Button>
              }
            />
            <div className="space-y-2 p-4">
              {form.lube.length === 0 ? (
                <p className="text-[12px] text-[#9BA0A6]">No M-Oil sales today. Type name + qty + price.</p>
              ) : null}
              {form.lube.map((row, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_80px_100px_90px_32px]">
                  <TextInput
                    value={row.itemName}
                    disabled={closed}
                    aria-label="M-Oil name"
                    placeholder="M-Oil brand / name"
                    onChange={(e) => updateLube(index, { itemId: null, itemName: e.target.value })}
                    className={`${rowInput} col-span-2 sm:col-span-1`}
                  />
                  <NumberInput
                    value={row.quantity}
                    disabled={closed}
                    aria-label="Quantity"
                    placeholder="Qty"
                    onChange={(value) => updateLube(index, { quantity: value })}
                    className={rowInput}
                  />
                  <NumberInput
                    value={row.price}
                    disabled={closed}
                    aria-label="Price"
                    placeholder="Price ₹"
                    onChange={(value) => updateLube(index, { price: value })}
                    className={rowInput}
                  />
                  <span className="flex h-9 items-center justify-end text-[12.5px] tabular-nums text-[#0D0F14]">
                    {money((Number(row.quantity) || 0) * (Number(row.price) || 0))}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove lubricant row"
                    disabled={closed}
                    onClick={() => update({ lube: form.lube.filter((_, rowIndex) => rowIndex !== index) })}
                    className="flex h-9 w-8 items-center justify-center text-[#9BA0A6] hover:text-[#B42318] disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {preview ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E4E6] bg-[#F5F7F9] px-3 py-2.5">
                  <span className="text-[12px] text-[#4E525A]">
                    {form.lube.length} item(s) · Qty {inr(form.lube.reduce((s, r) => s + (Number(r.quantity) || 0), 0), 3)}
                  </span>
                  <span className="rounded-[10px] bg-[#0D0F14] px-4 py-1.5 text-[13px] font-bold tabular-nums text-white">
                    Total M-Oil (F6): {money(preview.lube.total)}
                  </span>
                </div>
              ) : null}
            </div>
          </Card>

          {/* Expenses (names + prices) */}
          <ExpenseCard
            form={form}
            data={data}
            closed={closed}
            updateExpense={updateExpense}
            removeExpense={(index) => update({ expenses: form.expenses.filter((_, i) => i !== index) })}
            addExpense={(categoryId) =>
              update({ expenses: [...form.expenses, { categoryId, type: 'running', details: '', amount: 0 }] })
            }
          />

          {/* Online + POS + Bank + Cash */}
          <Card>
            <CardHeader
              title="Online, POS and bank"
              subtitle="Online lines are added to F11; POS is one figure; a bank deposit reduces cash."
              actions={
                <Button
                  size="sm"
                  variant="muted"
                  disabled={closed}
                  onClick={() => update({ online: [...form.online, { label: 'Online', amount: 0 }] })}
                >
                  <Plus className="h-3.5 w-3.5" /> Add online line
                </Button>
              }
            />
            <div className="space-y-2 p-4">
              {form.online.map((row, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2">
                  <TextInput
                    value={row.label}
                    disabled={closed}
                    aria-label="Online label"
                    placeholder="Label (e.g. UPI, Dkpr)"
                    onChange={(event) => updateOnline(index, { label: event.target.value })}
                    className={rowInput}
                  />
                  <NumberInput
                    value={row.amount}
                    disabled={closed}
                    aria-label="Online amount"
                    onChange={(value) => updateOnline(index, { amount: value })}
                    className={rowInput}
                  />
                  <button
                    type="button"
                    aria-label="Remove online line"
                    disabled={closed}
                    onClick={() => update({ online: form.online.filter((_, rowIndex) => rowIndex !== index) })}
                    className="flex h-9 w-8 items-center justify-center text-[#9BA0A6] hover:text-[#B42318] disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">POS</span>
                  <NumberInput value={form.pos} disabled={closed} onChange={(value) => update({ pos: value })} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Bank deposit</span>
                  <NumberInput
                    value={form.bankDeposit}
                    disabled={closed}
                    onChange={(value) => update({ bankDeposit: value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Cash counted</span>
                  <NumberInput
                    value={form.countedCash}
                    disabled={closed}
                    onChange={(value) => update({ countedCash: value })}
                  />
                </label>
              </div>
            </div>
          </Card>

          {/* Credit parties — collection */}
          <CreditCard
            form={form}
            data={data}
            closed={closed}
            updateCredit={updateCredit}
            removeCredit={(index) => update({ credits: form.credits.filter((_, i) => i !== index) })}
            addCredit={() =>
              update({
                credits: [
                  ...form.credits,
                  { partyId: data.masters?.parties?.[0]?.id ?? '', type: 'payment', mode: 'cash', amount: 0, note: '' },
                ],
              })
            }
          />
        </div>

        {/* Summary column — one column as per rule book */}
        <div className="min-w-0 space-y-4 xl:sticky xl:top-[83px] xl:self-start">
          <Card>
            <CardHeader title="Day totals — one column" subtitle="Recalculated live; the server stores the official figures." />
            <div className="px-4 pb-1 pt-1">
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#9BA0A6]">MS Sale / HSD Sale (A/C litres)</p>
              <SummaryRow label="MS Sale (A/C)" value={preview?.products.MS.acSale} />
              <SummaryRow label="HSD Sale (A/C)" value={preview?.products.HSD.acSale} />
              <p className="mt-2 mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#9BA0A6]">Amounts</p>
              <SummaryRow label="MS amount (F4)" value={preview?.products.MS.amount} />
              <SummaryRow label="HSD amount (F4)" value={preview?.products.HSD.amount} />
              <SummaryRow label="Total amount (F7)" value={preview?.fuel.totalAmount} strong />
              <SummaryRow label="R/F value (F5)" value={preview?.fuel.totalRfValue} />
              <p className="mt-2 mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#9BA0A6]">Deductions & collections</p>
              <SummaryRow label="EXP — Expenses" value={preview?.expenses.total} />
              <SummaryRow label="Credit given" value={preview?.cash.creditGiven} />
              <SummaryRow label="Online collected" value={preview?.cash.online} />
              <SummaryRow label="POS machine" value={preview?.cash.pos} />
              <SummaryRow label="Credit received (paid)" value={preview?.cash.creditReceived} />
              <SummaryRow label="Net movement (F11)" value={preview?.cash.net} strong tone={preview?.cash.net < 0 ? 'bad' : undefined} />
              <p className="mt-2 mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#9BA0A6]">Cash box</p>
              <SummaryRow label="P. balanced (previous)" value={preview?.cash.previousBalance} />
              <SummaryRow label="Bank deposit" value={preview?.cash.bankDeposit} />
              <SummaryRow label="M-Oil (F6)" value={preview?.lube.total} />
              <div className="my-2 h-px bg-[#E2E4E6]" />
              <SummaryRow label="Total cash (F12)" value={preview?.cash.total} strong tone={preview?.cash.total < 0 ? 'bad' : undefined} />
              <SummaryRow label="Cash in hand − book (F13)" value={preview?.cash.difference} tone={Math.abs(preview?.cash.difference ?? 0) > 0.5 ? 'bad' : 'good'} />
              <SummaryRow label="R/F + Total cash (F16)" value={preview?.rfPlusCash} strong />
              <SummaryRow label="Daily profit (F17)" value={preview?.profit.net} />
            </div>
            <div className="border-t border-[#E2E4E6] px-4 py-3 text-[11.5px] leading-relaxed text-[#4E525A]">
              <div className="flex justify-between gap-2">
                <span>MS stock variance</span>
                <span className="tabular-nums">{preview ? `${inr(preview.products.MS.variance, 3)} L` : '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>HSD stock variance</span>
                <span className="tabular-nums">{preview ? `${inr(preview.products.HSD.variance, 3)} L` : '—'}</span>
              </div>
              <div className="mt-2 flex gap-3">
                <Link to="/stock" className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                  Stock &amp; dips
                </Link>
                <Link to="/expenses" className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                  Expenses
                </Link>
                <Link to="/credit" className="font-medium text-[#0D0F14] underline decoration-[#D2D5D9] underline-offset-2">
                  Credit
                </Link>
              </div>
            </div>
          </Card>

          {preview?.errors?.length ? (
            <div className="space-y-2">
              {preview.errors.map((message) => (
                <InlineError key={message}>
                  <span className="inline-flex items-start gap-1.5">
                    <CircleAlert className="mt-[1px] h-3.5 w-3.5 shrink-0" /> {message}
                  </span>
                </InlineError>
              ))}
            </div>
          ) : null}

          {preview?.alerts?.length ? (
            <div className="space-y-2">
              {preview.alerts.map((message) => (
                <InlineNotice key={message} tone="warn">
                  {message}
                </InlineNotice>
              ))}
            </div>
          ) : null}

          <p className="text-[11px] leading-relaxed text-[#9BA0A6]">
            Closing a day locks it. Reopening is allowed only when every later day is still open, because
            tomorrow&apos;s opening cash comes from today&apos;s total.
          </p>
        </div>
      </div>
    </div>
  )
}

function Pill({ litres: preview }) {
  if (!preview) return null
  return (
    <span className="text-[11px] tabular-nums text-[#4E525A]">
      {inr(preview.products.MS.meterSale, 3)} + {inr(preview.products.HSD.meterSale, 3)} L
    </span>
  )
}
