import { describe, it, expect } from 'vitest'
import { parseSessionsInput } from './dayEdit'

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
