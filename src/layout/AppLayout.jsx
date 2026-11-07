import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu } from 'lucide-react'
import { NAV_ITEMS, Sidebar } from './Sidebar'
import { BpclLockup } from '../components/BpclLogo'
import AppFooter from '../components/AppFooter'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui'

/**
 * Global application shell.
 *
 * Breakpoint contract from design.md:
 *   < 768px   : off-canvas 280px drawer + overlay
 *   768-1023px: 72px icon rail
 *   >= 1024px : 280px fixed-width sidebar
 */
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const currentItem = NAV_ITEMS.find((item) =>
    item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
  const pageTitle = currentItem?.label ?? 'Dashboard'

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!drawerOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const desktopQuery = window.matchMedia('(min-width: 768px)')
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    const handleBreakpointChange = (event) => {
      if (event.matches) setDrawerOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    desktopQuery.addEventListener('change', handleBreakpointChange)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      desktopQuery.removeEventListener('change', handleBreakpointChange)
    }
  }, [drawerOpen])

  const closeDrawer = () => setDrawerOpen(false)

  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    await logout()
    // Brief exit frame so the tap has visible feedback before routing away.
    window.setTimeout(() => navigate('/login', { replace: true }), 450)
  }

  return (
    <div className={`flex min-h-dvh w-full bg-[#FFFFFF] ${signingOut ? 'animate-sink' : ''}`}>
      {signingOut ? (
        <div className="animate-overlay fixed inset-0 z-50 flex items-center justify-center bg-white/85 backdrop-blur-sm print:hidden" role="status" aria-label="Signing out">
          <div className="animate-pop flex items-center gap-3 rounded-2xl border border-[#E2E4E6] bg-white px-5 py-4 shadow-xl">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#D2D5D9] border-t-[#17191F]" aria-hidden="true" />
            <span className="text-[13px] font-medium text-[#0D0F14]">Signing out…</span>
          </div>
        </div>
      ) : null}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[10px] focus:bg-[#0D0F14] focus:px-3 focus:py-2 focus:text-[12px] focus:font-medium focus:text-[#FFFFFF] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[#17191F]"
      >
        Skip to content
      </a>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-[#0D0F14]/40 md:hidden print:hidden"
          role="presentation"
          onClick={closeDrawer}
        />
      ) : null}

      <Sidebar open={drawerOpen} onClose={closeDrawer} />

      <div className="flex min-w-0 flex-1 flex-col bg-[#FFFFFF]">
        <header className="sticky top-0 z-30 flex h-[67px] shrink-0 items-center justify-between gap-3 border-b border-[#E2E4E6] bg-[#FFFFFF] pl-[19px] pr-[18px] print:static print:z-auto">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#E2E4E6] bg-[#FFFFFF] text-[#0D0F14] hover:bg-[#F5F7F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17191F] md:hidden"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              aria-controls="app-sidebar"
            >
              <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
            </button>

            <h1 className="truncate text-[15px] font-semibold leading-none tracking-[-0.015em] text-[#0D0F14]">
              {pageTitle}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-3 print:hidden">
            <span className="hidden text-[12px] text-[#4E525A] sm:inline">{user?.username ?? 'owner'}</span>
            <Button variant="secondary" size="sm" onClick={signOut} aria-label="Sign out" disabled={signingOut}>
              <LogOut className={`h-4 w-4 ${signingOut ? 'animate-spin' : ''}`} strokeWidth={1.75} />
              <span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </Button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 bg-[#FFFFFF] animate-rise">
          <div className="hidden border-b border-[#E2E4E6] px-[19px] py-4 print:flex">
            <BpclLockup />
          </div>
          <Outlet />
        </main>

        <AppFooter />
      </div>
    </div>
  )
}
