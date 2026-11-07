import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'react-toastify'
import { dateLabel, money } from '../lib/format'
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
  Select,
  TextInput,
} from '../components/ui'

const cell = 'h-8 rounded-[8px]'

function ageLabel(dateKey) {
  if (!dateKey) return '—'
  const days = Math.floor((Date.now() - new Date(`${dateKey}T00:00:00Z`).getTime()) / 86400000)
  if (days <= 0) return 'today'
  return `${days} day${days === 1 ? '' : 's'}`
}

export default function Credit() {
  const { date, setDate } = useDay()
  const { data, loading, error, refresh } = useResource(() => api.get('/credit'), [])
  const [showParty, setShowParty] = useState(false)
  const [partyDraft, setPartyDraft] = useState({ name: '', phone: '', creditLimit: 0, openingBalance: 0 })
  const [txn, setTxn] = useState({ partyId: '', type: 'credit', mode: 'cash', amount: 0, note: '' })
  const [partyFilter, setPartyFilter] = useState('')
  // Note: NumberInput in edit mode uses local draft — commit via PUT panel below.
  const [editing, setEditing] = useState(null)
  const [editDraft, setEditDraft] = useState({ amount: 0, note: '', mode: 'cash', type: 'credit' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const parties = data?.parties ?? []
  const transactions = data?.transactions ?? []
  const totals = useMemo(() => {
    const outstanding = parties.reduce((sum, party) => sum + Math.max(0, party.outstanding), 0)
    const given = parties.reduce((sum, party) => sum + party.given, 0)
    const paid = parties.reduce((sum, party) => sum + party.paid, 0)
    return { outstanding, given, paid }
  }, [parties])

  const todayTotals = useMemo(() => {
    const todays = transactions.filter((row) => row.date === date)
    const given = todays.filter((row) => row.type === 'credit').reduce((sum, row) => sum + row.amount, 0)
    const paid = todays.filter((row) => row.type === 'payment').reduce((sum, row) => sum + row.amount, 0)
    return { count: todays.length, given, paid }
  }, [transactions, date])

  const shown = partyFilter ? transactions.filter((row) => row.partyId === partyFilter) : transactions
  const shownTotals = useMemo(() => {
    const given = shown.filter((row) => row.type === 'credit').reduce((sum, row) => sum + row.amount, 0)
    const paid = shown.filter((row) => row.type === 'payment').reduce((sum, row) => sum + row.amount, 0)
    return { given, paid, count: shown.length }
  }, [shown])
  const selectedParty = parties.find((party) => party.id === partyFilter)
  const partyId = txn.partyId || parties[0]?.id || ''

  const addParty = async (event) => {
    event.preventDefault()
    setBusy(true)
    setActionError('')
    try {
      await api.post('/credit/parties', {
        name: partyDraft.name,
        phone: partyDraft.phone,
        creditLimit: Number(partyDraft.creditLimit) || 0,
        openingBalance: Number(partyDraft.openingBalance) || 0,
      })
      setPartyDraft({ name: '', phone: '', creditLimit: 0, openingBalance: 0 })
      setShowParty(false)
      refresh()
      toast.success('Party saved.')
    } catch (failure) {
      setActionError(failure.message)
      toast.error(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const addTransaction = async (event) => {
    event.preventDefault()
    setBusy(true)
    setActionError('')
    try {
      await api.post('/credit/transactions', {
        date,
        partyId,
        type: txn.type,
        mode: txn.mode,
        amount: Number(txn.amount) || 0,
        note: txn.note,
      })
      setTxn((current) => ({ ...current, amount: 0, note: '' }))
      refresh()
      toast.success(txn.type === 'credit' ? 'Credit added.' : 'Payment added.')
    } catch (failure) {
      setActionError(failure.message)
      toast.error(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const removeTransaction = async (id) => {
    setBusy(true)
    setActionError('')
    try {
      await api.del(`/credit/transactions/${id}`)
      refresh()
      toast.success('Entry deleted.')
    } catch (failure) {
      setActionError(failure.message)
      toast.error(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (row) => {
    setEditing(row.id)
    setEditDraft({ amount: row.amount, note: row.note, mode: row.mode, type: row.type })
  }

  const saveEdit = async (row) => {
    const amount = Number(editDraft.amount) || 0
    if (!(amount > 0)) {
      toast.error('Amount must be greater than zero.')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await api.put(`/credit/transactions/${row.id}`, {
        amount,
        note: editDraft.note,
        mode: editDraft.mode,
        type: editDraft.type,
      })
      setEditing(null)
      refresh()
      toast.success('Amount and name updated.')
    } catch (failure) {
      setActionError(failure.message)
      toast.error(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 pb-10 pt-4 sm:px-[19px]">
      <div className="mb-4">
        <DateNav date={date} onChange={setDate} label={`${dateLabel(date)} · credit ledger`}>
          <Button variant="secondary" onClick={() => setShowParty((value) => !value)}>
            <UserPlus className="h-4 w-4" /> {showParty ? 'Hide party form' : 'New party'}
          </Button>
        </DateNav>
      </div>

      {actionError ? (
        <div className="mb-4">
          <InlineError>{actionError}</InlineError>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ['Outstanding', totals.outstanding],
          ['Credit given', totals.given],
          ['Payments received', totals.paid],
        ].map(([label, value]) => (
          <Card key={label} className="animate-rise px-4 py-3">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#4E525A]">{label}</span>
            <Money value={value} tone={label === 'Outstanding' && value > 0 ? 'bad' : undefined} className="mt-1.5 block text-[19px] font-semibold" />
          </Card>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 rounded-[14px] border border-[#E2E4E6] bg-[#F5F7F9] px-4 py-3 sm:grid-cols-3">
        <div>
          <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#4E525A]">Today&apos;s credit given (auto)</span>
          <p className="mt-1 text-[16px] font-bold tabular-nums text-[#0D0F14]">{money(todayTotals.given)}</p>
          <p className="text-[10.5px] text-[#9BA0A6]">{dateLabel(date)}</p>
        </div>
        <div>
          <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#4E525A]">Today&apos;s payments total (auto)</span>
          <p className="mt-1 text-[16px] font-bold tabular-nums text-[#147A3A]">{money(todayTotals.paid)}</p>
          <p className="text-[10.5px] text-[#9BA0A6]">{todayTotals.count} entries</p>
        </div>
        <div>
          <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#4E525A]">Balance today</span>
          <p className="mt-1 text-[16px] font-bold tabular-nums text-[#0D0F14]">{money(todayTotals.paid - todayTotals.given)}</p>
          <p className="text-[10.5px] text-[#9BA0A6]">payments − credit given</p>
        </div>
      </div>

      {showParty ? (
        <Card className="mt-4">
          <CardHeader title="New credit party" subtitle="A transport company, a fleet or a regular customer." />
          <form onSubmit={addParty} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block lg:col-span-2">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Name</span>
              <TextInput
                value={partyDraft.name}
                required
                maxLength={80}
                placeholder="e.g. Arun Transport"
                onChange={(event) => setPartyDraft({ ...partyDraft, name: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Phone</span>
              <TextInput
                value={partyDraft.phone}
                maxLength={20}
                inputMode="tel"
                onChange={(event) => setPartyDraft({ ...partyDraft, phone: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Credit limit</span>
              <NumberInput
                value={partyDraft.creditLimit}
                onChange={(value) => setPartyDraft({ ...partyDraft, creditLimit: value })}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Opening balance</span>
              <NumberInput
                value={partyDraft.openingBalance}
                onChange={(value) => setPartyDraft({ ...partyDraft, openingBalance: value })}
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-5">
              <Button type="submit" variant="primary" disabled={busy || !partyDraft.name.trim()}>
                <Plus className="h-4 w-4" /> {busy ? 'Saving…' : 'Save party'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <CardHeader title="Party balances" subtitle="Outstanding = opening balance + credit given − payments received." />
          {loading && !data ? (
            <Empty>Loading parties…</Empty>
          ) : parties.length === 0 ? (
            <Empty>No credit parties yet. Add the first one above.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-4 text-left text-[12px] font-normal text-[#4E525A]">Party</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Given</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Paid</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Outstanding</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Limit</th>
                    <th className="h-[33px] border-b border-[#E2E4E6] px-4 text-left text-[12px] font-normal text-[#4E525A]">Oldest credit</th>
                  </tr>
                </thead>
                <tbody>
                  {parties.map((party) => {
                    const overLimit = party.creditLimit > 0 && party.outstanding > party.creditLimit
                    return (
                      <tr
                        key={party.id}
                        className={`border-b border-[#E2E4E6] hover:bg-[#F5F7F9] ${partyFilter === party.id ? 'bg-[#F5F7F9]' : ''}`}
                      >
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => setPartyFilter(partyFilter === party.id ? '' : party.id)}
                            className="text-left"
                          >
                            <span className="block text-[12.5px] font-medium text-[#0D0F14]">{party.name}</span>
                            <span className="block text-[10.5px] text-[#9BA0A6]">
                              {party.phone || 'no phone'} · {partyFilter === party.id ? 'showing statement' : 'tap for statement'}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right text-[12.5px] tabular-nums text-[#4E525A]">{money(party.given)}</td>
                        <td className="px-3 py-2 text-right text-[12.5px] tabular-nums text-[#4E525A]">{money(party.paid)}</td>
                        <td className="px-3 py-2 text-right">
                          <Money value={party.outstanding} tone={overLimit ? 'bad' : party.outstanding > 0 ? 'bad' : 'good'} className="text-[12.5px] font-semibold" />
                          {overLimit ? <span className="ml-1 text-[10px] font-medium uppercase text-[#B42318]">over</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right text-[12.5px] tabular-nums text-[#4E525A]">
                          {party.creditLimit > 0 ? money(party.creditLimit) : '—'}
                        </td>
                        <td className="px-4 py-2 text-[12px] text-[#4E525A]">
                          {party.oldestCreditDate ? `${dateLabel(party.oldestCreditDate)} · ${ageLabel(party.oldestCreditDate)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-[#E2E4E6] px-4 py-2.5 text-[11px] leading-relaxed text-[#4E525A]">
            Credit given and cash payments on a date feed the F11 cash chain automatically — no re-entry in the daily sheet.
          </div>
        </Card>

        <Card className="xl:sticky xl:top-[83px] xl:self-start">
          <CardHeader
            title={selectedParty ? `Statement · ${selectedParty.name}` : 'Credit or payment'}
            subtitle={selectedParty ? 'Entries for this party only.' : `Dated ${dateLabel(date)}.`}
          />
          <form onSubmit={addTransaction} className="space-y-3 p-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Party</span>
              <Select value={partyId} onChange={(event) => setTxn({ ...txn, partyId: event.target.value })} required>
                <option value="">Choose party…</option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </Select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              {[
                ['credit', 'Credit given'],
                ['payment', 'Payment in'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTxn({ ...txn, type: value })}
                  className={`h-[38px] rounded-[10px] border text-[12.5px] font-medium transition-colors ${
                    txn.type === value
                      ? 'border-[#17191F] bg-[#17191F] text-white'
                      : 'border-[#E2E4E6] bg-white text-[#4E525A] hover:bg-[#F5F7F9]'
                  }`}
                  aria-pressed={txn.type === value}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Mode</span>
              <Select value={txn.mode} onChange={(event) => setTxn({ ...txn, mode: event.target.value })}>
                <option value="cash">Cash</option>
                <option value="online">Online / bank</option>
              </Select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Amount / Price (₹)</span>
              <NumberInput value={txn.amount} onChange={(value) => setTxn({ ...txn, amount: value })} />
              <span className="mt-1 block text-[11px] text-[#9BA0A6]">
                Payments total auto: {money(todayTotals.paid)} today · {txn.type === 'payment' ? `after this entry ${money(todayTotals.paid + (Number(txn.amount) || 0))}` : `credit given ${money(todayTotals.given)}`}
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Note / Vehicle No</span>
              <TextInput
                value={txn.note}
                maxLength={160}
                placeholder="Name, vehicle number, invoice…"
                onChange={(event) => setTxn({ ...txn, note: event.target.value })}
              />
            </label>

            <Button type="submit" variant="primary" className="w-full" disabled={busy || !partyId || !(Number(txn.amount) > 0)}>
              <Plus className="h-4 w-4" /> {busy ? 'Saving…' : txn.type === 'credit' ? 'Add credit' : 'Add payment'}
            </Button>
            <p className="text-[11px] leading-relaxed text-[#9BA0A6]">
              Only cash payments increase today&apos;s cash box; online payments settle the party account without touching
              cash.
            </p>
          </form>
        </Card>
      </div>

      <Card className="animate-rise mt-4" style={{ animationDelay: '100ms' }}>
        <CardHeader
          title={selectedParty ? `Transactions · ${selectedParty.name}` : 'Recent credit transactions'}
          subtitle={`Names + prices. Newest first, ${shownTotals.count} entries · Given ${money(shownTotals.given)} · Paid ${money(shownTotals.paid)}`}
          actions={
            partyFilter ? (
              <Button size="sm" variant="muted" onClick={() => setPartyFilter('')}>
                Clear filter
              </Button>
            ) : null
          }
        />
        {shown.length === 0 ? (
          <Empty>No credit entries yet for {selectedParty ? selectedParty.name : 'the station'}.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-2 text-center text-[12px] font-normal text-[#4E525A] w-[44px]">Sl No</th>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-4 text-left text-[12px] font-normal text-[#4E525A]">Date</th>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-left text-[12px] font-normal text-[#4E525A]">Name (Party)</th>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-left text-[12px] font-normal text-[#4E525A]">Type</th>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-left text-[12px] font-normal text-[#4E525A]">Mode</th>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-left text-[12px] font-normal text-[#4E525A]">Note</th>
                  <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Price (₹)</th>
                  <th className="h-[33px] w-12 border-b border-[#E2E4E6] px-2 text-right text-[12px] font-normal text-[#4E525A]" />
                </tr>
              </thead>
              <tbody>
                {shown.map((row, idx) => {
                  const isEditing = editing === row.id
                  return (
                  <tr key={row.id} className={`border-b border-[#E2E4E6] ${isEditing ? 'bg-[#F5F9FF]' : ''}`}>
                    <td className="px-2 py-2 text-center text-[12px] tabular-nums text-[#4E525A]">{idx + 1}</td>
                    <td className="px-4 py-2 text-[12.5px] tabular-nums text-[#4E525A]">{dateLabel(row.date)}</td>
                    <td className="px-3 py-2 text-[12.5px] font-medium text-[#0D0F14]">
                      {row.partyName}
                      {isEditing ? <span className="ml-1 text-[10px] text-[#0B3C8C]">editing…</span> : null}
                    </td>
                    <td className="px-3 py-1.5">
                      {isEditing ? (
                        <Select value={editDraft.type} onChange={(event) => setEditDraft({ ...editDraft, type: event.target.value })} className={cell}>
                          <option value="credit">Credit</option>
                          <option value="payment">Payment</option>
                        </Select>
                      ) : (
                        <span
                          className={`inline-flex h-[23px] items-center rounded-[7px] px-2 text-[10.5px] font-medium uppercase tracking-[0.5px] ${
                            row.type === 'credit' ? 'bg-[#FDE8E5] text-[#B42318]' : 'bg-[#E2F4E6] text-[#147A3A]'
                          }`}
                        >
                          {row.type === 'credit' ? 'Credit' : 'Payment'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {isEditing ? (
                        <Select value={editDraft.mode} onChange={(event) => setEditDraft({ ...editDraft, mode: event.target.value })} className={cell}>
                          <option value="cash">Cash</option>
                          <option value="online">Online</option>
                        </Select>
                      ) : (
                        <span className="text-[12px] capitalize text-[#4E525A]">{row.mode}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {isEditing ? (
                        <TextInput value={editDraft.note} onChange={(event) => setEditDraft({ ...editDraft, note: event.target.value })} placeholder="Name / vehicle" className={cell} />
                      ) : (
                        <span className="text-[12.5px] text-[#4E525A]">{row.note || <span className="text-[#9BA0A6]">—</span>}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {isEditing ? (
                        <NumberInput value={editDraft.amount} onChange={(value) => setEditDraft({ ...editDraft, amount: value })} className={cell} />
                      ) : (
                        <span className="block text-right">
                          <Money value={row.amount} tone={row.type === 'credit' ? 'bad' : 'good'} className="text-[12.5px] font-medium" />
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {row.date === date ? (
                        <span className="inline-flex gap-1">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                aria-label="Save edit"
                                disabled={busy}
                                onClick={() => saveEdit(row)}
                                className="inline-flex h-8 items-center rounded-[8px] bg-[#17191F] px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
                              >
                                {busy ? '…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel edit"
                                onClick={() => setEditing(null)}
                                className="inline-flex h-8 items-center rounded-[8px] px-2.5 text-[11px] text-[#4E525A] hover:bg-[#EFF1F3]"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                aria-label="Edit credit entry"
                                disabled={busy}
                                onClick={() => startEdit(row)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#9BA0A6] hover:bg-[#EEF3F8] hover:text-[#0B3C8C] disabled:opacity-40"
                              >
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                              </button>
                              <button
                                type="button"
                                aria-label="Delete credit entry"
                                disabled={busy}
                                onClick={() => removeTransaction(row.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#9BA0A6] hover:bg-[#FDE8E5] hover:text-[#B42318] disabled:opacity-40"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-[10.5px] text-[#9BA0A6]" title={`Open ${row.date} to edit`}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-[#E2E4E6] px-4 py-2.5 text-[11px] leading-relaxed text-[#4E525A]">
          Entries can only be deleted on an open day — select that date above, then delete. Closed days stay immutable.{' '}
          <Link to="/daily-entry" className="font-medium underline decoration-[#D2D5D9] underline-offset-2">
            Open daily entry
          </Link>
        </div>
      </Card>

      {error ? <div className="mt-4"><InlineError>{error}</InlineError></div> : null}
      {parties.length === 0 ? (
        <div className="mt-4">
          <InlineNotice>Credit is optional at this station — leave it empty if all sales are cash.</InlineNotice>
        </div>
      ) : null}
    </div>
  )
}
