import { createContext, useContext, useEffect, useState } from 'react'
import { parseUsers, SUPABASE_AUTH } from './config'
import { supabase } from './supabase'

const AuthContext = createContext(null)
const SESSION_KEY = 'dimed-session'

// Supabase Auth faqat yoqilgan VA klient mavjud bo'lsa ishlatiladi
const useSupabaseAuth = SUPABASE_AUTH && supabase

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (useSupabaseAuth) {
      // --- Supabase Auth rejimi ---
      supabase.auth.getSession().then(({ data }) => {
        const s = data?.session
        setUser(s ? { nickname: s.user.email, id: s.user.id } : null)
        setLoading(false)
      }).catch(() => setLoading(false))
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        setUser(session ? { nickname: session.user.email, id: session.user.id } : null)
      })
      return () => sub?.subscription?.unsubscribe?.()
    }

    // --- Custom login rejimi (o'zgarmagan) ---
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.nickname) setUser(parsed)
      }
    } catch (e) {
      // buzilgan session
    }
    setLoading(false)
  }, [])

  /**
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async function login(identifier, password) {
    if (useSupabaseAuth) {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(identifier).trim(),
        password,
      })
      if (error) return { ok: false, error: 'Email yoki parol xato' }
      return { ok: true }
    }

    // Custom login (o'zgarmagan)
    const users = parseUsers()
    const found = users.find(
      (u) => u.nickname === String(identifier).trim() && u.password === String(password),
    )
    if (!found) {
      return { ok: false, error: "Nickname yoki parol noto'g'ri" }
    }
    const session = { nickname: found.nickname, loginAt: new Date().toISOString() }
    setUser(session)
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch (e) {
      // e'tiborsiz
    }
    return { ok: true }
  }

  async function logout() {
    if (useSupabaseAuth) {
      await supabase.auth.signOut().catch(() => {})
      setUser(null)
      return
    }
    setUser(null)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch (e) {
      // e'tiborsiz
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak')
  return ctx
}
