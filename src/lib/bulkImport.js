// Ommaviy oylik kiritish: Excel/matndan nusxa-joylashtirilgan qatorlarni parse qiladi.
// Har qator: "Ism <TAB|;|,> Summa [<sep> tur(fix/hourly)]"
import { normalizeName } from './ivmsParser'

/**
 * @param {string} text
 * @returns {Array<{name, amount, type|null, invalid?: boolean}>}
 */
export function parseBulkSalary(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    let parts
    if (line.includes('\t')) parts = line.split('\t')
    else if (line.includes(';')) parts = line.split(';')
    else {
      // Ajratkich yo'q — oxirgi sonni summa deb olamiz (ism sonli bo'lmaydi)
      const m = line.match(/^(.+?)[\s,;]+([\d][\d\s,'.]*)\s*([A-Za-z]+)?$/)
      if (m) parts = [m[1], m[2], m[3] || ''].filter((_, i) => i < 2 || m[3])
      else parts = [line]
    }
    parts = parts.map((p) => (p || '').trim())

    const name = parts[0]
    // Kasr qismi (",00" / ".50") tashlanadi — aks holda "4 500 000,00" 450 000 000 bo'lib qolardi
    const amount = parts[1] ? parseInt(parts[1].replace(/[.,]\d{1,2}\s*$/, '').replace(/[^\d]/g, ''), 10) : NaN
    if (!name || Number.isNaN(amount) || amount <= 0) {
      out.push({ name, amount: null, type: null, invalid: true })
      continue
    }
    let type = null
    if (parts[2]) {
      const t = parts[2].toLowerCase()
      if (t.startsWith('soat') || t === 'hourly' || t === 'h') type = 'hourly'
      else if (t.startsWith('kun') || t === 'daily' || t === 'd') type = 'daily'
      else if (t.startsWith('fix') || t.startsWith('oylik') || t === 'f') type = 'fix'
    }
    out.push({ name, amount, type })
  }
  return out
}

/**
 * Parse qilingan qatorlarni mavjud ishchilarga moslaydi.
 * @returns {{matched: Array, unmatched: Array, invalid: Array}}
 */
export function matchBulkSalary(rows, employees) {
  const empByNorm = new Map(employees.map((e) => [normalizeName(e.name), e]))
  const matched = []
  const unmatched = []
  const invalid = []
  for (const row of rows) {
    if (row.invalid) { invalid.push(row); continue }
    const emp = empByNorm.get(normalizeName(row.name))
    if (!emp) { unmatched.push(row); continue }
    const calc_type = row.type || emp.calc_type || 'fix'
    // Faqat tegishli maydon to'ldiriladi, qolganlari null
    const patch = { calc_type, monthly_salary: null, hourly_rate: null, daily_rate: null }
    if (calc_type === 'hourly') patch.hourly_rate = row.amount
    else if (calc_type === 'daily') patch.daily_rate = row.amount
    else patch.monthly_salary = row.amount
    matched.push({ id: emp.id, name: emp.name, calc_type, amount: row.amount, patch })
  }
  return { matched, unmatched, invalid }
}
