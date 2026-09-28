// Kunni qo'lda tuzatish: foydalanuvchi kiritgan "HH:MM" juftliklarini tekshirib, sessions ga aylantiradi
import { timeToMinutes } from './format'

const HM_RE = /^\d{1,2}:\d{2}$/

/**
 * @param {Array<{in: string, out: string}>} rows kiritilgan juftliklar (bo'sh qatorlar tashlanadi)
 * @param {{night?: boolean}} opts tungi jadvalli ishchida chiqish <= kirish — keyingi kun
 * @returns {Array<{in: number, out: number}>} tartiblangan, kesishmaydigan juftliklar (daqiqalar)
 * @throws {Error} tushunarli xabar bilan
 */
export function parseSessionsInput(rows, { night = false } = {}) {
  const out = []
  for (const [i, r] of (rows || []).entries()) {
    const a = String(r.in || '').trim()
    const b = String(r.out || '').trim()
    if (!a && !b) continue
    const n = i + 1
    if (!HM_RE.test(a) || !HM_RE.test(b)) throw new Error(`${n}-juftlik: vaqtni SS:DD ko'rinishida kiriting (masalan 08:00)`)
    const from = timeToMinutes(a)
    let to = timeToMinutes(b)
    if (from > 1439 || to > 1439 || from < 0) throw new Error(`${n}-juftlik: vaqt noto'g'ri`)
    if (to <= from) {
      if (!night) throw new Error(`${n}-juftlik: chiqish kirishdan keyin bo'lishi kerak`)
      to += 1440
    }
    out.push({ in: from, out: to })
  }
  out.sort((x, y) => x.in - y.in)
  for (let i = 1; i < out.length; i++) {
    if (out[i].in < out[i - 1].out) throw new Error('Juftliklar bir-birini kesib o\'tmasligi kerak')
  }
  return out
}

const hm = (min) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const rowOf = (a, b) => ({ in: a == null ? '' : hm(a), out: b == null ? '' : hm(b) })

/**
 * Tuzatish oynasi uchun boshlang'ich qatorlar: mavjud juftliklar + muammodan ma'lum vaqtlar
 * (yopilmagan Приход — kirish to'ldirilgan, Уход bo'sh; Приход'siz Уход — chiqish to'ldirilgan;
 * faqat «Нет» — birinchi va oxirgi punch taklif sifatida). Bo'sh joyni foydalanuvchi to'ldiradi.
 */
export function editRowsFor(day) {
  const rows = (day?.sessions || []).map((x) => rowOf(x.in, x.out))
  for (const i of day?.issues || []) {
    if (i.type === 'unclosed_in') rows.push(rowOf(i.at, null))
    else if (i.type === 'orphan_out') rows.push(rowOf(null, i.at))
    else if (i.type === 'only_none' && i.at != null) rows.push(rowOf(i.at, i.last))
  }
  return rows.length ? rows : [rowOf(null, null)]
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
