// Supabase ma'lumotlar qatlami (VITE_SUPABASE_* sozlangan bo'lsa)
import { supabase } from './supabase'
import { DEFAULT_SETTINGS } from './constants'

const SETTINGS_KEY = 'app'

function check(error) {
  if (!error) return
  // PGRST202 — funksiya topilmadi: bazada sxema yangilanmagan
  const e = new Error(error.code === 'PGRST202'
    ? "Bazada yangi funksiya topilmadi — supabase/schema.sql ni qayta ishga tushiring (README)."
    : error.message || 'Supabase xatosi')
  e.code = error.code // masalan 23503 — bog'liq yozuvlar bor (tarixi bor ishchini o'chirish)
  throw e
}

const PAGE = 1000

/**
 * Jadvaldan barcha mos qatorlarni sahifalab o'qiydi. Supabase bitta so'rovga ko'pi bilan
 * "Max rows" (standart 1000) qator qaytaradi — busiz ~33+ ishchida davomat jimgina kesilib,
 * qayta hisoblashda yetishmagan kunlar "kelmagan" deb oylikdan ushlanardi.
 */
async function selectAll(table, build = (q) => q) {
  const out = []
  for (;;) {
    const { data, count, error } = await build(supabase.from(table).select('*', { count: 'exact' }))
      .order('id')
      .range(out.length, out.length + PAGE - 1)
    check(error)
    out.push(...(data || []))
    if (!data?.length || out.length >= (count ?? 0)) return out
  }
}

// Seed real DB da qo'lda (SQL seed) qilinadi — bu yerda no-op
export function seedIfEmpty() {}
export function registerDemoReportBuilder() {}
export async function resetDemoData() {}

// ---------- Employees ----------
export async function listEmployees() {
  return selectAll('employees', (q) => q.order('name'))
}

export async function createEmployee(payload) {
  const { data, error } = await supabase.from('employees').insert(payload).select().single()
  check(error)
  return data
}

export async function createEmployeesBulk(list) {
  if (!list.length) return []
  const out = []
  for (let i = 0; i < list.length; i += 500) {
    const { data, error } = await supabase.from('employees').insert(list.slice(i, i + 500)).select()
    check(error)
    out.push(...(data || []))
  }
  return out
}

export async function updateEmployeesBulk(updates) {
  // updates: [{ id, patch }] — har birini alohida yangilaymiz (parallel)
  await Promise.all(updates.map(async (u) => {
    const { error } = await supabase.from('employees').update(u.patch).eq('id', u.id)
    check(error)
  }))
  return updates.length
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
  return selectAll('monthly_reports', (q) => q.order('month', { ascending: false }))
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
  return selectAll('attendance_records', (q) => q.eq('report_id', reportId))
}


// ---------- Salary calculations ----------
export async function getCalculationsByReport(reportId) {
  return selectAll('salary_calculations', (q) => q.eq('report_id', reportId))
}

export async function getCalculationsByMonth(month) {
  const report = await getReportByMonth(month)
  if (!report) return []
  return getCalculationsByReport(report.id)
}

// ---------- Saqlash — bitta tranzaksiyada (supabase/schema.sql dagi funksiyalar) ----------
/** Oy hisobotini to'liq almashtiradi: eski hisobot + yangi davomat + natijalar */
export async function saveMonthReport({ month, file_name, source, attendance, calculations, settings_snapshot = null }) {
  const { data, error } = await supabase.rpc('save_month_report', {
    p_month: month,
    p_file_name: file_name,
    p_source: source,
    p_attendance: attendance,
    p_calculations: calculations,
    p_settings_snapshot: settings_snapshot,
  })
  check(error)
  return data
}

/** Hisobot natijalarini almashtiradi (qayta hisoblash); snapshot berilsa — u ham yangilanadi */
export async function replaceCalculationsForReport(reportId, records, settingsSnapshot = null) {
  const { error } = await supabase.rpc('replace_report_calculations', {
    p_report_id: reportId,
    p_calculations: records,
    p_settings_snapshot: settingsSnapshot,
  })
  check(error)
}

export async function getCalculationsForEmployee(employeeId) {
  const data = await selectAll('salary_calculations', (q) => q.eq('employee_id', employeeId))
  const reports = await listReports()
  const byId = new Map(reports.map((r) => [r.id, r]))
  return (data || [])
    .map((c) => ({ ...c, month: byId.get(c.report_id)?.month }))
    .sort((a, b) => ((a.month || '') < (b.month || '') ? 1 : -1))
}

// ---------- Advances ----------
export async function listAdvances({ month, employeeId } = {}) {
  return selectAll('advances', (q) => {
    let x = q.order('date', { ascending: false })
    if (month) x = x.eq('month', month)
    if (employeeId) x = x.eq('employee_id', employeeId)
    return x
  })
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
