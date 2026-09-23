import { useEffect, useState } from 'react'
import {
  Save, RotateCcw, Sliders, CalendarDays, Server, Database, FlaskConical,
  CheckCircle2, Loader2, AlertTriangle, PartyPopper, Plus, X,
} from 'lucide-react'
import { PageHeader, PageLoader, Field, ConfirmDialog } from '../components/ui'
import { WEEKDAY_NAMES_UZ, formatDate, formatDateTime } from '../lib/format'
import { DEFAULT_SETTINGS } from '../lib/constants'
import { IS_DEMO } from '../lib/db'
import { SUPABASE_URL } from '../lib/config'
import * as db from '../lib/db'

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [holidayInput, setHolidayInput] = useState('')
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false) }

  useEffect(() => {
    ;(async () => {
      try { setForm(await db.getSettings()) } catch (e) { console.error('Sozlamalarni yuklashda xatolik:', e) } finally { setLoading(false) }
    })()
  }, [])

  function toggleWeekend(day) {
    setSaved(false)
    setForm((f) => {
      const has = f.weekend_days.includes(day)
      return { ...f, weekend_days: has ? f.weekend_days.filter((d) => d !== day) : [...f.weekend_days, day].sort() }
    })
  }

  function addHoliday(date) {
    if (!date) return
    setSaved(false)
    setForm((f) => {
      const list = f.holidays || []
      if (list.includes(date)) return f
      return { ...f, holidays: [...list, date].sort() }
    })
  }
  function removeHoliday(date) {
    setSaved(false)
    setForm((f) => ({ ...f, holidays: (f.holidays || []).filter((d) => d !== date) }))
  }

  // O'tgan oylar qayta hisoblanmaydi: ular hisob paytidagi sozlamalar bilan saqlangan (snapshot)
  async function save() {
    setBusy(true)
    try {
      await db.updateSettings({
      late_penalty_per_min: Number(form.late_penalty_per_min) || 0,
      grace_period_min: Number(form.grace_period_min) || 0,
      overtime_multiplier: Number(form.overtime_multiplier) || 1,
      weekend_multiplier: Number(form.weekend_multiplier) || 1,
      weekend_days: form.weekend_days,
      holidays: form.holidays || [],
      })
      setSaved(true)
    } finally {
      setBusy(false)
    }
  }

  async function doReset() {
    setResetOpen(false)
    await db.resetDemoData()
    window.location.reload()
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader title="Sozlamalar" subtitle="Jarima, koeffitsientlar va agent sozlamalari">
        <button onClick={save} className="btn-primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {busy ? 'Saqlanmoqda…' : saved ? 'Saqlandi' : 'Saqlash'}
        </button>
      </PageHeader>

      {saved && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Sozlamalar saqlandi.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hisoblash sozlamalari */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sliders className="h-5 w-5 text-brand-500" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Hisoblash sozlamalari</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Kech qolish jarimasi" hint="so'm / daqiqa">
              <input type="number" min="0" className="input tabular" value={form.late_penalty_per_min} onChange={(e) => set('late_penalty_per_min', e.target.value)} />
            </Field>
            <Field label="Grace period" hint="daqiqa (kechirim vaqti)">
              <input type="number" min="0" className="input tabular" value={form.grace_period_min} onChange={(e) => set('grace_period_min', e.target.value)} />
            </Field>
            <Field label="Overtime koeffitsienti" hint="masalan 1.5x">
              <input type="number" step="0.1" min="1" className="input tabular" value={form.overtime_multiplier} onChange={(e) => set('overtime_multiplier', e.target.value)} />
            </Field>
            <Field label="Dam olish koeffitsienti" hint="masalan 2x">
              <input type="number" step="0.1" min="1" className="input tabular" value={form.weekend_multiplier} onChange={(e) => set('weekend_multiplier', e.target.value)} />
            </Field>
          </div>
        </div>

        {/* Dam olish kunlari */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Dam olish kunlari</h3>
          </div>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Bu kunlarda ishlagan soatlar dam olish koeffitsienti bilan hisoblanadi.</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_NAMES_UZ.map((name, day) => {
              const active = form.weekend_days.includes(day)
              return (
                <button
                  key={day}
                  onClick={() => toggleWeekend(day)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                  }`}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Bayram kunlari */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-emerald-500" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Bayram kunlari</h3>
          </div>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Bayram ish kuniga to'g'ri kelsa — <b>kelmagan deb jarima qilinmaydi</b> (haq to'lanadi). Bayramda ishlaganlar dam olish koeffitsienti bilan hisoblanadi.
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              className="input tabular"
              value={holidayInput}
              onChange={(e) => setHolidayInput(e.target.value)}
            />
            <button
              type="button"
              onClick={() => { addHoliday(holidayInput); setHolidayInput('') }}
              className="btn-secondary shrink-0"
              disabled={!holidayInput}
            >
              <Plus className="h-4 w-4" /> Qo'shish
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(form.holidays || []).length === 0 ? (
              <span className="text-sm text-slate-400">Bayram kunlari kiritilmagan</span>
            ) : (
              (form.holidays || []).map((date) => (
                <span key={date} className="badge-green gap-1.5 pr-1">
                  {formatDate(date)}
                  <button type="button" onClick={() => removeHoliday(date)} className="rounded-full p-0.5 hover:bg-emerald-200/60 dark:hover:bg-emerald-500/20" aria-label="O'chirish">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* IVMS Agent */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Server className="h-5 w-5 text-brand-500" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">IVMS Agent</h3>
          </div>
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            Agent klinika kompyuterida ishlaydi. Qaysi kun va soatda yuklashi o'sha kompyuterdagi
            <code className="mx-1 rounded bg-slate-200 px-1 dark:bg-slate-700">config.json</code> da sozlanadi
            (agent/README.md). Pastda — sayt agent fayllarini oxirgi marta qayta ishlagandagi holat.
          </p>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Oxirgi yuklash</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{form.agent.last_run ? formatDateTime(form.agent.last_run) : 'Hali yo\'q'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Holat</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{form.agent.last_status || 'idle'}</span>
            </div>
            {form.agent.last_error && (
              <p className="break-words text-xs text-red-500">{form.agent.last_error}</p>
            )}
          </div>
        </div>

        {/* Tizim */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-brand-500" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Tizim</h3>
          </div>
          {IS_DEMO ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <FlaskConical className="h-4 w-4" /> DEMO rejim
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400/80">
                Supabase sozlanmagan — ma'lumotlar shu brauzerda (localStorage) saqlanadi.
                Ishga tushirish uchun <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">.env</code> ga
                VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY qo'shing.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Supabase ulangan
              </p>
              <p className="mt-1 break-all text-xs text-emerald-600 dark:text-emerald-400/80">{SUPABASE_URL}</p>
            </div>
          )}

          {IS_DEMO && (
            <button onClick={() => setResetOpen(true)} className="btn-secondary mt-4 w-full text-red-600 dark:text-red-400">
              <RotateCcw className="h-4 w-4" /> DEMO ma'lumotlarni tozalash
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Yangi sozlamalar keyingi hisob-kitoblarga qo'llanadi. O'tgan oylar o'zgarmaydi — ular hisob paytidagi
        sozlamalar bilan saqlangan. Oyni yangi sozlamalar bilan hisoblash uchun «Oylik hisoblash» sahifasida
        «Qayta hisoblash» tugmasini bosing.
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={doReset}
        title="DEMO ma'lumotlarni tozalash"
        message="Barcha demo ishchilar, hisob-kitoblar va avanslar o'chib, boshidan yaratiladi. Davom etasizmi?"
        confirmText="Ha, tozalash"
      />
    </div>
  )
}
