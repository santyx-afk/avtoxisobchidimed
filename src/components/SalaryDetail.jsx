import { Printer } from 'lucide-react'
import { Modal } from './ui'
import DataTable from './DataTable'
import { formatSom, formatSigned, shortTime, minutesToHm, minutesToHours } from '../lib/format'
import { CALC_TYPE_LABEL } from '../lib/constants'
import { printPayslip } from '../lib/payslip'

/** Bitta ishchining oylik natijasi: farq sabablari + kunlik breakdown */
export default function SalaryDetail({ open, onClose, employee, summary, days = [], month }) {
  if (!summary) return null

  const chips = [
    ['Asos (belgilangan)', formatSom(summary.base_salary), 'slate'],
    ['Kelgan kunlar', formatSom(summary.calculated_salary), 'slate'],
    summary.overtime_pay > 0 && ['Overtime', '+' + formatSom(summary.overtime_pay), 'green'],
    summary.weekend_pay > 0 && ['Dam olish', '+' + formatSom(summary.weekend_pay), 'green'],
    summary.penalties > 0 && ['Jarima', '−' + formatSom(summary.penalties), 'red'],
    summary.advance_deduction > 0 && ['Avans', '−' + formatSom(summary.advance_deduction), 'red'],
  ].filter(Boolean)

  const noteLines = (summary.notes || '').split('\n').filter(Boolean)

  const dayColumns = [
    { key: 'date', header: 'Sana', render: (d) => <span className="tabular">{d.date?.slice(8)}.{d.date?.slice(5, 7)}</span> },
    { key: 'day_of_week', header: 'Kun', render: (d) => (
      <span className={d.is_weekend ? 'text-amber-500' : 'text-slate-500'}>{d.day_of_week || '—'}</span>
    ) },
    { key: 'check_in', header: 'Kirish', align: 'center', render: (d) => <span className="tabular">{shortTime(d.check_in)}</span> },
    { key: 'check_out', header: 'Chiqish', align: 'center', render: (d) => <span className="tabular">{shortTime(d.check_out)}</span> },
    { key: 'worked_minutes', header: 'Ishlagan', align: 'right', render: (d) => <span className="tabular">{d.worked_minutes ? minutesToHm(d.worked_minutes) : '—'}</span> },
    { key: 'late_minutes', header: 'Kech', align: 'right', render: (d) => (d.late_minutes > 0 ? <span className="tabular text-red-500">{d.late_minutes}d</span> : <span className="text-slate-300">—</span>) },
    { key: 'overtime_minutes', header: 'Overtime', align: 'right', render: (d) => (d.overtime_minutes > 0 ? <span className="tabular text-emerald-500">{minutesToHm(d.overtime_minutes)}</span> : <span className="text-slate-300">—</span>) },
  ]

  return (
    <Modal open={open} onClose={onClose} title={employee?.name || 'Oylik tafsiloti'} size="xl">
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

        {/* Kunlik breakdown */}
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
