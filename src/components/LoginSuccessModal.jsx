import { useEffect, useRef } from 'react'

/**
 * Full-screen confirmation shown after a successful sign-in.
 *
 * The parent owns the timing; this component only renders the overlay and
 * moves focus into the dialog. `h-[100dvh]` tracks the visible viewport on
 * mobile browsers, and `overflow-hidden` prevents the bounce/scale animation
 * from ever creating a scrollbar.
 */
export default function LoginSuccessModal({ open, username = 'owner' }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex h-[100dvh] w-full animate-fade-in items-center justify-center overflow-hidden bg-black/20 px-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-success-title"
      aria-describedby="login-success-description"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-[360px] animate-pop-in overflow-hidden rounded-2xl border border-white/70 bg-white px-6 py-8 text-center shadow-2xl shadow-slate-950/25 outline-none sm:max-w-[400px] sm:px-10 sm:py-10"
      >
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center" aria-hidden="true">
          <span className="absolute inset-0 animate-ring-ping rounded-full bg-emerald-500/20" />
          <span className="absolute inset-0 rounded-full bg-emerald-50 ring-1 ring-emerald-600/15" />
          <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d="M20 6 9 17l-5-5"
                className="animate-check-draw"
                style={{ strokeDasharray: 36 }}
              />
            </svg>
          </span>
        </div>

        <h2
          id="login-success-title"
          className="mt-5 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[#0D0F14]"
        >
          Signed in
        </h2>
        <p id="login-success-description" className="mt-2 text-[13px] leading-relaxed text-[#4E525A]">
          Welcome back, <span className="font-semibold text-[#0D0F14]">{username}</span>.
          <br />
          Opening your dashboard…
        </p>

        <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <span className="block h-full w-full origin-left animate-success-drain rounded-full bg-emerald-500" />
        </div>
        <p className="mt-3 text-[10.5px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Secure session started
        </p>
      </div>
    </div>
  )
}
