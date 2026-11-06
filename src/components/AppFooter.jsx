import { Link } from 'react-router-dom'
import { Database, FileText, Settings2 } from 'lucide-react'

const linkClass =
  'inline-flex items-center gap-1.5 rounded-[6px] transition-colors hover:text-[#0D0F14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F]'

/**
 * Compact footer for the signed-in shell. Hidden in print, where the report
 * masthead and its own audit line take over.
 */
export default function AppFooter() {
  const year = new Date().getFullYear()

  return (
    <>
      <footer className="mt-auto border-t border-[#E2E4E6] bg-[#FFFFFF] px-4 py-4 sm:px-5 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium leading-tight text-[#0D0F14]">
              Tirap Fuel Station
              <span className="px-1.5 text-[#9BA0A6]">·</span>
              <span className="font-normal text-[#4E525A]">BPCL Dealer</span>
            </p>
            <p className="mt-1 truncate text-[10.5px] leading-tight text-[#9BA0A6]">
              Daily close records · Arunachal Pradesh, India
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10.5px] text-[#4E525A]">
            <span className="inline-flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-[#9BA0A6]" strokeWidth={1.75} aria-hidden="true" />
              Ledger v1.0
            </span>
            <Link to="/reports" className={linkClass}>
              <FileText className="h-3.5 w-3.5 text-[#9BA0A6]" strokeWidth={1.75} aria-hidden="true" />
              Monthly report
            </Link>
            <Link to="/settings" className={linkClass}>
              <Settings2 className="h-3.5 w-3.5 text-[#9BA0A6]" strokeWidth={1.75} aria-hidden="true" />
              Settings
            </Link>
            <span className="text-[#9BA0A6]">© {year}</span>
          </div>
        </div>
      </footer>

      <footer className="mt-auto hidden border-t border-[#E2E4E6] px-[19px] py-3 text-[10.5px] leading-relaxed text-[#9BA0A6] print:block">
        Tirap Fuel Station · BPCL Dealer · Bharat Petroleum — generated from the daily close records.
      </footer>
    </>
  )
}
