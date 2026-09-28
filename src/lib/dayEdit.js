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
