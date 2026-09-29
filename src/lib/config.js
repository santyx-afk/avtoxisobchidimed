// Ilova konfiguratsiyasi va muhit o'zgaruvchilari

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const IVMS_BUCKET = import.meta.env.VITE_IVMS_BUCKET || 'ivms-reports'

// Windows ilova (Electron): preload `window.dimed` ni beradi. Bu rejimda hamma narsa
// kompyuterning o'zida (diskdagi fayl) saqlanadi, internet va Supabase kerak emas.
export const IS_DESKTOP = typeof window !== 'undefined' && Boolean(window.dimed?.isDesktop)

// Supabase sozlangan bo'lsa — real DB, aks holda DEMO (localStorage) rejim
export const isSupabaseConfigured = !IS_DESKTOP && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

// Real DB bilan faqat Supabase Auth (email+parol) ishlatiladi: parollar bundle'ga
// tushmaydi, RLS esa faqat 'staff' rolidagi foydalanuvchilarga ruxsat beradi.
// Nickname+parol login faqat DEMO rejimda qoladi (ma'lumotlar shu brauzerda).
export const SUPABASE_AUTH = isSupabaseConfigured

/**
 * DEMO rejim foydalanuvchilari — VITE_USERS: "admin:parol1,buxgalter:parol2".
 * Real (Supabase) rejimda ishlatilmaydi.
 * @returns {Array<{nickname: string, password: string}>}
 */
export function parseUsers() {
  const raw = import.meta.env.VITE_USERS || ''
  const users = raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':')
      if (idx === -1) return null
      return {
        nickname: pair.slice(0, idx).trim(),
        password: pair.slice(idx + 1).trim(),
      }
    })
    .filter((u) => u && u.nickname && u.password)

  // Agar .env bo'sh bo'lsa — demo login (faqat local test uchun)
  if (users.length === 0) {
    return [
      { nickname: 'admin', password: 'admin' },
      { nickname: 'buxgalter', password: 'buxgalter' },
      { nickname: 'direktor', password: 'direktor' },
    ]
  }
  return users
}

export const APP_NAME = 'Dimed Salary'
export const APP_SUBTITLE = 'HR oylik hisoblash tizimi'
