// IVMS hisobot faylini o'qib, parseIvmsHtml uchun HTML matnga aylantiradi.
//  - IVMS "Punch Report" aslida HTML (.xls nomli): UTF-8, UTF-16 yoki Windows-1251 bo'lishi mumkin;
//  - Excel'da ochib qayta saqlangan haqiqiy .xls/.xlsx — SheetJS bilan o'qiladi (kerak bo'lganda yuklanadi).

/** Baytlardan matn: BOM yoki nol baytlar bo'yicha UTF-16, aks holda UTF-8 (yaroqsiz bo'lsa Windows-1251) */
export function decodeText(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b)
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b)
  // BOM'siz UTF-16LE: lotin harf/raqamlarning har ikkinchi bayti nol
  const head = b.subarray(0, 512)
  let zeros = 0
  for (let i = 1; i < head.length; i += 2) if (head[i] === 0) zeros++
  if (head.length >= 8 && zeros > head.length / 4) return new TextDecoder('utf-16le').decode(b)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b)
  } catch {
    return new TextDecoder('windows-1251').decode(b)
  }
}

const pad = (n) => String(n).padStart(2, '0')
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

/** Excel katagi -> matn. Excel sana/vaqtni songa aylantirgan bo'ladi — ISO ko'rinishga qaytaramiz */
function cellText(cell, XLSX) {
  if (!cell) return ''
  if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
    const days = Math.floor(cell.v)
    const secs = Math.round((cell.v - days) * 86400)
    const d = new Date(Date.UTC(1899, 11, 30) + days * 86400000) // UTC — soat mintaqasi siljimaydi
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    const time = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`
    if (days === 0) return time
    return secs ? `${date} ${time}` : date
  }
  return cell.w ?? String(cell.v ?? '')
}

/** Haqiqiy Excel fayl: xlsx (ZIP, "PK") yoki eski xls (OLE2) */
function isBinarySpreadsheet(b) {
  return (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0)
}

/** Birinchi varaqni oddiy HTML jadvalga aylantiradi (har qator varaq kengligida — ustunlar siljimaydi) */
async function spreadsheetToHtml(b) {
  const mod = await import('xlsx')
  const XLSX = mod.read ? mod : mod.default
  const wb = XLSX.read(b, { type: 'array', cellNF: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws?.['!ref']) return ''
  const range = XLSX.utils.decode_range(ws['!ref'])
  const rows = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      cells.push(`<td>${esc(cellText(ws[XLSX.utils.encode_cell({ r, c })], XLSX))}</td>`)
    }
    rows.push(`<tr>${cells.join('')}</tr>`)
  }
  return `<table>${rows.join('')}</table>`
}

/** Fayl baytlari -> parseIvmsHtml uchun HTML */
export async function reportBufferToHtml(buffer) {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return isBinarySpreadsheet(b) ? spreadsheetToHtml(b) : decodeText(b)
}

/** Brauzerdagi File -> HTML */
export async function readReportFile(file) {
  return reportBufferToHtml(await file.arrayBuffer())
}
