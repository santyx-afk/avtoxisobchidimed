import { describe, it, expect } from 'vitest'
import { payslipHtml } from './payslip'

const employee = { name: 'Aliyeva Nigora', position: 'Registratura', department: 'Dimed', calc_type: 'fix' }
const summary = {
  work_days: 24, expected_work_days: 26, total_hours: 200, overtime_hours: 3,
  weekend_hours: 0, late_count: 2, total_late_minutes: 30,
  base_salary: 4500000, calculated_salary: 4153846, overtime_pay: 100000,
  weekend_pay: 0, penalties: 15000, advance_deduction: 500000,
  net_salary: 3738846, difference: -761154,
  notes: '2 kun kelmagan (05.08, 12.08) — -346,154 so\'m\nAvans olgan 15.08 — -500,000 so\'m',
}

describe('payslipHtml', () => {
  const html = payslipHtml({ employee, summary, month: '2026-08' })

  it('ishchi ismi va oyni o\'z ichiga oladi', () => {
    expect(html).toContain('Aliyeva Nigora')
    expect(html).toContain('Avgust 2026')
    expect(html).toContain('Registratura')
  })

  it('NET oylik va farqni ko\'rsatadi', () => {
    expect(html).toContain('3,738,846')
    expect(html).toContain('Dimed')
  })

  it('farq sabablarini o\'z ichiga oladi', () => {
    expect(html).toContain('2 kun kelmagan')
    expect(html).toContain('Avans olgan')
  })

  it('imzo joylari bor', () => {
    expect(html).toContain('Ishchi imzosi')
    expect(html).toContain('Buxgalter imzosi')
  })
})
