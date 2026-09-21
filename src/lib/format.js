// Formatlash va vaqt yordamchilari

/** Raqamni so'm formatida: 1000000 -> "1 000 000" */
export function formatSom(value, { withCurrency = false } = {}) {
  const n = Math.round(Number(value) || 0)
  const sign = n < 0 ? '-' : ''
  const str = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${str}${withCurrency ? " so'm" : ''}`
}

/** Farq uchun ishorali format: +150000 -> "+150 000" */
export function formatSigned(value) {
  const n = Math.round(Number(value) || 0)
  if (n === 0) return '0'
  const s = formatSom(Math.abs(n))
  return (n > 0 ? '+' : '−') + s
}

/** "HH:MM:SS" yoki "HH:MM" -> daqiqalar (00:00 dan). "-", null -> null */
export function timeToMinutes(time) {
  if (!time || time === '-' || time === '--') return null
  const parts = String(time).trim().split(':')
  if (parts.length < 2) return null
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const s = parts.length > 2 ? parseInt(parts[2], 10) : 0
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m + Math.round((s || 0) / 60)
}

/** daqiqalar -> "8s 30d" ko'rinishida */
export function minutesToHm(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h === 0) return `${mm}d`
  if (mm === 0) return `${h}s`
  return `${h}s ${mm}d`
}

/** daqiqalar -> soat (numeric, 2 kasr) */
export function minutesToHours(minutes) {
  return Math.round(((Number(minutes) || 0) / 60) * 100) / 100
}

/** "HH:MM:SS" -> "HH:MM" */
export function shortTime(time) {
  if (!time || time === '-') return '—'
  const parts = String(time).split(':')
  return `${parts[0]}:${parts[1]}`
}

const MONTH_NAMES_UZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]

/** "2026-08" -> "Avgust 2026" */
export function formatMonth(monthStr) {
  if (!monthStr) return ''
  const [y, m] = monthStr.split('-')
  const idx = parseInt(m, 10) - 1
  if (idx < 0 || idx > 11) return monthStr
  return `${MONTH_NAMES_UZ[idx]} ${y}`
}

/** "2026-08-05" -> "05.08.2026" */
export function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${d}.${m}.${y}`
}

/** "2026-08-05" -> "05.08" */
export function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  if (!m || !d) return dateStr
  return `${d}.${m}`
}

/** Joriy oy "YYYY-MM" */
export function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Oldingi oy "YYYY-MM" */
export function previousMonth(monthStr = currentMonth()) {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Oydagi kunlar soni */
export function daysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** "YYYY-MM-DD" -> hafta kuni raqami (0=Yakshanba ... 6=Shanba) */
export function weekdayOfDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

export const WEEKDAY_NAMES_UZ = [
  'Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba',
  'Payshanba', 'Juma', 'Shanba',
]

export const WEEKDAY_SHORT_UZ = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan']

/** ISO sana bilan hozirgi vaqtgacha o'tgan vaqt: "2 soat oldin" */
export function timeAgo(iso) {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hozirgina'
  if (min < 60) return `${min} daqiqa oldin`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs} soat oldin`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} kun oldin`
  return formatDateTime(iso)
}

/** ISO -> "05.09.2026 10:00" */
export function formatDateTime(iso) {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}
