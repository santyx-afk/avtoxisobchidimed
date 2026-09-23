// Hikvision IVMS-4200 "Punch Report" (HTML-xls) parseri
//
// Fayl aslida HTML jadval. Ba'zan bitta <tr> ichida bir nechta yozuv
// ketma-ket keladi — shuning uchun barcha katakchalarni tekislab (flatten),
// 11 ustunlik chunklarga bo'lamiz. Har bir yozuvning 7-katagi (index 6) sana
// bo'lishi kerak — shu bilan haqiqiy ma'lumot qatorlarini ajratamiz.

export const IVMS_COLUMNS = 11
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/

/** HTML matnini DOM ga aylantirib, har bir qatorning katakchalarini oladi */
function extractRows(html) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser mavjud emas (brauzer yoki jsdom kerak)')
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rows = Array.from(doc.querySelectorAll('tr'))
  return rows.map((tr) =>
    Array.from(tr.querySelectorAll('td, th')).map((c) =>
      (c.textContent || '').replace(/ /g, ' ').trim(),
    ),
  )
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Ismni tozalaydi: ortiqcha probellarni siqadi, apostrof variantlarini birlashtiradi (registr saqlanadi) */
export function tidyName(s) {
  return String(s || '')
    .replace(/[ʻʼ‘’´`]/g, "'") // O'/Oʻ/O`/O' variantlari -> '
    .replace(/\s+/g, ' ')
    .trim()
}

/** Ismni moslashtirish uchun normallaydi: tidyName + kichik harf (registrga bog'liq emas) */
export function normalizeName(s) {
  return tidyName(s).toLowerCase()
}

/** Header qatorini topadi (Имя va Дата ustunlari bor qator) */
function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(normalize)
    const hasName = cells.some((c) => c === 'имя' || c === 'ism' || c === 'name')
    const hasDate = cells.some((c) => c === 'дата' || c === 'sana' || c === 'date')
    if (hasName && hasDate) return i
  }
  return -1
}

/** Sana diapazonidan oyni ("YYYY-MM") ajratadi */
function extractMonthFromRange(rows, headerIdx) {
  const limit = headerIdx >= 0 ? headerIdx : Math.min(rows.length, 6)
  for (let i = 0; i < limit; i++) {
    for (const cell of rows[i]) {
      const m = cell.match(/(\d{4})-(\d{2})-\d{2}/)
      if (m) return `${m[1]}-${m[2]}`
    }
  }
  return null
}

function mapChunk(chunk) {
  const clean = (v) => {
    const t = String(v ?? '').trim()
    return t === '-' || t === '--' || t === '' ? null : t
  }
  const time = (v) => {
    const t = clean(v)
    if (!t) return null
    return TIME_RE.test(t) ? t : null
  }
  return {
    no: chunk[0]?.trim() || '',
    personId: chunk[1]?.trim() || '',
    name: tidyName(chunk[2]),
    department: chunk[3]?.trim() || '',
    position: chunk[4]?.trim() || '',
    gender: chunk[5]?.trim() || '',
    date: chunk[6]?.trim() || '',
    dayOfWeek: chunk[7]?.trim() || '',
    schedule: chunk[8]?.trim() || '',
    firstIn: time(chunk[9]),
    lastOut: time(chunk[10]),
  }
}

/**
 * IVMS HTML faylni parse qiladi.
 * @param {string} html
 * @returns {{month: string|null, records: Array, meta: {totalRows: number, skipped: number, names: string[], departments: string[]}}}
 */
export function parseIvmsHtml(html) {
  if (!html || typeof html !== 'string') {
    return { month: null, records: [], meta: { totalRows: 0, skipped: 0, names: [], departments: [] } }
  }

  const rows = extractRows(html)
  const headerIdx = findHeaderRow(rows)
  const month = extractMonthFromRange(rows, headerIdx)

  // Header qatoridan keyingi barcha katakchalarni tekislaymiz
  const startRow = headerIdx >= 0 ? headerIdx + 1 : 0
  let dataCells = []

  // Agar header qatorida 11 dan ortiq katak bo'lsa — ortiqchasi ma'lumot
  if (headerIdx >= 0 && rows[headerIdx].length > IVMS_COLUMNS) {
    dataCells = dataCells.concat(rows[headerIdx].slice(IVMS_COLUMNS))
  }
  for (let i = startRow; i < rows.length; i++) {
    dataCells = dataCells.concat(rows[i])
  }

  const records = []
  let skipped = 0
  for (let i = 0; i + IVMS_COLUMNS <= dataCells.length; i += IVMS_COLUMNS) {
    const chunk = dataCells.slice(i, i + IVMS_COLUMNS)
    if (DATE_RE.test(String(chunk[6]).trim())) {
      const rec = mapChunk(chunk)
      if (rec.name) records.push(rec)
      else skipped++
    } else {
      // takrorlangan header yoki begona qator — o'tkazib yuboramiz
      skipped++
    }
  }

  const names = [...new Set(records.map((r) => r.name))].sort()
  const departments = [...new Set(records.map((r) => r.department).filter(Boolean))].sort()

  // Oy — yozuvlarda eng ko'p uchragan oy (diapazon bir necha oyni qamrasa ham to'g'ri,
  // masalan "07-25 — 08-31" -> 2026-08). Yozuv bo'lmasa — sarlavhadagi diapazondan.
  const monthCounts = {}
  for (const r of records) {
    const m = r.date.slice(0, 7)
    monthCounts[m] = (monthCounts[m] || 0) + 1
  }
  const dominant = Object.keys(monthCounts).sort((a, b) => monthCounts[b] - monthCounts[a])[0]

  return {
    month: dominant || month,
    records,
    meta: {
      totalRows: rows.length,
      skipped,
      names,
      departments,
      monthCounts,
    },
  }
}

/** Parse qilingan yozuvlarni ism bo'yicha guruhlaydi: { name: [records] } */
export function groupRecordsByName(records) {
  const map = new Map()
  for (const r of records) {
    if (!map.has(r.name)) map.set(r.name, [])
    map.get(r.name).push(r)
  }
  return map
}
