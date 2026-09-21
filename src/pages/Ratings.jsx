import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Trophy, Clock, Timer, Wallet, TrendingUp, TrendingDown, CheckCircle2, Upload,
} from 'lucide-react'
import { PageHeader, PageLoader, EmptyState } from '../components/ui'
import { formatSom, formatMonth, minutesToHours } from '../lib/format'
import { loadMonthView } from '../lib/reportView'
import * as db from '../lib/db'

export default function Ratings() {
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState([])
  const [month, setMonth] = useState('')
  const [view, setView] = useState(null)

  useEffect(() => {
    ;(async () => {
      const reps = await db.listReports()
      setReports(reps)
      if (reps[0]) {
        setMonth(reps[0].month)
        setView(await loadMonthView(reps[0].month))
      }
      setLoading(false)
    })()
  }, [])

  async function selectMonth(m) {
    setMonth(m)
    setView(await loadMonthView(m))
  }

  const ranks = useMemo(() => {
    if (!view) return null
    const items = view.results.map((r) => ({
      id: r.employee.id,
      name: r.employee.name,
      hours: r.summary.total_hours || 0,
      lateMin: r.summary.total_late_minutes || 0,
      lateCount: r.summary.late_count || 0,
      net: r.summary.net_salary || 0,
    }))
    const byHoursDesc = [...items].sort((a, b) => b.hours - a.hours)
    const byLateDesc = [...items].sort((a, b) => b.lateMin - a.lateMin)
    const byNetDesc = [...items].sort((a, b) => b.net - a.net)
    return {
      topHours: byHoursDesc.slice(0, 10),
      bottomHours: [...byHoursDesc].reverse().slice(0, 10),
      mostLate: byLateDesc.filter((x) => x.lateMin > 0).slice(0, 10),
      ideal: [...items].sort((a, b) => a.lateMin - b.lateMin).slice(0, 10),
      topNet: byNetDesc.slice(0, 10),
      bottomNet: [...byNetDesc].reverse().slice(0, 10),
    }
  }, [view])

  if (loading) return <PageLoader />

  if (reports.length === 0 || !ranks) {
    return (
      <div>
        <PageHeader title="Reyting" subtitle="Ishchilar reytingi" />
        <EmptyState icon={Trophy} title="Reyting bo'sh" description="Reyting uchun avval oylik hisoblang.">
          <Link to="/calculate" className="btn-primary mt-2"><Upload className="h-4 w-4" /> IVMS fayl yuklash</Link>
        </EmptyState>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Reyting" subtitle={formatMonth(month)}>
        <select className="input w-auto" value={month} onChange={(e) => selectMonth(e.target.value)}>
          {reports.map((r) => <option key={r.id} value={r.month}>{formatMonth(r.month)}</option>)}
        </select>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RankCard title="Eng ko'p ishlagan" icon={TrendingUp} tone="green" items={ranks.topHours} format={(x) => `${minutesToHours(x.hours * 60)} s`} />
        <RankCard title="Eng kam ishlagan" icon={TrendingDown} tone="slate" items={ranks.bottomHours} format={(x) => `${minutesToHours(x.hours * 60)} s`} />
        <RankCard title="Eng ko'p kech qolgan" icon={Timer} tone="red" items={ranks.mostLate} format={(x) => `${x.lateMin} daq (${x.lateCount} kun)`} emptyText="Kech qolgan yo'q 🎉" />
        <RankCard title="Ideal ishchilar (kam kech)" icon={CheckCircle2} tone="brand" items={ranks.ideal} format={(x) => (x.lateMin === 0 ? 'Kech qolmagan' : `${x.lateMin} daq`)} />
        <RankCard title="Eng ko'p oylik" icon={Wallet} tone="green" items={ranks.topNet} format={(x) => formatSom(x.net)} />
        <RankCard title="Eng kam oylik" icon={Clock} tone="amber" items={ranks.bottomNet} format={(x) => formatSom(x.net)} />
      </div>
    </div>
  )
}

const medal = ['🥇', '🥈', '🥉']

function RankCard({ title, icon: Icon, tone, items, format, emptyText }) {
  const tones = {
    green: 'text-emerald-500', red: 'text-red-500', brand: 'text-brand-500',
    amber: 'text-amber-500', slate: 'text-slate-400',
  }
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${tones[tone]}`} />
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">{emptyText || "Ma'lumot yo'q"}</p>
      ) : (
        <ol className="space-y-1">
          {items.map((x, i) => (
            <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`w-6 text-center text-sm ${i < 3 ? '' : 'font-semibold text-slate-400'}`}>
                  {i < 3 ? medal[i] : i + 1}
                </span>
                <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{x.name}</span>
              </div>
              <span className="tabular shrink-0 text-sm font-semibold text-slate-500 dark:text-slate-400">{format(x)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
