// Oylik hisoblash dvigateli.
//
// Har bir ishchi uchun IVMS kunlik yozuvlari, sozlamalar va avanslar asosida
// oylikni hisoblaydi. Eng muhimi — belgilangan va hisoblangan oylik o'rtasidagi
// FARQ SABABLARINI batafsil yozadi (notes).
import {
  timeToMinutes, weekdayOfDate, daysInMonth, formatSom, formatDateShort, minutesToHours,
  minutesToClock, addDays, WEEKDAY_SHORT_UZ,
} from './format'
import { PUNCH_STATE, DAY_ISSUE } from './constants'

const round = (n) => Math.round(Number(n) || 0)
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Override qiymati bo'lsa uni, aks holda global sozlamani qaytaradi */
function numOr(value, fallback) {
  if (value === null || value === undefined || value === '') return Number(fallback) || 0
  const n = Number(value)
  return Number.isNaN(n) ? Number(fallback) || 0 : n
}

/**
 * Ishchining dam olish (ishlamaydigan) hafta kunlarini aniqlaydi.
 * employee.work_days berilgan bo'lsa — undan tashqari kunlar dam olish;
 * aks holda global settings.weekend_days ishlatiladi.
 */
export function employeeRestDays(employee, settings) {
  const wd = employee.work_days
  if (Array.isArray(wd) && wd.length > 0) {
    return [0, 1, 2, 3, 4, 5, 6].filter((d) => !wd.includes(d))
  }
  return settings.weekend_days || [0]
}

/** Oydagi ish kunlari sonini hisoblaydi (dam olish kunlaridan tashqari) */
export function expectedWorkDays(month, weekendDays = [0]) {
  const total = daysInMonth(month)
  let count = 0
  for (let d = 1; d <= total; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`
    if (!weekendDays.includes(weekdayOfDate(dateStr))) count++
  }
  return count
}

/**
 * IVMS yozuvlarini smenalarga aylantiradi: [{ date, dayOfWeek, inMin, outMin }].
 * inMin/outMin — smena sanasining 00:00 idan daqiqalar (outMin 1440 dan oshishi mumkin);
 * outMin = null — faqat bitta punch. Bir sanadagi bir nechta qator birlashtiriladi.
 *
 * Tungi smena (masalan 22:00–06:00): IVMS "birinchi/oxirgi kirish" hisoboti kalendar
 * kuni bo'yicha, shuning uchun bir qatorda "kechagi smenadan chiqish (06:00) + bugungi
 * smenaga kirish (22:00)" turadi. Punchlar smena boshlangan sanaga qayta taqsimlanadi:
 * smena tugashi va boshlanishi o'rtasidan (22:00–06:00 uchun 14:00) keyingi punch —
 * shu kungi smena, oldingisi — kechagi smena. `anchored` yozuvlar (saqlangan attendance)
 * allaqachon smena sanasiga bog'langan.
 */
export function buildShifts(records, { workStart, workEnd }) {
  const night = workEnd < workStart
  const mid = (workStart + workEnd) / 2
  const byDate = new Map()
  const shiftOf = (date, dayOfWeek) => {
    if (!byDate.has(date)) byDate.set(date, { date, dayOfWeek: '', punches: [] })
    const s = byDate.get(date)
    if (dayOfWeek && !s.dayOfWeek) s.dayOfWeek = dayOfWeek
    return s
  }

  for (const r of records) {
    if (!r?.date) continue
    const tin = timeToMinutes(r.firstIn)
    const tout = timeToMinutes(r.lastOut)
    const own = shiftOf(r.date, r.dayOfWeek) // kelmagan kun ham smena sanasi sifatida qoladi
    const times = [tin, tout !== tin ? tout : null].filter((t) => t != null)
    // bitta qatorda chiqish < kirish — chiqish keyingi kalendar kunida (yarim tundan o'tgan)
    const nextDay = (t) => tin != null && t < tin

    for (const t of times) {
      if (!night) own.punches.push(nextDay(t) ? t + 1440 : t)
      else if (r.anchored) own.punches.push(t >= mid ? t : t + 1440)
      else {
        const date = nextDay(t) ? addDays(r.date, 1) : r.date
        if (t >= mid) shiftOf(date).punches.push(t)
        else shiftOf(addDays(date, -1)).punches.push(t + 1440)
      }
    }
  }

  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((s) => {
      const p = [...new Set(s.punches)].sort((a, b) => a - b)
      return {
        date: s.date,
        dayOfWeek: s.dayOfWeek,
        inMin: p.length ? p[0] : null,
        outMin: p.length > 1 ? p[p.length - 1] : null,
      }
    })
}

// ---------------------------------------------------------------------------
// Xom punchlardan (Приход / Уход) juftliklar qurish
// ---------------------------------------------------------------------------
const DEDUPE_SEC = 120 // bir xil holatdagi ketma-ket bosishlar shu oraliqda bitta hisoblanadi
const MIN_MAX_SESSION = 16 * 60 // juftlik shundan uzun bo'lmaydi (yoki jadval + 4 soat)

const dayNumber = (date) => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}

/** Ishchi jadvali bo'yicha juftlikning eng uzun ruxsat etilgan davomiyligi (daqiqa) */
export function maxSessionMinutes(workStart, workEnd) {
  const span = (workEnd > workStart ? workEnd : workEnd + 1440) - workStart
  return Math.max(MIN_MAX_SESSION, span + 240)
}

/**
 * Xom punchlarni ({date, time, state}) smenalarga aylantiradi:
 * [{ date, dayOfWeek, sessions: [{in, out}], issues: [{type, at}], inMin, outMin }].
 * in/out — smena sanasining 00:00 idan daqiqalar (out 1440 dan oshishi mumkin).
 *
 * Qoidalar:
 *  - «Нет» punchlar hisobga olinmaydi;
 *  - bir xil holatdagi ketma-ket bosishlar (2 daqiqa ichida): Приход (va Приход при перерыве) —
 *    birinchisi, Уход (va Уход при перерыве) — oxirgisi;
 *  - juftlik = Приход → keyingi Уход, sanasi Приход sanasi (tungi smena ham). Uzun oraliqdagi
 *    (maxSessionMinutes) Уход/Приход eski Приход'ga tegishli emas;
 *  - ochiq Приход turganda yana Приход — takror, birinchisi qoladi;
 *  - Уход при перерыве → Приход при перерыве oralig'i juftlikdan ayriladi (tushlik ayrilmaydi);
 *  - Уход bosilmagan Приход, Приход'siz Уход, juftlanmagan tanaffus — hisoblanmaydi, `issues` ga yoziladi;
 *  - tungi jadvalli ishchida "o'rta nuqta"dan oldingi Приход/Уход oldingi kun smenasiga tegishli.
 */
export function buildShiftsFromPunches(punches, { workStart, workEnd }) {
  const night = workEnd < workStart
  const mid = (workStart + workEnd) / 2
  const cap = maxSessionMinutes(workStart, workEnd) * 60

  const dates = new Map() // kalendar sana -> Приход/Уход bosilganmi
  const items = []
  for (const p of punches) {
    if (!p?.date) continue
    const min = timeToMinutes(p.time)
    if (min == null) continue
    const sec = dayNumber(p.date) * 86400 + min * 60 + (parseInt(String(p.time).split(':')[2], 10) || 0)
    const stateful = p.state && p.state !== PUNCH_STATE.NONE
    dates.set(p.date, dates.get(p.date) || !!stateful)
    if (stateful) items.push({ sec, state: p.state, date: p.date, min })
  }
  items.sort((a, b) => a.sec - b.sec)

  // takroriy bosishlarni siqish
  const clusters = []
  for (const it of items) {
    const last = clusters[clusters.length - 1]
    if (last && last.state === it.state && it.sec - last.lastSec <= DEDUPE_SEC) {
      last.lastSec = it.sec
      last.lastItem = it
    } else clusters.push({ state: it.state, firstItem: it, lastItem: it, lastSec: it.sec })
  }
  const punchesList = clusters.map((c) =>
    (c.state === PUNCH_STATE.IN || c.state === PUNCH_STATE.BREAK_IN ? c.firstItem : c.lastItem))

  const shifts = new Map()
  const shiftOf = (date) => {
    if (!shifts.has(date)) {
      shifts.set(date, { date, dayOfWeek: WEEKDAY_SHORT_UZ[weekdayOfDate(date)], sessions: [], issues: [] })
    }
    return shifts.get(date)
  }
  // punkt qaysi smena sanasiga tegishli
  const anchorOf = (it) => (night && it.min < mid ? addDays(it.date, -1) : it.date)
  const minutesOn = (date, sec) => Math.floor((sec - dayNumber(date) * 86400) / 60)
  const issue = (date, type, sec) => shiftOf(date).issues.push({ type, at: minutesOn(date, sec) })

  let open = null // { sec, item, date, breaks: [[from, to]], brk: sec | null }
  const closeSession = (outSec) => {
    const segs = []
    let cursor = open.sec
    for (const [from, to] of open.breaks) {
      if (from > cursor) segs.push([cursor, from])
      cursor = Math.max(cursor, to)
    }
    if (outSec > cursor) segs.push([cursor, outSec])
    if (open.brk != null) issue(open.date, DAY_ISSUE.ORPHAN_BREAK, open.brk) // qaytish bosilmagan
    const out = segs
      .map(([a, b]) => ({ in: minutesOn(open.date, a), out: minutesOn(open.date, b) }))
      .filter((x) => x.out > x.in)
    if (out.length) shiftOf(open.date).sessions.push(...out)
    else issue(open.date, DAY_ISSUE.SHORT, open.sec)
    open = null
  }
  const dropStale = (sec) => {
    if (open && sec - open.sec > cap) {
      issue(open.date, DAY_ISSUE.UNCLOSED_IN, open.sec)
      open = null
    }
  }

  for (const it of punchesList) {
    dropStale(it.sec)
    const date = anchorOf(it)
    if (it.state === PUNCH_STATE.IN) {
      if (!open) open = { sec: it.sec, date, breaks: [], brk: null }
    } else if (it.state === PUNCH_STATE.OUT) {
      if (open) closeSession(it.sec)
      else issue(date, DAY_ISSUE.ORPHAN_OUT, it.sec)
    } else if (it.state === PUNCH_STATE.BREAK_OUT) {
      if (!open) issue(date, DAY_ISSUE.ORPHAN_BREAK, it.sec)
      else if (open.brk == null) open.brk = it.sec
    } else if (it.state === PUNCH_STATE.BREAK_IN) {
      if (open && open.brk != null) {
        open.breaks.push([open.brk, it.sec])
        open.brk = null
      } else issue(date, DAY_ISSUE.ORPHAN_BREAK, it.sec)
    }
  }
  if (open) issue(open.date, DAY_ISSUE.UNCLOSED_IN, open.sec)

  // Faqat «Нет» punch bo'lgan kunlar
  for (const [date, stateful] of dates) {
    if (stateful) continue
    const s = shiftOf(date)
    if (!s.sessions.length && !s.issues.length) s.issues.push({ type: DAY_ISSUE.ONLY_NONE, at: null })
  }

  return finalizeShifts([...shifts.values()])
}

/** Saqlangan kunlik qatorlar (sessions/issues) -> smenalar */
export function shiftsFromSessions(rows) {
  return finalizeShifts(rows.filter((r) => r?.date).map((r) => ({
    date: r.date,
    dayOfWeek: r.dayOfWeek || WEEKDAY_SHORT_UZ[weekdayOfDate(r.date)],
    sessions: Array.isArray(r.sessions) ? r.sessions : [],
    issues: Array.isArray(r.issues) ? r.issues : [],
  })))
}

function finalizeShifts(list) {
  return list
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((s) => {
      const sessions = [...s.sessions].sort((a, b) => a.in - b.in)
      return {
        ...s,
        sessions,
        inMin: sessions.length ? sessions[0].in : null,
        outMin: sessions.length ? sessions[sessions.length - 1].out : null,
      }
    })
}

/** Yozuvlar turi: xom punchlar | saqlangan juftliklar | kunlik (Punch Report) */
function recordKind(records) {
  if (records.some((r) => r?.state)) return 'punches'
  if (records.some((r) => Array.isArray(r?.sessions))) return 'sessions'
  return 'legacy'
}

/** Kunlik qatorlardagi izohlar soni (UI ogohlantirishlari uchun) */
export function summarizeDayIssues(days) {
  const c = { unclosed: 0, orphanOut: 0, orphanBreak: 0, onlyNone: 0, short: 0 }
  for (const d of days || []) {
    for (const i of d.issues || []) {
      if (i.type === DAY_ISSUE.UNCLOSED_IN) c.unclosed++
      else if (i.type === DAY_ISSUE.ORPHAN_OUT) c.orphanOut++
      else if (i.type === DAY_ISSUE.ORPHAN_BREAK) c.orphanBreak++
      else if (i.type === DAY_ISSUE.ONLY_NONE) c.onlyNone++
      else if (i.type === DAY_ISSUE.SHORT) c.short++
    }
  }
  return c
}

const clock = (min) => minutesToClock(min).slice(0, 5)
function listPoints(items, max = 8) {
  const shown = items.slice(0, max).join(', ')
  return items.length > max ? `${shown} … (+${items.length - max})` : shown
}

/**
 * Bitta ishchi uchun oylikni hisoblaydi.
 * @returns {{ summary: object, days: Array }}
 */
export function calcEmployeeSalary({ employee, records = [], settings, advances = [], month }) {
  // Har bir ishchi uchun: work_days va override sozlamalar bo'lsa ular,
  // aks holda global sozlamalar ishlatiladi.
  const weekendDays = employeeRestDays(employee, settings)
  const grace = numOr(employee.grace_period_min, settings.grace_period_min)
  const penaltyPerMin = numOr(employee.late_penalty_per_min, settings.late_penalty_per_min)
  const otMult = numOr(employee.overtime_multiplier, settings.overtime_multiplier) || 1
  const weMult = numOr(employee.weekend_multiplier, settings.weekend_multiplier) || 1

  const workStart = timeToMinutes(employee.work_start) ?? 480
  const workEnd = timeToMinutes(employee.work_end) ?? 1020
  const kind = recordKind(records)
  // Xom punchlar/juftliklar rejimida tushlik ayrilmaydi (haqiqiy ishlangan vaqt hisoblanadi)
  const lunch = kind === 'legacy' ? Number(employee.lunch_minutes ?? 60) : 0
  // Tungi smena: tugash boshlanishdan kichik bo'lsa (masalan 22:00-06:00) — keyingi kunga o'tadi
  const workEndAdj = workEnd > workStart ? workEnd : workEnd + 1440
  const scheduledMinutes = Math.max(0, workEndAdj - workStart - lunch)
  const scheduledHours = scheduledMinutes / 60

  // Bayram kunlari — jarima qilinmaydi (haq to'lanadi), dam kuni kabi ishlanadi
  const holidaySet = new Set(settings.holidays || [])
  const isRestDay = (dateStr) => weekendDays.includes(weekdayOfDate(dateStr)) || holidaySet.has(dateStr)

  // Smenalar — faqat shu oy (fayldagi boshqa oy yozuvlari hisobga olinmaydi)
  const allShifts = kind === 'punches'
    ? buildShiftsFromPunches(records, { workStart, workEnd })
    : kind === 'sessions' ? shiftsFromSessions(records) : buildShifts(records, { workStart, workEnd })
  const shifts = allShifts.filter((s) => s.date.startsWith(`${month}-`))

  // --- Kelmagan kunlar (kalendar bo'yicha, ish kunlari) ---
  const shiftByDate = new Map(shifts.map((s) => [s.date, s]))
  const totalDays = daysInMonth(month)
  let workingDaysPresent = 0
  const absentDates = []
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`
    if (isRestDay(dateStr)) continue // dam olish yoki bayram — kutilgan ish kuni emas
    if (shiftByDate.get(dateStr)?.inMin != null) workingDaysPresent++
    else absentDates.push(dateStr)
  }
  const expected = workingDaysPresent + absentDates.length

  // --- Kunlik hisob (attendance + soatlar) ---
  const days = []
  let regularMinutes = 0
  let overtimeMinutes = 0
  let weekendMinutes = 0
  let totalLate = 0
  let lateCount = 0
  const weekendWorkedDates = []
  const incompleteDays = []
  let presentDaysTotal = 0

  for (const s of shifts) {
    const isWeekend = isRestDay(s.date) // dam olish yoki bayram
    const { inMin, outMin } = s
    let worked = 0
    let late = 0
    let ot = 0

    if (s.sessions) {
      // Juftliklar: ishlangan vaqt = juftliklar yig'indisi (tanaffus allaqachon ayirilgan)
      if (inMin != null) {
        presentDaysTotal++
        worked = s.sessions.reduce((sum, x) => sum + (x.out - x.in), 0)
        if (!isWeekend) {
          late = Math.max(0, inMin - workStart - grace)
          ot = Math.min(Math.max(0, outMin - workEndAdj), Math.max(0, worked - scheduledMinutes))
        }
      }
    } else if (inMin != null) {
      presentDaysTotal++
      if (outMin != null) {
        worked = Math.max(0, outMin - inMin - lunch)
        if (!isWeekend) {
          late = Math.max(0, inMin - workStart - grace)
          // Overtime — faqat jadvaldagi soatlar to'liq ishlangandan keyin:
          // kech kelib kech ketish overtime emas
          ot = Math.min(Math.max(0, outMin - workEndAdj), Math.max(0, worked - scheduledMinutes))
        }
      } else {
        // faqat bitta punch — to'liq ish kuni deb hisoblaymiz (izohda "tekshiring" deyiladi)
        worked = isWeekend ? 0 : scheduledMinutes
        incompleteDays.push(s.date)
        // Punch smena boshiga yaqin — kirish (kechikish hisoblanadi); oxiriga yaqin —
        // chiqish (kirish punchi unutilgan), bundan kechikish chiqarib bo'lmaydi
        const isArrival = inMin - workStart < (workEndAdj - workStart) / 2
        if (!isWeekend && isArrival) late = Math.max(0, inMin - workStart - grace)
      }
    }

    if (isWeekend) {
      if (worked > 0) {
        weekendMinutes += worked
        weekendWorkedDates.push(s.date)
      }
    } else {
      regularMinutes += Math.max(0, worked - ot)
      overtimeMinutes += ot
    }
    if (late > 0) {
      totalLate += late
      lateCount++
    }

    // dam olish kunida faqat «Нет» bo'lishi izoh emas
    const issues = s.sessions ? s.issues.filter((i) => !(isWeekend && i.type === DAY_ISSUE.ONLY_NONE)) : null
    days.push({
      employee_id: employee.id,
      date: s.date,
      day_of_week: s.dayOfWeek || '',
      check_in: inMin != null ? minutesToClock(inMin) : null,
      check_out: outMin != null ? minutesToClock(outMin) : null,
      is_weekend: isWeekend,
      worked_minutes: round(worked),
      late_minutes: round(late),
      overtime_minutes: round(ot),
      ...(s.sessions ? { sessions: s.sessions, issues } : {}),
    })
  }

  const regularHours = round2(regularMinutes / 60)
  const overtimeHours = round2(overtimeMinutes / 60)
  const weekendHours = round2(weekendMinutes / 60)
  const totalHours = round2((regularMinutes + overtimeMinutes + weekendMinutes) / 60)

  const advanceTotal = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  const penalties = round(totalLate * penaltyPerMin)

  let baseSalary = 0
  let calculatedSalary = 0
  let overtimePay = 0
  let weekendPay = 0
  let absenceDeduction = 0

  if (employee.calc_type === 'hourly') {
    const rate = Number(employee.hourly_rate) || 0
    const regularPay = round((regularMinutes / 60) * rate)
    overtimePay = round((overtimeMinutes / 60) * rate * otMult)
    weekendPay = round((weekendMinutes / 60) * rate * weMult)
    baseSalary = regularPay
    calculatedSalary = regularPay
  } else {
    // fix oylik yoki kunbay (daily) — ikkalasi ham kunlik stavka asosida
    let dailyRate
    if (employee.calc_type === 'daily') {
      // Kunbay: kunlik summa to'g'ridan-to'g'ri kiritiladi
      dailyRate = Number(employee.daily_rate) || 0
      baseSalary = round(dailyRate * expected) // belgilangan: hamma ish kuni kelsa
    } else {
      // Fix: oylik ish kunlariga bo'linadi
      baseSalary = Number(employee.monthly_salary) || 0
      dailyRate = expected > 0 ? baseSalary / expected : 0
    }
    const hourlyEquiv = scheduledHours > 0 ? dailyRate / scheduledHours : 0
    calculatedSalary = round(dailyRate * workingDaysPresent)
    absenceDeduction = round(dailyRate * absentDates.length)
    overtimePay = round((overtimeMinutes / 60) * hourlyEquiv * otMult)
    weekendPay = round((weekendMinutes / 60) * hourlyEquiv * weMult)
  }

  const netSalary = round(calculatedSalary + overtimePay + weekendPay - penalties - advanceTotal)
  const difference = round(netSalary - baseSalary)

  // --- Farq sabablari (notes) ---
  const notes = []
  // Fix va kunbay uchun kelmagan kunlar jarima bo'ladi (soatbayda emas)
  if (employee.calc_type !== 'hourly' && absentDates.length > 0) {
    const list = absentDates.map(formatDateShort).join(', ')
    notes.push(`${absentDates.length} kun kelmagan (${list}) — ${formatSom(-absenceDeduction)} so'm`)
  }
  if (overtimeMinutes > 0) {
    notes.push(`${minutesToHours(overtimeMinutes)} soat overtime — +${formatSom(overtimePay)} so'm`)
  }
  if (weekendMinutes > 0) {
    const list = weekendWorkedDates.map(formatDateShort).join(', ')
    notes.push(`Dam olish kuni ishlagan (${list}): ${minutesToHours(weekendMinutes)} soat — +${formatSom(weekendPay)} so'm`)
  }
  if (totalLate > 0) {
    notes.push(`Jami ${totalLate} daqiqa kech qolish (${lateCount} kun) — jarima ${formatSom(-penalties)} so'm`)
  }
  for (const a of advances) {
    const when = a.date ? ` ${formatDateShort(a.date)}` : ''
    const why = a.reason ? ` (${a.reason})` : ''
    notes.push(`Avans olgan${when} — ${formatSom(-(Number(a.amount) || 0))} so'm${why}`)
  }
  if (employee.calc_type === 'hourly') {
    notes.unshift(`Ishlagan soat: ${totalHours} — asos ${formatSom(baseSalary)} so'm`)
  }
  if (incompleteDays.length > 0) {
    notes.push(`${incompleteDays.length} kun faqat bitta punch (kirish yoki chiqish yo'q) — to'liq kun hisoblandi, tekshiring (${incompleteDays.map(formatDateShort).join(', ')})`)
  }
  if (kind !== 'legacy') {
    const by = (type) => days.flatMap((d) => (d.issues || []).filter((i) => i.type === type).map((i) => ({ d, i })))
    const at = ({ d, i }) => `${formatDateShort(d.date)}${i.at != null ? ` ${clock(i.at)}` : ''}`
    const unclosed = by(DAY_ISSUE.UNCLOSED_IN)
    if (unclosed.length) notes.push(`Ketaman bosilmagan (Приход bor, Уход yo'q) — juftlik hisoblanmadi: ${listPoints(unclosed.map(at))}`)
    const orphan = by(DAY_ISSUE.ORPHAN_OUT)
    if (orphan.length) notes.push(`Oldidan Приход yo'q Уход — hisoblanmadi: ${listPoints(orphan.map(at))}`)
    const onlyNone = by(DAY_ISSUE.ONLY_NONE)
    if (onlyNone.length) notes.push(`${onlyNone.length} kun faqat «Нет» punch (Приход/Уход bosilmagan) — kelmagan hisoblandi: ${listPoints(onlyNone.map(at))}`)
    const brk = by(DAY_ISSUE.ORPHAN_BREAK)
    if (brk.length) notes.push(`Juftlanmagan tanaffus punchlari (tanaffus ayrilmadi): ${listPoints(brk.map(at))}`)
    const manual = by(DAY_ISSUE.MANUAL)
    if (manual.length) notes.push(`Qo'lda tuzatilgan kunlar: ${listPoints(manual.map(at))}`)
    const short = by(DAY_ISSUE.SHORT)
    if (short.length) notes.push(`1 daqiqadan qisqa juftlik hisoblanmadi: ${listPoints(short.map(at))}`)
  }
  if (notes.length === 0) {
    notes.push('Farq yo\'q — belgilangan oylik to\'liq hisoblandi')
  }

  const summary = {
    employee_id: employee.id,
    work_days: presentDaysTotal,
    expected_work_days: expected,
    total_hours: totalHours,
    regular_hours: regularHours,
    overtime_hours: overtimeHours,
    weekend_hours: weekendHours,
    late_count: lateCount,
    total_late_minutes: round(totalLate),
    base_salary: round(baseSalary),
    calculated_salary: round(calculatedSalary),
    overtime_pay: round(overtimePay),
    weekend_pay: round(weekendPay),
    penalties: round(penalties),
    advance_deduction: round(advanceTotal),
    net_salary: round(netSalary),
    difference: round(difference),
    notes: notes.join('\n'),
  }

  return { summary, days }
}
