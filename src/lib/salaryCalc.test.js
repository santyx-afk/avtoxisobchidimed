import { describe, it, expect } from 'vitest'
import { calcEmployeeSalary, expectedWorkDays, employeeRestDays } from './salaryCalc'

const baseSettings = {
  late_penalty_per_min: 500,
  grace_period_min: 5,
  overtime_multiplier: 1.5,
  weekend_multiplier: 2,
  weekend_days: [0],
}

const rec = (date, firstIn, lastOut, dayOfWeek = '') => ({ date, firstIn, lastOut, dayOfWeek })

describe('expectedWorkDays', () => {
  it('yakshanbalardan tashqari kunlarni sanaydi (2026-08)', () => {
    // Avgust 2026 = 31 kun. Yakshanbalar: 2,9,16,23,30 (5 ta) => 26 ish kuni
    expect(expectedWorkDays('2026-08', [0])).toBe(26)
  })
  it('Shanba+Yakshanba dam olish bo\'lsa kamroq', () => {
    expect(expectedWorkDays('2026-08', [0, 6])).toBeLessThan(26)
  })
})

describe('employeeRestDays — individual ish kunlari', () => {
  it('work_days berilsa, undan tashqari kunlar dam olish', () => {
    expect(employeeRestDays({ work_days: [1, 2, 3, 4, 5, 6] }, { weekend_days: [0] })).toEqual([0])
    expect(employeeRestDays({ work_days: [1, 2, 3, 4, 5] }, { weekend_days: [0] })).toEqual([0, 6])
  })
  it('work_days bo\'lmasa — umumiy sozlama', () => {
    expect(employeeRestDays({}, { weekend_days: [0, 6] })).toEqual([0, 6])
    expect(employeeRestDays({ work_days: [] }, { weekend_days: [0] })).toEqual([0])
  })
})

describe('calcEmployeeSalary — individual sozlamalar', () => {
  const settings = { ...baseSettings, weekend_days: [0, 6] } // umumiy: Shanba+Yakshanba dam
  const emp = (extra) => ({
    id: 'x', calc_type: 'hourly', hourly_rate: 25000,
    work_start: '08:00', work_end: '17:00', lunch_minutes: 60, ...extra,
  })
  // 2026-08-01 — Shanba
  const satRec = [rec('2026-08-01', '08:00:00', '17:00:00')]

  it('ishchi Shanba ishlasa (work_days=Dush-Shan) — oddiy soat', () => {
    const { summary } = calcEmployeeSalary({
      employee: emp({ work_days: [1, 2, 3, 4, 5, 6] }), settings, month: '2026-08', records: satRec,
    })
    expect(summary.regular_hours).toBe(8)
    expect(summary.weekend_hours).toBe(0)
  })

  it('ishchi Shanba ishlamasa (umumiy) — dam olish soati (x2)', () => {
    const { summary } = calcEmployeeSalary({
      employee: emp({}), settings, month: '2026-08', records: satRec,
    })
    expect(summary.weekend_hours).toBe(8)
    expect(summary.weekend_pay).toBe(400000) // 8*25000*2
  })

  it('individual jarima override ishlaydi', () => {
    const s = { ...baseSettings, weekend_days: [] }
    const { summary } = calcEmployeeSalary({
      employee: emp({ late_penalty_per_min: 1000 }), settings: s, month: '2026-08',
      records: [rec('2026-08-06', '08:10:00', '17:00:00')], // 5 daq kech (grace 5)
    })
    expect(summary.total_late_minutes).toBe(5)
    expect(summary.penalties).toBe(5000) // 5 * 1000 (override, global 500 emas)
  })
})

describe('calcEmployeeSalary — tungi smena (yarim tundan o\'tadigan)', () => {
  const guard = {
    id: 'g', name: 'Qorovul', calc_type: 'hourly', hourly_rate: 25000,
    work_start: '22:00', work_end: '06:00', lunch_minutes: 0,
  }
  const settings = { ...baseSettings, weekend_days: [] }

  it('22:00→06:00 = 8 soat (yarim tundan o\'tadi)', () => {
    const { summary } = calcEmployeeSalary({
      employee: guard, settings, month: '2026-08',
      records: [rec('2026-08-03', '22:00:00', '06:00:00')],
    })
    expect(summary.regular_hours).toBe(8)
    expect(summary.overtime_hours).toBe(0)
    expect(summary.net_salary).toBe(200000) // 8*25000
  })

  it('22:00→08:00 = 8 soat regular + 2 soat overtime', () => {
    const { summary } = calcEmployeeSalary({
      employee: guard, settings, month: '2026-08',
      records: [rec('2026-08-04', '22:00:00', '08:00:00')],
    })
    expect(summary.regular_hours).toBe(8)
    expect(summary.overtime_hours).toBe(2)
    expect(summary.overtime_pay).toBe(75000) // 2*25000*1.5
    expect(summary.net_salary).toBe(275000)
  })
})

describe('calcEmployeeSalary — bayram kunlari', () => {
  // 2026-08-05 — Chorshanba (ish kuni), uni bayram qilamiz
  const empFix = {
    id: 'f', name: 'Fix', calc_type: 'fix', monthly_salary: 3100000,
    work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
  }
  const allPresent = []
  for (let d = 1; d <= 31; d++) {
    allPresent.push(rec(`2026-08-${String(d).padStart(2, '0')}`, '08:00:00', '17:00:00'))
  }

  it('bayram kutilgan ish kunidan chiqariladi (jarima yo\'q)', () => {
    const base = { ...baseSettings, weekend_days: [] }
    const noHol = calcEmployeeSalary({ employee: empFix, settings: base, month: '2026-08', records: allPresent })
    const withHol = calcEmployeeSalary({ employee: empFix, settings: { ...base, holidays: ['2026-08-05'] }, month: '2026-08', records: allPresent })
    expect(noHol.summary.expected_work_days).toBe(31)
    expect(withHol.summary.expected_work_days).toBe(30) // bayram chiqarildi
  })

  it('bayramda absent bo\'lsa ham jarima qilinmaydi', () => {
    const base = { ...baseSettings, weekend_days: [], holidays: ['2026-08-05'] }
    const records = allPresent.filter((r) => r.date !== '2026-08-05') // 5-kun kelmagan
    const { summary } = calcEmployeeSalary({ employee: empFix, settings: base, month: '2026-08', records })
    expect(summary.expected_work_days).toBe(30)
    expect(summary.work_days).toBe(30)
    expect(summary.notes).not.toContain('kelmagan') // bayram absent emas
  })

  it('bayramda ishlagan — dam olish koeffitsienti (x2)', () => {
    const emp = { id: 'h', calc_type: 'hourly', hourly_rate: 25000, work_start: '08:00', work_end: '17:00', lunch_minutes: 60 }
    const base = { ...baseSettings, weekend_days: [], holidays: ['2026-08-05'] }
    const { summary } = calcEmployeeSalary({ employee: emp, settings: base, month: '2026-08', records: [rec('2026-08-05', '08:00:00', '17:00:00')] })
    expect(summary.weekend_hours).toBe(8)
    expect(summary.weekend_pay).toBe(400000) // 8*25000*2
    expect(summary.regular_hours).toBe(0)
  })
})

describe('calcEmployeeSalary — kunbay (daily)', () => {
  const employee = {
    id: 'd', name: 'Kunbay', calc_type: 'daily', daily_rate: 150000,
    work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
  }
  const settings = { ...baseSettings, weekend_days: [] } // avgust 2026 = 31 ish kuni
  const present = []
  for (let d = 1; d <= 28; d++) {
    present.push(rec(`2026-08-${String(d).padStart(2, '0')}`, '08:00:00', '17:00:00'))
  }

  it('kunlik summa × kelgan kunlar', () => {
    const { summary } = calcEmployeeSalary({ employee, settings, month: '2026-08', records: present })
    expect(summary.expected_work_days).toBe(31)
    expect(summary.work_days).toBe(28)
    expect(summary.base_salary).toBe(150000 * 31) // belgilangan: hamma kun kelsa
    expect(summary.calculated_salary).toBe(150000 * 28) // real kelgan
    expect(summary.net_salary).toBe(150000 * 28)
    expect(summary.difference).toBe(150000 * 28 - 150000 * 31) // -450,000 (3 kun kelmagan)
    expect(summary.notes).toContain('3 kun kelmagan')
  })

  it('avans va overtime hisobga olinadi', () => {
    const advances = [{ amount: 500000, date: '2026-08-10' }]
    const withOt = [...present, rec('2026-08-28', '08:00:00', '19:00:00')] // 28-kun overtime
    const { summary } = calcEmployeeSalary({ employee, settings, month: '2026-08', records: withOt, advances })
    expect(summary.advance_deduction).toBe(500000)
    expect(summary.overtime_pay).toBeGreaterThan(0)
    expect(summary.net_salary).toBe(summary.base_salary + summary.difference)
  })
})

describe('calcEmployeeSalary — soatbay (hourly)', () => {
  const employee = {
    id: 'e1', name: 'Test', calc_type: 'hourly', hourly_rate: 25000,
    work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
  }

  it('oddiy ish kuni: 8 soat = 200,000', () => {
    const settings = { ...baseSettings, weekend_days: [] }
    const { summary } = calcEmployeeSalary({
      employee, settings, month: '2026-08',
      records: [rec('2026-08-03', '08:00:00', '17:00:00')],
    })
    expect(summary.regular_hours).toBe(8)
    expect(summary.overtime_hours).toBe(0)
    expect(summary.net_salary).toBe(200000)
    expect(summary.base_salary).toBe(200000)
    expect(summary.difference).toBe(0)
  })

  it('overtime: 08:00-19:00 => 8s regular + 2s overtime (x1.5)', () => {
    const settings = { ...baseSettings, weekend_days: [] }
    const { summary } = calcEmployeeSalary({
      employee, settings, month: '2026-08',
      records: [rec('2026-08-04', '08:00:00', '19:00:00')],
    })
    expect(summary.regular_hours).toBe(8)
    expect(summary.overtime_hours).toBe(2)
    // regular 8*25000=200000, overtime 2*25000*1.5=75000
    expect(summary.overtime_pay).toBe(75000)
    expect(summary.net_salary).toBe(275000)
    expect(summary.notes).toContain('overtime')
  })

  it('dam olish kuni (x2): 3 soat = 150,000', () => {
    const settings = { ...baseSettings, weekend_days: [0, 1, 2, 3, 4, 5, 6] } // barcha kun dam olish
    const { summary } = calcEmployeeSalary({
      employee, settings, month: '2026-08',
      records: [rec('2026-08-05', '10:00:00', '14:00:00')],
    })
    expect(summary.weekend_hours).toBe(3)
    expect(summary.weekend_pay).toBe(150000) // 3*25000*2
    expect(summary.net_salary).toBe(150000)
    expect(summary.notes).toContain('Dam olish kuni')
  })

  it('kech qolish jarimasi: 08:10 (grace 5) => 5 daqiqa => 2,500 jarima', () => {
    const settings = { ...baseSettings, weekend_days: [] }
    const { summary } = calcEmployeeSalary({
      employee, settings, month: '2026-08',
      records: [rec('2026-08-06', '08:10:00', '17:00:00')],
    })
    expect(summary.total_late_minutes).toBe(5)
    expect(summary.late_count).toBe(1)
    expect(summary.penalties).toBe(2500)
    expect(summary.notes).toContain('kech qolish')
  })
})

describe('calcEmployeeSalary — fix oylik', () => {
  const employee = {
    id: 'e2', name: 'Test Fix', calc_type: 'fix', monthly_salary: 3000000,
    work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
  }
  // weekend_days=[] => avgust 2026 da 31 ish kuni; kunlik = 3,000,000/31
  const settings = { ...baseSettings, weekend_days: [] }

  // 28 kun kelgan (01..28), 3 kun kelmagan (29,30,31)
  const present = []
  for (let d = 1; d <= 28; d++) {
    present.push(rec(`2026-08-${String(d).padStart(2, '0')}`, '08:00:00', '17:00:00'))
  }

  it('kelmagan kunlarni jarima qiladi va sabab yozadi', () => {
    const { summary } = calcEmployeeSalary({ employee, settings, month: '2026-08', records: present })
    expect(summary.expected_work_days).toBe(31)
    expect(summary.work_days).toBe(28)
    // calculated = round(3000000/31 * 28)
    const daily = 3000000 / 31
    expect(summary.calculated_salary).toBe(Math.round(daily * 28))
    expect(summary.net_salary).toBe(summary.calculated_salary)
    expect(summary.base_salary).toBe(3000000)
    expect(summary.difference).toBe(summary.net_salary - 3000000)
    expect(summary.notes).toContain('3 kun kelmagan')
  })

  it('avans oylikdan ushlab qolinadi va sababda ko\'rsatiladi', () => {
    const advances = [{ amount: 500000, date: '2026-08-15', reason: 'shaxsiy' }]
    const { summary } = calcEmployeeSalary({ employee, settings, month: '2026-08', records: present, advances })
    expect(summary.advance_deduction).toBe(500000)
    expect(summary.net_salary).toBe(summary.calculated_salary - 500000)
    expect(summary.notes).toContain('Avans')
  })

  it('net = base + difference invarianti', () => {
    const advances = [{ amount: 300000, date: '2026-08-10' }]
    const withOt = [...present, rec('2026-08-28', '08:00:00', '19:00:00')] // 28-kun overtime bilan
    const { summary } = calcEmployeeSalary({ employee, settings, month: '2026-08', records: withOt, advances })
    expect(summary.net_salary).toBe(summary.base_salary + summary.difference)
    expect(summary.overtime_pay).toBeGreaterThan(0)
    expect(summary.notes).toContain('overtime')
  })

  it('kunlik attendance yozuvlarini qaytaradi', () => {
    const { days } = calcEmployeeSalary({ employee, settings, month: '2026-08', records: present })
    expect(days).toHaveLength(28)
    expect(days[0]).toMatchObject({ date: '2026-08-01', check_in: '08:00:00', worked_minutes: 480 })
  })
})

describe('calcEmployeeSalary — sharhda topilgan xatolar', () => {
  const fix = {
    id: 'f6', name: 'Fix', calc_type: 'fix', monthly_salary: 6000000,
    work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
  }
  const settings = { ...baseSettings, weekend_days: [0] }
  const calc = (employee, records, s = settings) =>
    calcEmployeeSalary({ employee, settings: s, month: '2026-08', records }).summary

  it("bitta punch — faqat kechki chiqish (kirish unutilgan): kechikish jarimasi yo'q", () => {
    const s = calc(fix, [rec('2026-08-03', '17:05:00', '17:05:00')])
    expect(s.total_late_minutes).toBe(0)
    expect(s.penalties).toBe(0)
    expect(s.notes).toContain('bitta punch')
  })

  it('bitta punch — ertalabki kech kirish: kechikish hisoblanadi', () => {
    const s = calc(fix, [rec('2026-08-03', '08:30:00', '-')])
    expect(s.total_late_minutes).toBe(25)
  })

  it("kech kelib kech ketish (10:00–19:00) overtime emas — oddiy kundan ko'p to'lanmaydi", () => {
    const normal = calc(fix, [rec('2026-08-03', '08:00:00', '17:00:00')])
    const shifted = calc(fix, [rec('2026-08-03', '10:00:00', '19:00:00')])
    expect(shifted.overtime_hours).toBe(0)
    expect(shifted.net_salary).toBeLessThan(normal.net_salary) // faqat kechikish jarimasi
  })

  it("sekundlar yuqoriga yaxlitlanmaydi: 08:05:59 (grace 5) — kechikish yo'q", () => {
    expect(calc(fix, [rec('2026-08-03', '08:05:59', '17:00:00')]).total_late_minutes).toBe(0)
  })

  it('boshqa oy yozuvlari hisobga olinmaydi', () => {
    const hourly = { ...fix, calc_type: 'hourly', hourly_rate: 25000 }
    const s = calc(hourly, [rec('2026-08-03', '08:00:00', '17:00:00'), rec('2026-09-01', '08:00:00', '17:00:00')])
    expect(s.regular_hours).toBe(8)
    expect(s.work_days).toBe(1)
  })

  describe('tungi smena — IVMS kalendar kuni formati', () => {
    const guard = {
      id: 'g2', calc_type: 'hourly', hourly_rate: 25000,
      work_start: '22:00', work_end: '06:00', lunch_minutes: 0,
    }
    const s0 = { ...baseSettings, weekend_days: [] }
    // Har qator: kechagi smenadan chiqish (06:00) + bugungi smenaga kirish (22:00)
    const split = [
      rec('2026-08-03', '21:58:00', '21:58:00'), // 1-smena boshlanishi (faqat kirish)
      rec('2026-08-04', '06:00:00', '22:00:00'),
      rec('2026-08-05', '06:00:00', '22:10:00'), // 3-smenaga 10 daqiqa kech
      rec('2026-08-06', '06:02:00', '-'),
    ]

    it('har smena 8 soat (16 emas), kechikish to\'g\'ri', () => {
      const s = calc(guard, split, s0)
      expect(s.work_days).toBe(3)
      expect(s.regular_hours).toBe(23.9) // 8:02 + 8:00 + 7:52 (kechikkan) = 1434 daq
      expect(s.overtime_hours).toBe(0)
      expect(s.total_late_minutes).toBe(5) // 22:10 - 22:00 - grace 5
      expect(s.net_salary).toBe(595000) // 1434/60 * 25000 − 5 daq × 500 jarima
    })

    it("yarim tundan keyin kelgan qorovul (00:10) — kech qolgan", () => {
      const s = calc(guard, [rec('2026-08-04', '00:10:00', '06:00:00')], s0)
      expect(s.total_late_minutes).toBe(125) // 00:10 = 22:00 + 130 daqiqa, grace 5
      expect(s.regular_hours).toBeCloseTo(5.83, 2)
    })

    it('saqlangan (anchored) smenalardan qayta hisoblash bir xil natija beradi', () => {
      const first = calcEmployeeSalary({ employee: guard, settings: s0, month: '2026-08', records: split })
      const again = calcEmployeeSalary({
        employee: guard, settings: s0, month: '2026-08',
        records: first.days.map((d) => ({ date: d.date, firstIn: d.check_in, lastOut: d.check_out, anchored: true })),
      })
      expect(again.summary).toEqual(first.summary)
    })
  })
})
