import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { decodeText, reportBufferToHtml } from './readReportFile'
import { parseIvmsHtml } from './ivmsParser'

const sample = readFileSync(resolve(process.cwd(), 'sample/ivms_2026-08.xls'))

describe('readReportFile — kodirovka', () => {
  it('UTF-8 namunaviy IVMS fayl: barcha yozuvlar, begona qator yo\'q', async () => {
    const res = parseIvmsHtml(await reportBufferToHtml(sample))
    expect(res.records).toHaveLength(434)
    expect(res.meta.skipped).toBe(0)
  })

  it('UTF-16 (BOM bilan va BOMsiz)', () => {
    const text = sample.toString('utf8')
    const withBom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
    expect(parseIvmsHtml(decodeText(withBom)).records).toHaveLength(434)
    expect(parseIvmsHtml(decodeText(Buffer.from(text, 'utf16le'))).records).toHaveLength(434)
  })

  it('Windows-1251 — kirill sarlavha to\'g\'ri o\'qiladi', () => {
    const cp1251 = Buffer.concat([
      Buffer.from('<table><tr><td>'), Buffer.from([0xc8, 0xec, 0xff]), // Имя
      Buffer.from('</td><td>'), Buffer.from([0xc4, 0xe0, 0xf2, 0xe0]), // Дата
      Buffer.from('</td></tr></table>'),
    ])
    expect(decodeText(cp1251)).toContain('<td>Имя</td><td>Дата</td>')
  })
})

describe("readReportFile — Excel'da qayta saqlangan .xlsx", () => {
  it("sana/vaqt sonlari ISO ko'rinishga qaytadi va yozuv o'qiladi", async () => {
    const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000
    const ws = XLSX.utils.aoa_to_sheet([
      ['Dimed'],
      ['2026-08-01 00:00:00 - 2026-08-31 23:59:59'],
      ['№', 'Идентификатор человека', 'Имя', 'Департамент', 'Должность', 'Пол', 'Дата', 'День недели', 'Расписание', 'Первый вход', 'Последний выход'],
      [1, 1001, 'Aliyeva Nigora', 'Dimed', '', 'Ж', 0, 'Пн', '08:00-17:00', 0, 0],
    ])
    ws.G4 = { t: 'n', v: serial(2026, 8, 3), z: 'dd.mm.yyyy' }
    ws.J4 = { t: 'n', v: (7 * 60 + 58) / 1440, z: 'hh:mm:ss' }
    ws.K4 = { t: 'n', v: 17 / 24, z: 'h:mm' }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

    const res = parseIvmsHtml(await reportBufferToHtml(bytes))
    expect(res.month).toBe('2026-08')
    expect(res.records).toHaveLength(1)
    expect(res.records[0]).toMatchObject({
      date: '2026-08-03', firstIn: '07:58:00', lastOut: '17:00:00', personId: '1001', name: 'Aliyeva Nigora',
    })
  })
})
