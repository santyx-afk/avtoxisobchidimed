// Kunni qo'lda tuzatish: smena = kirish (sana + soat) va chiqish (sana + soat)
import { addDays } from './format'

const STAMP_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})$/
const MAX_SHIFT_MIN = 36 * 60

const dayNumber = (date) => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}
const pad = (n) => String(n).padStart(2, '0')
const hm = (min) => `${pad(Math.floor((min % 1440) / 60))}:${pad(min % 60)}`

/** Sana + smena sanasi 00:00 dan daqiqalar -> "YYYY-MM-DDTHH:MM" (daqiqa 1440 dan oshsa keyingi kun) */
function stampOf(date, minutes) {
  if (minutes == null) return ''
  return `${addDays(date, Math.floor(minutes / 1440))}T${hm(minutes)}`
}

/**
 * Kiritilgan kirish/chiqish ("YYYY-MM-DDTHH:MM") ni smenaga aylantiradi.
 * Smena sanasi — kirish sanasi; chiqish ertasi kuni (yoki undan keyin) bo'lishi mumkin.
 * Ikkalasi bo'sh — kun «kelmagan» (sessions: []).
 * @returns {{date: string|null, sessions: Array<{in: number, out: number}>}}
 * @throws {Error} tushunarli xabar bilan
 */
export function parseShiftInput({ in: inStr, out: outStr }) {
  const a = String(inStr || '').trim()
  const b = String(outStr || '').trim()
  if (!a && !b) return { date: null, sessions: [] }
  if (!a || !b) throw new Error("Kirish va chiqishning sana va soatini to'liq kiriting (yoki ikkalasini ham bo'sh qoldiring)")
  const ma = a.match(STAMP_RE)
  const mb = b.match(STAMP_RE)
  if (!ma || !mb) throw new Error('Sana va soatni to\'g\'ri kiriting')
  const inMin = Number(ma[2]) * 60 + Number(ma[3])
  const outMin = (dayNumber(mb[1]) - dayNumber(ma[1])) * 1440 + Number(mb[2]) * 60 + Number(mb[3])
  if (Number(ma[2]) > 23 || Number(mb[2]) > 23 || Number(ma[3]) > 59 || Number(mb[3]) > 59) throw new Error("Soat noto'g'ri")
  if (outMin <= inMin) throw new Error("Chiqish kirishdan keyin bo'lishi kerak (ertasi kuni bo'lsa, chiqish sanasini o'zgartiring)")
  if (outMin - inMin > MAX_SHIFT_MIN) throw new Error("Smena 36 soatdan uzun bo'lmasin — sanalarni tekshiring")
  return { date: ma[1], sessions: [{ in: inMin, out: outMin }] }
}

/**
 * Tuzatish oynasi uchun boshlang'ich kirish/chiqish: mavjud smena (birinchi kirish — oxirgi chiqish),
 * yopilmagan Приход (kirish yozilgan, chiqish bo'sh), Приход'siz Уход (chiqish yozilgan),
 * faqat «Нет» (birinchi va oxirgi punch taklif sifatida).
 */
export function editPairFor(day) {
  const date = day?.date
  if (!date) return { in: '', out: '' }
  const ss = day.sessions || []
  if (ss.length) return { in: stampOf(date, ss[0].in), out: stampOf(date, ss[ss.length - 1].out) }
  for (const i of day.issues || []) {
    if (i.type === 'unclosed_in') return { in: stampOf(date, i.at), out: '' }
    if (i.type === 'orphan_out') return { in: '', out: stampOf(date, i.at) }
    if (i.type === 'only_none' && i.at != null) return { in: stampOf(date, i.at), out: stampOf(date, i.last) }
  }
  return { in: '', out: '' }
}

/** Muammo tavsifi (ro'yxatda ko'rsatish uchun) */
export function issueDetail(issue) {
  switch (issue.type) {
    case 'unclosed_in': return `Приход ${hm(issue.at)} — Уход bosilmagan`
    case 'orphan_out': return `Уход ${hm(issue.at)} — oldidan Приход yo'q`
    case 'only_none': return issue.at == null ? 'Faqat «Нет» punchlar'
      : `Faqat «Нет»: birinchi ${hm(issue.at)}, oxirgi ${hm(issue.last)} (${issue.count} ta)`
    case 'orphan_break': return `Tanaffus punchi ${hm(issue.at)} juftlanmadi`
    case 'short': return `1 daqiqadan qisqa juftlik (${hm(issue.at)})`
    default: return issue.type
  }
}

/**
 * Berilgan turdagi muammolarni ishchi/kun bo'yicha yig'adi.
 * @param {Array<{employee, summary}>} results  @param {Map<string, Array>} daysByEmp
 * @returns {Array<{employee, summary, day, issue}>} ism va sana bo'yicha tartiblangan
 */
export function collectDayIssues(results, daysByEmp, type) {
  const out = []
  for (const r of results || []) {
    for (const day of daysByEmp.get(r.employee.id) || []) {
      for (const issue of day.issues || []) {
        if (issue.type === type) out.push({ employee: r.employee, summary: r.summary, day, issue })
      }
    }
  }
  return out.sort((a, b) => (a.employee.name.localeCompare(b.employee.name) || (a.day.date < b.day.date ? -1 : 1)))
}
