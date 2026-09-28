import { describe, it, expect } from 'vitest'
import { calcEmployeeSalary, buildShiftsFromPunches } from './salaryCalc'

// Xom punchlar (Приход / Уход) bo'yicha KELDI-KETTI hisoblash
const settings = {
  late_penalty_per_min: 500, grace_period_min: 5, overtime_multiplier: 1.5, weekend_multiplier: 2, weekend_days: [0],
}
const hourly = {
  id: 'h', calc_type: 'hourly', hourly_rate: 60000, work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
}
// 2026-09-08 — Seshanba
const p = (date, time, state) => ({ date, time, state })
const D8 = '2026-09-08'
const calc = (records, employee = hourly, s = settings) =>
  calcEmployeeSalary({ employee, settings: s, month: '2026-09', records })
const day = (res, date) => res.days.find((d) => d.date === date)

describe('juftlash: bir necha juftlikli kun', () => {
  const res = calc([
    p(D8, '08:02:10', 'in'), p(D8, '13:10:05', 'out'), p(D8, '14:00:00', 'in'), p(D8, '18:05:30', 'out'),
  ])

  it('juftliklar alohida saqlanadi va yig\'iladi', () => {
    expect(day(res, D8).sessions).toEqual([{ in: 482, out: 790 }, { in: 840, out: 1085 }])
    expect(day(res, D8).worked_minutes).toBe(308 + 245)
    expect(day(res, D8).check_in).toBe('08:02:00')
    expect(day(res, D8).check_out).toBe('18:05:00')
  })

  it("tushlik (lunch_minutes) ayrilmaydi; overtime haqiqiy daqiqalardan (18:05 − 17:00, jadval 9 soat)", () => {
    expect(day(res, D8).overtime_minutes).toBe(13) // min(65, 553 − 540)
    expect(res.summary.regular_hours).toBe(9)
    expect(res.summary.overtime_pay).toBe(19500) // 13/60 × 60000 × 1.5
    expect(res.summary.net_salary).toBe(540000 + 19500)
  })

  it('kechikish — birinchi Приход bo\'yicha (08:02, grace 5 — kechikish yo\'q)', () => {
    expect(res.summary.total_late_minutes).toBe(0)
    const late = calc([p(D8, '08:20:00', 'in'), p(D8, '12:00:00', 'out'), p(D8, '13:00:00', 'in'), p(D8, '17:00:00', 'out')])
    expect(late.summary.total_late_minutes).toBe(15) // 20 − grace 5, ikkinchi juftlik hisobga kirmaydi
  })
})

describe('juftlash: tanaffus (Уход при перерыве → Приход при перерыве)', () => {
  it('tanaffus ish vaqtidan ayriladi', () => {
    const res = calc([
      p(D8, '08:00:00', 'in'), p(D8, '12:00:00', 'break_out'), p(D8, '12:30:00', 'break_in'), p(D8, '17:00:00', 'out'),
    ])
    expect(day(res, D8).sessions).toEqual([{ in: 480, out: 720 }, { in: 750, out: 1020 }])
    expect(day(res, D8).worked_minutes).toBe(510)
  })

  it("teskari tartib (Приход при перерыве → Уход при перерыве) tanaffus emas: ayrilmaydi, izoh yoziladi", () => {
    const res = calc([
      p(D8, '08:00:00', 'in'), p(D8, '12:00:00', 'break_in'), p(D8, '12:30:00', 'break_out'), p(D8, '17:00:00', 'out'),
    ])
    expect(day(res, D8).worked_minutes).toBe(540)
    expect(day(res, D8).issues.map((i) => i.type)).toEqual(['orphan_break', 'orphan_break'])
    expect(res.summary.notes).toContain('Juftlanmagan tanaffus')
  })

  it("Приход'siz tanaffus punchi e'tiborsiz (juftlik ochilmaydi)", () => {
    const res = calc([p(D8, '08:00:00', 'break_out'), p(D8, '09:00:00', 'in'), p(D8, '17:00:00', 'out')])
    expect(day(res, D8).sessions).toEqual([{ in: 540, out: 1020 }])
    expect(day(res, D8).issues).toEqual([{ type: 'orphan_break', at: 480 }])
  })
})

describe('juftlash: takroriy bosishlar (2 daqiqa ichida)', () => {
  it('Приход — birinchisi, Уход — oxirgisi olinadi', () => {
    const res = calc([
      p(D8, '08:00:00', 'in'), p(D8, '08:00:40', 'in'), p(D8, '08:01:30', 'in'),
      p(D8, '17:00:00', 'out'), p(D8, '17:00:50', 'out'), p(D8, '17:02:00', 'out'),
    ])
    expect(day(res, D8).sessions).toEqual([{ in: 480, out: 1022 }])
    expect(day(res, D8).issues).toEqual([])
  })

  it("2 daqiqadan keyingi ikkinchi Приход (ochiq juftlik) — takror, birinchisi qoladi", () => {
    const res = calc([p(D8, '06:53:00', 'in'), p(D8, '08:11:00', 'in'), p(D8, '17:24:00', 'out')])
    expect(day(res, D8).sessions).toEqual([{ in: 413, out: 1044 }])
  })

  it("«Нет» punchlar hisobga olinmaydi (juftlash va siqishni buzmaydi)", () => {
    const res = calc([
      p(D8, '07:59:00', 'none'), p(D8, '08:00:00', 'in'), p(D8, '08:00:20', 'none'), p(D8, '08:00:40', 'in'),
      p(D8, '17:00:00', 'out'), p(D8, '17:05:00', 'none'),
    ])
    expect(day(res, D8).sessions).toEqual([{ in: 480, out: 1020 }])
  })
})

describe('juftlash: Уход bosilmagan kun', () => {
  it("juftlik hisoblanmaydi, kun kelmagan, izohda «Ketaman bosilmagan»", () => {
    const fix = { ...hourly, calc_type: 'fix', monthly_salary: 3000000 }
    const res = calc([p(D8, '08:00:00', 'in'), p('2026-09-09', '08:00:00', 'in'), p('2026-09-09', '17:00:00', 'out')], fix,
      { ...settings, weekend_days: [] })
    expect(day(res, D8)).toMatchObject({ worked_minutes: 0, check_in: null, sessions: [], issues: [{ type: 'unclosed_in', at: 480 }] })
    expect(res.summary.work_days).toBe(1)
    expect(res.summary.notes).toContain('Ketaman bosilmagan')
    expect(res.summary.notes).toContain('08.09 08:00')
    expect(res.summary.notes).toContain('kun kelmagan') // 29 ish kuni kelmagan, shu jumladan 08.09
    expect(res.summary.notes).toMatch(/29 kun kelmagan[^\n]*08\.09/)
  })

  it("kunbay: yopilmagan kun to'lanmaydi, to'liq juftlikli kun to'lanadi", () => {
    const daily = { ...hourly, calc_type: 'daily', daily_rate: 100000 }
    const res = calc([
      p(D8, '08:00:00', 'in'), p(D8, '17:00:00', 'out'),
      p('2026-09-09', '08:00:00', 'in'), p('2026-09-09', '17:00:00', 'out'),
      p('2026-09-10', '08:00:00', 'in'),
    ], daily, { ...settings, weekend_days: [] })
    expect(res.summary.work_days).toBe(2)
    expect(res.summary.calculated_salary).toBe(200000)
  })

  it("to'liq juftlikdan keyingi yopilmagan Приход — faqat o'sha juftlik hisoblanmaydi", () => {
    const res = calc([p(D8, '08:00:00', 'in'), p(D8, '12:00:00', 'out'), p(D8, '14:00:00', 'in')])
    expect(day(res, D8).sessions).toEqual([{ in: 480, out: 720 }])
    expect(day(res, D8).issues).toEqual([{ type: 'unclosed_in', at: 840 }])
    expect(res.summary.work_days).toBe(1)
  })

  it("ertasi kuni ham Уход bosilmasa, eski Приход keyingi kun Уход'iga ulanmaydi", () => {
    const res = calc([p(D8, '08:00:00', 'in'), p('2026-09-09', '08:00:00', 'in'), p('2026-09-09', '17:00:00', 'out')])
    expect(day(res, D8).sessions).toEqual([])
    expect(day(res, '2026-09-09').sessions).toEqual([{ in: 480, out: 1020 }])
  })
})

describe('juftlash: faqat «Нет» va Приход\'siz Уход', () => {
  it("faqat «Нет» bo'lgan kun — kelmagan, izoh yoziladi", () => {
    const res = calc([p(D8, '09:00:00', 'none'), p(D8, '09:05:00', 'none')])
    expect(day(res, D8)).toMatchObject({ sessions: [], issues: [{ type: 'only_none', at: 540, last: 545, count: 2 }] })
    expect(res.summary.notes).toContain('08.09 09:00–09:05')
    expect(res.summary.work_days).toBe(0)
    expect(res.summary.notes).toContain('faqat «Нет»')
  })

  it("dam olish kunidagi faqat «Нет» izoh bo'lmaydi", () => {
    const res = calc([p('2026-09-13', '09:00:00', 'none')]) // yakshanba
    expect(day(res, '2026-09-13').issues).toEqual([])
  })

  it("oldidan Приход yo'q Уход hisoblanmaydi, izoh yoziladi", () => {
    const res = calc([p(D8, '17:00:00', 'out')])
    expect(day(res, D8)).toMatchObject({ worked_minutes: 0, issues: [{ type: 'orphan_out', at: 1020 }] })
    expect(res.summary.work_days).toBe(0)
    expect(res.summary.notes).toContain("Oldidan Приход yo'q Уход")
  })

  it("1 daqiqadan qisqa juftlik (sinov bosishi) kun sifatida sanalmaydi", () => {
    const res = calc([p(D8, '08:00:05', 'in'), p(D8, '08:00:40', 'out')])
    expect(res.summary.work_days).toBe(0)
    expect(day(res, D8).issues).toEqual([{ type: 'short', at: 480 }])
  })
})

describe('juftlash: tungi smena (yarim tundan o\'tadi)', () => {
  const guard = { id: 'g', calc_type: 'hourly', hourly_rate: 25000, work_start: '22:00', work_end: '06:00', lunch_minutes: 0 }
  const s0 = { ...settings, weekend_days: [] }

  it('Приход kechqurun, Уход ertasi kuni — juftlik Приход sanasiga tegishli', () => {
    const res = calc([p(D8, '22:00:30', 'in'), p('2026-09-09', '06:00:10', 'out')], guard, s0)
    expect(res.days).toHaveLength(1)
    expect(day(res, D8).sessions).toEqual([{ in: 1320, out: 1800 }])
    expect(res.summary.regular_hours).toBe(8)
    expect(res.summary.overtime_hours).toBe(0)
    expect(res.summary.total_late_minutes).toBe(0)
  })

  it("yarim tundan keyin kelgan (00:10) Приход oldingi kun smenasiga tegishli va kech qolgan", () => {
    const res = calc([p('2026-09-10', '00:10:00', 'in'), p('2026-09-10', '06:00:00', 'out')], guard, s0)
    expect(day(res, '2026-09-09').sessions).toEqual([{ in: 1450, out: 1800 }])
    expect(res.summary.total_late_minutes).toBe(125)
  })

  it("kunduzgi jadvalli ishchida ham 16 soatdan oshmagan oraliq yarim tundan o'tishi mumkin", () => {
    const res = calc([p(D8, '20:00:00', 'in'), p('2026-09-09', '06:00:00', 'out')])
    expect(day(res, D8).sessions).toEqual([{ in: 1200, out: 1800 }])
  })

  it("tungi smenada Приход'siz ertalabki Уход oldingi kun smenasiga izoh bo'ladi", () => {
    const res = calc([p('2026-09-09', '08:22:00', 'out')], guard, s0)
    expect(day(res, D8).issues).toEqual([{ type: 'orphan_out', at: 1942 }])
  })
})

describe('oy chegarasi va qayta hisoblash', () => {
  it('boshqa oy punchlari hisobga olinmaydi', () => {
    const res = calc([p(D8, '08:00:00', 'in'), p(D8, '17:00:00', 'out'), p('2026-10-01', '08:00:00', 'in'), p('2026-10-01', '17:00:00', 'out')])
    expect(res.summary.work_days).toBe(1)
  })

  it('saqlangan juftliklardan qayta hisoblash bir xil natija beradi (izohlar bilan)', () => {
    const first = calc([
      p(D8, '08:02:00', 'in'), p(D8, '12:00:00', 'break_out'), p(D8, '12:40:00', 'break_in'), p(D8, '18:05:00', 'out'),
      p('2026-09-09', '08:00:00', 'in'), p('2026-09-10', '10:00:00', 'none'), p('2026-09-11', '17:00:00', 'out'),
    ], { ...hourly, calc_type: 'fix', monthly_salary: 3000000 })
    const stored = first.days.map((d) => ({
      date: d.date, dayOfWeek: d.day_of_week, sessions: d.sessions, issues: d.issues, firstIn: d.check_in, lastOut: d.check_out, anchored: true,
    }))
    const again = calcEmployeeSalary({
      employee: { ...hourly, calc_type: 'fix', monthly_salary: 3000000 }, settings, month: '2026-09', records: stored,
    })
    expect(again.summary).toEqual(first.summary)
    expect(again.days).toEqual(first.days)
  })

  it("buildShiftsFromPunches: tartiblanmagan punchlar ham to'g'ri juftlanadi", () => {
    const shifts = buildShiftsFromPunches(
      [p(D8, '17:00:00', 'out'), p(D8, '08:00:00', 'in')], { workStart: 480, workEnd: 1020 },
    )
    expect(shifts[0].sessions).toEqual([{ in: 480, out: 1020 }])
  })
})

describe('faqat «Нет» kun: birinchi va oxirgi punch', () => {
  const nurse = { id: 'n', calc_type: 'fix', monthly_salary: 3000000, work_start: '20:00', work_end: '08:00', lunch_minutes: 0 }
  const s0 = { ...settings, weekend_days: [] }

  it('kunduzgi: shu kalendar kundagi birinchi va oxirgi', () => {
    const res = calc([p(D8, '17:10:00', 'none'), p(D8, '08:03:00', 'none'), p(D8, '12:00:00', 'none')])
    expect(day(res, D8).issues).toEqual([{ type: 'only_none', at: 483, last: 1030, count: 3 }])
  })

  it('tungi hamshira: kechqurundan ertasi kuni 10:00 gacha bo\'lgan punchlar bitta smena', () => {
    const res = calc([
      p(D8, '19:58:00', 'none'), p(D8, '23:00:00', 'none'), p('2026-09-09', '08:15:00', 'none'), p('2026-09-09', '09:59:00', 'none'),
      p('2026-09-09', '10:30:00', 'none'), // 10:00 dan keyin — keyingi kun guruhi
    ], nurse, s0)
    expect(day(res, D8).issues).toEqual([{ type: 'only_none', at: 1198, last: 1440 + 599, count: 4 }])
    expect(day(res, '2026-09-09').issues[0]).toMatchObject({ type: 'only_none', at: 630, count: 1 })
  })
})

describe('sutkalik smena (24 soat)', () => {
  const duty = { id: 'd', calc_type: 'fix', monthly_salary: 3000000, work_start: '08:00', work_end: '08:00', lunch_minutes: 60, duty_24h: true, duty_days: 10 }
  const s0 = { ...settings, weekend_days: [0] }
  const punches = [
    p('2026-09-06', '08:00:00', 'in'), p('2026-09-07', '08:10:00', 'out'), // yakshanba boshlangan sutka
    p('2026-09-09', '07:58:00', 'in'), p('2026-09-10', '08:00:00', 'out'),
  ]

  it('sutka bitta smena: juftlik Приход sanasiga, Уход ertasi kuni', () => {
    const res = calc(punches, duty, s0)
    expect(day(res, '2026-09-06').sessions).toEqual([{ in: 480, out: 1930 }])
    expect(res.summary.work_days).toBe(2)
  })

  it("fix: oylik ÷ kutilgan sutkalar × ishlagan sutkalar; dam olish, overtime va kelmagan jarima yo'q", () => {
    const res = calc(punches, duty, s0)
    expect(res.summary.expected_work_days).toBe(10)
    expect(res.summary.calculated_salary).toBe(600000) // 3 000 000 / 10 × 2
    expect(res.summary.overtime_pay).toBe(0)
    expect(res.summary.weekend_pay).toBe(0)
    expect(res.summary.notes).toContain('Sutkalik smena: 2 sutka ishladi (kutilgan 10)')
    expect(res.summary.notes).not.toContain('kelmagan')
  })

  it('kunbay sutkalik: sutka × kunlik summa', () => {
    const res = calc(punches, { ...duty, calc_type: 'daily', daily_rate: 400000 }, s0)
    expect(res.summary.calculated_salary).toBe(800000)
  })

  it("Уход 30 soatdan keyin bo'lsa juftlik yopilmagan", () => {
    const res = calc([p('2026-09-09', '08:00:00', 'in'), p('2026-09-10', '15:00:00', 'out')], duty, s0)
    expect(res.summary.work_days).toBe(0)
  })
})
