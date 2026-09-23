// Oyni qulflash (lock) — to'langan oyni tasodifan o'zgartirishdan himoya.
// Schema o'zgarmasligi uchun settings.locked_months (jsonb) da saqlanadi.
import * as db from './db'

export async function getLockedMonths() {
  const s = await db.getSettings()
  return s.locked_months || []
}

export async function isMonthLocked(month) {
  if (!month) return false
  const list = await getLockedMonths()
  return list.includes(month)
}

export async function setMonthLocked(month, locked) {
  const list = await getLockedMonths()
  const has = list.includes(month)
  let next = list
  if (locked && !has) next = [...list, month].sort()
  else if (!locked && has) next = list.filter((m) => m !== month)
  await db.updateSettings({ locked_months: next })
  return next
}

/** Qulflangan oyni o'zgartirishga urinishda xato beradi */
export async function assertMonthUnlocked(month) {
  if (await isMonthLocked(month)) {
    throw new Error(`${month} oyi qulflangan (yopilgan). O'zgartirish uchun avval «Oylik hisoblash» sahifasida oyni oching.`)
  }
}
