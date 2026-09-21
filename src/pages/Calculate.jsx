import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, Wallet, Timer, AlertTriangle, Eye, Server,
  UserX, FileWarning, CheckCircle2, Loader2, Calculator, UserPlus, RefreshCw, Lock, LockOpen,
} from 'lucide-react'
import { PageHeader, StatCard, EmptyState, PageLoader } from '../components/ui'
import DataTable from '../components/DataTable'
import SalaryDetail from '../components/SalaryDetail'
import { formatSom, formatSigned, formatMonth, formatDateTime, minutesToHours } from '../lib/format'
import { CALC_TYPE_LABEL, REPORT_SOURCE_LABEL } from '../lib/constants'
import { processIvmsFile, computeReport, saveReport, recalculateMonth } from '../lib/runCalculation'
import { groupRecordsByName } from '../lib/ivmsParser'
import { loadMonthView } from '../lib/reportView'
import { isMonthLocked, setMonthLocked } from '../lib/monthLock'
import * as db from '../lib/db'

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

/** IVMS "Расписание" ustunidan ish vaqtini ajratadi: "08:00-17:00" -> {start,end} */
function parseSchedule(schedule) {
  const def = { start: '08:00', end: '17:00' }
  if (!schedule) return def
  const m = String(schedule).match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/)
  if (!m) return def
  const pad = (h) => String(h).padStart(2, '0')
  return { start: `${pad(m[1])}:${m[2]}`, end: `${pad(m[3])}:${m[4]}` }
}

export default function Calculate() {
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState([])
  const [view, setView] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [detail, setDetail] = useState(null)
  const [settings, setSettings] = useState(null)
  const [addingAll, setAddingAll] = useState(false)
  const [addedMsg, setAddedMsg] = useState('')
  const [recalcing, setRecalcing] = useState(false)
  const [locked, setLocked] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!view?.month) { setLocked(false); return }
    isMonthLocked(view.month).then(setLocked)
  }, [view?.month])

  async function toggleLock() {
    if (!view?.month) return
    await setMonthLocked(view.month, !locked)
    setLocked(!locked)
    setAddedMsg(!locked ? `${view.month} oyi qulflandi.` : `${view.month} oyi ochildi.`)
  }

  // Ishchilar oyligi/sozlamasi o'zgargach — oyni qayta hisoblash
  async function handleRecalc() {
    if (!view?.month || recalcing) return
    if (locked) { setError(`${view.month} oyi qulflangan. Qayta hisoblash uchun avval oyni oching.`); return }
    setRecalcing(true)
    setError('')
    setAddedMsg('')
    try {
      await recalculateMonth(view.month)
      setView(await loadMonthView(view.month))
      setAddedMsg('Oylik qayta hisoblandi.')
    } catch (err) {
      setError(err.message || 'Qayta hisoblashda xatolik')
    } finally {
      setRecalcing(false)
    }
  }

  async function refresh(month) {
    const [reps, st] = await Promise.all([db.listReports(), db.getSettings()])
    setReports(reps)
    setSettings(st)
    setView(await loadMonthView(month))
  }

  useEffect(() => {
    ;(async () => {
      try { await refresh() } catch (e) { console.error('Hisob-kitobni yuklashda xatolik:', e) } finally { setLoading(false) }
    })()
  }, [])

  function buildView(result, parsedRecords) {
    const daysByEmp = new Map()
    for (const d of result.allDays) {
      if (!daysByEmp.has(d.employee_id)) daysByEmp.set(d.employee_id, [])
      daysByEmp.get(d.employee_id).push(d)
    }
    return {
      month: result.month,
      report: result.report,
      results: result.results,
      daysByEmp,
      unmatchedNames: result.unmatchedNames,
      missingEmployees: result.missingEmployees,
      parsedRecords, // avtomatik qo'shish uchun xom yozuvlar (yuklashdan keyin)
    }
  }

  async function handleFile(file) {
    if (!file) return
    setError('')
    setAddedMsg('')
    setBusy(true)
    try {
      const html = await readFileText(file)
      const result = await processIvmsFile({ html, fileName: file.name, source: 'manual' })
      const reps = await db.listReports()
      setReports(reps)
      setView(buildView(result, result.parsed.records))
    } catch (err) {
      setError(err.message || "Faylni qayta ishlashda xatolik")
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Faylda bor, tizimda yo'q ishchilarni avtomatik bazaga qo'shish + qayta hisoblash
  async function autoAddEmployees() {
    if (!view?.parsedRecords || addingAll) return
    setAddingAll(true)
    setError('')
    try {
      const grouped = groupRecordsByName(view.parsedRecords)
      // Barcha ishchini bitta batch bilan qo'shamiz (tez)
      const payloads = view.unmatchedNames.map((name) => {
        const recs = grouped.get(name) || []
        const first = recs.find((r) => r.department) || recs[0] || {}
        const sched = parseSchedule(first.schedule)
        return {
          name,
          calc_type: 'fix',
          monthly_salary: null, // keyin Ishchilar sahifasida to'ldiriladi
          hourly_rate: null,
          work_start: sched.start,
          work_end: sched.end,
          lunch_minutes: 60,
          department: first.department || 'Dimed',
          position: first.position || null,
          is_active: true,
        }
      })
      await db.createEmployeesBulk(payloads)

      // Endi ismlar mos keladi — qayta hisoblaymiz
      const [employees, st] = await Promise.all([db.listEmployees(), db.getSettings()])
      const advancesByEmployee = new Map()
      await Promise.all(
        employees.filter((e) => e.is_active).map(async (e) => {
          const adv = await db.getAdvancesByEmployeeMonth(e.id, view.month)
          if (adv.length) advancesByEmployee.set(e.id, adv)
        }),
      )
      const computed = computeReport({
        records: view.parsedRecords, month: view.month, employees, settings: st, advancesByEmployee,
      })
      const report = await saveReport({
        month: view.month,
        fileName: view.report?.file_name,
        source: view.report?.source || 'manual',
        allDays: computed.allDays,
        allSummaries: computed.allSummaries,
      })
      setView(buildView({ ...computed, report, month: view.month }, view.parsedRecords))
      setAddedMsg(`${view.unmatchedNames.length} ta ishchi qo'shildi. Endi "Ishchilar" sahifasida ularning oylik summasi va turini kiriting, so'ng shu yerda "Qayta hisoblash" tugmasini bosing.`)
    } catch (err) {
      setError(err.message || "Ishchilarni qo'shishda xatolik")
    } finally {
      setAddingAll(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const agg = useMemo(() => {
    if (!view) return null
    const r = view.results
    return {
      count: r.length,
      fund: r.reduce((s, x) => s + (x.summary.net_salary || 0), 0),
      lateCount: r.reduce((s, x) => s + (x.summary.late_count || 0), 0),
      diffs: r.filter((x) => Math.abs(x.summary.difference || 0) > 0).length,
    }
  }, [view])

  if (loading) return <PageLoader />

  const columns = [
    {
      key: 'name', header: 'Ishchi',
      sortValue: (r) => r.employee.name,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-800 dark:text-slate-100">{r.employee.name}</div>
          <div className="text-xs text-slate-400">{CALC_TYPE_LABEL[r.employee.calc_type]}</div>
        </div>
      ),
    },
    { key: 'work_days', header: 'Kun', align: 'center', sortValue: (r) => r.summary.work_days,
      render: (r) => <span className="tabular text-slate-500">{r.summary.work_days}/{r.summary.expected_work_days}</span> },
    { key: 'base_salary', header: 'Belgilangan', align: 'right', sortValue: (r) => r.summary.base_salary,
      render: (r) => <span className="tabular">{formatSom(r.summary.base_salary)}</span> },
    { key: 'net_salary', header: 'Hisoblangan', align: 'right', sortValue: (r) => r.summary.net_salary,
      render: (r) => <span className="tabular font-semibold text-slate-800 dark:text-slate-100">{formatSom(r.summary.net_salary)}</span> },
    { key: 'difference', header: 'Farq', align: 'right', sortValue: (r) => r.summary.difference,
      render: (r) => (
        <span className={`tabular font-semibold ${r.summary.difference < 0 ? 'text-red-600 dark:text-red-400' : r.summary.difference > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
          {formatSigned(r.summary.difference)}
        </span>
      ) },
    { key: 'late', header: 'Kech', align: 'center', sortValue: (r) => r.summary.total_late_minutes,
      render: (r) => r.summary.late_count > 0 ? <span className="badge-amber">{r.summary.late_count} kun</span> : <span className="text-slate-300">—</span> },
    { key: 'actions', header: '', sortable: false, align: 'right',
      render: (r) => <button className="btn-ghost p-1.5" title="Tafsilot"><Eye className="h-4 w-4" /></button> },
  ]

  return (
    <div>
      <PageHeader title="Oylik hisoblash" subtitle="IVMS faylni yuklab, oylikni hisoblang">
        {reports.length > 0 && (
          <select
            className="input w-auto"
            value={view?.month || ''}
            onChange={async (e) => setView(await loadMonthView(e.target.value))}
          >
            {reports.map((r) => (
              <option key={r.id} value={r.month}>{formatMonth(r.month)}</option>
            ))}
          </select>
        )}
      </PageHeader>

      {/* Yuklash zonasi */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`card mb-6 flex flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-300 dark:border-slate-700'
        }`}
      >
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.html,.htm,.mht" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15">
          {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-7 w-7" />}
        </div>
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">
            {busy ? 'Qayta ishlanmoqda…' : 'IVMS faylni bu yerga tashlang'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Hikvision IVMS-4200 "Punch Report" (.xls / .html)
          </p>
        </div>
        <button onClick={() => fileRef.current?.click()} className="btn-primary" disabled={busy}>
          <FileSpreadsheet className="h-4 w-4" /> Fayl tanlash
        </button>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {addedMsg && (
        <div className="mb-6 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {addedMsg}
        </div>
      )}

      {!view ? (
        <EmptyState icon={Calculator} title="Hali hisob-kitob yo'q" description="Boshlash uchun IVMS faylni yuklang." />
      ) : (
        <div className="space-y-6">
          {/* Report info */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-slate-100 px-4 py-3 text-sm dark:bg-slate-800/50">
            <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
              <FileSpreadsheet className="h-4 w-4 text-brand-500" /> {formatMonth(view.month)}
            </span>
            <span className="text-slate-500 dark:text-slate-400">Fayl: {view.report?.file_name || '—'}</span>
            <span className="text-slate-500 dark:text-slate-400">Yuklangan: {formatDateTime(view.report?.uploaded_at)}</span>
            <span className="badge-slate">{REPORT_SOURCE_LABEL[view.report?.source] || '—'}</span>
            {locked && <span className="badge-amber"><Lock className="h-3 w-3" /> Qulflangan</span>}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={toggleLock} className="btn-secondary btn-sm" title={locked ? 'Oyni ochish' : 'Oyni yopish (o\'zgarishlardan himoya)'}>
                {locked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {locked ? 'Ochish' : 'Oyni yopish'}
              </button>
              <button onClick={handleRecalc} className="btn-secondary btn-sm" disabled={recalcing || locked} title="Ishchilar oyligi/sozlamasi o'zgargan bo'lsa bosing">
                {recalcing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Qayta hisoblash
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={CheckCircle2} label="Hisoblandi" value={agg.count} hint="ishchi" tone="brand" />
            <StatCard icon={Wallet} label="Oylik fond" value={formatSom(agg.fund)} hint="net so'm" tone="green" />
            <StatCard icon={Timer} label="Kech qolganlar" value={agg.lateCount} hint="marta" tone="amber" />
            <StatCard icon={AlertTriangle} label="Farqli oyliklar" value={agg.diffs} hint="ishchi" tone="red" />
          </div>

          {/* Warnings */}
          {(view.unmatchedNames.length > 0 || view.missingEmployees.length > 0) && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {view.unmatchedNames.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                      <UserX className="h-4 w-4" /> Faylda bor, tizimda yo'q ({view.unmatchedNames.length})
                    </p>
                    {view.parsedRecords && (
                      <button onClick={autoAddEmployees} className="btn-primary btn-sm" disabled={addingAll}>
                        {addingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                        {addingAll ? 'Qo\'shilmoqda…' : 'Avtomatik qo\'shish'}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400/80">Bu ismlar hech bir ishchiga mos kelmadi. "Avtomatik qo'shish" ular fayldagi ma'lumot (departament, ish vaqti) bilan bazaga qo'shadi — keyin oylik summasini kiritasiz.</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {view.unmatchedNames.slice(0, 12).map((n) => <span key={n} className="badge-amber">{n}</span>)}
                    {view.unmatchedNames.length > 12 && <span className="badge-amber">+{view.unmatchedNames.length - 12}</span>}
                  </div>
                </div>
              )}
              {view.missingEmployees.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    <FileWarning className="h-4 w-4" /> Tizimda bor, faylda yo'q ({view.missingEmployees.length})
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Bu ishchilar uchun faylda yozuv topilmadi (barcha kun kelmagan deb hisoblandi).</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {view.missingEmployees.slice(0, 12).map((n) => <span key={n} className="badge-slate">{n}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results table */}
          <DataTable
            columns={columns}
            rows={view.results}
            rowKey={(r) => r.employee.id}
            searchPlaceholder="Ishchi qidirish…"
            initialSort={{ key: 'difference', dir: 'asc' }}
            onRowClick={(r) => setDetail({ employee: r.employee, summary: r.summary, days: view.daysByEmp.get(r.employee.id) || [] })}
            emptyTitle="Natija yo'q"
          />
        </div>
      )}

      <SalaryDetail
        open={!!detail}
        onClose={() => setDetail(null)}
        employee={detail?.employee}
        summary={detail?.summary}
        days={detail?.days || []}
        month={view?.month}
      />
    </div>
  )
}
