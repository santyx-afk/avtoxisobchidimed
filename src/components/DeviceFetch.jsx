// «Turniketdan olish» — Windows ilovada terminaldan (ISAPI) oy ma'lumotlarini oladi.
import { useEffect, useMemo, useState } from 'react'
import { Radio, Loader2, Settings as SettingsIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from './ui'
import { formatMonth } from '../lib/format'
import { desktopIsapi } from '../lib/desktop'

/** Oxirgi `count` oy ('YYYY-MM'), eng yangisi birinchi */
export function recentMonths(now = new Date(), count = 6) {
  const list = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return list
}

export default function DeviceFetch({ existingMonths = [], busy, onFetched, onError }) {
  const months = useMemo(() => recentMonths(), [])
  const [month, setMonth] = useState(months[0])
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [configured, setConfigured] = useState(true)

  useEffect(() => {
    desktopIsapi.getConfig().then((c) => setConfigured(Boolean(c?.host && c?.hasPassword))).catch(() => {})
  }, [])

  async function run() {
    setConfirm(false)
    setWorking(true)
    setProgress(null)
    const off = desktopIsapi.onProgress(setProgress)
    try {
      const res = await desktopIsapi.fetchMonth(month)
      if (!res.ok) throw new Error(res.error || 'Terminaldan olib bo\'lmadi')
      await onFetched({ html: res.html, fileName: res.fileName, total: res.total, stateful: res.stateful })
    } catch (e) {
      onError(e.message || String(e))
    } finally {
      off()
      setWorking(false)
      setProgress(null)
    }
  }

  const exists = existingMonths.includes(month)

  return (
    <div className="card mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
        {working ? <Loader2 className="h-6 w-6 animate-spin" /> : <Radio className="h-6 w-6" />}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-slate-800 dark:text-slate-100">Turniketdan olish</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {working
            ? progress?.total ? `Yuklanmoqda: ${progress.done} / ${progress.total} ta yozuv…` : 'Terminalga ulanilmoqda…'
            : configured
              ? 'Ma\'lumot terminaldan to\'g\'ridan-to\'g\'ri olinadi (internet kerak emas) va hisoblanadi.'
              : <>Avval <Link to="/settings" className="font-medium text-brand-600 underline"><SettingsIcon className="mr-0.5 inline h-3.5 w-3.5" />Sozlamalar</Link>da terminal IP va parolini kiriting.</>}
        </p>
      </div>
      <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} disabled={working || busy}>
        {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
      </select>
      <button className="btn-primary" disabled={working || busy || !configured} onClick={() => (exists ? setConfirm(true) : run())}>
        <Radio className="h-4 w-4" /> Olish
      </button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={run}
        title="Oyni qayta olish"
        message={`${formatMonth(month)} oyi allaqachon hisoblangan. Terminaldan qayta olsangiz, hisobot yangilanadi va shu oydagi qo'lda tuzatishlar yo'qoladi. Davom etasizmi?`}
        confirmText="Ha, qayta olish"
        danger={false}
      />
    </div>
  )
}
