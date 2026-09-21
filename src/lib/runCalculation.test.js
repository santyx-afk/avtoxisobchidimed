import { describe, it, expect } from 'vitest'
import { computeReport } from './runCalculation'

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
