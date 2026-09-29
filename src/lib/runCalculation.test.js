import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeReport, saveReport, recalculateMonth, reportWarnings, processIvmsFile } from './runCalculation'
import { dayIssueSummary } from './salaryCalc'
import { setMonthLocked } from './monthLock'
import { parseIvmsHtml } from './ivmsParser'
import { rawHtml } from './__fixtures__/rawHtml'
import * as db from './db'

const settings = {
  weekend_days: [], late_penalty_per_min: 500, grace_period_min: 5,
  overtime_multiplier: 1.5, weekend_multiplier: 2,
}
const emp = (name, extra = {}) => ({
  id: name, name, calc_type: 'hourly', hourly_rate: 25000,
  work_start: '08:00', work_end: '17:00', lunch_minutes: 60, is_active: true, ...extra,
})
const rec = (name, date, firstIn, lastOut) => ({ name, date, firstIn, lastOut, dayOfWeek: '', schedule: '' })

describe('computeReport — normallashtirilgan ism moslashtirish', () => {
  it('ortiqcha probel/registr farqi bo\'lsa ham mos keladi', () => {
    const employees = [emp('Karimov Sardor')]
    const records = [rec('  karimov   SARDOR ', '2026-08-03', '08:00:00', '17:00:00')]
    const { results, unmatchedNames } = computeReport({ records, month: '2026-08', employees, settings })
    expect(results[0].hasData).toBe(true)
    expect(unmatchedNames).toHaveLength(0)
  })

  it('apostrof variantlari mos keladi', () => {
    const employees = [emp("O'rinova Shoxista")]
    const records = [rec('Oʻrinova Shoxista', '2026-08-03', '08:00:00', '17:00:00')]
    const { results, unmatchedNames } = computeReport({ records, month: '2026-08', employees, settings })
    expect(results[0].hasData).toBe(true)
    expect(unmatchedNames).toHaveLength(0)
  })

  it('mos kelmagan ismlar dublikatsiz qaytadi (display ism bilan)', () => {
    const employees = [emp('Karimov Sardor')]
    const records = [
      rec('Yangi Ishchi', '2026-08-03', '08:00:00', '17:00:00'),
      rec('yangi ishchi', '2026-08-04', '08:00:00', '17:00:00'), // xuddi shu (normal)
    ]
    const { unmatchedNames } = computeReport({ records, month: '2026-08', employees, settings })
    expect(unmatchedNames).toEqual(['Yangi Ishchi']) // bitta marta, birinchi ko'rinishdagi ism
  })
})

describe('computeReport — IVMS ID va bir xil ismlar', () => {
  const recId = (name, personId, date) => ({ ...rec(name, date, '08:00:00', '17:00:00'), personId })

  it('IVMS ID bo\'yicha moslaydi (ism boshqacha bo\'lsa ham)', () => {
    const employees = [emp('Karimov Sardor', { ivms_person_id: '1001' })]
    const { results, unmatchedNames } = computeReport({
      records: [recId('Karimov Sardor Aka', '1001', '2026-08-03')], month: '2026-08', employees, settings,
    })
    expect(results[0].hasData).toBe(true)
    expect(unmatchedNames).toHaveLength(0)
  })

  it("bir xil ismli ikki ishchi — ikkalasiga ham davomat yozilmaydi, ogohlantiriladi", () => {
    const employees = [emp('Karimov Aziz', { id: 'a' }), emp('Karimov Aziz', { id: 'b' })]
    const { results, ambiguousNames } = computeReport({
      records: [rec('Karimov Aziz', '2026-08-03', '08:00:00', '17:00:00')], month: '2026-08', employees, settings,
    })
    expect(results.every((r) => !r.hasData)).toBe(true)
    expect(ambiguousNames).toEqual(['Karimov Aziz'])
  })

  it("fayldagi bir xil ismli ikki odam (turli ID) bitta ishchiga qo'shilib ketmaydi", () => {
    const employees = [emp('Karimov Aziz')]
    const { results, ambiguousNames } = computeReport({
      records: [recId('Karimov Aziz', '1001', '2026-08-03'), recId('Karimov Aziz', '1005', '2026-08-03')],
      month: '2026-08', employees, settings,
    })
    expect(results[0].hasData).toBe(false)
    expect(ambiguousNames).toEqual(['Karimov Aziz'])
  })

  it('ID si bor ishchi aniqlangach, qolgan bir xil ismli odam "tizimda yo\'q" bo\'ladi', () => {
    const employees = [emp('Karimov Aziz', { id: 'a', ivms_person_id: '1001' })]
    const { results, unmatched } = computeReport({
      records: [recId('Karimov Aziz', '1001', '2026-08-03'), recId('Karimov Aziz', '1005', '2026-08-04')],
      month: '2026-08', employees, settings,
    })
    expect(results[0].summary.work_days).toBe(1)
    expect(unmatched).toMatchObject([{ name: 'Karimov Aziz', personId: '1005' }])
  })

  it('ism bo\'yicha bir ma\'noli moslanganda IVMS ID eslab qolinadi', () => {
    const employees = [emp('Karimov Sardor', { id: 'k' })]
    const { learnedPersonIds } = computeReport({
      records: [recId('Karimov Sardor', '1002', '2026-08-03')], month: '2026-08', employees, settings,
    })
    expect(learnedPersonIds).toEqual([{ id: 'k', ivms_person_id: '1002' }])
  })

  it("nofaol ishchining yozuvlari \"tizimda yo'q\" deb chiqmaydi", () => {
    const employees = [emp('Karimov Sardor', { is_active: false })]
    const { results, unmatchedNames } = computeReport({
      records: [rec('Karimov Sardor', '2026-08-03', '08:00:00', '17:00:00')], month: '2026-08', employees, settings,
    })
    expect(results).toHaveLength(0)
    expect(unmatchedNames).toHaveLength(0)
  })
})

describe('saqlash va qayta hisoblash (DEMO baza)', () => {
  const dbEmp = (name) => db.createEmployee({
    name, calc_type: 'fix', monthly_salary: 3000000, work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
  })
  async function saveMonth(month, employees) {
    const s = await db.getSettings()
    const records = employees.map((e) => rec(e.name, `${month}-01`, '08:00:00', '17:00:00'))
    const computed = computeReport({ records, month, employees, settings: s })
    return saveReport({
      month, fileName: 'x.xls', source: 'manual', allDays: computed.allDays, allSummaries: computed.allSummaries, settings: s,
    })
  }
  const calcOf = async (month, id) => (await db.getCalculationsByMonth(month)).find((c) => c.employee_id === id)

  it("qayta hisoblash o'tgan oy shartlarini saqlaydi; «Qayta hisoblash» hozirgilarini qo'llaydi", async () => {
    const e = await dbEmp('Snapshot Ishchi')
    await saveMonth('2099-06', [e])
    await db.updateEmployee(e.id, { monthly_salary: 9000000 })
    await recalculateMonth('2099-06') // masalan avans o'zgargach
    expect((await calcOf('2099-06', e.id)).base_salary).toBe(3000000)
    await recalculateMonth('2099-06', { useCurrent: true })
    expect((await calcOf('2099-06', e.id)).base_salary).toBe(9000000)
  })

  it('oyga bitta hisobot: qayta saqlash eskisini almashtiradi', async () => {
    const e = await dbEmp('Takror Ishchi')
    await saveMonth('2099-07', [e])
    await saveMonth('2099-07', [e])
    expect((await db.listReports()).filter((r) => r.month === '2099-07')).toHaveLength(1)
  })

  it('qulflangan oy saqlanmaydi', async () => {
    const e = await dbEmp('Qulf Ishchi')
    await setMonthLocked('2099-08', true)
    await expect(saveMonth('2099-08', [e])).rejects.toThrow('qulflangan')
  })

  it("tarixi bor ishchini o'chirib bo'lmaydi (tarix saqlanadi)", async () => {
    const e = await dbEmp('Tarix Ishchi')
    await saveMonth('2099-09', [e])
    await expect(db.deleteEmployee(e.id)).rejects.toMatchObject({ code: '23503' })
    expect(await calcOf('2099-09', e.id)).toBeTruthy()
  })
})

describe('reportWarnings', () => {
  it("tanilmagan qatorlar haqida ogohlantiradi", () => {
    const parsed = { month: '2026-08', meta: { skipped: 2, monthCounts: { '2026-08': 10 } } }
    expect(reportWarnings(parsed, {}).join(' ')).toContain('2 ta tanilmagan qator')
  })
})

describe('xom format (Приход / Уход): saqlash, qayta hisoblash, ogohlantirishlar', () => {
  const M = '2099-10' // 2099-10-05 — Payshanba
  const punches = (name, id) => [
    [id, name, `${M}-05 08:00:00`, 'in'], [id, name, `${M}-05 12:00:00`, 'out'],
    [id, name, `${M}-05 13:00:00`, 'in'], [id, name, `${M}-05 17:00:00`, 'out'],
    [id, name, `${M}-06 08:00:00`, 'in'], // Уход bosilmagan
    [id, name, `${M}-07 09:00:00`, 'none'], // faqat «Нет»
  ]
  const setup = async (name, id) => {
    const e = await db.createEmployee({
      name, ivms_person_id: id, calc_type: 'hourly', hourly_rate: 60000, work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
    })
    const s = await db.getSettings()
    const parsed = parseIvmsHtml(rawHtml(punches(name, id)))
    const computed = computeReport({ records: parsed.records, month: M, employees: [e], settings: s })
    return { e, s, parsed, computed }
  }
  const calcOf = async (id) => (await db.getCalculationsByMonth(M)).find((c) => c.employee_id === id)

  it('hisoblaydi: haqiqiy daqiqalar, kunlik qatorlarda sessions/issues', async () => {
    const { computed } = await setup('Xom Ishchi', '901')
    const { summary } = computed.results[0]
    expect(summary.work_days).toBe(1)
    expect(summary.total_hours).toBe(9) // birinchi Приход 08:00 → oxirgi Уход 17:00, orada tushlik ayrilmaydi
    expect(computed.allDays.find((d) => d.date === `${M}-05`).sessions).toEqual([{ in: 480, out: 1020 }])
    expect(summary.notes).toContain('Ketaman bosilmagan')
  })

  it("ogohlantirishlar: yopilmagan juftliklar va faqat «Нет» kunlar soni", async () => {
    const { parsed, computed } = await setup('Ogoh Ishchi', '902')
    const text = dayIssueSummary(computed.allDays, parsed.meta.statefulDates).map((x) => x.text).join(' | ')
    expect(text).toContain('1 ta yopilmagan juftlik')
    expect(text).toContain('1 ta xodim-kun faqat «Нет»')
  })

  it("saqlangan juftliklardan qayta hisoblash: avans o'zgarsa ham, hozirgi shartlar bilan ham", async () => {
    const { e, s, computed } = await setup('Qayta Ishchi', '903')
    await saveReport({
      month: M, fileName: 'raw.xls', source: 'manual', allDays: computed.allDays, allSummaries: computed.allSummaries, settings: s,
    })
    const saved = (await db.getAttendanceByReport((await db.getReportByMonth(M)).id)).find((a) => a.date === `${M}-05`)
    expect(saved.sessions).toEqual([{ in: 480, out: 1020 }])

    const before = await calcOf(e.id)
    await db.createAdvance({ employee_id: e.id, amount: 100000, date: `${M}-10`, reason: 'x', month: M })
    await recalculateMonth(M) // snapshot shartlari + avans
    const afterAdvance = await calcOf(e.id)
    expect(afterAdvance.net_salary).toBe(before.net_salary - 100000)
    expect(afterAdvance.total_hours).toBe(before.total_hours)
    expect(afterAdvance.notes).toContain('Ketaman bosilmagan') // izohlar saqlangan issues dan

    await db.updateEmployee(e.id, { hourly_rate: 90000 })
    await recalculateMonth(M, { useCurrent: true })
    expect((await calcOf(e.id)).calculated_salary).toBe(9 * 90000)
    // kunlik qatorlar ham yangilandi va juftliklar saqlanib qoldi
    const rows = await db.getAttendanceByReport((await db.getReportByMonth(M)).id)
    expect(rows.find((a) => a.date === `${M}-05`).sessions).toHaveLength(1)
  })
})

describe("qo'lda tuzatish (dayOverrides)", () => {
  const M = '2099-11' // 2099-11-05 — Payshanba
  it("yopilmagan kunni tuzatish: kun hisoblanadi, izoh «Ketaman bosilmagan» o'rniga «Qo'lda tuzatilgan»", async () => {
    const e = await db.createEmployee({
      name: 'Tuzatish Ishchi', ivms_person_id: '950', calc_type: 'hourly', hourly_rate: 60000, work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
    })
    const s = await db.getSettings()
    const parsed = parseIvmsHtml(rawHtml([
      ['950', 'Tuzatish Ishchi', `${M}-05 08:00:00`, 'in'], ['950', 'Tuzatish Ishchi', `${M}-05 17:00:00`, 'out'],
      ['950', 'Tuzatish Ishchi', `${M}-06 08:00:00`, 'in'], // Уход bosilmagan
    ].map((r) => r)))
    const computed = computeReport({ records: parsed.records, month: M, employees: [e], settings: s })
    await saveReport({ month: M, fileName: 'x.xls', source: 'manual', allDays: computed.allDays, allSummaries: computed.allSummaries, settings: s })
    const calc = async () => (await db.getCalculationsByMonth(M)).find((c) => c.employee_id === e.id)
    expect((await calc()).work_days).toBe(1)
    expect((await calc()).notes).toContain('Ketaman bosilmagan')

    await recalculateMonth(M, { dayOverrides: [{ employeeId: e.id, date: `${M}-06`, sessions: [{ in: 480, out: 1020 }] }] })
    const after = await calc()
    expect(after.work_days).toBe(2)
    expect(after.total_hours).toBe(18)
    expect(after.notes).not.toContain('Ketaman bosilmagan')
    expect(after.notes).toContain("Qo'lda tuzatilgan kunlar: 06.11")

    // keyingi qayta hisoblash (masalan avans) tuzatishni saqlaydi
    await recalculateMonth(M)
    expect((await calc()).work_days).toBe(2)

    // yangi kun qo'shish va kunni «kelmagan» qilish
    await recalculateMonth(M, { dayOverrides: [
      { employeeId: e.id, date: `${M}-07`, sessions: [{ in: 480, out: 720 }] },
      { employeeId: e.id, date: `${M}-05`, sessions: [] },
    ] })
    expect((await calc()).total_hours).toBe(9 + 4) // 06-kun 08:00–17:00 (9 soat) + 07-kun 4 soat
  })
})

describe("qo'lda tuzatish: chiqish ertasi kuni (sana + soat)", () => {
  const M = '2099-12'
  it("faqat «Нет» kun: Приход 17:00, Уход ertasi 08:20 — smena Приход sanasiga yoziladi, ertasi kuni qatori bo'shatiladi", async () => {
    const e = await db.createEmployee({
      name: 'Kechki Ishchi', ivms_person_id: '960', calc_type: 'fix', monthly_salary: 3000000, work_start: '08:00', work_end: '17:00',
      two_shifts: true, duty_days: 15,
    })
    const s = await db.getSettings()
    const parsed = parseIvmsHtml(rawHtml([
      ['960', 'Kechki Ishchi', `${M}-10 17:00:00`, 'none'], ['960', 'Kechki Ishchi', `${M}-11 08:20:00`, 'none'],
    ]))
    const computed = computeReport({ records: parsed.records, month: M, employees: [e], settings: s })
    await saveReport({ month: M, fileName: 'x.xls', source: 'manual', allDays: computed.allDays, allSummaries: computed.allSummaries, settings: s })
    await recalculateMonth(M, { dayOverrides: [
      { employeeId: e.id, date: `${M}-10`, sessions: [{ in: 1020, out: 1940 }] },
      { employeeId: e.id, date: `${M}-11`, sessions: [] },
    ] })
    const calc = (await db.getCalculationsByMonth(M)).find((c) => c.employee_id === e.id)
    expect(calc.work_days).toBe(1)
    expect(calc.total_hours).toBe(15.33) // 17:00 → ertasi 08:20
    expect(calc.calculated_salary).toBe(200000) // 3 000 000 / 15 × 1 smena
    const rows = await db.getAttendanceByReport((await db.getReportByMonth(M)).id)
    expect(rows.find((a) => a.date === `${M}-10`).sessions).toEqual([{ in: 1020, out: 1940 }])
    expect(rows.find((a) => a.date === `${M}-11`).issues).toEqual([{ type: 'manual', at: null }])
  })
})

describe('anonim fixture (haqiqiy fayldan 4 xodim) — oxirigacha hisoblash', () => {
  const html = readFileSync(resolve(process.cwd(), 'src/lib/__fixtures__/ivms_raw_anon.xls'), 'utf8')
  const parsed = parseIvmsHtml(html)
  const employees = ['101', '102', '103', '104'].map((id) => ({
    id, name: `Test ${id}`, ivms_person_id: id, is_active: true,
    calc_type: 'hourly', hourly_rate: 60000, work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
  }))
  const computed = computeReport({ records: parsed.records, month: '2026-09', employees, settings: { ...settings, weekend_days: [0] } })
  const of = (id) => computed.results.find((r) => r.employee.id === id)
  const dayOf = (id, date) => computed.allDays.filter((d) => d.employee_id === id).find((d) => d.date === date)

  it("hamma xodim ID bo'yicha moslashadi", () => {
    expect(computed.unmatched).toHaveLength(0)
    expect(computed.results.every((r) => r.hasData)).toBe(true)
  })

  it('takroriy Приход/Уход klasterlari bitta juftlikka aylanadi', () => {
    expect(dayOf('101', '2026-09-26').sessions).toHaveLength(1) // 16:16 Приход ×2 … 18:23 Уход ×2
    expect(dayOf('102', '2026-09-28').sessions).toHaveLength(1) // 06:53 Приход ×3 + 08:11 Приход, 17:24 Уход
  })

  it('Уход bosilmagan Приход hisoblanmaydi', () => {
    expect(dayOf('103', '2026-09-28')).toMatchObject({ worked_minutes: 0, sessions: [] })
    expect(of('103').summary.notes).toContain('Ketaman bosilmagan')
  })

  it('ogohlantirishlar: yopilmagan juftlik va faqat «Нет» kunlar', () => {
    const text = dayIssueSummary(computed.allDays, parsed.meta.statefulDates).map((x) => x.text).join(' | ')
    expect(text).toMatch(/\d+ ta yopilmagan juftlik/)
    expect(text).toMatch(/\d+ ta xodim-kun faqat «Нет»/)
    expect(text).toContain('26.09–28.09')
  })
})

describe('agent fayli: faqat «Нет» bo\'lsa oy ustidan yozilmaydi', () => {
  const M = '2097-05'
  const onlyNone = rawHtml([['980', 'Faqat Net', `${M}-05 08:00:00`, 'none'], ['980', 'Faqat Net', `${M}-05 17:00:00`, 'none']])
  const withIn = rawHtml([['980', 'Faqat Net', `${M}-05 08:00:00`, 'in'], ['980', 'Faqat Net', `${M}-05 17:00:00`, 'out']])

  it('agent manbasi: rad etiladi, saqlanmaydi', async () => {
    await expect(processIvmsFile({ html: onlyNone, fileName: 'a.xls', source: 'agent' })).rejects.toThrow('faqat «Нет»')
    expect(await db.getReportByMonth(M)).toBeNull()
  })
  it("qo'lda yuklash ruxsat; Приход/Уход bor agent fayli o'tadi", async () => {
    await expect(processIvmsFile({ html: onlyNone, fileName: 'm.xls', source: 'manual' })).resolves.toBeTruthy()
    await expect(processIvmsFile({ html: withIn, fileName: 'a.xls', source: 'agent' })).resolves.toBeTruthy()
  })
})
