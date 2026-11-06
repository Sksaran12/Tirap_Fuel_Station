import { useEffect, useState } from 'react'
import { Check, KeyRound, Plus, Save } from 'lucide-react'
import { api } from '../lib/api'
import { money } from '../lib/format'
import { useResource } from '../lib/useResource'
import {
  Button,
  Card,
  CardHeader,
  Empty,
  InlineError,
  InlineNotice,
  NumberInput,
  Select,
  TextInput,
} from '../components/ui'

const fieldLabel = 'mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]'

export default function Settings() {
  const settings = useResource(() => api.get('/settings'), [])
  const categories = useResource(() => api.get('/expense-categories'), [])
  const lube = useResource(() => api.get('/lube-items'), [])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newLube, setNewLube] = useState({ name: '', price: 0 })
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordNotice, setPasswordNotice] = useState('')

  useEffect(() => {
    if (settings.data?.row) {
      const row = settings.data.row
      setForm({
        stationName: row.stationName,
        rounding: row.rounding,
        marginMS: Number(row.marginMS),
        marginHSD: Number(row.marginHSD),
        lubeMargin: Number(row.lubeMargin),
        stockLossValuation: row.stockLossValuation,
        costMS: Number(row.costMS),
        costHSD: Number(row.costHSD),
        varianceLimit: Number(row.varianceLimit),
        maxMeterDigits: Number(row.maxMeterDigits),
      })
    }
  }, [settings.data])

  const save = async (event) => {
    event.preventDefault()
    setBusy('settings')
    setError('')
    setNotice('')
    try {
      await api.put('/settings', {
        ...form,
        marginMS: Number(form.marginMS) || 0,
        marginHSD: Number(form.marginHSD) || 0,
        lubeMargin: Number(form.lubeMargin) || 0,
        costMS: Number(form.costMS) || 0,
        costHSD: Number(form.costHSD) || 0,
        varianceLimit: Number(form.varianceLimit) || 0,
        maxMeterDigits: Number(form.maxMeterDigits) || 6,
      })
      settings.refresh()
      setNotice('Settings saved. New entries and open days recalculate with these values.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy('')
    }
  }

  const changePassword = async (event) => {
    event.preventDefault()
    setPasswordError('')
    setPasswordNotice('')
    if (password.newPassword !== password.confirm) {
      setPasswordError('The two new passwords do not match.')
      return
    }
    setBusy('password')
    try {
      await api.post('/auth/password', {
        currentPassword: password.currentPassword,
        newPassword: password.newPassword,
      })
      setPassword({ currentPassword: '', newPassword: '', confirm: '' })
      setPasswordNotice('Password changed. Other sessions have been signed out.')
    } catch (failure) {
      setPasswordError(failure.message)
    } finally {
      setBusy('')
    }
  }

  const addCategory = async (event) => {
    event.preventDefault()
    setBusy('category')
    setError('')
    try {
      await api.post('/expense-categories', { name: newCategory })
      setNewCategory('')
      categories.refresh()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy('')
    }
  }

  const addLube = async (event) => {
    event.preventDefault()
    setBusy('lube')
    setError('')
    try {
      await api.post('/lube-items', { name: newLube.name, price: Number(newLube.price) || 0 })
      setNewLube({ name: '', price: 0 })
      lube.refresh()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy('')
    }
  }

  if (settings.loading && !settings.data) {
    return <div className="p-4 text-[12px] text-[#4E525A]">Loading settings…</div>
  }
  if (!form) {
    return (
      <div className="p-4">
        <InlineError>{settings.error || 'Could not load settings.'}</InlineError>
      </div>
    )
  }

  return (
    <div className="px-4 pb-10 pt-4 sm:px-[19px]">
      {error ? <div className="mb-4"><InlineError>{error}</InlineError></div> : null}
      {notice ? <div className="mb-4"><InlineNotice tone="good">{notice}</InlineNotice></div> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Station" subtitle="Printed on reports and the app shell." />
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={fieldLabel}>Station name</span>
                <TextInput
                  value={form.stationName}
                  maxLength={80}
                  onChange={(event) => setForm({ ...form, stationName: event.target.value })}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>Rounding</span>
                <Select value={form.rounding} onChange={(event) => setForm({ ...form, rounding: event.target.value })}>
                  <option value="paper">Paper — floor to whole rupee</option>
                  <option value="exact">Exact — keep paise</option>
                </Select>
                <span className="mt-1 block text-[11px] text-[#9BA0A6]">
                  The paper sheet of 24/10/2026 uses floor-to-rupee.
                </span>
              </label>
              <label className="block">
                <span className={fieldLabel}>Maximum meter digits</span>
                <Select
                  value={form.maxMeterDigits}
                  onChange={(event) => setForm({ ...form, maxMeterDigits: Number(event.target.value) })}
                >
                  {[4, 5, 6, 7, 8].map((digits) => (
                    <option key={digits} value={digits}>
                      {digits} digits ({money(Math.pow(10, digits) - 1)})
                    </option>
                  ))}
                </Select>
                <span className="mt-1 block text-[11px] text-[#9BA0A6]">Used to resolve a meter rollover.</span>
              </label>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Margins and profit"
              subtitle="F17 needs a per-litre margin; until you set one, daily profit shows as —."
            />
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              <label className="block">
                <span className={fieldLabel}>MS margin (₹/L)</span>
                <NumberInput value={form.marginMS} onChange={(value) => setForm({ ...form, marginMS: value })} />
              </label>
              <label className="block">
                <span className={fieldLabel}>HSD margin (₹/L)</span>
                <NumberInput value={form.marginHSD} onChange={(value) => setForm({ ...form, marginHSD: value })} />
              </label>
              <label className="block">
                <span className={fieldLabel}>Lube margin (%)</span>
                <NumberInput value={form.lubeMargin} onChange={(value) => setForm({ ...form, lubeMargin: value })} />
              </label>
              <label className="block">
                <span className={fieldLabel}>Variance alert (L)</span>
                <NumberInput value={form.varianceLimit} onChange={(value) => setForm({ ...form, varianceLimit: value })} />
              </label>
            </div>
            <div className="border-t border-[#E2E4E6] px-4 py-2.5 text-[11px] leading-relaxed text-[#4E525A]">
              Running expenses reduce profit; one-off spends do not. A stock shortfall is valued at the selling rate or
              the cost rate below.
            </div>
          </Card>

          <Card>
            <CardHeader title="Stock loss valuation" subtitle="How a negative dip variance is costed in F17." />
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
              <label className="block">
                <span className={fieldLabel}>Valuation</span>
                <Select
                  value={form.stockLossValuation}
                  onChange={(event) => setForm({ ...form, stockLossValuation: event.target.value })}
                >
                  <option value="selling">Selling rate of the day</option>
                  <option value="cost">Cost rate</option>
                </Select>
              </label>
              <label className="block">
                <span className={fieldLabel}>MS cost (₹/L)</span>
                <NumberInput value={form.costMS} onChange={(value) => setForm({ ...form, costMS: value })} />
              </label>
              <label className="block">
                <span className={fieldLabel}>HSD cost (₹/L)</span>
                <NumberInput value={form.costHSD} onChange={(value) => setForm({ ...form, costHSD: value })} />
              </label>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" onClick={save} disabled={busy === 'settings'}>
              <Save className="h-4 w-4" /> {busy === 'settings' ? 'Saving…' : 'Save settings'}
            </Button>
            <span className="text-[11px] text-[#9BA0A6]">Every change is audited.</span>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Owner password" subtitle="At least 10 characters. Other sessions are signed out." />
            <div className="space-y-3 p-4">
              <label className="block">
                <span className={fieldLabel}>Current password</span>
                <TextInput
                  type="password"
                  autoComplete="current-password"
                  value={password.currentPassword}
                  onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>New password</span>
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  value={password.newPassword}
                  onChange={(event) => setPassword({ ...password, newPassword: event.target.value })}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>Confirm new password</span>
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  value={password.confirm}
                  onChange={(event) => setPassword({ ...password, confirm: event.target.value })}
                />
              </label>
              {passwordError ? <InlineError>{passwordError}</InlineError> : null}
              {passwordNotice ? <InlineNotice tone="good">{passwordNotice}</InlineNotice> : null}
              <Button
                variant="secondary"
                className="w-full"
                onClick={changePassword}
                disabled={busy === 'password' || !password.currentPassword || password.newPassword.length < 10}
              >
                <KeyRound className="h-4 w-4" /> {busy === 'password' ? 'Changing…' : 'Change password'}
              </Button>
              <p className="text-[11px] leading-relaxed text-[#9BA0A6]">
                Locked out? The developer reset script clears the lock and sets a fresh password on the server.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Expense categories" subtitle="Used by the Expenses screen." />
            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
              {(categories.data?.categories ?? []).map((category) => (
                <span
                  key={category.id}
                  className="inline-flex h-[24px] items-center rounded-[7px] bg-[#EFF1F3] px-2 text-[11.5px] text-[#4E525A]"
                >
                  {category.name}
                </span>
              ))}
              {(categories.data?.categories ?? []).length === 0 ? <Empty>No categories yet.</Empty> : null}
            </div>
            <form onSubmit={addCategory} className="flex items-center gap-2 p-4">
              <TextInput
                value={newCategory}
                maxLength={40}
                placeholder="New category"
                aria-label="New expense category"
                onChange={(event) => setNewCategory(event.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={busy === 'category' || !newCategory.trim()}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Lubricant price list" subtitle="Pre-fills the price on daily entry." />
            <ul className="divide-y divide-[#EFF1F3]">
              {(lube.data?.items ?? []).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="text-[12.5px] text-[#0D0F14]">{item.name}</span>
                  <span className="text-[12.5px] tabular-nums text-[#4E525A]">{money(item.price)}</span>
                </li>
              ))}
              {(lube.data?.items ?? []).length === 0 ? <Empty>No lubricant items yet.</Empty> : null}
            </ul>
            <form onSubmit={addLube} className="flex items-center gap-2 p-4">
              <TextInput
                value={newLube.name}
                maxLength={80}
                placeholder="Item name"
                aria-label="New lubricant name"
                onChange={(event) => setNewLube({ ...newLube, name: event.target.value })}
              />
              <div className="w-[110px] shrink-0">
                <NumberInput
                  value={newLube.price}
                  aria-label="New lubricant price"
                  onChange={(value) => setNewLube({ ...newLube, price: value })}
                />
              </div>
              <Button type="submit" variant="secondary" disabled={busy === 'lube' || !newLube.name.trim()}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="System" subtitle="Data and safety." />
            <div className="space-y-2 p-4 text-[11.5px] leading-relaxed text-[#4E525A]">
              <p className="flex items-start gap-2">
                <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[#147A3A]" /> Sessions end after 30 minutes idle.
              </p>
              <p className="flex items-start gap-2">
                <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[#147A3A]" /> Five wrong passwords lock the owner
                for 15 minutes.
              </p>
              <p className="flex items-start gap-2">
                <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[#147A3A]" /> Closed days are immutable until an
                audited reopen.
              </p>
              <p className="pt-1 text-[#9BA0A6]">
                Database: PostgreSQL in production, SQLite for local verification. Money is stored as NUMERIC(12,2).
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
