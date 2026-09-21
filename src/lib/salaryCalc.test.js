import { describe, it, expect } from 'vitest'
import { calcEmployeeSalary, expectedWorkDays } from './salaryCalc'

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
