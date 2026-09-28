import { describe, it, expect } from 'vitest'
import { parseSessionsInput, editRowsFor, issueDetail, collectDayIssues } from './dayEdit'

describe('parseSessionsInput — qo\'lda kiritilgan juftliklar', () => {
  it('HH:MM juftliklarini daqiqaga aylantiradi, bo\'sh qatorlarni tashlaydi, tartiblaydi', () => {
    expect(parseSessionsInput([{ in: '13:00', out: '17:00' }, { in: '', out: '' }, { in: '8:00', out: '12:00' }]))
      .toEqual([{ in: 480, out: 720 }, { in: 780, out: 1020 }])
  })
  it('hammasi bo\'sh — kun kelmagan (bo\'sh ro\'yxat)', () => {
    expect(parseSessionsInput([{ in: '', out: '' }])).toEqual([])
  })
  it('noto\'g\'ri format, chiqish <= kirish va kesishgan juftliklar xato beradi', () => {
    expect(() => parseSessionsInput([{ in: '8', out: '17:00' }])).toThrow('SS:DD')
    expect(() => parseSessionsInput([{ in: '17:00', out: '08:00' }])).toThrow('chiqish kirishdan keyin')
    expect(() => parseSessionsInput([{ in: '08:00', out: '13:00' }, { in: '12:00', out: '17:00' }])).toThrow('kesib')
    expect(() => parseSessionsInput([{ in: '08:00', out: '' }])).toThrow('SS:DD')
  })
  it('tungi smenada chiqish kirishdan kichik bo\'lsa — keyingi kun', () => {
    expect(parseSessionsInput([{ in: '22:00', out: '06:00' }], { night: true })).toEqual([{ in: 1320, out: 1800 }])
  })
})

describe('tuzatish oynasi va muammolar ro\'yxati', () => {
  it('yopilmagan Приход: kirish to\'ldirilgan, Уход bo\'sh (foydalanuvchi to\'ldiradi)', () => {
    const day = { sessions: [{ in: 480, out: 720 }], issues: [{ type: 'unclosed_in', at: 840 }] }
    expect(editRowsFor(day)).toEqual([{ in: '08:00', out: '12:00' }, { in: '14:00', out: '' }])
  })
  it("Приход'siz Уход: chiqish to'ldirilgan; faqat «Нет»: birinchi va oxirgi taklif qilinadi", () => {
    expect(editRowsFor({ sessions: [], issues: [{ type: 'orphan_out', at: 1020 }] })).toEqual([{ in: '', out: '17:00' }])
    expect(editRowsFor({ sessions: [], issues: [{ type: 'only_none', at: 483, last: 1030, count: 3 }] })).toEqual([{ in: '08:03', out: '17:10' }])
    expect(editRowsFor({})).toEqual([{ in: '', out: '' }])
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
