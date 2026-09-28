import { describe, it, expect } from 'vitest'
import { parseShiftInput, editPairFor, issueDetail, collectDayIssues } from './dayEdit'

describe('parseShiftInput — sana + soat bilan kirish/chiqish', () => {
  it('smena kirish sanasiga tegishli; chiqish ertasi kuni bo\'lishi mumkin', () => {
    expect(parseShiftInput({ in: '2026-09-10T17:00', out: '2026-09-11T08:20' })).toEqual({
      date: '2026-09-10', sessions: [{ in: 1020, out: 1440 + 500 }],
    })
    expect(parseShiftInput({ in: '2026-09-10T08:00', out: '2026-09-10T17:05' }).sessions).toEqual([{ in: 480, out: 1025 }])
  })
  it("ikkalasi bo'sh — kun «kelmagan»", () => {
    expect(parseShiftInput({ in: '', out: '' })).toEqual({ date: null, sessions: [] })
  })
  it("bittasi bo'sh, noto'g'ri format, chiqish <= kirish va juda uzun smena xato beradi", () => {
    expect(() => parseShiftInput({ in: '2026-09-10T08:00', out: '' })).toThrow("to'liq")
    expect(() => parseShiftInput({ in: '2026-09-10 8', out: '2026-09-10T09:00' })).toThrow("to'g'ri")
    expect(() => parseShiftInput({ in: '2026-09-10T17:00', out: '2026-09-10T08:00' })).toThrow('chiqish sanasini')
    expect(() => parseShiftInput({ in: '2026-09-10T08:00', out: '2026-09-13T08:00' })).toThrow('36 soat')
  })
})

describe('tuzatish oynasi va muammolar ro\'yxati', () => {
  it("mavjud smena: birinchi kirish — oxirgi chiqish (chiqish ertasi kuni bo'lsa sanasi ham)", () => {
    expect(editPairFor({ date: '2026-09-10', sessions: [{ in: 1020, out: 1940 }], issues: [] }))
      .toEqual({ in: '2026-09-10T17:00', out: '2026-09-11T08:20' })
  })
  it("yopilmagan Приход: kirish yozilgan, chiqish bo'sh; Приход'siz Уход: chiqish yozilgan", () => {
    expect(editPairFor({ date: '2026-09-10', sessions: [], issues: [{ type: 'unclosed_in', at: 1020 }] })).toEqual({ in: '2026-09-10T17:00', out: '' })
    expect(editPairFor({ date: '2026-09-10', sessions: [], issues: [{ type: 'orphan_out', at: 500 }] })).toEqual({ in: '', out: '2026-09-10T08:20' })
  })
  it('faqat «Нет»: birinchi va oxirgi punch (sana va soat bilan) taklif qilinadi', () => {
    expect(editPairFor({ date: '2026-09-10', sessions: [], issues: [{ type: 'only_none', at: 1198, last: 2039, count: 4 }] }))
      .toEqual({ in: '2026-09-10T19:58', out: '2026-09-11T09:59' })
    expect(editPairFor({ date: '2026-09-10' })).toEqual({ in: '', out: '' })
  })
  it('tavsif va ro\'yxat yig\'ish', () => {
    expect(issueDetail({ type: 'only_none', at: 483, last: 1030, count: 3 })).toBe('Faqat «Нет»: birinchi 08:03, oxirgi 17:10 (3 ta)')
    const results = [{ employee: { id: 'b', name: 'Bobur' }, summary: {} }, { employee: { id: 'a', name: 'Aziz' }, summary: {} }]
    const daysByEmp = new Map([
      ['a', [{ date: '2026-09-09', issues: [{ type: 'unclosed_in', at: 480 }] }, { date: '2026-09-08', issues: [{ type: 'unclosed_in', at: 480 }] }]],
      ['b', [{ date: '2026-09-08', issues: [{ type: 'orphan_out', at: 1020 }] }]],
    ])
    const list = collectDayIssues(results, daysByEmp, 'unclosed_in')
    expect(list.map((x) => `${x.employee.name} ${x.day.date}`)).toEqual(['Aziz 2026-09-08', 'Aziz 2026-09-09'])
  })
})
