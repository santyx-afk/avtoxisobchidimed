// Oylik hisoblash dvigateli.
//
// Har bir ishchi uchun IVMS kunlik yozuvlari, sozlamalar va avanslar asosida
// oylikni hisoblaydi. Eng muhimi — belgilangan va hisoblangan oylik o'rtasidagi
// FARQ SABABLARINI batafsil yozadi (notes).
import {
  timeToMinutes, weekdayOfDate, daysInMonth, formatSom, formatDateShort, minutesToHours,
  minutesToClock, addDays,
} from './format'

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
  const lunch = Number(employee.lunch_minutes ?? 60)
  // Tungi smena: tugash boshlanishdan kichik bo'lsa (masalan 22:00-06:00) — keyingi kunga o'tadi
  const workEndAdj = workEnd > workStart ? workEnd : workEnd + 1440
  const scheduledMinutes = Math.max(0, workEndAdj - workStart - lunch)
  const scheduledHours = scheduledMinutes / 60

  // Bayram kunlari — jarima qilinmaydi (haq to'lanadi), dam kuni kabi ishlanadi
  const holidaySet = new Set(settings.holidays || [])
  const isRestDay = (dateStr) => weekendDays.includes(weekdayOfDate(dateStr)) || holidaySet.has(dateStr)

  // Smenalar — faqat shu oy (fayldagi boshqa oy yozuvlari hisobga olinmaydi)
  const shifts = buildShifts(records, { workStart, workEnd })
    .filter((s) => s.date.startsWith(`${month}-`))

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

    if (inMin != null) {
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
