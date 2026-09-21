import { describe, it, expect } from 'vitest'
import { parseIvmsHtml, groupRecordsByName } from './ivmsParser'

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
