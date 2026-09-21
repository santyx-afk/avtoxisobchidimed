import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

// Sahifa qulaganda emas — asinxron (masalan Supabase) xatolarni pastda banner qilib ko'rsatadi.
export default function GlobalErrors() {
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const onRejection = (e) => {
      const reason = e?.reason
      const m = reason?.message || (typeof reason === 'string' ? reason : '')
      if (m && !/ResizeObserver|Google|fonts|cert/i.test(m)) setMsg(m)
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  if (!msg) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="flex max-w-lg items-start gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 shadow-lg dark:border-red-500/30 dark:bg-slate-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ma'lumotlar bilan xatolik</p>
          <p className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">{msg}</p>
          <p className="mt-1 text-xs text-slate-400">Internet yoki Supabase ulanishini tekshiring.</p>
        </div>
        <button onClick={() => setMsg('')} className="btn-ghost -mr-1 -mt-1 p-1" aria-label="Yopish">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
