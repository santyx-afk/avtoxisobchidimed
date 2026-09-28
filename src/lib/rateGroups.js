// Guruh stavkalari: tungi/kunduzgi hamshira, farrosh va h.k. — tanlangan xodimlarga oylik yoki
// smena uchun summani ommaviy qo'yish. Guruhlar sozlamalarda (settings.rate_groups) saqlanadi.

export const RATE_TYPES = [
  ['fix', 'Oylik (fix)'],
  ['daily', 'Smena uchun (kunbay)'],
]

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `g-${Math.random().toString(36).slice(2)}`)

export const newGroup = (name = '') => ({ id: uid(), name, type: 'fix', amount: '', employee_ids: [] })

/** Saqlangan guruhlar bo'sh bo'lsa — to'rtta tayyor guruh */
export function initialGroups(saved) {
  if (Array.isArray(saved) && saved.length) return saved.map((g) => ({ ...g, employee_ids: g.employee_ids || [] }))
  return ['Tungi hamshiralar', 'Tungi farroshlar', 'Kunduzgi hamshiralar', 'Kunduzgi farroshlar'].map(newGroup)
}

/** Xodimni bitta guruhga biriktiradi (boshqa guruhlardan olib tashlaydi — bir xodim bitta stavkada) */
export function assignEmployees(groups, groupId, employeeIds) {
  const chosen = new Set(employeeIds)
  return groups.map((g) => (g.id === groupId
    ? { ...g, employee_ids: [...chosen] }
    : { ...g, employee_ids: g.employee_ids.filter((id) => !chosen.has(id)) }))
}

/**
 * Guruhlardan xodim yangilanishlarini yasaydi: [{ id, patch }].
 * @throws {Error} a'zosi bor guruhda summa yo'q bo'lsa
 */
export function groupPatches(groups) {
  const out = []
  for (const g of groups) {
    if (!g.employee_ids.length) continue
    const amount = Number(g.amount)
    if (!(amount > 0)) throw new Error(`«${g.name || 'Guruh'}» uchun summa kiriting`)
    const patch = g.type === 'daily'
      ? { calc_type: 'daily', daily_rate: amount, monthly_salary: null, hourly_rate: null }
      : { calc_type: 'fix', monthly_salary: amount, daily_rate: null, hourly_rate: null }
    for (const id of g.employee_ids) out.push({ id, patch })
  }
  return out
}
