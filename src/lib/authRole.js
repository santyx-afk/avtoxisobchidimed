// Supabase Auth foydalanuvchisining roli. Rol app_metadata.role da saqlanadi —
// uni faqat administrator (SQL yoki servis kalit) o'zgartira oladi, foydalanuvchi
// o'zi emas (user_metadata dan farqli). RLS (supabase/schema.sql) ham shu rolni tekshiradi.
export const STAFF_ROLE = 'staff'

export const NO_ACCESS_MESSAGE =
  "Bu hisobga ruxsat berilmagan. Administrator Supabase'da unga 'staff' rolini berishi kerak (README → Xavfsizlik)."

/** Sessiyadan ilova foydalanuvchisini yasaydi; 'staff' roli bo'lmasa null */
export function staffUserFromSession(session) {
  const u = session?.user
  if (!u || u.app_metadata?.role !== STAFF_ROLE) return null
  return { nickname: u.email, id: u.id, role: STAFF_ROLE }
}
