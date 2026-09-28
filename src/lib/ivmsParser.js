// Hikvision IVMS-4200 hisobotlari (HTML-xls) parseri. Ikki format:
//  - "Punch Report" (birinchi kirish / oxirgi chiqish) — kunlik qator, 7-katak sana;
//  - "Отчет об исходных записях" (xom punchlar) — bitta qator = bitta punch, 4-katak "YYYY-MM-DD HH:MM:SS",
//    5-katak holat (Приход / Уход / ... / Нет). Sarlavhadagi "Время" + "Состояние посещения" bo'yicha aniqlanadi.
//
// Fayl aslida HTML jadval. Ba'zan bitta <tr> ichida bir nechta yozuv
// ketma-ket keladi — shuning uchun barcha katakchalarni tekislab (flatten),
// 11 ustunlik chunklarga bo'lamiz. Har bir yozuvning 7-katagi (index 6) sana
// bo'lishi kerak — shu bilan haqiqiy ma'lumot qatorlarini ajratamiz.

import { IVMS_FORMAT, PUNCH_STATE } from './constants'

export const IVMS_COLUMNS = 11
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Xom format vaqti: "2026-09-28 08:12:01" (faqat sana bo'lsa — yarim tun)
const STAMP_RE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?$/
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
      (c.textContent || '').replace(/\u00A0/g, ' ').trim(),
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

const has = (n, ...names) => n.some((c) => names.includes(c))

/** Xom format sarlavhasi: Имя + Время + Состояние посещения */
function isRawHeaderLike(cells) {
  const n = cells.map(normalize)
  return has(n, 'имя', 'name') && has(n, 'время', 'time') && has(n, 'состояние посещения', 'attendance status')
}

/** Punch Report sarlavhasi: Имя + Дата */
function isPunchHeaderLike(cells) {
  const n = cells.map(normalize)
  return has(n, 'имя', 'ism', 'name') && has(n, 'дата', 'sana', 'date')
}

/** Header qatori (yoki uning bo'lagi) — ikkala format uchun */
function isHeaderLike(cells) {
  return isRawHeaderLike(cells) || isPunchHeaderLike(cells)
}

/** Formatni aniqlaydi: { format, headerIdx }. Sarlavha topilmasa — eski Punch Report */
function detectFormat(rows) {
  const raw = rows.findIndex(isRawHeaderLike)
  if (raw >= 0) return { format: IVMS_FORMAT.RAW_RECORDS, headerIdx: raw }
  return { format: IVMS_FORMAT.PUNCH_REPORT, headerIdx: rows.findIndex(isPunchHeaderLike) }
}

/** IVMS ID oldidagi apostrofni (Excel matn belgisi: '1, '44) olib tashlaydi */
export function cleanPersonId(v) {
  return String(v ?? '').trim().replace(/^['ʻʼ‘’´`]+/, '')
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
    personId: cleanPersonId(chunk[1]),
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

const RAW_STATES = {
  'приход': PUNCH_STATE.IN,
  'уход': PUNCH_STATE.OUT,
  'приход при перерыве': PUNCH_STATE.BREAK_IN,
  'уход при перерыве': PUNCH_STATE.BREAK_OUT,
  'нет': PUNCH_STATE.NONE,
}

/** Xom format ustun indekslari: sarlavhadan, topilmasa IVMS standart tartibi */
function rawColumns(headerCells) {
  const n = (headerCells || []).map(normalize)
  const at = (names, def) => {
    const i = n.findIndex((c) => names.includes(c))
    return i >= 0 ? i : def
  }
  return {
    personId: at(['идентификатор человека', 'person id'], 0),
    name: at(['имя', 'name'], 1),
    department: at(['департамент', 'department'], 2),
    time: at(['время', 'time'], 3),
    state: at(['состояние посещения', 'attendance status'], 4),
    label: at(['пользовательское название', 'custom name'], 6),
  }
}

function mapRawChunk(chunk, col) {
  const m = String(chunk[col.time] ?? '').trim().match(STAMP_RE)
  const rawState = String(chunk[col.state] ?? '').trim()
  const state = RAW_STATES[normalize(rawState)]
  const time = m[2] ? (m[2].length === 4 ? `0${m[2]}` : m[2]) : '00:00'
  return {
    personId: cleanPersonId(chunk[col.personId]),
    name: tidyName(chunk[col.name]),
    department: String(chunk[col.department] ?? '').trim(),
    date: m[1],
    time: time.length === 5 ? `${time}:00` : time,
    state: state || PUNCH_STATE.NONE,
    rawState,
    unknownState: !state,
    label: String(chunk[col.label] ?? '').trim(),
  }
}

/**
 * Tekislangan katakchalarni yozuvlarga bo'ladi. Yaroqsiz bo'lak (takrorlangan header,
 * "Page 2" kabi begona qator) uchrasa 1 katakka surib qayta sinxronlanamiz — aks holda
 * bitta ortiqcha katak keyingi barcha yozuvlarni yo'qotardi.
 * @param {(chunk: string[]) => boolean} isRecord bo'lak yozuv bo'ladimi
 * @param {(chunk: string[]) => object|null} map bo'lak -> yozuv (null — yaroqsiz)
 */
function chunkRecords(dataCells, isRecord, map) {
  const records = []
  let skipped = 0 // tanilmagan bo'laklar (takrorlangan header va bo'sh kataklar sanalmaydi)
  let junk = []
  const flushJunk = () => {
    if (junk.some((c) => String(c).trim()) && !isHeaderLike(junk)) skipped++
    junk = []
  }
  let i = 0
  while (i + IVMS_COLUMNS <= dataCells.length) {
    const chunk = dataCells.slice(i, i + IVMS_COLUMNS)
    if (isRecord(chunk)) {
      flushJunk()
      const rec = map(chunk)
      if (rec) records.push(rec)
      else skipped++
      i += IVMS_COLUMNS
    } else {
      junk.push(dataCells[i])
      i++
    }
  }
  junk.push(...dataCells.slice(i))
  flushJunk()
  return { records, skipped }
}

/**
 * IVMS HTML faylni parse qiladi (format o'zi aniqlanadi).
 * Punch Report: yozuv = kunlik qator { date, firstIn, lastOut, ... }.
 * Xom format: yozuv = bitta punch { date, time, state, ... } — juftlash salaryCalc da.
 * @param {string} html
 * @returns {{format: string, month: string|null, records: Array, meta: object}}
 */
export function parseIvmsHtml(html) {
  if (!html || typeof html !== 'string') {
    return { format: IVMS_FORMAT.PUNCH_REPORT, month: null, records: [], meta: { totalRows: 0, skipped: 0, names: [], departments: [] } }
  }

  const rows = extractRows(html)
  const { format, headerIdx } = detectFormat(rows)
  const isRaw = format === IVMS_FORMAT.RAW_RECORDS
  const month = extractMonthFromRange(rows, headerIdx)

  // Header qatoridan keyingi barcha katakchalarni tekislaymiz
  const startRow = headerIdx >= 0 ? headerIdx + 1 : 0
  let dataCells = []

  // Agar header qatorida 11 dan ortiq katak bo'lsa — ortiqchasi ma'lumot
  if (headerIdx >= 0 && rows[headerIdx].length > IVMS_COLUMNS) {
    dataCells = dataCells.concat(rows[headerIdx].slice(IVMS_COLUMNS))
  }
  dataCells = dataCells.concat(rows.slice(startRow).flat())

  let records
  let skipped
  if (isRaw) {
    const col = rawColumns(rows[headerIdx])
    ;({ records, skipped } = chunkRecords(
      dataCells,
      (chunk) => STAMP_RE.test(String(chunk[col.time]).trim()) && String(chunk[col.state]).trim() !== '',
      (chunk) => {
        const rec = mapRawChunk(chunk, col)
        return rec.name ? rec : null
      },
    ))
  } else {
    ;({ records, skipped } = chunkRecords(
      dataCells,
      (chunk) => DATE_RE.test(String(chunk[6]).trim()),
      (chunk) => {
        const rec = mapChunk(chunk)
        return rec.name ? rec : null
      },
    ))
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

  const meta = { totalRows: rows.length, skipped, names, departments, monthCounts }
  if (isRaw) {
    const stateCounts = {}
    for (const r of records) stateCounts[r.state] = (stateCounts[r.state] || 0) + 1
    meta.punchCount = records.length
    meta.stateCounts = stateCounts
    meta.unknownStates = records.filter((r) => r.unknownState).length
    // Приход/Уход bosilgan kunlar (faqat «Нет» bo'lmagan)
    meta.statefulDates = [...new Set(records.filter((r) => r.state !== PUNCH_STATE.NONE).map((r) => r.date))].sort()
  }

  return { format, month: dominant || month, records, meta }
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
