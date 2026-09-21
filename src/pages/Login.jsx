import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Stethoscope, Eye, EyeOff, Sun, Moon, LogIn } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { APP_NAME, APP_SUBTITLE } from '../lib/config'
import { IS_DEMO } from '../lib/db'
import { Spinner } from '../components/ui'

export default function Login() {
  const { user, login } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const res = login(nickname, password)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    const to = location.state?.from?.pathname || '/'
    navigate(to, { replace: true })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 dark:bg-slate-950">
      {/* Fon dekoratsiyasi */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-brand-400/10 blur-3xl" />
      </div>

      <button onClick={toggleTheme} className="btn-ghost absolute right-4 top-4 p-2" aria-label="Mavzu">
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="card relative w-full max-w-md p-8 shadow-lg animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md">
            <Stethoscope className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{APP_SUBTITLE}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Nickname</label>
            <input
              className="input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Parol</label>
            <div className="relative">
              <input
                className="input pr-11"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                tabIndex={-1}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            Kirish
          </button>
        </form>

        {IS_DEMO && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
            <p className="font-semibold text-slate-600 dark:text-slate-300">DEMO kirish ma'lumotlari:</p>
            <p className="mt-1">
              <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">admin</code> /{' '}
              <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">admin</code>
            </p>
            <p className="mt-1 text-[11px] leading-snug">
              Ishga tushirishda <code>.env</code> ichida VITE_USERS orqali haqiqiy foydalanuvchilar belgilanadi.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
