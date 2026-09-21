import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Calculator, HandCoins, History, Trophy, Settings,
  Menu, X, Sun, Moon, LogOut, Stethoscope, FlaskConical,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { APP_NAME, APP_SUBTITLE } from '../lib/config'
import { IS_DEMO } from '../lib/db'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/employees', label: 'Ishchilar', icon: Users },
  { to: '/calculate', label: 'Oylik hisoblash', icon: Calculator },
  { to: '/advances', label: 'Avanslar', icon: HandCoins },
  { to: '/history', label: 'Oylik tarixi', icon: History },
  { to: '/ratings', label: 'Reyting', icon: Trophy },
  { to: '/settings', label: 'Sozlamalar', icon: Settings },
]

function SidebarContent({ onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
          <Stethoscope className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold leading-tight text-slate-900 dark:text-white">{APP_NAME}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{APP_SUBTITLE}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => clsx('nav-link', isActive && 'nav-link-active')}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {IS_DEMO && (
        <div className="mx-3 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          <p className="flex items-center gap-1.5 font-semibold">
            <FlaskConical className="h-3.5 w-3.5" /> DEMO rejim
          </p>
          <p className="mt-0.5 leading-snug">Supabase sozlanmagan. Ma'lumotlar shu brauzerda saqlanadi.</p>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 animate-fade-in border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <button onClick={() => setOpen(false)} className="btn-ghost absolute right-2 top-4 p-1.5">
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="btn-ghost -ml-2 p-2 lg:hidden" aria-label="Menyu">
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{current?.label || 'Dashboard'}</h2>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button onClick={toggleTheme} className="btn-ghost p-2" aria-label="Mavzuni almashtirish">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="hidden items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 sm:flex dark:bg-slate-800">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {user?.nickname?.[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{user?.nickname}</span>
            </div>
            <button onClick={logout} className="btn-ghost p-2" aria-label="Chiqish" title="Chiqish">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
