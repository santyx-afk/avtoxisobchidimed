// Excel export (SheetJS) — xlsx faqat kerak bo'lganda yuklanadi (lazy import)
import { formatMonth } from './format'
import { CALC_TYPE_LABEL } from './constants'

/**
 * Oylik hisob-kitobni .xlsx ga eksport qiladi va yuklab beradi.
 * @param {{month: string, results: Array<{employee, summary}>}}
 */
export async function exportMonthToExcel({ month, results }) {
  const XLSX = await import('xlsx')
  const header = [
    'Ishchi', 'Turi', 'Departament', 'Kelgan kun', 'Kutilgan kun',
    'Jami soat', 'Overtime soat', 'Dam olish soat', 'Kech (kun)', 'Kech (daqiqa)',
    'Belgilangan', 'Kelgan kunlar', 'Overtime', 'Dam olish', 'Jarima', 'Avans',
    'Net oylik', 'Farq', 'Izohlar',
  ]

  const rows = results.map(({ employee, summary }) => [
    employee.name,
    CALC_TYPE_LABEL[employee.calc_type] || employee.calc_type,
    employee.department || '',
    summary.work_days,
    summary.expected_work_days,
    summary.total_hours,
    summary.overtime_hours,
    summary.weekend_hours,
    summary.late_count,
    summary.total_late_minutes,
    summary.base_salary,
    summary.calculated_salary,
    summary.overtime_pay,
    summary.weekend_pay,
    summary.penalties,
    summary.advance_deduction,
    summary.net_salary,
    summary.difference,
    (summary.notes || '').replace(/\n/g, ' | '),
  ])

  // Jami qatori
  const sum = (key) => results.reduce((s, r) => s + (Number(r.summary[key]) || 0), 0)
  const totalRow = [
    'JAMI', '', '', '', '', '', '', '', '', '',
    sum('base_salary'), sum('calculated_salary'), sum('overtime_pay'),
    sum('weekend_pay'), sum('penalties'), sum('advance_deduction'),
    sum('net_salary'), sum('difference'), '',
  ]

  const aoa = [header, ...rows, [], totalRow]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Ustun kengliklari
  ws['!cols'] = [
    { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 11 },
    { wch: 9 }, { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 12 },
    { wch: 13 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 12 },
    { wch: 14 }, { wch: 13 }, { wch: 50 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, formatMonth(month).slice(0, 31))
  XLSX.writeFile(wb, `dimed_oylik_${month}.xlsx`)
}
