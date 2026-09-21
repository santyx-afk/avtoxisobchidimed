// Supabase ma'lumotlar qatlami (VITE_SUPABASE_* sozlangan bo'lsa)
import { supabase } from './supabase'
import { DEFAULT_SETTINGS } from './constants'

const SETTINGS_KEY = 'app'

function check(error) {
  if (error) throw new Error(error.message || 'Supabase xatosi')
}

// Seed real DB da qo'lda (SQL seed) qilinadi — bu yerda no-op
export function seedIfEmpty() {}
export function registerDemoReportBuilder() {}
export async function resetDemoData() {}

// ---------- Employees ----------
export async function listEmployees() {
  const { data, error } = await supabase.from('employees').select('*').order('name')
  check(error)
  return data || []
}

export async function createEmployee(payload) {
  const { data, error } = await supabase.from('employees').insert(payload).select().single()
  check(error)
  return data
}

export async function updateEmployee(id, payload) {
  const { data, error } = await supabase.from('employees').update(payload).eq('id', id).select().single()
  check(error)
  return data
}

export async function deleteEmployee(id) {
  const { error } = await supabase.from('employees').delete().eq('id', id)
  check(error)
}

// ---------- Settings ----------
export async function getSettings() {
  const { data, error } = await supabase.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
  check(error)
  const value = data?.value || {}
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    agent: { ...DEFAULT_SETTINGS.agent, ...(value.agent || {}) },
  }
}

export async function updateSettings(partial) {
  const current = await getSettings()
  const merged = {
    ...current,
    ...partial,
    agent: { ...current.agent, ...(partial.agent || {}) },
  }
  const { error } = await supabase.from('settings').upsert({ key: SETTINGS_KEY, value: merged })
  check(error)
  return merged
}

// ---------- Reports ----------
export async function listReports() {
  const { data, error } = await supabase.from('monthly_reports').select('*').order('month', { ascending: false })
  check(error)
  return data || []
}

export async function getReport(id) {
  const { data, error } = await supabase.from('monthly_reports').select('*').eq('id', id).maybeSingle()
  check(error)
  return data
}

export async function getReportByMonth(month) {
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*')
    .eq('month', month)
    .order('uploaded_at', { ascending: false })
    .limit(1)
  check(error)
  return data?.[0] || null
}

export async function getLatestReport() {
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(1)
  check(error)
  return data?.[0] || null
}

export async function createReport({ month, file_name, source = 'manual' }) {
  const { data, error } = await supabase
    .from('monthly_reports')
    .insert({ month, file_name, source })
    .select()
    .single()
  check(error)
  return data
}

export async function deleteReport(id) {
  // attendance/calculations FK ON DELETE CASCADE bo'lishi kerak (schema.sql)
  const { error } = await supabase.from('monthly_reports').delete().eq('id', id)
  check(error)
}

// ---------- Attendance ----------
export async function getAttendanceByReport(reportId) {
  const { data, error } = await supabase.from('attendance_records').select('*').eq('report_id', reportId)
  check(error)
  return data || []
}

export async function replaceAttendanceForReport(reportId, records) {
  let error
  ;({ error } = await supabase.from('attendance_records').delete().eq('report_id', reportId))
  check(error)
  const rows = records.map((r) => ({ ...r, report_id: reportId }))
  for (let i = 0; i < rows.length; i += 500) {
    ;({ error } = await supabase.from('attendance_records').insert(rows.slice(i, i + 500)))
    check(error)
  }
}

// ---------- Salary calculations ----------
export async function getCalculationsByReport(reportId) {
  const { data, error } = await supabase.from('salary_calculations').select('*').eq('report_id', reportId)
  check(error)
  return data || []
}

export async function getCalculationsByMonth(month) {
  const report = await getReportByMonth(month)
  if (!report) return []
  return getCalculationsByReport(report.id)
}

export async function replaceCalculationsForReport(reportId, records) {
  let error
  ;({ error } = await supabase.from('salary_calculations').delete().eq('report_id', reportId))
  check(error)
  const rows = records.map((r) => ({ ...r, report_id: reportId }))
  for (let i = 0; i < rows.length; i += 500) {
    ;({ error } = await supabase.from('salary_calculations').insert(rows.slice(i, i + 500)))
    check(error)
  }
}

export async function getCalculationsForEmployee(employeeId) {
  const { data, error } = await supabase.from('salary_calculations').select('*').eq('employee_id', employeeId)
  check(error)
  const reports = await listReports()
  const byId = new Map(reports.map((r) => [r.id, r]))
  return (data || [])
    .map((c) => ({ ...c, month: byId.get(c.report_id)?.month }))
    .sort((a, b) => ((a.month || '') < (b.month || '') ? 1 : -1))
}

// ---------- Advances ----------
export async function listAdvances({ month, employeeId } = {}) {
  let q = supabase.from('advances').select('*').order('date', { ascending: false })
  if (month) q = q.eq('month', month)
  if (employeeId) q = q.eq('employee_id', employeeId)
  const { data, error } = await q
  check(error)
  return data || []
}

export async function getAdvancesByEmployeeMonth(employeeId, month) {
  const { data, error } = await supabase
    .from('advances')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('month', month)
  check(error)
  return data || []
}

export async function createAdvance(payload) {
  const { data, error } = await supabase.from('advances').insert(payload).select().single()
  check(error)
  return data
}

export async function deleteAdvance(id) {
  const { error } = await supabase.from('advances').delete().eq('id', id)
  check(error)
}
