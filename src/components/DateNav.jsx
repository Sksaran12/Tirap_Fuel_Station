import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, todayKey } from '../lib/format'
import { Button } from './ui'

/** Shared date stepper used by the day-scoped screens. */
export default function DateNav({ date, onChange, label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA0A6]" />
          <input
            type="date"
            value={date}
            onChange={(event) => event.target.value && onChange(event.target.value)}
            className="h-8 rounded-[10px] border border-[#E2E4E6] bg-white pl-8 pr-2 text-[12.5px] font-medium text-[#0D0F14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F]"
            aria-label="Business date"
          />
        </div>
        <Button variant="secondary" size="sm" aria-label="Next day" onClick={() => onChange(addDays(date, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {date !== todayKey() ? (
          <Button variant="ghost" size="sm" onClick={() => onChange(todayKey())}>
            Today
          </Button>
        ) : null}
      </div>
      {label ? <span className="text-[12px] text-[#4E525A]">{label}</span> : null}
      {children ? <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}
