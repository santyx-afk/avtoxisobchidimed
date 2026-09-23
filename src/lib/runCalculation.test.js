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
