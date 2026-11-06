import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Calculator,
  CircleAlert,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  LockKeyhole,
  LockKeyholeOpen,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { BpclMark } from '../components/BpclLogo'
import LoginSuccessModal from '../components/LoginSuccessModal'

const FEATURES = [
  {
    icon: Calculator,
    title: 'F1–F17, calculated live',
    body: 'The paper sheet reconciles as you type, then locks when the day is closed.',
  },
  {
    icon: LockKeyholeOpen,
    title: 'Reopen with a paper trail',
    body: 'Every save, close and reopen is written to the audit log — never a silent edit.',
  },
  {
    icon: Fingerprint,
    title: 'Built for the owner',
    body: 'One account, a 30-minute idle timeout, and a 15-minute lockout after five wrong tries.',
  },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('owner')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(null)

  const year = useMemo(() => new Date().getFullYear(), [])

  useEffect(() => {
    if (!success) return undefined
    const timer = window.setTimeout(() => {
      navigate(success.redirectTo, { replace: true })
    }, success.delayMs)
    return () => window.clearTimeout(timer)
  }, [success, navigate])

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError('')
    try {
      const data = await login(username.trim(), password)
      setSuccess({
        username: data?.user?.username || username.trim(),
        delayMs: Number(data?.redirectDelayMs) || 1500,
        redirectTo: data?.redirectTo || '/dashboard',
      })
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-[#070D18] text-white">
      {/* Ambient brand light + a faint ledger grid. Decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-1/4 h-80 w-80 animate-drift-slow rounded-full bg-[#0B3C8C]/45 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-[#F5B301]/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      </div>

      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-[1500px] lg:grid-cols-[1.02fr_.98fr]">
        {/* Brand story — stacks above the card on phones. */}
        <aside className="flex flex-col justify-between gap-8 px-5 pb-2 pt-6 sm:px-8 sm:pb-4 sm:pt-10 lg:px-14 lg:py-12">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur">
                <BpclMark className="h-8 w-8" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold leading-tight tracking-[-0.01em]">
                  Tirap Fuel Station
                </span>
                <span className="block truncate text-[9.5px] font-medium uppercase leading-tight tracking-[0.2em] text-slate-400">
                  BPCL Dealer Portal
                </span>
              </span>
            </div>

            <div className="mt-6 sm:mt-12 lg:mt-24">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-300 backdrop-blur">
                <ShieldCheck className="h-3.5 w-3.5 text-[#F5B301]" strokeWidth={2} aria-hidden="true" />
                Owner access only
              </span>

              <h1 className="mt-4 max-w-[470px] text-[31px] font-semibold leading-[1.03] tracking-[-0.035em] sm:mt-5 sm:text-[44px] lg:text-[46px]">
                Every litre.
                <br />
                <span className="text-[#F5B301]">Every rupee.</span>
                <br />
                Accounted for.
              </h1>

              <p className="mt-3 text-[12px] leading-relaxed text-slate-400 sm:hidden">
                Owner access to the daily register.
              </p>

              <p className="mt-5 hidden max-w-[420px] text-[13px] leading-relaxed text-slate-400 sm:block sm:text-[14px]">
                The daily register for Tirap Fuel Station — meters, stock dips, credit and cash,
                reconciled on one sheet before the shutters come down.
              </p>

              <ul className="mt-8 hidden space-y-4 sm:block">
                {FEATURES.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex max-w-[430px] items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300">
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium leading-snug text-slate-200">
                        {title}
                      </span>
                      <span className="mt-1 block text-[11.5px] leading-relaxed text-slate-500">
                        {body}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="hidden items-center justify-between border-t border-white/10 pt-4 text-[10.5px] leading-relaxed text-slate-500 lg:flex">
            <span>© {year} Tirap Fuel Station</span>
            <span>Authorised BPCL dealer · Arunachal Pradesh</span>
          </div>
        </aside>

        {/* The boxed sign-in card. */}
        <section className="flex flex-col justify-center px-4 pb-8 pt-3 sm:px-8 sm:pb-12 lg:px-12 lg:py-12">
          <div className="mx-auto w-full max-w-[440px]">
            <div className="rounded-2xl border border-white/60 bg-white p-5 text-[#0D0F14] shadow-2xl shadow-black/30 sm:p-8">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Secure sign in
                  </p>
                  <h2 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.025em] text-slate-950 sm:text-[26px]">
                    Welcome back
                  </h2>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
                  <ShieldCheck className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                  Owner
                </span>
              </div>

              <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
                Use the owner account to open today&apos;s register.
              </p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="username"
                    className="mb-1.5 block text-[12px] font-medium text-slate-700"
                  >
                    Username
                  </label>
                  <div className="relative">
                    <UserRound
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <input
                      id="username"
                      name="username"
                      autoComplete="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      disabled={busy}
                      required
                      className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-11 pr-4 text-[16px] text-slate-900 transition-colors placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-900/10 disabled:opacity-60 sm:text-[14px]"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <label htmlFor="password" className="block text-[12px] font-medium text-slate-700">
                      Password
                    </label>
                    <span className="text-[10.5px] text-slate-400">Case sensitive</span>
                  </div>
                  <div className="relative">
                    <LockKeyhole
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={busy}
                      required
                      className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-11 pr-14 text-[16px] text-slate-900 transition-colors placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-900/10 disabled:opacity-60 sm:text-[14px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      disabled={busy}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 disabled:opacity-50"
                    >
                      {showPassword ? (
                        <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {error ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12px] leading-snug text-red-700"
                  >
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={busy || !password}
                  className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-[14px] font-semibold text-white shadow-lg shadow-slate-950/20 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-[10.5px] text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <LockKeyhole className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  30-min idle timeout
                </span>
                <span>5 tries · 15-min lockout</span>
              </div>
            </div>

            <p className="mt-5 text-center text-[10.5px] leading-relaxed text-slate-500 lg:hidden">
              © {year} Tirap Fuel Station · Authorised BPCL dealer
            </p>
          </div>
        </section>
      </div>

      <LoginSuccessModal open={Boolean(success)} username={success?.username} />
    </div>
  )
}
