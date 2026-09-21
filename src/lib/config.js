// Ilova konfiguratsiyasi va muhit o'zgaruvchilari

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const IVMS_BUCKET = import.meta.env.VITE_IVMS_BUCKET || 'ivms-reports'

// Supabase sozlangan bo'lsa — real DB, aks holda DEMO (localStorage) rejim
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

// Xavfsiz login: yoqilsa custom login o'rniga Supabase Auth (email+parol) ishlatiladi.
// Default OFF — hozirgi nickname+parol login o'zgarmaydi.
export const SUPABASE_AUTH = import.meta.env.VITE_SUPABASE_AUTH === 'true'

/**
 * VITE_USERS ni parse qiladi: "admin:parol1,buxgalter:parol2"
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
