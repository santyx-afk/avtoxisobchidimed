import { describe, it, expect } from 'vitest'
import { parseBulkSalary, matchBulkSalary } from './bulkImport'

describe('parseBulkSalary', () => {
  it('tab bilan ajratilgan qatorlar', () => {
    const rows = parseBulkSalary('Aliyeva Nigora\t4500000\nKarimov Sardor\t3000000')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'Aliyeva Nigora', amount: 4500000, type: null })
    expect(rows[1]).toMatchObject({ name: 'Karimov Sardor', amount: 3000000 })
  })

  it('tur ustuni (soatbay/fix/kunbay)', () => {
    const rows = parseBulkSalary('Rahimov Jasur\t25000\tsoatbay\nX\t3000000\tfix\nY\t150000\tkunbay')
    expect(rows[0].type).toBe('hourly')
    expect(rows[1].type).toBe('fix')
    expect(rows[2].type).toBe('daily')
  })

  it('probel ajratkich + vergulli minglar', () => {
    const rows = parseBulkSalary('Karimov Sardor 3,000,000')
    expect(rows[0]).toMatchObject({ name: 'Karimov Sardor', amount: 3000000 })
  })

  it('nuqtali vergul ajratkich', () => {
    const rows = parseBulkSalary('Ism Familiya;5000000')
    expect(rows[0]).toMatchObject({ name: 'Ism Familiya', amount: 5000000 })
  })

  it('summa yo\'q qator — noto\'g\'ri', () => {
    const rows = parseBulkSalary('Faqat Ism')
    expect(rows[0].invalid).toBe(true)
  })

  it('bo\'sh qatorlar o\'tkazib yuboriladi', () => {
    expect(parseBulkSalary('\n\n  \n')).toHaveLength(0)
  })
})

describe('matchBulkSalary', () => {
  const employees = [
    { id: '1', name: 'Karimov Sardor', calc_type: 'fix' },
    { id: '2', name: "O'rinova Shoxista", calc_type: 'hourly' },
  ]

  it('ism bo\'yicha moslaydi (normalizatsiya bilan) va patch tayyorlaydi', () => {
    const rows = parseBulkSalary('  karimov sardor \t3500000')
    const { matched, unmatched } = matchBulkSalary(rows, employees)
    expect(unmatched).toHaveLength(0)
    expect(matched[0].id).toBe('1')
    expect(matched[0].patch).toMatchObject({ calc_type: 'fix', monthly_salary: 3500000, hourly_rate: null })
  })

  it('tur override — soatbay patch', () => {
    const rows = parseBulkSalary('Karimov Sardor\t20000\tsoatbay')
    const { matched } = matchBulkSalary(rows, employees)
    expect(matched[0].patch).toMatchObject({ calc_type: 'hourly', hourly_rate: 20000, monthly_salary: null, daily_rate: null })
  })

  it('tur override — kunbay patch', () => {
    const rows = parseBulkSalary('Karimov Sardor\t150000\tkunbay')
    const { matched } = matchBulkSalary(rows, employees)
    expect(matched[0].patch).toMatchObject({ calc_type: 'daily', daily_rate: 150000, monthly_salary: null, hourly_rate: null })
  })

  it('mavjud bo\'lmagan ism — unmatched', () => {
    const rows = parseBulkSalary('Yangi Odam\t1000000')
    const { matched, unmatched } = matchBulkSalary(rows, employees)
    expect(matched).toHaveLength(0)
    expect(unmatched[0].name).toBe('Yangi Odam')
  })
})

describe('parseBulkSalary — kasr qismi', () => {
  it("kasr qismi summaga qo'shilib ketmaydi (\"4 500 000,00\" -> 4 500 000)", () => {
    expect(parseBulkSalary('Ali Vali\t4 500 000,00')[0].amount).toBe(4500000)
    expect(parseBulkSalary('Ali Vali\t4,500,000.00')[0].amount).toBe(4500000)
    expect(parseBulkSalary('Ali Vali 4500000.5')[0].amount).toBe(4500000)
    expect(parseBulkSalary('Ali Vali\t3,000,000')[0].amount).toBe(3000000)
  })
})
