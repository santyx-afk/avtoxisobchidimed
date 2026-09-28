import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseIvmsHtml, groupRecordsByName, tidyName, normalizeName, cleanPersonId } from './ivmsParser'
import { rawHtml, RAW_HEADER } from './__fixtures__/rawHtml'

describe('tidyName / normalizeName', () => {
  it('ortiqcha probellarni siqadi va trim qiladi', () => {
    expect(tidyName('  Karimov   Sardor ')).toBe('Karimov Sardor')
  })
  it('apostrof variantlarini birlashtiradi', () => {
    expect(tidyName('Oʻrinova')).toBe("O'rinova")
    expect(tidyName('O`rinova')).toBe("O'rinova")
    expect(tidyName('O’rinova')).toBe("O'rinova")
  })
  it('normalizeName registrga bog\'liq emas', () => {
    expect(normalizeName('  KARIMOV  sardor ')).toBe('karimov sardor')
    expect(normalizeName('Oʻrinova Shoxista')).toBe(normalizeName("O'rinova shoxista"))
  })
})

// IVMS-4200 "Punch Report" HTML-xls namunasi.
// Ikkinchi ma'lumot qatorida IKKI yozuv ketma-ket (22 katak) — chunking sinovi.
const SAMPLE = `
<html><body><table>
  <tr><td>Dimed</td></tr>
  <tr><td>Отчет о записях первого/последнего доступа</td></tr>
  <tr><td>2026-08-01 00:00:00 - 2026-08-31 23:59:59</td></tr>
  <tr>
    <td>№</td><td>Идентификатор человека</td><td>Имя</td><td>Департамент</td>
    <td>Должность</td><td>Пол</td><td>Дата</td><td>День недели</td>
    <td>Расписание</td><td>Первый вход</td><td>Последний выход</td>
  </tr>
  <tr>
    <td>1</td><td>1001</td><td>Aliyeva Nigora</td><td>Dimed</td><td>Registratura</td>
    <td>Ж</td><td>2026-08-01</td><td>Сб</td><td>08:00-17:00</td><td>07:58:00</td><td>17:05:00</td>
  </tr>
  <tr>
    <td>2</td><td>1001</td><td>Aliyeva Nigora</td><td>Dimed</td><td>Registratura</td>
    <td>Ж</td><td>2026-08-03</td><td>Пн</td><td>08:00-17:00</td><td>08:12:00</td><td>17:30:00</td>
    <td>3</td><td>1002</td><td>Karimov Sardor</td><td>Dimed</td><td>Hamshira</td>
    <td>М</td><td>2026-08-03</td><td>Пн</td><td>08:00-17:00</td><td>08:00:00</td><td>19:00:00</td>
  </tr>
  <tr>
    <td>4</td><td>1002</td><td>Karimov Sardor</td><td>Dimed</td><td>Hamshira</td>
    <td>М</td><td>2026-08-04</td><td>Вт</td><td>08:00-17:00</td><td>-</td><td>-</td>
  </tr>
</table></body></html>
`

describe('parseIvmsHtml', () => {
  const result = parseIvmsHtml(SAMPLE)

  it('sana diapazonidan oyni ajratadi', () => {
    expect(result.month).toBe('2026-08')
  })

  it('barcha yozuvlarni oladi (concatenated tr ham)', () => {
    expect(result.records).toHaveLength(4)
  })

  it('bitta <tr> ichidagi ikkita yozuvni to\'g\'ri ajratadi', () => {
    const aug3 = result.records.filter((r) => r.date === '2026-08-03')
    expect(aug3).toHaveLength(2)
    expect(aug3.map((r) => r.name).sort()).toEqual(['Aliyeva Nigora', 'Karimov Sardor'])
  })

  it('vaqtlarni to\'g\'ri o\'qiydi', () => {
    const first = result.records[0]
    expect(first.name).toBe('Aliyeva Nigora')
    expect(first.firstIn).toBe('07:58:00')
    expect(first.lastOut).toBe('17:05:00')
  })

  it('kelmagan kunni null qiladi ("-")', () => {
    const absent = result.records.find((r) => r.date === '2026-08-04')
    expect(absent.firstIn).toBeNull()
    expect(absent.lastOut).toBeNull()
  })

  it('departament va ismlar ro\'yxatini qaytaradi', () => {
    expect(result.meta.names).toContain('Aliyeva Nigora')
    expect(result.meta.departments).toContain('Dimed')
  })

  it('ism bo\'yicha guruhlaydi', () => {
    const grouped = groupRecordsByName(result.records)
    expect(grouped.get('Karimov Sardor')).toHaveLength(2)
    expect(grouped.get('Aliyeva Nigora')).toHaveLength(2)
  })
})

describe('parseIvmsHtml — chegara holatlar', () => {
  it('bo\'sh kirishda xatosiz ishlaydi', () => {
    expect(parseIvmsHtml('').records).toHaveLength(0)
    expect(parseIvmsHtml(null).records).toHaveLength(0)
  })

  it('takrorlangan header qatorini o\'tkazib yuboradi', () => {
    const withRepeat = SAMPLE.replace(
      '<td>4</td><td>1002</td>',
      `<td>№</td><td>Идентификатор человека</td><td>Имя</td><td>Департамент</td>
       <td>Должность</td><td>Пол</td><td>Дата</td><td>День недели</td>
       <td>Расписание</td><td>Первый вход</td><td>Последний выход</td>
       <td>4</td><td>1002</td>`,
    )
    const res = parseIvmsHtml(withRepeat)
    // Takrorlangan header 'Дата' sanaga o'xshamaydi — o'tkazib yuboriladi
    expect(res.records.filter((r) => r.name === 'Karimov Sardor' && r.date === '2026-08-04')).toHaveLength(1)
  })
})

describe('parseIvmsHtml — oyni aniqlash', () => {
  it("diapazon ikki oyni qamrasa, yozuvlar ko'p bo'lgan oy olinadi", () => {
    const html = SAMPLE
      .replace('2026-08-01 00:00:00 - 2026-08-31', '2026-07-25 00:00:00 - 2026-08-31')
      .replace('<td>2026-08-01</td>', '<td>2026-07-31</td>')
    const res = parseIvmsHtml(html)
    expect(res.month).toBe('2026-08')
    expect(res.meta.monthCounts).toEqual({ '2026-07': 1, '2026-08': 3 })
  })
})

describe('parseIvmsHtml — qayta sinxronlash', () => {
  it("o'rtadagi begona qator (\"Page 2\") keyingi yozuvlarni yo'qotmaydi", () => {
    const html = SAMPLE.replace('<td>4</td><td>1002</td>', '<td>Page 2</td></tr><tr><td>4</td><td>1002</td>')
    const res = parseIvmsHtml(html)
    expect(res.records).toHaveLength(4)
    expect(res.meta.skipped).toBe(1)
  })

  it('takrorlangan header begona qator deb sanalmaydi', () => {
    const html = SAMPLE.replace('<td>4</td><td>1002</td>', '<td>№</td><td>Имя</td><td>Дата</td></tr><tr><td>4</td><td>1002</td>')
    const res = parseIvmsHtml(html)
    expect(res.records).toHaveLength(4)
    expect(res.meta.skipped).toBe(0)
  })

  it("header qatori bo'lmasa ham yozuvlar o'qiladi", () => {
    const res = parseIvmsHtml(SAMPLE.replace(/<tr>\s*<td>№<\/td>[\s\S]*?<\/tr>/, ''))
    expect(res.records).toHaveLength(4)
    expect(res.month).toBe('2026-08')
  })
})

// ---------------------------------------------------------------------------
// Xom format: "Отчет об исходных записях"
// ---------------------------------------------------------------------------
describe('parseIvmsHtml — format aniqlash', () => {
  it('Punch Report formatini aniqlaydi', () => {
    expect(parseIvmsHtml(SAMPLE).format).toBe('punch_report')
  })

  it('xom formatni "Время" + "Состояние посещения" sarlavhasi bo\'yicha aniqlaydi', () => {
    const res = parseIvmsHtml(rawHtml([['1', 'Ali', '2026-09-08 08:00:00', 'in']]))
    expect(res.format).toBe('raw_records')
    expect(res.records).toHaveLength(1)
  })

  it("bo'sh kirish — xatosiz", () => {
    expect(parseIvmsHtml('').records).toHaveLength(0)
  })
})

describe('parseIvmsHtml — xom punchlar', () => {
  const html = rawHtml([
    ['00000024', 'Ali Valiyev', '2026-09-08 08:02:11', 'in'],
    ['00000024', 'Ali Valiyev', '2026-09-08 13:10:00', 'out'],
    ['44', 'Vali Aliyev', '2026-09-08 9:05', 'break_out'],
    ['44', 'Vali Aliyev', '2026-09-09 00:00:00', 'none'],
  ])
  const res = parseIvmsHtml(html)

  it("ID oldidagi apostrofni olib tashlaydi (nollar saqlanadi)", () => {
    expect(res.records.map((r) => r.personId)).toEqual(['00000024', '00000024', '44', '44'])
    expect(cleanPersonId("'1")).toBe('1')
    expect(cleanPersonId('’44')).toBe('44')
  })

  it('sana, vaqt va holatni ajratadi (soniyasiz vaqt ham)', () => {
    expect(res.records[0]).toMatchObject({ date: '2026-09-08', time: '08:02:11', state: 'in', name: 'Ali Valiyev' })
    expect(res.records[2]).toMatchObject({ time: '09:05:00', state: 'break_out' })
    expect(res.records[3].state).toBe('none')
  })

  it("oy — eng ko'p uchragan oy; meta yig'indilari", () => {
    expect(res.month).toBe('2026-09')
    expect(res.meta.punchCount).toBe(4)
    expect(res.meta.stateCounts).toEqual({ in: 1, out: 1, break_out: 1, none: 1 })
    expect(res.meta.statefulDates).toEqual(['2026-09-08'])
  })

  it('tanilmagan holat «Нет» deb olinadi va sanaladi', () => {
    const r = parseIvmsHtml(rawHtml([['1', 'Ali', '2026-09-08 08:00:00', 'Boshqa']]))
    expect(r.records[0].state).toBe('none')
    expect(r.meta.unknownStates).toBe(1)
  })

  it("sahifalar orasida takrorlangan sarlavha keyingi yozuvlarni yo'qotmaydi", () => {
    const repeat = `<tr><td>Отчет об исходных записях</td></tr><tr>${RAW_HEADER.map((h) => `<td>${h}</td>`).join('')}</tr>`
    const r = parseIvmsHtml(rawHtml(
      [['1', 'Ali', '2026-09-08 08:00:00', 'in'], ['1', 'Ali', '2026-09-08 17:00:00', 'out'], ['2', 'Vali', '2026-09-08 08:00:00', 'in']],
      { extra: { 0: repeat } },
    ))
    expect(r.records).toHaveLength(3)
    expect(r.meta.skipped).toBe(0)
  })

  it("begona qator (\"Page 2\") 1 ta o'tkazib yuborilgan deb sanaladi, keyingi yozuvlar saqlanadi", () => {
    const r = parseIvmsHtml(rawHtml(
      [['1', 'Ali', '2026-09-08 08:00:00', 'in'], ['1', 'Ali', '2026-09-08 17:00:00', 'out']],
      { extra: { 0: '<tr><td>Page 2</td></tr>' } },
    ))
    expect(r.records).toHaveLength(2)
    expect(r.meta.skipped).toBe(1)
  })
})

describe('parseIvmsHtml — anonim fixture (haqiqiy fayl tuzilishi: <tr> faqat birinchi qatorda)', () => {
  const html = readFileSync(resolve(process.cwd(), 'src/lib/__fixtures__/ivms_raw_anon.xls'), 'utf8')
  const res = parseIvmsHtml(html)

  it("format, oy va yozuvlar soni", () => {
    expect(res.format).toBe('raw_records')
    expect(res.month).toBe('2026-09')
    expect(res.records).toHaveLength(38)
    expect(res.meta.skipped).toBe(0)
    expect(res.meta.names).toHaveLength(4)
  })

  it("ID lardan apostrof olib tashlangan", () => {
    expect([...new Set(res.records.map((r) => r.personId))].sort()).toEqual(['101', '102', '103', '104'])
  })

  it('holatlar', () => {
    expect(res.meta.stateCounts).toEqual({ none: 13, out: 12, in: 12, break_out: 1 })
  })
})
