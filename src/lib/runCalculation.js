// IVMS hisobotini qayta ishlash: parse -> ishchilarni moslashtirish -> hisoblash -> saqlash
import { parseIvmsHtml, groupRecordsByName } from './ivmsParser'
import { calcEmployeeSalary } from './salaryCalc'
import * as db from './db'

/**
 * Mavjud oyni qayta hisoblaydi (masalan avans qo'shilgach).
 * Saqlangan attendance yozuvlaridan IVMS record shakliga qaytarib, qayta hisoblaydi.
 * @returns {boolean} report topilib qayta hisoblandimi
 */
export async function recalculateMonth(month) {
  const report = await db.getReportByMonth(month)
  if (!report) return false
  const [employees, settings, attendance] = await Promise.all([
    db.listEmployees(),
    db.getSettings(),
    db.getAttendanceByReport(report.id),
  ])

  const byEmp = new Map()
  for (const a of attendance) {
    if (!byEmp.has(a.employee_id)) byEmp.set(a.employee_id, [])
    byEmp.get(a.employee_id).push({
      date: a.date,
      dayOfWeek: a.day_of_week,
      firstIn: a.check_in || '-',
      lastOut: a.check_out || '-',
    })
  }

  const summaries = []
  for (const employee of employees) {
    const records = byEmp.get(employee.id)
    if (!records) continue
    const advances = await db.getAdvancesByEmployeeMonth(employee.id, month)
    const { summary } = calcEmployeeSalary({ employee, records, settings, advances, month })
    summaries.push({ ...summary, report_id: report.id })
  }
  await db.replaceCalculationsForReport(report.id, summaries)
  return true
}

/**
 * Parse qilingan yozuvlar asosida hisob-kitob (DB ga yozmasdan).
 * @param {{records: Array, month: string, employees: Array, settings: object, advancesByEmployee: Map}}
 */
export function computeReport({ records, month, employees, settings, advancesByEmployee = new Map() }) {
  const grouped = groupRecordsByName(records)
  const activeEmployees = employees.filter((e) => e.is_active)
  const results = []
  const allDays = []
  const allSummaries = []

  for (const employee of activeEmployees) {
    const empRecords = grouped.get(employee.name) || []
    const advances = advancesByEmployee.get(employee.id) || []
    const { summary, days } = calcEmployeeSalary({ employee, records: empRecords, settings, advances, month })
    results.push({ employee, summary, hasData: empRecords.length > 0 })
    allDays.push(...days)
    allSummaries.push(summary)
  }

  const employeeNames = new Set(activeEmployees.map((e) => e.name))
  const unmatchedNames = [...grouped.keys()].filter((n) => !employeeNames.has(n))
  const missingEmployees = results.filter((r) => !r.hasData).map((r) => r.employee.name)

  return { results, allDays, allSummaries, unmatchedNames, missingEmployees }
}

/** Hisoblangan natijalarni DB ga saqlaydi (oyiga bitta report) */
export async function saveReport({ month, fileName, source, allDays, allSummaries }) {
  const existing = await db.getReportByMonth(month)
  if (existing) await db.deleteReport(existing.id)
  const report = await db.createReport({ month, file_name: fileName, source })
  await db.replaceAttendanceForReport(
    report.id,
    allDays.map((d) => ({ ...d, report_id: report.id })),
  )
  await db.replaceCalculationsForReport(
    report.id,
    allSummaries.map((s) => ({ ...s, report_id: report.id })),
  )
  return report
}

/**
 * IVMS HTML faylini to'liq qayta ishlaydi va saqlaydi.
 * @returns natija + ogohlantirishlar
 */
export async function processIvmsFile({ html, fileName, source = 'manual' }) {
  const parsed = parseIvmsHtml(html)
  if (!parsed.month) {
    throw new Error("Fayldan oy (sana) aniqlanmadi. IVMS 'Punch Report' formatini tekshiring.")
  }
  if (parsed.records.length === 0) {
    throw new Error("Faylda hech qanday yozuv topilmadi. Format noto'g'ri bo'lishi mumkin.")
  }

  const [employees, settings] = await Promise.all([db.listEmployees(), db.getSettings()])

  // Har bir ishchi uchun shu oydagi avanslarni yig'amiz
  const advancesByEmployee = new Map()
  const active = employees.filter((e) => e.is_active)
  await Promise.all(
    active.map(async (e) => {
      const adv = await db.getAdvancesByEmployeeMonth(e.id, parsed.month)
      if (adv.length) advancesByEmployee.set(e.id, adv)
    }),
  )

  const computed = computeReport({
    records: parsed.records,
    month: parsed.month,
    employees,
    settings,
    advancesByEmployee,
  })

  const report = await saveReport({
    month: parsed.month,
    fileName,
    source,
    allDays: computed.allDays,
    allSummaries: computed.allSummaries,
  })

  return { report, month: parsed.month, parsed, ...computed }
}
