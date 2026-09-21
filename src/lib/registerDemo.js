// DEMO rejim: sintetik oylik attendance + hisob-kitob generatori.
// mockDb.seedIfEmpty() shu builderni chaqiradi (Supabase sozlanmagan bo'lsa).
import { registerDemoReportBuilder } from './db'
import { calcEmployeeSalary } from './salaryCalc'
import { previousMonth, currentMonth, daysInMonth, weekdayOfDate, timeToMinutes, WEEKDAY_SHORT_UZ } from './format'

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad2 = (n) => String(n).padStart(2, '0')
function timeStr(min) {
  const m = Math.max(0, Math.min(1439, Math.round(min)))
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}:00`
}

function generateRecords(employee, month, settings, rng) {
  const weekendDays = settings.weekend_days || [0]
  const startMin = timeToMinutes(employee.work_start) ?? 480
  const endMin = timeToMinutes(employee.work_end) ?? 1020
  const isGuard = /qorovul/i.test(employee.position || '')
  const total = daysInMonth(month)
  const records = []

  for (let d = 1; d <= total; d++) {
    const date = `${month}-${pad2(d)}`
    const wd = weekdayOfDate(date)
    const isWeekend = weekendDays.includes(wd)
    const dayOfWeek = WEEKDAY_SHORT_UZ[wd]

    let present
    if (isWeekend) present = isGuard ? true : rng() < 0.12
    else present = rng() < 0.93

    if (!present) {
      records.push({ date, dayOfWeek, firstIn: '-', lastOut: '-' })
      continue
    }

    let inMin = startMin
    if (!isWeekend && rng() < 0.22) inMin += 3 + Math.floor(rng() * 22)
    else inMin += -3 + Math.floor(rng() * 4)

    let outMin = endMin
    if (rng() < 0.16) outMin += 30 + Math.floor(rng() * 140)
    else outMin += -5 + Math.floor(rng() * 8)

    records.push({ date, dayOfWeek, firstIn: timeStr(inMin), lastOut: timeStr(outMin) })
  }
  return records
}

registerDemoReportBuilder(({ employees, settings, commit }) => {
  const month = previousMonth(currentMonth())

  // Bir nechta ishchiga avans (individual)
  const advancesList = []
  const advByEmp = new Map()
  const advancePlan = [
    { idx: 1, amount: 500000, reason: 'shaxsiy' },
    { idx: 4, amount: 800000, reason: 'oilaviy' },
    { idx: 7, amount: 1000000, reason: 'avans' },
  ]
  for (const p of advancePlan) {
    const emp = employees[p.idx]
    if (!emp) continue
    const adv = { employee_id: emp.id, amount: p.amount, date: `${month}-15`, reason: p.reason, month }
    advancesList.push(adv)
    advByEmp.set(emp.id, [adv])
  }

  const allDays = []
  const allSummaries = []
  employees.forEach((employee, ei) => {
    const rng = mulberry32(1000 + ei * 7 + month.length)
    const records = generateRecords(employee, month, settings, rng)
    const { summary, days } = calcEmployeeSalary({
      employee,
      records,
      settings,
      advances: advByEmp.get(employee.id) || [],
      month,
    })
    allDays.push(...days)
    allSummaries.push(summary)
  })

  commit({
    report: { month, file_name: `ivms_${month}.xls`, source: 'agent' },
    attendance: allDays,
    calculations: allSummaries,
    advances: advancesList,
  })
})
