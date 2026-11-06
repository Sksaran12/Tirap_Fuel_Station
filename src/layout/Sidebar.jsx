import { Link, NavLink } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  ClipboardPenLine,
  CreditCard,
  Droplets,
  LayoutDashboard,
  ReceiptText,
  Settings,
  X,
} from 'lucide-react'
import { BpclMark } from '../components/BpclLogo'

export const NAV_ITEMS = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Daily Entry', to: '/daily-entry', icon: ClipboardPenLine },
  { label: 'Stock', to: '/stock', icon: Droplets },
  { label: 'Credit', to: '/credit', icon: CreditCard },
  { label: 'Expenses', to: '/expenses', icon: ReceiptText },
  { label: 'Cash Book', to: '/cash-book', icon: BookOpen },
  { label: 'Reports', to: '/reports', icon: BarChart3 },
  { label: 'Settings', to: '/settings', icon: Settings },
]

const itemBase =
  'group flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F] md:mx-auto md:w-10 md:justify-center md:px-0 lg:mx-0 lg:w-auto lg:justify-start lg:px-3'

const activeItem =
  'bg-[#FFFFFF] text-[#0D0F14] shadow-[0_2px_5px_rgba(13,15,20,.08)]'

const idleItem = 'text-[#4E525A] hover:bg-[#FFFFFF] hover:text-[#0D0F14]'

/**
 * Sidebar width is dictated by design.md section 2:
 *   mobile  (<768px)  -> 280px off-canvas drawer, hidden until opened
 *   tablet  (768px+)  -> 72px icon rail
 *   desktop (1024px+) -> 280px full sidebar
 *
 * Tailwind's default md (768px) and lg (1024px) breakpoints match those
 * media-query boundaries, so they are used directly below.
 */
export function Sidebar({ open, onClose }) {
  const visibility = open
    ? 'visible translate-x-0'
    : 'invisible -translate-x-full md:visible md:translate-x-0'

  return (
    <aside
      id="app-sidebar"
      aria-label="Primary navigation"
      className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-[280px] shrink-0 flex-col border-r border-[#E2E4E6] bg-[#F5F7F9] transition-[transform,visibility] duration-150 ease-out md:sticky md:top-0 md:z-20 md:w-[72px] md:self-start md:transition-none lg:w-[280px] print:hidden ${visibility}`}
    >
      <div className="flex h-[67px] shrink-0 items-center border-b border-[#E2E4E6] pl-[19px] pr-[18px] md:justify-center md:px-0 lg:justify-start lg:pl-[19px] lg:pr-[18px]">
        <Link
          to="/dashboard"
          onClick={onClose}
          className="flex min-w-0 items-center gap-3 rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F] md:justify-center lg:justify-start"
          aria-label="Tirap Fuel Station Manager home"
        >
          <BpclMark className="h-8 w-8 shrink-0" />
          <span className="min-w-0 md:hidden lg:block">
            <span className="block truncate text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#0D0F14]">
              Tirap
            </span>
            <span className="block truncate text-[10px] font-medium uppercase leading-tight tracking-[0.12em] text-[#4E525A]">
              BPCL Dealer
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[#4E525A] hover:bg-[#FFFFFF] hover:text-[#0D0F14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F] md:hidden"
          aria-label="Close navigation"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-3 py-4 md:px-2 lg:px-3"
        aria-label="Main navigation"
      >
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-[#4E525A] md:hidden lg:block">
          Workspace
        </p>

        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ label, to, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onClose}
                title={label}
                className={({ isActive }) =>
                  `${itemBase} ${isActive ? activeItem : idleItem}`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className="h-[18px] w-[18px] shrink-0"
                      strokeWidth={isActive ? 2 : 1.75}
                      aria-hidden="true"
                    />
                    <span className="truncate md:hidden lg:inline">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
