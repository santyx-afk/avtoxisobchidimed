// DEMO rejim ma'lumotlar qatlami — localStorage orqali (Supabase sozlanmaganda)
import { DEFAULT_SETTINGS } from './constants'
import { DEMO_EMPLOYEES } from './demoData'

const DB_KEY = 'dimed-db'

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function emptyState() {
  return {
    employees: [],
    monthly_reports: [],
    attendance_records: [],
    salary_calculations: [],
    advances: [],
    settings: { ...DEFAULT_SETTINGS },
    seeded: false,
  }
}

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw)
    return { ...emptyState(), ...parsed }
  } catch (e) {
    return emptyState()
  }
}

function save(state) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(state))
  } catch (e) {
    // e'tiborsiz (masalan xotira to'lgan)
  }
}

// Demo report generatori keyinroq (2-bosqich) ulanadi
let demoReportBuilder = null
export function registerDemoReportBuilder(fn) {
  demoReportBuilder = fn
}

export function seedIfEmpty() {
  const state = load()
  if (state.seeded) return
  const now = new Date().toISOString()
  state.employees = DEMO_EMPLOYEES.map((e) => ({
    id: uid(),
    is_active: true,
    created_at: now,
    ...e,
  }))
  state.settings = { ...DEFAULT_SETTINGS }
  state.seeded = true
  save(state)

  // Demo attendance + hisob-kitob (agar builder ulangan bo'lsa)
  if (demoReportBuilder) {
    try {
      demoReportBuilder({
        employees: state.employees,
        settings: state.settings,
        commit: (payload) => commitDemoReport(payload),
      })
    } catch (e) {
      // demo report yaratilmadi — muhim emas
    }
  }
}

function commitDemoReport({ report, attendance, calculations, advances }) {
  const state = load()
  const reportRow = { id: uid(), uploaded_at: new Date().toISOString(), source: 'agent', ...report }
  state.monthly_reports.push(reportRow)
  attendance.forEach((a) => state.attendance_records.push({ id: uid(), report_id: reportRow.id, ...a }))
  calculations.forEach((c) => state.salary_calculations.push({ id: uid(), report_id: reportRow.id, ...c }))
  if (advances) advances.forEach((a) => state.advances.push({ id: uid(), ...a }))
  save(state)
}

// ---------- Employees ----------
export async function listEmployees() {
  const s = load()
  return [...s.employees].sort((a, b) => a.name.localeCompare(b.name))
}

export async function createEmployee(data) {
  const s = load()
  const row = { id: uid(), is_active: true, created_at: new Date().toISOString(), ...data }
  s.employees.push(row)
  save(s)
  return row
}

export async function createEmployeesBulk(list) {
  const s = load()
  const now = new Date().toISOString()
  const rows = list.map((data) => ({ id: uid(), is_active: true, created_at: now, ...data }))
  rows.forEach((r) => s.employees.push(r))
  save(s)
  return rows
}

export async function updateEmployee(id, data) {
  const s = load()
  const idx = s.employees.findIndex((e) => e.id === id)
  if (idx === -1) throw new Error('Ishchi topilmadi')
  s.employees[idx] = { ...s.employees[idx], ...data }
  save(s)
  return s.employees[idx]
}

export async function updateEmployeesBulk(updates) {
  // updates: [{ id, patch }]
  const s = load()
  const byId = new Map(s.employees.map((e, i) => [e.id, i]))
  for (const u of updates) {
    const idx = byId.get(u.id)
    if (idx != null) s.employees[idx] = { ...s.employees[idx], ...u.patch }
  }
  save(s)
  return updates.length
}

export async function deleteEmployee(id) {
  const s = load()
  s.employees = s.employees.filter((e) => e.id !== id)
  s.attendance_records = s.attendance_records.filter((a) => a.employee_id !== id)
  s.salary_calculations = s.salary_calculations.filter((c) => c.employee_id !== id)
  s.advances = s.advances.filter((a) => a.employee_id !== id)
  save(s)
}

// ---------- Settings ----------
export async function getSettings() {
  const s = load()
  return { ...DEFAULT_SETTINGS, ...s.settings, agent: { ...DEFAULT_SETTINGS.agent, ...(s.settings.agent || {}) } }
}

export async function updateSettings(partial) {
  const s = load()
  s.settings = {
    ...DEFAULT_SETTINGS,
    ...s.settings,
    ...partial,
    agent: { ...DEFAULT_SETTINGS.agent, ...(s.settings.agent || {}), ...(partial.agent || {}) },
  }
  save(s)
  return s.settings
}

// ---------- Reports ----------
export async function listReports() {
  const s = load()
  return [...s.monthly_reports].sort((a, b) => (a.month < b.month ? 1 : -1))
}

export async function getReport(id) {
  const s = load()
  return s.monthly_reports.find((r) => r.id === id) || null
}

export async function getReportByMonth(month) {
  const s = load()
  const rows = s.monthly_reports
    .filter((r) => r.month === month)
    .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1))
  return rows[0] || null
}

export async function getLatestReport() {
  const s = load()
  const rows = [...s.monthly_reports].sort((a, b) =>
    (a.uploaded_at || '') < (b.uploaded_at || '') ? 1 : -1,
  )
  return rows[0] || null
}

export async function createReport({ month, file_name, source = 'manual' }) {
  const s = load()
  const row = { id: uid(), month, file_name, source, uploaded_at: new Date().toISOString() }
  s.monthly_reports.push(row)
  save(s)
  return row
}

export async function deleteReport(id) {
  const s = load()
  s.monthly_reports = s.monthly_reports.filter((r) => r.id !== id)
  s.attendance_records = s.attendance_records.filter((a) => a.report_id !== id)
  s.salary_calculations = s.salary_calculations.filter((c) => c.report_id !== id)
  save(s)
}

// ---------- Attendance ----------
export async function getAttendanceByReport(reportId) {
  const s = load()
  return s.attendance_records.filter((a) => a.report_id === reportId)
}

export async function replaceAttendanceForReport(reportId, records) {
  const s = load()
  s.attendance_records = s.attendance_records.filter((a) => a.report_id !== reportId)
  records.forEach((r) => s.attendance_records.push({ id: uid(), report_id: reportId, ...r }))
  save(s)
}

// ---------- Salary calculations ----------
export async function getCalculationsByReport(reportId) {
  const s = load()
  return s.salary_calculations.filter((c) => c.report_id === reportId)
}

export async function getCalculationsByMonth(month) {
  const s = load()
  const report = await getReportByMonth(month)
  if (!report) return []
  return s.salary_calculations.filter((c) => c.report_id === report.id)
}

export async function replaceCalculationsForReport(reportId, records) {
  const s = load()
  s.salary_calculations = s.salary_calculations.filter((c) => c.report_id !== reportId)
  records.forEach((r) => s.salary_calculations.push({ id: uid(), report_id: reportId, ...r }))
  save(s)
}

export async function getCalculationsForEmployee(employeeId) {
  const s = load()
  const byReport = new Map(s.monthly_reports.map((r) => [r.id, r]))
  return s.salary_calculations
    .filter((c) => c.employee_id === employeeId)
    .map((c) => ({ ...c, month: byReport.get(c.report_id)?.month }))
    .sort((a, b) => ((a.month || '') < (b.month || '') ? 1 : -1))
}

// ---------- Advances ----------
export async function listAdvances({ month, employeeId } = {}) {
  const s = load()
  let rows = [...s.advances]
  if (month) rows = rows.filter((a) => a.month === month)
  if (employeeId) rows = rows.filter((a) => a.employee_id === employeeId)
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export async function getAdvancesByEmployeeMonth(employeeId, month) {
  const s = load()
  return s.advances.filter((a) => a.employee_id === employeeId && a.month === month)
}

export async function createAdvance(data) {
  const s = load()
  const row = { id: uid(), ...data }
  s.advances.push(row)
  save(s)
  return row
}

export async function deleteAdvance(id) {
  const s = load()
  s.advances = s.advances.filter((a) => a.id !== id)
  save(s)
}

// DEMO ma'lumotlarni tozalash (Sozlamalar sahifasidan)
export async function resetDemoData() {
  save(emptyState())
  seedIfEmpty()
}
