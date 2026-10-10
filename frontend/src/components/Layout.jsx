import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BadgeCheck, FilePlus2, LayoutDashboard, Map as MapIcon, Menu, Route as RouteIcon, ShieldCheck, X, Cpu, CircleAlert } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { useSource } from '../context'

const HealthCtx = createContext({ health: null, error: null, loading: true })
export const useHealth = () => useContext(HealthCtx)

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/report', label: 'Report a hazard', icon: FilePlus2 },
  { to: '/map', label: 'Live hazard map', icon: MapIcon },
  { to: '/routes', label: 'Route safety', icon: RouteIcon },
  { to: '/verify', label: 'Community verification', icon: BadgeCheck },
  { to: '/admin', label: 'Authority dashboard', icon: ShieldCheck },
]

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <rect width="32" height="32" rx="9" fill="#101e34" stroke="#223756" />
        <path d="M16 5.5 7 9.2v6.6c0 5.6 3.8 9 9 10.5 5.2-1.5 9-4.9 9-10.5V9.2L16 5.5Z" fill="none" stroke="#34d3c0" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12.5 20.5 16 12l3.5 8.5" fill="none" stroke="#34d3c0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 15v1.5" stroke="#34d3c0" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <p className="text-[1.05rem] font-semibold tracking-tight text-white">RoadGuardian</p>
        <p className="text-xs text-mist-400">Road risk intelligence</p>
      </div>
    </div>
  )
}

function NavList({ onNavigate }) {
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              isActive ? 'bg-teal-400/10 font-medium text-teal-300 ring-1 ring-inset ring-teal-400/25' : 'text-mist-300 hover:bg-ink-700/60 hover:text-white'
            }`
          }
        >
          <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function SidebarFooter() {
  const { health, error, loading } = useHealth()
  const { showDemo, toggle } = useSource()
  const aiOk = health?.ai?.available
  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-lg border border-ink-600/70 bg-ink-850/70 p-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="demo-toggle" className="font-medium text-mist-100">
            Fictional demo data
          </label>
          <button
            id="demo-toggle"
            role="switch"
            aria-checked={showDemo}
            onClick={toggle}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${showDemo ? 'bg-teal-500' : 'bg-ink-500'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${showDemo ? 'left-[18px]' : 'left-0.5'}`} />
            <span className="sr-only">{showDemo ? 'Shown' : 'Hidden'}</span>
          </button>
        </div>
        <p className="mt-1.5 leading-relaxed text-mist-400">Seeded sample reports are labelled and can be hidden to see real submissions only.</p>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-ink-600/70 bg-ink-850/70 p-3" role="status">
        {error ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-sev-high" aria-hidden /> : <Cpu className={`mt-0.5 h-4 w-4 shrink-0 ${aiOk ? 'text-teal-300' : 'text-sev-medium'}`} aria-hidden />}
        <p className="leading-relaxed text-mist-300">
          {loading ? 'Checking services' : error ? 'API offline' : aiOk ? `AI model ready: ${health.ai.model}` : 'AI detection unavailable. Manual reports only.'}
        </p>
      </div>
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const healthState = useAsync((signal) => api.health(signal), [])

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <HealthCtx.Provider value={{ health: healthState.data, error: healthState.error, loading: healthState.loading }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[3000] focus:rounded-md focus:bg-teal-400 focus:px-3 focus:py-2 focus:text-ink-950">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-ink-600/60 bg-ink-900/90 px-4 py-5 backdrop-blur lg:flex">
        <Brand />
        <div className="mt-8 flex-1 overflow-y-auto">
          <NavList />
        </div>
        <SidebarFooter />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-ink-600/60 bg-ink-900/90 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-mist-200 hover:bg-ink-700" aria-label="Open navigation menu" aria-expanded={open} aria-controls="mobile-nav">
          <Menu className="h-5 w-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div id="mobile-nav" className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-ink-900 px-4 py-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-mist-300 hover:bg-ink-700" aria-label="Close navigation menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
            <SidebarFooter />
          </div>
        </div>
      )}

      <main id="main" className="lg:pl-64">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </HealthCtx.Provider>
  )
}
