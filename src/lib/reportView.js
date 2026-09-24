// Saqlangan oy hisobotini ko'rish uchun yordamchi (Calculate, History, Ratings)
import * as db from './db'

/**
 * Berilgan oy uchun to'liq natijani yuklaydi (yoki oxirgisini).
 * @returns {null | { month, report, results, daysByEmp, missingEmployees, unmatchedNames }}
 */
export async function loadMonthView(month) {
  const employees = await db.listEmployees()
  const empMap = new Map(employees.map((e) => [e.id, e]))
  const report = month ? await db.getReportByMonth(month) : await db.getLatestReport()
  if (!report) return null

  const [calcs, attendance] = await Promise.all([
    db.getCalculationsByReport(report.id),
    db.getAttendanceByReport(report.id),
  ])

  const daysByEmp = new Map()
  for (const a of attendance) {
    if (!daysByEmp.has(a.employee_id)) daysByEmp.set(a.employee_id, [])
    daysByEmp.get(a.employee_id).push(a)
  }

  const results = calcs.map((c) => ({
    // hisob paytidagi shartlar (snapshot) — ishchi keyin o'zgargan bo'lsa ham shu oy to'g'ri ko'rinadi
    employee: {
      ...(empMap.get(c.employee_id) || { id: c.employee_id, name: '?', calc_type: 'fix' }),
      ...(c.employee_snapshot || {}),
    },
    summary: c,
  }))

  const haveCalc = new Set(calcs.map((c) => c.employee_id))
  const missingEmployees = employees.filter((e) => e.is_active && !haveCalc.has(e.id)).map((e) => e.name)

  return { month: report.month, report, results, daysByEmp, missingEmployees, unmatchedNames: [] }
}

/** Natijalar ro'yxatidan oylik yig'indi */
export function monthSummary(results) {
  return {
    count: results.length,
    fund: results.reduce((s, r) => s + (r.summary.net_salary || 0), 0),
    baseFund: results.reduce((s, r) => s + (r.summary.base_salary || 0), 0),
    lateCount: results.reduce((s, r) => s + (r.summary.late_count || 0), 0),
    lateMinutes: results.reduce((s, r) => s + (r.summary.total_late_minutes || 0), 0),
    overtimeHours: results.reduce((s, r) => s + (r.summary.overtime_hours || 0), 0),
    totalHours: results.reduce((s, r) => s + (r.summary.total_hours || 0), 0),
    advances: results.reduce((s, r) => s + (r.summary.advance_deduction || 0), 0),
    diffCount: results.filter((r) => Math.abs(r.summary.difference || 0) > 0).length,
  }
}
