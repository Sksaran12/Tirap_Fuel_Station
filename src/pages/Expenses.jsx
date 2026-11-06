import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
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

export default function Expenses() {
  const { date, setDate } = useDay()
  const expenses = useResource(() => api.get(`/expenses?date=${date}`), [date])
  const categories = useResource(() => api.get('/expense-categories'), [])
  const [draft, setDraft] = useState({ categoryId: '', type: 'running', details: '', amount: 0 })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const rows = expenses.data?.expenses ?? []
  const firstCategory = categories.data?.categories?.[0]?.id ?? ''
  const categoryId = draft.categoryId || firstCategory
  const totals = useMemo(() => {
    const running = rows.filter((row) => row.type === 'running').reduce((sum, row) => sum + row.amount, 0)
    const oneOff = rows.filter((row) => row.type === 'one-off').reduce((sum, row) => sum + row.amount, 0)
    return { running, oneOff, total: running + oneOff }
  }, [rows])

  const add = async (event) => {
    event.preventDefault()
    setBusy(true)
    setActionError('')
    try {
      await api.post('/expenses', {
        date,
        categoryId,
        type: draft.type,
        details: draft.details,
        amount: Number(draft.amount) || 0,
      })
      setDraft((current) => ({ ...current, details: '', amount: 0 }))
      expenses.refresh()
    } catch (failure) {
      setActionError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    setBusy(true)
    setActionError('')
    try {
      await api.del(`/expenses/${id}`)
      expenses.refresh()
    } catch (failure) {
      setActionError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 pb-10 pt-4 sm:px-[19px]">
      <div className="mb-4">
        <DateNav date={date} onChange={setDate} label={`${dateLabel(date)} · station expenses`}>
          <Link to="/daily-entry">
            <Button variant="secondary">Back to daily entry</Button>
          </Link>
        </DateNav>
      </div>

      {actionError ? (
        <div className="mb-4">
          <InlineError>{actionError}</InlineError>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-[83px] lg:self-start">
          <CardHeader title="Add an expense" subtitle="Running costs reduce daily profit; one-off spends do not." />
          <form onSubmit={add} className="space-y-3 p-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Category</span>
              <Select
                value={categoryId}
                onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
                required
              >
                <option value="">Choose category…</option>
                {(categories.data?.categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </label>

            <div className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Type</span>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Expense type">
                {[
                  ['running', 'Running'],
                  ['one-off', 'One-off'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDraft({ ...draft, type: value })}
                    className={`h-[38px] rounded-[10px] border text-[12.5px] font-medium transition-colors ${
                      draft.type === value
                        ? 'border-[#17191F] bg-[#17191F] text-white'
                        : 'border-[#E2E4E6] bg-white text-[#4E525A] hover:bg-[#F5F7F9]'
                    }`}
                    aria-pressed={draft.type === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Details</span>
              <TextInput
                value={draft.details}
                placeholder="e.g. Generator diesel, tea for staff"
                maxLength={160}
                onChange={(event) => setDraft({ ...draft, details: event.target.value })}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">Amount (₹)</span>
              <NumberInput value={draft.amount} onChange={(value) => setDraft({ ...draft, amount: value })} />
            </label>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={busy || !categoryId || !(Number(draft.amount) > 0)}
            >
              <Plus className="h-4 w-4" /> {busy ? 'Adding…' : 'Add expense'}
            </Button>
            <p className="text-[11px] leading-relaxed text-[#9BA0A6]">
              Expenses are dated {dateLabel(date)}. Closed days reject changes until
              reopened.
            </p>
          </form>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Running', totals.running],
              ['One-off', totals.oneOff],
              ['Total', totals.total],
            ].map(([label, value]) => (
              <Card key={label} className="px-3 py-3">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#4E525A]">{label}</span>
                <Money value={value} className="mt-1.5 block text-[17px] font-semibold" />
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader
              title={`Expenses on ${dateLabel(date)}`}
              subtitle="Running expenses feed F11 and F17; one-off spends only leave the cash box."
            />
            {expenses.loading && !expenses.data ? (
              <Empty>Loading expenses…</Empty>
            ) : rows.length === 0 ? (
              <Empty>No expenses recorded for this day.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr>
                      <th className="h-[33px] border-b border-[#E2E4E6] px-4 text-left text-[12px] font-normal text-[#4E525A]">Category</th>
                      <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-left text-[12px] font-normal text-[#4E525A]">Details</th>
                      <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-left text-[12px] font-normal text-[#4E525A]">Type</th>
                      <th className="h-[33px] border-b border-[#E2E4E6] px-3 text-right text-[12px] font-normal text-[#4E525A]">Amount</th>
                      <th className="h-[33px] w-12 border-b border-[#E2E4E6] px-2 text-right text-[12px] font-normal text-[#4E525A]" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-[#E2E4E6]">
                        <td className="px-4 py-2 text-[12.5px] font-medium text-[#0D0F14]">{row.category}</td>
                        <td className="px-3 py-2 text-[12.5px] text-[#4E525A]">{row.details || <span className="text-[#9BA0A6]">—</span>}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex h-[23px] items-center rounded-[7px] px-2 text-[10.5px] font-medium uppercase tracking-[0.5px] ${
                              row.type === 'one-off' ? 'bg-[#FBF0DA] text-[#A66A08]' : 'bg-[#EFF1F3] text-[#4E525A]'
                            }`}
                          >
                            {row.type === 'one-off' ? 'One-off' : 'Running'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Money value={row.amount} className="text-[12.5px] font-medium" />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            aria-label="Delete expense"
                            disabled={busy}
                            onClick={() => remove(row.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#9BA0A6] hover:bg-[#FDE8E5] hover:text-[#B42318] disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-[#E2E4E6] px-4 py-2.5 text-[11px] leading-relaxed text-[#4E525A]">
              Manage the category list in <Link to="/settings" className="font-medium underline decoration-[#D2D5D9] underline-offset-2">Settings</Link>.
              Daily entry shows these totals read-only, so nothing is counted twice.
            </div>
          </Card>

          {expenses.error ? <InlineError>{expenses.error}</InlineError> : null}
          {rows.length === 0 && totals.total === 0 ? (
            <InlineNotice>Expenses are optional — add only what the station actually spent today.</InlineNotice>
          ) : null}
        </div>
      </div>
    </div>
  )
}
