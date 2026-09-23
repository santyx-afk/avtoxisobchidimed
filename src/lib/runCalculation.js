// IVMS hisobotini qayta ishlash: parse -> ishchilarni moslashtirish -> hisoblash -> saqlash
import { parseIvmsHtml, normalizeName } from './ivmsParser'
import { calcEmployeeSalary } from './salaryCalc'
import { isMonthLocked, assertMonthUnlocked } from './monthLock'
import * as db from './db'

const pidOf = (v) => String(v ?? '').trim()

// Hisob paytidagi shartlar nusxasi (snapshot): keyinroq oylik yoki sozlama o'zgarsa ham
// o'tgan oy qayta hisoblanganda shu shartlar bilan qoladi
const TERM_KEYS = [
  'calc_type', 'monthly_salary', 'hourly_rate', 'daily_rate', 'work_start', 'work_end', 'lunch_minutes',
  'work_days', 'grace_period_min', 'late_penalty_per_min', 'overtime_multiplier', 'weekend_multiplier',
]
const SETTING_KEYS = [
  'late_penalty_per_min', 'grace_period_min', 'overtime_multiplier', 'weekend_multiplier', 'weekend_days', 'holidays',
]
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]))
export const employeeTerms = (employee) => pick(employee, TERM_KEYS)
export const settingsTerms = (settings) => pick(settings, SETTING_KEYS)

/** Oy avanslarini bitta so'rov bilan olib, ishchi bo'yicha guruhlaydi: Map<employee_id, advances[]> */
export async function loadAdvancesByEmployee(month) {
  const map = new Map()
  for (const a of await db.listAdvances({ month })) {
    if (!map.has(a.employee_id)) map.set(a.employee_id, [])
    map.get(a.employee_id).push(a)
  }
  return map
}

/**
 * Mavjud oyni saqlangan attendance yozuvlaridan qayta hisoblaydi.
 * useCurrent=false (masalan avans o'zgargach) — hisob paytidagi shartlar (snapshot) saqlanadi,
 * faqat avanslar yangilanadi. useCurrent=true («Qayta hisoblash» tugmasi) — ishchilarning
 * hozirgi oyligi/jadvali va hozirgi sozlamalar qo'llanadi.
 * @returns {boolean} report topilib qayta hisoblandimi
 */
export async function recalculateMonth(month, { useCurrent = false } = {}) {
  if (await isMonthLocked(month)) return false // qulflangan oy — o'zgartirilmaydi
  const report = await db.getReportByMonth(month)
  if (!report) return false
  const [employees, currentSettings, attendance, existing, advancesByEmployee] = await Promise.all([
    db.listEmployees(),
    db.getSettings(),
    db.getAttendanceByReport(report.id),
    db.getCalculationsByReport(report.id),
    loadAdvancesByEmployee(month),
  ])

  // Saqlangan attendance allaqachon smena sanasiga bog'langan (tungi smena uchun muhim)
  const byEmp = new Map()
  for (const a of attendance) {
    if (!byEmp.has(a.employee_id)) byEmp.set(a.employee_id, [])
    byEmp.get(a.employee_id).push({
      date: a.date,
      dayOfWeek: a.day_of_week,
      firstIn: a.check_in,
      lastOut: a.check_out,
      anchored: true,
    })
  }
  const prevByEmp = new Map(existing.map((c) => [c.employee_id, c]))
  const useSnapshot = !useCurrent && report.settings_snapshot
  const settings = useSnapshot ? { ...currentSettings, ...report.settings_snapshot } : currentSettings

  const summaries = []
  for (const employee of employees) {
    const prev = prevByEmp.get(employee.id)
    // Faylda yozuvi bor yoki avval hisoblangan (faylda yo'q, "kelmagan") ishchilar
    if (!byEmp.has(employee.id) && !prev) continue
    const emp = !useCurrent && prev?.employee_snapshot ? { ...employee, ...prev.employee_snapshot } : employee
    const { summary } = calcEmployeeSalary({
      employee: emp,
      records: byEmp.get(employee.id) || [],
      settings,
      advances: advancesByEmployee.get(employee.id) || [],
      month,
    })
    summaries.push({ ...summary, employee_snapshot: employeeTerms(emp) })
  }
  // Snapshot yo'q (eski) hisobotga yoki yangi shartlar qo'llanganda — sozlamalar nusxasi yoziladi
  await db.replaceCalculationsForReport(report.id, summaries, useSnapshot ? null : settingsTerms(settings))
  return true
}

/**
 * IVMS yozuvlarini ishchilarga moslaydi:
 * 1) IVMS ID (Идентификатор человека) bo'yicha — ishchida ivms_person_id bo'lsa;
 * 2) normallashtirilgan ism bo'yicha (registr/probel/apostrofga bog'liq emas) — faqat bir
 *    ma'noli bo'lsa. Bir xil ismli ikki ishchi yoki fayldagi bir xil ismli ikki odam (turli ID)
 *    hech kimga berilmaydi — aks holda ikki kishiga bir xil davomat va oylik yozilardi.
 * @returns {{ byEmployee: Map, unmatched: Array<{name, personId, records}>, ambiguousNames: string[], learnedPersonIds: Array<{id, ivms_person_id}> }}
 */
export function matchRecords(records, employees) {
  const buckets = new Map()
  for (const r of records) {
    const personId = pidOf(r.personId)
    const norm = normalizeName(r.name)
    const key = personId ? `id:${personId}` : `name:${norm}`
    if (!buckets.has(key)) buckets.set(key, { personId, norm, name: r.name, records: [] })
    buckets.get(key).records.push(r)
  }

  const byPid = new Map()
  const byName = new Map()
  for (const e of employees) {
    if (pidOf(e.ivms_person_id)) byPid.set(pidOf(e.ivms_person_id), e)
    const n = normalizeName(e.name)
    if (!byName.has(n)) byName.set(n, [])
    byName.get(n).push(e)
  }

  const byEmployee = new Map()
  const learnedPersonIds = []
  const assign = (e, b) => {
    byEmployee.set(e.id, b.records)
    if (b.personId && !pidOf(e.ivms_person_id)) learnedPersonIds.push({ id: e.id, ivms_person_id: b.personId })
  }

  // 1) IVMS ID bo'yicha
  const rest = []
  for (const b of buckets.values()) {
    const e = b.personId && byPid.get(b.personId)
    if (e) assign(e, b)
    else rest.push(b)
  }

  // 2) Ism bo'yicha — faqat bir ma'noli holatda
  const sameName = new Map()
  for (const b of rest) sameName.set(b.norm, (sameName.get(b.norm) || 0) + 1)
  const unmatched = []
  const ambiguousNames = []
  for (const b of rest) {
    // IVMS ID si boshqa bo'lgan ishchi bu odam emas
    const cands = (byName.get(b.norm) || []).filter(
      (e) => !byEmployee.has(e.id) && !(b.personId && pidOf(e.ivms_person_id)),
    )
    if (cands.length === 0) unmatched.push({ name: b.name, personId: b.personId, records: b.records })
    else if (cands.length === 1 && sameName.get(b.norm) === 1) assign(cands[0], b)
    else if (!ambiguousNames.includes(b.name)) ambiguousNames.push(b.name)
  }

  return { byEmployee, unmatched, ambiguousNames, learnedPersonIds }
}

/**
 * Parse qilingan yozuvlar asosida hisob-kitob (DB ga yozmasdan).
 * @param {{records: Array, month: string, employees: Array, settings: object, advancesByEmployee: Map}}
 */
export function computeReport({ records, month, employees, settings, advancesByEmployee = new Map() }) {
  // Moslash barcha ishchilar bo'yicha (nofaol ishchi "tizimda yo'q" bo'lib chiqmasin),
  // hisoblash — faqat faollar uchun
  const { byEmployee, unmatched, ambiguousNames, learnedPersonIds } = matchRecords(records, employees)
  const activeEmployees = employees.filter((e) => e.is_active)

  const results = []
  const allDays = []
  const allSummaries = []
  for (const employee of activeEmployees) {
    const empRecords = byEmployee.get(employee.id) || []
    const advances = advancesByEmployee.get(employee.id) || []
    const { summary, days } = calcEmployeeSalary({ employee, records: empRecords, settings, advances, month })
    results.push({ employee, summary, hasData: empRecords.length > 0 })
    allDays.push(...days)
    allSummaries.push({ ...summary, employee_snapshot: employeeTerms(employee) })
  }

  // Faylda bor, tizimda yo'q (dublikatsiz — birinchi ko'ringan ism)
  const unmatchedNames = unmatched.map((u) => u.name)
  const missingEmployees = results.filter((r) => !r.hasData).map((r) => r.employee.name)

  return { results, allDays, allSummaries, unmatchedNames, unmatched, ambiguousNames, learnedPersonIds, missingEmployees }
}

/** Ism bo'yicha bir ma'noli moslangan ishchilarga IVMS ID ni saqlaydi (keyingi oylarda ID bo'yicha moslanadi) */
export async function rememberPersonIds(learned) {
  if (!learned?.length) return
  try {
    await db.updateEmployeesBulk(learned.map(({ id, ivms_person_id }) => ({ id, patch: { ivms_person_id } })))
  } catch (e) {
    // eski sxema (ivms_person_id ustuni yo'q) — moslash ism bo'yicha davom etadi
    console.warn('IVMS ID saqlanmadi:', e?.message)
  }
}

/** Foydalanuvchiga ko'rsatiladigan ogohlantirishlar */
export function reportWarnings(parsed, computed) {
  const warnings = []
  const other = Object.entries(parsed?.meta?.monthCounts || {}).filter(([m]) => m !== parsed.month)
  if (other.length) {
    const list = other.map(([m, n]) => `${m}: ${n} ta`).join(', ')
    warnings.push(`Faylda boshqa oy yozuvlari ham bor (${list}) — faqat ${parsed.month} hisoblandi.`)
  }
  if (computed?.ambiguousNames?.length) {
    warnings.push(`Bir xil ismlilarni ajratib bo'lmadi: ${computed.ambiguousNames.join(', ')} — "Ishchilar" sahifasida ularga IVMS ID kiriting.`)
  }
  return warnings
}

/** Hisoblangan natijalarni DB ga saqlaydi: oyiga bitta report, bitta tranzaksiyada */
export async function saveReport({ month, fileName, source, allDays, allSummaries, settings }) {
  await assertMonthUnlocked(month)
  return db.saveMonthReport({
    month,
    file_name: fileName,
    source,
    attendance: allDays,
    calculations: allSummaries,
    settings_snapshot: settings ? settingsTerms(settings) : null,
  })
}

/**
 * IVMS HTML faylini to'liq qayta ishlaydi va saqlaydi.
 * @returns natija + ogohlantirishlar
 */
export async function processIvmsFile({ html, fileName, source = 'manual', expectedMonth = null }) {
  const parsed = parseIvmsHtml(html)
  if (!parsed.month) {
    throw new Error("Fayldan oy (sana) aniqlanmadi. IVMS 'Punch Report' formatini tekshiring.")
  }
  if (parsed.records.length === 0) {
    throw new Error("Faylda hech qanday yozuv topilmadi. Format noto'g'ri bo'lishi mumkin.")
  }
  // Agent fayli: papka oyi va fayl ichidagi oy bir xil bo'lishi kerak (boshqa oy ustidan yozilmasin)
  if (expectedMonth && parsed.month !== expectedMonth) {
    throw new Error(`Fayl ${expectedMonth} papkasida, lekin ichidagi ma'lumot ${parsed.month} oyiga tegishli — o'tkazib yuborildi.`)
  }
  await assertMonthUnlocked(parsed.month)

  const [employees, settings, advancesByEmployee] = await Promise.all([
    db.listEmployees(),
    db.getSettings(),
    loadAdvancesByEmployee(parsed.month),
  ])

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
    settings,
  })
  await rememberPersonIds(computed.learnedPersonIds)

  return { report, month: parsed.month, parsed, warnings: reportWarnings(parsed, computed), ...computed }
}
