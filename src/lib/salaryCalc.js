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
const SPLIT_GAP = 8 * 3600 // oxirgi Уход'dan shuncha vaqt o'tib kelgan Приход — yangi smena (soniya)
const MIN_MAX_SESSION = 16 * 60 // juftlik shundan uzun bo'lmaydi (yoki jadval + 4 soat)
const DUTY_MAX_SESSION = 30 * 60 // sutkalik smena: 24 soat + 6 soat zaxira
const FREE_MAX_SESSION = 18 * 60 // ikki xil smena (jadvalsiz): juftlik 18 soatgacha
const NIGHT_MORNING_END = 10 * 60 // tungi smena: ertalabki 10:00 gacha bo'lgan punchlar oldingi kun smenasiga tegishli (faqat «Нет» ko'rsatish uchun)

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
 * Faqat Приход/Уход: smena boshlanishi — birinchi Приход, tugashi — oxirgi Уход
 * (orada bir necha Приход/Уход bo'lsa ham bitta smena; tanaffus/tushlik ayrilmaydi).
 *  - «Нет» va tanaffus punchlari hisobga olinmaydi;
 *  - smena sanasi — birinchi Приход sanasi (Уход ertasi kuni bo'lsa ham);
 *  - oxirgi Уход'dan keyin SPLIT_GAP dan uzoq Приход — yangi smena; smena boshidan `cap` dan uzoq
 *    punch eski smenaga tegishli emas;
 *  - Уход bosilmagan smena (Уход umuman yo'q) hisoblanmaydi, Приход'siz Уход hisoblanmaydi — `issues` ga yoziladi;
 *  - tungi jadvalli ishchida "o'rta nuqta"dan oldingi Приход oldingi kun smenasiga tegishli.
 */
export function buildShiftsFromPunches(punches, { workStart, workEnd, duty24 = false, free = false }) {
  // free: jadvalsiz (ikki xil smena) — faqat Приход/Уход; juftlik har doim Приход sanasiga tegishli
  const night = !free && workEnd < workStart
  const mid = (workStart + workEnd) / 2
  const cap = (free ? FREE_MAX_SESSION : duty24 ? DUTY_MAX_SESSION : maxSessionMinutes(workStart, workEnd)) * 60

  // Kun guruhi: kunduzgi — kalendar sana; tungi jadvalda ertalabki 10:00 gacha — oldingi kun smenasi
  const groups = new Map() // sana -> { stateful, none: [daqiqalar (guruh sanasi 00:00 dan)] }
  const items = []
  for (const p of punches) {
    if (!p?.date) continue
    const min = timeToMinutes(p.time)
    if (min == null) continue
    const sec = dayNumber(p.date) * 86400 + min * 60 + (parseInt(String(p.time).split(':')[2], 10) || 0)
    const stateful = p.state === PUNCH_STATE.IN || p.state === PUNCH_STATE.OUT // tanaffus punchlari «Нет» kabi
    const early = night && min < NIGHT_MORNING_END
    const gDate = early ? addDays(p.date, -1) : p.date
    if (!groups.has(gDate)) groups.set(gDate, { stateful: false, none: [] })
    const g = groups.get(gDate)
    if (stateful) {
      g.stateful = true
      items.push({ sec, state: p.state, date: p.date, min })
    } else g.none.push(min + (early ? 1440 : 0))
  }
  items.sort((a, b) => a.sec - b.sec)

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

  // Smenani yopadi: birinchi Приход → oxirgi Уход (Уход bo'lmasa — yopilmagan)
  let cur = null // { sec, date, lastOut }
  const finish = () => {
    if (!cur) return
    if (cur.lastOut == null) issue(cur.date, DAY_ISSUE.UNCLOSED_IN, cur.sec)
    else {
      const a = minutesOn(cur.date, cur.sec)
      const b = minutesOn(cur.date, cur.lastOut)
      if (b > a) shiftOf(cur.date).sessions.push({ in: a, out: b })
      else issue(cur.date, DAY_ISSUE.SHORT, cur.sec)
    }
    cur = null
  }

  for (const it of items) {
    if (it.state !== PUNCH_STATE.IN && it.state !== PUNCH_STATE.OUT) continue // tanaffus punchlari e'tiborsiz
    if (cur && it.sec - cur.sec > cap) finish() // juda uzoq — eski smenaga tegishli emas
    if (it.state === PUNCH_STATE.IN) {
      if (cur && cur.lastOut != null && it.sec - cur.lastOut > SPLIT_GAP) finish() // yangi smena
      if (!cur) cur = { sec: it.sec, date: anchorOf(it), lastOut: null }
    } else if (cur) cur.lastOut = it.sec
    else issue(anchorOf(it), DAY_ISSUE.ORPHAN_OUT, it.sec)
  }
  finish()

  // Faqat «Нет» punch bo'lgan kunlar: shu kundagi birinchi va oxirgi punch ko'rsatiladi
  for (const [date, g] of groups) {
    if (g.stateful) continue
    const s = shiftOf(date)
    if (!s.sessions.length && !s.issues.length) {
      s.issues.push({ type: DAY_ISSUE.ONLY_NONE, at: Math.min(...g.none), last: Math.max(...g.none), count: g.none.length })
    }
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
  const kind = recordKind(records)
  // Sutkalik smena (24 soat): faqat xom punchlar/juftliklar rejimida; dam olish kuni, overtime va kelmagan kun jarimasi yo'q
  const duty = !!employee.duty_24h && kind !== 'legacy'
  // Ikki xil smena (kunduzi/kechasi): jadval yo'q, faqat Приход/Уход; kechikish va overtime yo'q
  const free = !duty && !!employee.two_shifts && kind !== 'legacy'
  const shiftBased = duty || free // smena soni bo'yicha hisob: dam olish kuni, kelmagan kun jarimasi yo'q
  const weekendDays = employeeRestDays(employee, settings)
  const grace = numOr(employee.grace_period_min, settings.grace_period_min)
  const penaltyPerMin = numOr(employee.late_penalty_per_min, settings.late_penalty_per_min)
  const otMult = numOr(employee.overtime_multiplier, settings.overtime_multiplier) || 1
  const weMult = numOr(employee.weekend_multiplier, settings.weekend_multiplier) || 1

  const workStart = timeToMinutes(employee.work_start) ?? 480
  const workEnd = duty ? workStart : (timeToMinutes(employee.work_end) ?? 1020) // sutkalik: tugash = boshlanish + 24 soat
  // Xom punchlar/juftliklar rejimida tushlik ayrilmaydi (haqiqiy ishlangan vaqt hisoblanadi)
  const lunch = kind === 'legacy' ? Number(employee.lunch_minutes ?? 60) : 0
  // Tungi smena: tugash boshlanishdan kichik bo'lsa (masalan 22:00-06:00) — keyingi kunga o'tadi
  const workEndAdj = workEnd > workStart ? workEnd : workEnd + 1440
  const scheduledMinutes = Math.max(0, workEndAdj - workStart - lunch)
  const scheduledHours = scheduledMinutes / 60

  // Bayram kunlari — jarima qilinmaydi (haq to'lanadi), dam kuni kabi ishlanadi
  const holidaySet = new Set(settings.holidays || [])
  const isRestDay = (dateStr) => !shiftBased && (weekendDays.includes(weekdayOfDate(dateStr)) || holidaySet.has(dateStr))

  // Smenalar — faqat shu oy (fayldagi boshqa oy yozuvlari hisobga olinmaydi)
  const allShifts = kind === 'punches'
    ? buildShiftsFromPunches(records, { workStart, workEnd, duty24: duty, free })
    : kind === 'sessions' ? shiftsFromSessions(records) : buildShifts(records, { workStart, workEnd })
  const shifts = allShifts.filter((s) => s.date.startsWith(`${month}-`))

  // --- Kelmagan kunlar (kalendar bo'yicha, ish kunlari) ---
  const shiftByDate = new Map(shifts.map((s) => [s.date, s]))
  const totalDays = daysInMonth(month)
  let workingDaysPresent = 0
  const absentDates = []
  if (shiftBased) {
    workingDaysPresent = shifts.filter((s) => s.inMin != null).length
  } else {
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`
      if (isRestDay(dateStr)) continue // dam olish yoki bayram — kutilgan ish kuni emas
      if (shiftByDate.get(dateStr)?.inMin != null) workingDaysPresent++
      else absentDates.push(dateStr)
    }
  }
  // sutkalik: kutilgan sutkalar soni ishchi sozlamasidan (kelmagan kun jarimasi yo'q)
  const expected = shiftBased ? (Number(employee.duty_days) || 10) : workingDaysPresent + absentDates.length

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
          late = free ? 0 : Math.max(0, inMin - workStart - grace)
          ot = shiftBased ? 0 : Math.min(Math.max(0, outMin - workEndAdj), Math.max(0, worked - scheduledMinutes))
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
  if (duty) notes.unshift(`Sutkalik smena: ${workingDaysPresent} sutka ishladi (kutilgan ${expected})`)
  if (free) notes.unshift(`Ikki xil smena: ${workingDaysPresent} smena ishladi (kutilgan ${expected})`)
  if (kind !== 'legacy') {
    const by = (type) => days.flatMap((d) => (d.issues || []).filter((i) => i.type === type).map((i) => ({ d, i })))
    const at = ({ d, i }) => `${formatDateShort(d.date)}${i.at != null ? ` ${clock(i.at)}${i.last != null && i.last !== i.at ? `–${clock(i.last)}` : ''}` : ''}`
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

/** Kunlik muammolar bo'yicha ogohlantirishlar: [{ type, count, text }] (UI da bosib ko'riladi) */
export function dayIssueSummary(days, statefulDates = []) {
  const c = summarizeDayIssues(days)
  const out = []
  if (c.unclosed > 0) out.push({ type: DAY_ISSUE.UNCLOSED_IN, count: c.unclosed, text: `${c.unclosed} ta yopilmagan juftlik (Приход bor, Уход bosilmagan) — hisoblanmadi.` })
  if (c.onlyNone > 0) {
    const d = statefulDates || []
    const range = d.length
      ? ` Приход/Уход belgilangan kunlar: ${d.length === 1 ? formatDateShort(d[0]) : `${formatDateShort(d[0])}–${formatDateShort(d[d.length - 1])}`}.`
      : ''
    out.push({ type: DAY_ISSUE.ONLY_NONE, count: c.onlyNone, text: `${c.onlyNone} ta xodim-kun faqat «Нет» punchlardan iborat — kelmagan hisoblandi.${range}` })
  }
  if (c.orphanOut > 0) out.push({ type: DAY_ISSUE.ORPHAN_OUT, count: c.orphanOut, text: `${c.orphanOut} ta Уход oldidan Приход yo'q — hisoblanmadi.` })
  if (c.orphanBreak > 0) out.push({ type: DAY_ISSUE.ORPHAN_BREAK, count: c.orphanBreak, text: `${c.orphanBreak} ta tanaffus punchi juftlanmadi — tanaffus ayrilmadi.` })
  return out
}
