import { useEffect, useId, useRef, useState } from 'react'
import { money } from '../lib/format'

/* --------------------------------- buttons -------------------------------- */

const buttonBase =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-[13px] font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F] disabled:cursor-not-allowed disabled:opacity-50'

const buttonVariants = {
  primary: 'bg-[#0D0F14] text-white hover:bg-[#262A32]',
  secondary:
    'border border-[#E2E4E6] bg-white text-[#4E525A] hover:bg-[#F5F7F9] hover:text-[#0D0F14]',
  muted: 'bg-[#F5F7F9] text-[#4E525A] hover:bg-[#EFF1F3] hover:text-[#0D0F14]',
  danger: 'border border-[#F3C9C3] bg-[#FDE8E5] text-[#B42318] hover:bg-[#f9dcd7]',
  ghost: 'text-[#4E525A] hover:bg-[#F5F7F9] hover:text-[#0D0F14]',
}

const buttonSizes = {
  sm: 'h-8 px-3',
  md: 'h-[38px] px-3.5',
  lg: 'h-10 px-4',
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }) {
  return (
    <button
      type="button"
      className={`${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    />
  )
}

/* ---------------------------------- cards --------------------------------- */

export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`rounded-[14px] border border-[#E2E4E6] bg-white ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E4E6] px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold leading-tight text-[#0D0F14]">{title}</h2>
        {subtitle ? <p className="mt-1 text-[12px] leading-tight text-[#4E525A]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/* --------------------------------- fields --------------------------------- */

const fieldClass =
  'h-[38px] w-full rounded-[10px] border-0 bg-[#F5F7F9] px-3 text-[13px] text-[#0D0F14] placeholder:text-[#9BA0A6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F] disabled:bg-[#EFF1F3] disabled:text-[#9BA0A6]'

export function Field({ label, hint, error, children, className = '', htmlFor }) {
  return (
    <label className={`block ${className}`} htmlFor={htmlFor}>
      {label ? (
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#4E525A]">
          {label}
        </span>
      ) : null}
      {children}
      {error ? <span className="mt-1 block text-[11px] text-[#B42318]">{error}</span> : null}
      {hint && !error ? <span className="mt-1 block text-[11px] text-[#9BA0A6]">{hint}</span> : null}
    </label>
  )
}

export function TextInput({ className = '', ...props }) {
  return <input className={`${fieldClass} ${className}`} {...props} />
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${fieldClass} appearance-none pr-8 ${className}`} {...props}>
      {children}
    </select>
  )
}

/**
 * Numeric input that lets the owner clear the box while typing.
 * Emits a number (0 when empty) and keeps a local editing string.
 */
export function NumberInput({ value, onChange, className = '', allowDecimal = true, ...props }) {
  const [draft, setDraft] = useState(() => (value === 0 || value === undefined ? '' : String(value)))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(value === 0 || value === undefined ? '' : String(value))
  }, [value])

  return (
    <input
      {...props}
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      className={`${fieldClass} text-right tabular-nums ${className}`}
      value={draft}
      onFocus={(event) => {
        focused.current = true
        props.onFocus?.(event)
      }}
      onChange={(event) => {
        const next = event.target.value.replace(/[^0-9.]/g, '')
        const parts = next.split('.')
        const clean = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : next
        setDraft(clean)
        const parsed = Number(clean)
        onChange(Number.isFinite(parsed) ? parsed : 0)
      }}
      onBlur={(event) => {
        focused.current = false
        setDraft(value === 0 || value === undefined ? '' : String(value))
        props.onBlur?.(event)
      }}
    />
  )
}

export function Checkbox({ checked, onChange, label, id: providedId }) {
  const autoId = useId()
  const id = providedId ?? autoId
  return (
    <span className="inline-flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border-0 bg-[#EFF1F3] bg-[center] bg-no-repeat checked:bg-[#17191F] checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%223%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m5%2012%204.5%204.5L19%206%22%2F%3E%3C%2Fsvg%3E')] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F]"
      />
      {label ? (
        <label htmlFor={id} className="cursor-pointer text-[13px] text-[#4E525A]">
          {label}
        </label>
      ) : null}
    </span>
  )
}

/* --------------------------------- status --------------------------------- */

export function StatusPill({ status }) {
  const closed = status === 'closed'
  return (
    <span
      className={`inline-flex h-[23px] items-center rounded-[7px] px-2 text-[10.5px] font-medium uppercase tracking-[0.5px] ${
        closed
          ? 'border border-[#D2D5D9] bg-white text-[#4E525A]'
          : 'bg-[#E2F4E6] text-[#147A3A]'
      }`}
    >
      {closed ? 'Closed' : 'Open'}
    </span>
  )
}

export function Pill({ tone = 'neutral', children, className = '' }) {
  const tones = {
    neutral: 'border border-[#D2D5D9] bg-white text-[#4E525A]',
    good: 'bg-[#E2F4E6] text-[#147A3A]',
    warn: 'bg-[#FBF0DA] text-[#A66A08]',
    bad: 'bg-[#FDE8E5] text-[#B42318]',
    dark: 'bg-[#17191F] text-white',
  }
  return (
    <span
      className={`inline-flex h-[23px] items-center rounded-[7px] px-2 text-[10.5px] font-medium uppercase tracking-[0.5px] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/* ---------------------------------- misc ---------------------------------- */

export function Money({ value, decimals = 0, tone = 'default', className = '' }) {
  const color =
    tone === 'bad' ? 'text-[#B42318]' : tone === 'good' ? 'text-[#147A3A]' : tone === 'muted' ? 'text-[#4E525A]' : 'text-[#0D0F14]'
  return (
    <span className={`tabular-nums ${color} ${className}`}>
      {money(value, decimals)}
    </span>
  )
}

export function InlineError({ children }) {
  if (!children) return null
  return (
    <div className="rounded-[10px] border border-[#F3C9C3] bg-[#FDE8E5] px-3 py-2 text-[12px] leading-snug text-[#B42318]">
      {children}
    </div>
  )
}

export function InlineNotice({ children, tone = 'neutral' }) {
  if (!children) return null
  const tones = {
    neutral: 'border-[#E2E4E6] bg-[#F5F7F9] text-[#4E525A]',
    warn: 'border-[#F3E0BC] bg-[#FBF0DA] text-[#A66A08]',
    good: 'border-[#CBE7D3] bg-[#E2F4E6] text-[#147A3A]',
  }
  return (
    <div className={`rounded-[10px] border px-3 py-2 text-[12px] leading-snug ${tones[tone]}`}>
      {children}
    </div>
  )
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-[#4E525A]">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#D2D5D9] border-t-[#17191F]" />
      {label}…
    </div>
  )
}

export function Empty({ children }) {
  return <p className="px-4 py-6 text-[12px] text-[#9BA0A6]">{children}</p>
}

/* --------------------------------- tables --------------------------------- */

export function TableScroll({ children, className = '' }) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full min-w-[720px] border-collapse text-left">{children}</table>
    </div>
  )
}

export function Th({ children, className = '', align = 'left' }) {
  return (
    <th
      scope="col"
      className={`h-[33px] whitespace-nowrap border-b border-[#E2E4E6] px-3 text-[12px] font-normal text-[#4E525A] ${
        align === 'right' ? 'text-right' : ''
      } ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '', align = 'left' }) {
  return (
    <td
      className={`border-b border-[#E2E4E6] px-3 py-2 text-[12.5px] text-[#4E525A] ${
        align === 'right' ? 'text-right tabular-nums' : ''
      } ${className}`}
    >
      {children}
    </td>
  )
}
