// Oylik hisoblash dvigateli.
//
// Har bir ishchi uchun IVMS kunlik yozuvlari, sozlamalar va avanslar asosida
// oylikni hisoblaydi. Eng muhimi — belgilangan va hisoblangan oylik o'rtasidagi
// FARQ SABABLARINI batafsil yozadi (notes).
import {
  timeToMinutes, weekdayOfDate, daysInMonth, formatSom, formatDateShort, minutesToHours,
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

  // --- Kelmagan kunlar (kalendar bo'yicha, ish kunlari) ---
  const recByDate = new Map(records.map((r) => [r.date, r]))
  const totalDays = daysInMonth(month)
  let workingDaysPresent = 0
  const absentDates = []
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`
    if (isRestDay(dateStr)) continue // dam olish yoki bayram — kutilgan ish kuni emas
    const rec = recByDate.get(dateStr)
    const present = rec && timeToMinutes(rec.firstIn) != null
    if (present) workingDaysPresent++
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
  const lateDays = []
  const weekendWorkedDates = []
  const incompleteDays = []
  let presentDaysTotal = 0

  for (const r of records) {
    const isWeekend = isRestDay(r.date) // dam olish yoki bayram
    const inMin = timeToMinutes(r.firstIn)
    const outMin = timeToMinutes(r.lastOut)
    let worked = 0
    let late = 0
    let ot = 0

    if (inMin != null) {
      presentDaysTotal++
      if (outMin != null && outMin !== inMin) {
        // Yarim tundan o'tgan bo'lsa (chiqish < kirish) — keyingi kunga o'tadi
        const outAdj = outMin > inMin ? outMin : outMin + 1440
        const raw = outAdj - inMin
        worked = Math.max(0, raw - lunch)
        if (!isWeekend) ot = Math.max(0, outAdj - workEndAdj)
      } else {
        // faqat bitta punch — to'liq ish kuni deb hisoblaymiz
        worked = isWeekend ? 0 : scheduledMinutes
        incompleteDays.push(r.date)
      }
      if (!isWeekend) late = Math.max(0, inMin - workStart - grace)
    }

    if (isWeekend) {
      if (worked > 0) {
        weekendMinutes += worked
        weekendWorkedDates.push(r.date)
      }
    } else {
      regularMinutes += Math.max(0, worked - ot)
      overtimeMinutes += ot
    }
    if (late > 0) {
      totalLate += late
      lateCount++
      lateDays.push(r.date)
    }

    days.push({
      employee_id: employee.id,
      date: r.date,
      day_of_week: r.dayOfWeek || '',
      check_in: r.firstIn || null,
      check_out: r.lastOut || null,
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
    notes.push(`${incompleteDays.length} kun chiqish vaqti yo'q — to'liq kun hisoblandi (${incompleteDays.map(formatDateShort).join(', ')})`)
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
