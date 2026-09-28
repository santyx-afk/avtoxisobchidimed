import { useEffect, useState } from 'react'
import { Printer, Pencil, Plus, Trash2, Loader2 } from 'lucide-react'
import { Modal } from './ui'
import DataTable from './DataTable'
import { formatSom, formatSigned, shortTime, minutesToHm, minutesToHours, timeToMinutes, daysInMonth } from '../lib/format'
import { parseSessionsInput, editRowsFor } from '../lib/dayEdit'
import { CALC_TYPE_LABEL, DAY_ISSUE_LABEL } from '../lib/constants'
import { printPayslip } from '../lib/payslip'

const hm = (min) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
/** Juftliklar: "08:02–13:10, 14:00–18:05" */
export const formatSessions = (sessions) => (sessions || []).map((x) => `${hm(x.in)}–${hm(x.out)}`).join(', ')

/** Bitta ishchining oylik natijasi: farq sabablari + kunlik breakdown */
const emptyRow = () => ({ in: '', out: '' })

/**
 * editable + onSaveDay(date, sessions) berilsa (xom format oyi), kunlik juftliklarni qo'lda
 * tuzatish mumkin: yopilmagan Приход, Приход'siz Уход, faqat «Нет» kunlar va h.k.
 */
export default function SalaryDetail({ open, onClose, employee, summary, days = [], month, editable = false, onSaveDay, startEditDate = null }) {
  const [editing, setEditing] = useState(null) // { date, rows, isNew }
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // Muammolar ro'yxatidan kelgan bo'lsa — shu kun tuzatish oynasi darrov ochiladi
  useEffect(() => {
    if (!open || !editable || !startEditDate) return
    const d = days.find((x) => x.date === startEditDate)
    setError('')
    setEditing({ date: startEditDate, rows: editRowsFor(d || {}) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startEditDate, editable])
  if (!summary) return null

  const night = (timeToMinutes(employee?.work_end) ?? 1020) < (timeToMinutes(employee?.work_start) ?? 480)
  const startEdit = (d) => {
    setError('')
    setEditing({
      date: d.date,
      rows: editRowsFor(d),
    })
  }
  const startNew = () => {
    setError('')
    setEditing({ date: '', rows: [emptyRow()], isNew: true })
  }
  const setRow = (i, patch) => setEditing((e) => ({ ...e, rows: e.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) }))
  async function save() {
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(editing.date) || !editing.date.startsWith(`${month}-`)) {
        throw new Error(`Sanani ${month} oyi ichidan tanlang`)
      }
      const sessions = parseSessionsInput(editing.rows, { night })
      setSaving(true)
      await onSaveDay(editing.date, sessions)
      setEditing(null)
    } catch (err) {
      setError(err.message || 'Saqlashda xatolik')
    } finally {
      setSaving(false)
    }
  }

  const chips = [
    ['Asos (belgilangan)', formatSom(summary.base_salary), 'slate'],
    ['Kelgan kunlar', formatSom(summary.calculated_salary), 'slate'],
    summary.overtime_pay > 0 && ['Overtime', '+' + formatSom(summary.overtime_pay), 'green'],
    summary.weekend_pay > 0 && ['Dam olish', '+' + formatSom(summary.weekend_pay), 'green'],
    summary.penalties > 0 && ['Jarima', '−' + formatSom(summary.penalties), 'red'],
    summary.advance_deduction > 0 && ['Avans', '−' + formatSom(summary.advance_deduction), 'red'],
  ].filter(Boolean)

  const noteLines = (summary.notes || '').split('\n').filter(Boolean)

  const hasSessions = days.some((d) => Array.isArray(d.sessions))
  const dayColumns = [
    { key: 'date', header: 'Sana', render: (d) => <span className="tabular">{d.date?.slice(8)}.{d.date?.slice(5, 7)}</span> },
    { key: 'day_of_week', header: 'Kun', render: (d) => (
      <span className={d.is_weekend ? 'text-amber-500' : 'text-slate-500'}>{d.day_of_week || '—'}</span>
    ) },
    { key: 'check_in', header: 'Kirish', align: 'center', render: (d) => <span className="tabular">{shortTime(d.check_in)}</span> },
    { key: 'check_out', header: 'Chiqish', align: 'center', render: (d) => <span className="tabular">{shortTime(d.check_out)}</span> },
    ...(hasSessions ? [{
      key: 'sessions', header: 'Juftliklar', sortable: false,
      render: (d) => (
        <div>
          <span className="tabular">{formatSessions(d.sessions) || '—'}</span>
          {(d.issues || []).map((i, k) => (
            <span key={k} className="badge-amber ml-1">{DAY_ISSUE_LABEL[i.type] || i.type}{i.at != null && i.type !== 'only_none' ? ` ${hm(i.at)}` : ''}</span>
          ))}
        </div>
      ),
    }] : []),
    { key: 'worked_minutes', header: 'Ishlagan', align: 'right', render: (d) => <span className="tabular">{d.worked_minutes ? minutesToHm(d.worked_minutes) : '—'}</span> },
    { key: 'late_minutes', header: 'Kech', align: 'right', render: (d) => (d.late_minutes > 0 ? <span className="tabular text-red-500">{d.late_minutes}d</span> : <span className="text-slate-300">—</span>) },
    { key: 'overtime_minutes', header: 'Overtime', align: 'right', render: (d) => (d.overtime_minutes > 0 ? <span className="tabular text-emerald-500">{minutesToHm(d.overtime_minutes)}</span> : <span className="text-slate-300">—</span>) },
  ]

  if (editable && onSaveDay) {
    dayColumns.push({
      key: 'edit', header: '', sortable: false, align: 'right',
      render: (d) => (
        <button className="btn-ghost p-1.5" title="Kunni tuzatish" onClick={(e) => { e.stopPropagation(); startEdit(d) }}>
          <Pencil className="h-4 w-4" />
        </button>
      ),
    })
  }

  return (
    <Modal open={open} onClose={() => { setEditing(null); setError(''); onClose() }} title={employee?.name || 'Oylik tafsiloti'} size="xl">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button
            onClick={() => printPayslip({ employee, summary, month })}
            className="btn-secondary btn-sm"
            title="Oylik varaqasini chop etish yoki PDF qilish"
          >
            <Printer className="h-4 w-4" /> Payslip (chop etish)
          </button>
        </div>

        {/* Natija sarlavhasi */}
        <div className="grid grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-4 text-center dark:bg-slate-800/50">
          <div>
            <p className="text-xs text-slate-400">Belgilangan</p>
            <p className="tabular mt-1 text-lg font-bold text-slate-700 dark:text-slate-200">{formatSom(summary.base_salary)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Hisoblangan (net)</p>
            <p className="tabular mt-1 text-lg font-bold text-brand-600 dark:text-brand-400">{formatSom(summary.net_salary)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Farq</p>
            <p className={`tabular mt-1 text-lg font-bold ${summary.difference < 0 ? 'text-red-600 dark:text-red-400' : summary.difference > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
              {formatSigned(summary.difference)}
            </p>
          </div>
        </div>

        {/* Ko'rsatkichlar */}
        <div className="flex flex-wrap gap-4 text-sm">
          <Metric label="Turi" value={CALC_TYPE_LABEL[employee?.calc_type] || '—'} />
          <Metric label="Kelgan kun" value={`${summary.work_days} / ${summary.expected_work_days}`} />
          <Metric label="Jami soat" value={`${minutesToHours(summary.total_hours * 60)} s`} />
          <Metric label="Overtime" value={`${summary.overtime_hours} s`} />
          <Metric label="Kech qolish" value={`${summary.late_count} kun / ${summary.total_late_minutes} daq`} />
        </div>

        {/* Farq sabablari */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Farq sabablari</h3>
          <ul className="space-y-1.5">
            {noteLines.map((line, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* Hisoblash tarkibi */}
        <div className="flex flex-wrap gap-2">
          {chips.map(([label, value, tone], i) => (
            <span key={i} className={`badge-${tone}`}>{label}: {value}</span>
          ))}
        </div>

        {/* Kunni qo'lda tuzatish */}
        {editing && (
          <div className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {editing.isNew ? "Kun qo'shish" : `Kunni tuzatish: ${editing.date}`}
            </h3>
            {editing.isNew && (
              <input
                type="date" className="input w-auto" value={editing.date}
                min={`${month}-01`} max={`${month}-${String(daysInMonth(month)).padStart(2, '0')}`}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
              />
            )}
            <p className="text-xs text-slate-500">
              Ishlagan vaqt oralig'ini (kirish – chiqish) kiriting. Tanaffus/tushlik bo'lsa, ikkita juftlik qiling (08:00–12:00, 13:00–17:00).
              Bo'sh qoldirsangiz kun «kelmagan» bo'ladi.{night && ' Tungi smena: chiqish kirishdan kichik bo\'lsa, keyingi kun hisoblanadi.'}
            </p>
            {editing.rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input tabular w-24" placeholder="08:00" value={r.in} onChange={(e) => setRow(i, { in: e.target.value })} />
                <span className="text-slate-400">–</span>
                <input className="input tabular w-24" placeholder="17:00" value={r.out} onChange={(e) => setRow(i, { out: e.target.value })} />
                <button
                  className="btn-ghost p-1.5" title="Juftlikni o'chirish"
                  onClick={() => setEditing({ ...editing, rows: editing.rows.filter((_, k) => k !== i) })}
                ><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setEditing({ ...editing, rows: [...editing.rows, emptyRow()] })}>
                <Plus className="h-3.5 w-3.5" /> Juftlik
              </button>
              <button className="btn-primary btn-sm" onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Saqlash va qayta hisoblash
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setEditing(null)} disabled={saving}>Bekor qilish</button>
            </div>
          </div>
        )}

        {/* Kunlik breakdown */}
        {editable && onSaveDay && !editing && (
          <button className="btn-secondary btn-sm" onClick={startNew}><Plus className="h-3.5 w-3.5" /> Kun qo'shish</button>
        )}
        {days.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Kunlik davomat</h3>
            <DataTable
              columns={dayColumns}
              rows={days}
              rowKey={(d) => d.date}
              searchable={false}
              initialSort={{ key: 'date', dir: 'asc' }}
              dense
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  )
}
