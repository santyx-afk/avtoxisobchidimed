import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Wallet, Timer, Clock, AlertTriangle, Server, Upload,
  TrendingUp, TrendingDown, Trophy, CheckCircle2, CircleDashed,
} from 'lucide-react'
import { PageHeader, StatCard, PageLoader, EmptyState } from '../components/ui'
import { formatSom, formatSigned, formatMonth, formatDateTime, minutesToHours } from '../lib/format'
import { REPORT_SOURCE_LABEL } from '../lib/constants'
import { syncAgentReports } from '../lib/agentStorage'
import * as db from '../lib/db'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])
  const [reports, setReports] = useState([])
  const [settings, setSettings] = useState(null)
  const [month, setMonth] = useState('')
  const [calcs, setCalcs] = useState([])

  useEffect(() => {
    ;(async () => {
      // Agent yuklagan yangi fayllarni tekshirish (faqat Supabase rejimida)
      try { await syncAgentReports() } catch (e) { /* e'tiborsiz */ }
      try {
        const [emps, reps, st] = await Promise.all([db.listEmployees(), db.listReports(), db.getSettings()])
        setEmployees(emps)
        setReports(reps)
        setSettings(st)
        setMonth(reps[0]?.month || '')
      } catch (e) {
        console.error('Dashboard yuklashda xatolik:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!month) {
      setCalcs([])
      return
    }
    db.getCalculationsByMonth(month).then(setCalcs)
  }, [month])

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])
  const activeCount = employees.filter((e) => e.is_active).length
  const latestReport = reports[0] || null

  const agg = useMemo(() => {
    if (calcs.length === 0) return null
    const fund = calcs.reduce((s, c) => s + (c.net_salary || 0), 0)
    const lateCount = calcs.reduce((s, c) => s + (c.late_count || 0), 0)
    const lateMinutes = calcs.reduce((s, c) => s + (c.total_late_minutes || 0), 0)
    const totalHours = calcs.reduce((s, c) => s + (c.total_hours || 0), 0)
    const withName = calcs.map((c) => ({ ...c, name: empMap.get(c.employee_id)?.name || '—' }))
    const byHours = [...withName].sort((a, b) => (b.total_hours || 0) - (a.total_hours || 0))
    const byLate = [...withName].sort((a, b) => (b.total_late_minutes || 0) - (a.total_late_minutes || 0))
    const warnings = withName
      .filter((c) => Math.abs(c.difference || 0) > 0)
      .sort((a, b) => Math.abs(b.difference || 0) - Math.abs(a.difference || 0))
    return {
      fund, lateCount, lateMinutes, totalHours, warnings,
      topHours: byHours[0], lowHours: byHours[byHours.length - 1],
      topLate: byLate[0], idealWorker: byLate[byLate.length - 1],
    }
  }, [calcs, empMap])

  if (loading) return <PageLoader />

  const agentStatus = settings?.agent || {}

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={month ? formatMonth(month) : 'Joriy holat'}>
        {reports.length > 0 && (
          <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
            {reports.map((r) => (
              <option key={r.id} value={r.month}>{formatMonth(r.month)}</option>
            ))}
          </select>
        )}
      </PageHeader>

      {/* Statistika kartalari */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Jami ishchilar" value={activeCount} hint={`${employees.length} ta ro'yxatda`} tone="brand" />
        <StatCard
          icon={Wallet}
          label="Oylik fond (hisoblangan)"
          value={agg ? formatSom(agg.fund) : '—'}
          hint={agg ? "so'm" : "Hisoblanmagan"}
          tone="green"
        />
        <StatCard
          icon={Timer}
          label="Kech qolishlar"
          value={agg ? agg.lateCount : '—'}
          hint={agg ? `${agg.lateMinutes} daqiqa jami` : 'Ma\'lumot yo\'q'}
          tone="amber"
        />
        <StatCard
          icon={Clock}
          label="Jami ishlangan soat"
          value={agg ? Math.round(agg.totalHours) : '—'}
          hint="soat / oy"
          tone="slate"
        />
      </div>

      {calcs.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Upload}
            title="Bu oy uchun hisob-kitob yo'q"
            description="IVMS faylni yuklab, oylik hisoblashni boshlang."
          >
            <Link to="/calculate" className="btn-primary mt-2">
              <Upload className="h-4 w-4" /> IVMS fayl yuklash
            </Link>
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Ogohlantirishlar */}
          <div className="card p-5 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Ogohlantirishlar — oylik farqi</h3>
            </div>
            {agg.warnings.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Barcha oyliklar belgilangan bilan mos.</p>
            ) : (
              <ul className="space-y-2">
                {agg.warnings.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{firstNote(c.notes)}</p>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold tabular ${(c.difference || 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatSigned(c.difference)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Agent status */}
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Server className="h-5 w-5 text-brand-500" />
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">IVMS Agent</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Oxirgi yuklash</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {latestReport ? formatDateTime(latestReport.uploaded_at) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Manba</span>
                <span className="badge-slate">{REPORT_SOURCE_LABEL[latestReport?.source] || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Holat</span>
                {agentStatus.enabled ? (
                  <span className="badge-green"><CheckCircle2 className="h-3.5 w-3.5" /> Faol</span>
                ) : (
                  <span className="badge-slate"><CircleDashed className="h-3.5 w-3.5" /> O'chirilgan</span>
                )}
              </div>
            </div>
            <Link to="/calculate" className="btn-secondary mt-4 w-full">
              <Upload className="h-4 w-4" /> Fayl yuklash
            </Link>
          </div>

          {/* Reyting mini */}
          <div className="card p-5 lg:col-span-3">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Reyting (qisqacha)</h3>
              <Link to="/ratings" className="ml-auto text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
                Batafsil →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniRank icon={TrendingUp} tone="green" label="Eng ko'p ishlagan" name={agg.topHours?.name} value={`${minutesToHours((agg.topHours?.total_hours || 0) * 60)} s`} />
              <MiniRank icon={TrendingDown} tone="slate" label="Eng kam ishlagan" name={agg.lowHours?.name} value={`${minutesToHours((agg.lowHours?.total_hours || 0) * 60)} s`} />
              <MiniRank icon={Timer} tone="red" label="Eng ko'p kech qolgan" name={agg.topLate?.name} value={`${agg.topLate?.total_late_minutes || 0} daq`} />
              <MiniRank icon={CheckCircle2} tone="brand" label="Ideal ishchi" name={agg.idealWorker?.name} value={`${agg.idealWorker?.total_late_minutes || 0} daq`} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniRank({ icon: Icon, tone, label, name, value }) {
  const tones = {
    green: 'text-emerald-500',
    red: 'text-red-500',
    brand: 'text-brand-500',
    slate: 'text-slate-400',
  }
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icon className={`h-4 w-4 ${tones[tone]}`} /> {label}
      </p>
      <p className="mt-1.5 truncate font-semibold text-slate-800 dark:text-slate-100">{name || '—'}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{value}</p>
    </div>
  )
}

function firstNote(notes) {
  if (!notes) return 'Farq mavjud'
  return String(notes).split('\n')[0]
}
