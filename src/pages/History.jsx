import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  History as HistoryIcon, Download, Wallet, Timer, Clock, FileSpreadsheet, Upload,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { PageHeader, PageLoader, StatCard, EmptyState } from '../components/ui'
import DataTable from '../components/DataTable'
import SalaryDetail from '../components/SalaryDetail'
import { formatSom, formatSigned, formatMonth, formatDateTime } from '../lib/format'
import { CALC_TYPE_LABEL, REPORT_SOURCE_LABEL } from '../lib/constants'
import { loadMonthView, monthSummary } from '../lib/reportView'
import { exportMonthToExcel } from '../lib/excel'
import { useTheme } from '../lib/theme'
import * as db from '../lib/db'

export default function History() {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState([])
  const [selected, setSelected] = useState('')
  const [view, setView] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        // Barcha oylar natijalari bitta so'rov bilan (har oy uchun alohida so'rov emas)
        const [reports, calcs] = await Promise.all([db.listReports(), db.listCalculationTotals()])
        const byReport = new Map()
        for (const c of calcs) {
          if (!byReport.has(c.report_id)) byReport.set(c.report_id, [])
          byReport.get(c.report_id).push({ summary: c })
        }
        const withAgg = reports.map((r) => ({ report: r, month: r.month, agg: monthSummary(byReport.get(r.id) || []) }))
        withAgg.sort((a, b) => (a.month < b.month ? 1 : -1))
        setMonths(withAgg)
        if (withAgg[0]) {
          setSelected(withAgg[0].month)
          setView(await loadMonthView(withAgg[0].month))
        }
      } catch (e) { console.error('Tarixni yuklashda xatolik:', e) } finally { setLoading(false) }
    })()
  }, [])

  async function selectMonth(m) {
    setSelected(m)
    setView(await loadMonthView(m))
  }

  const trend = useMemo(
    () =>
      [...months].reverse().map((m) => ({
        month: formatMonth(m.month), // yil bilan — bir necha yillik tarixda oylar adashmasin
        Belgilangan: Math.round(m.agg.baseFund),
        Net: Math.round(m.agg.fund),
      })),
    [months],
  )

  if (loading) return <PageLoader />

  if (months.length === 0) {
    return (
      <div>
        <PageHeader title="Oylik tarixi" subtitle="Oldingi oylar hisob-kitobi" />
        <EmptyState icon={HistoryIcon} title="Tarix bo'sh" description="Hali birorta oy hisoblanmagan.">
          <Link to="/calculate" className="btn-primary mt-2"><Upload className="h-4 w-4" /> IVMS fayl yuklash</Link>
        </EmptyState>
      </div>
    )
  }

  const axisColor = theme === 'dark' ? '#94a3b8' : '#64748b'
  const gridColor = theme === 'dark' ? '#1e293b' : '#e2e8f0'
  const cur = months.find((m) => m.month === selected)

  const columns = [
    { key: 'name', header: 'Ishchi', sortValue: (r) => r.employee.name,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-800 dark:text-slate-100">{r.employee.name}</div>
          <div className="text-xs text-slate-400">{CALC_TYPE_LABEL[r.employee.calc_type]}</div>
        </div>
      ) },
    { key: 'base_salary', header: 'Belgilangan', align: 'right', sortValue: (r) => r.summary.base_salary,
      render: (r) => <span className="tabular">{formatSom(r.summary.base_salary)}</span> },
    { key: 'net_salary', header: 'Net oylik', align: 'right', sortValue: (r) => r.summary.net_salary,
      render: (r) => <span className="tabular font-semibold">{formatSom(r.summary.net_salary)}</span> },
    { key: 'difference', header: 'Farq', align: 'right', sortValue: (r) => r.summary.difference,
      render: (r) => <span className={`tabular font-semibold ${r.summary.difference < 0 ? 'text-red-600 dark:text-red-400' : r.summary.difference > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{formatSigned(r.summary.difference)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Oylik tarixi" subtitle={`${months.length} ta oy hisoblangan`} />

      {/* Trend */}
      {trend.length >= 2 && (
        <div className="card mb-6 p-5">
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Oyma-oy oylik fondi</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" tick={{ fill: axisColor, fontSize: 12 }} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000000)}M`} />
                <Tooltip
                  formatter={(v) => formatSom(v) + " so'm"}
                  contentStyle={{
                    background: theme === 'dark' ? '#0f172a' : '#fff',
                    border: `1px solid ${gridColor}`, borderRadius: 12, fontSize: 13,
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="Belgilangan" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Net" stroke="#1f72eb" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Oy tanlash */}
      <div className="mb-6 flex flex-wrap gap-2">
        {months.map((m) => (
          <button
            key={m.month}
            onClick={() => selectMonth(m.month)}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
              selected === m.month
                ? 'border-brand-500 bg-brand-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {formatMonth(m.month)}
          </button>
        ))}
      </div>

      {cur && view && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-slate-100 px-4 py-3 text-sm dark:bg-slate-800/50">
            <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
              <FileSpreadsheet className="h-4 w-4 text-brand-500" /> {formatMonth(cur.month)}
            </span>
            <span className="text-slate-500 dark:text-slate-400">Yuklangan: {formatDateTime(cur.report.uploaded_at)}</span>
            <span className="badge-slate">{REPORT_SOURCE_LABEL[cur.report.source]}</span>
            <button
              onClick={() => exportMonthToExcel({ month: cur.month, results: view.results })}
              className="btn-secondary btn-sm ml-auto"
            >
              <Download className="h-4 w-4" /> Excel export
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Wallet} label="Net fond" value={formatSom(cur.agg.fund)} hint="so'm" tone="green" />
            <StatCard icon={FileSpreadsheet} label="Belgilangan fond" value={formatSom(cur.agg.baseFund)} hint="so'm" tone="slate" />
            <StatCard icon={Timer} label="Kech qolishlar" value={cur.agg.lateCount} hint={`${cur.agg.lateMinutes} daqiqa`} tone="amber" />
            <StatCard icon={Clock} label="Overtime" value={`${Math.round(cur.agg.overtimeHours)} s`} hint="jami" tone="brand" />
          </div>

          <DataTable
            columns={columns}
            rows={view.results}
            rowKey={(r) => r.employee.id}
            searchPlaceholder="Ishchi qidirish…"
            initialSort={{ key: 'net_salary', dir: 'desc' }}
            onRowClick={(r) => setDetail({ employee: r.employee, summary: r.summary, days: view.daysByEmp.get(r.employee.id) || [] })}
          />
        </div>
      )}

      <SalaryDetail open={!!detail} onClose={() => setDetail(null)} employee={detail?.employee} summary={detail?.summary} days={detail?.days || []} month={selected} />
    </div>
  )
}
