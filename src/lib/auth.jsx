import { createContext, useContext, useEffect, useState } from 'react'
import { parseUsers, SUPABASE_AUTH, IS_DESKTOP } from './config'
import { supabase } from './supabase'
import { staffUserFromSession, NO_ACCESS_MESSAGE } from './authRole'
import { desktopAuth } from './desktop'

const AuthContext = createContext(null)
const SESSION_KEY = 'dimed-session'
const DESKTOP_USER = { nickname: 'Administrator' }

// Real DB (Supabase) bilan — faqat Supabase Auth; DEMO rejimda — nickname+parol;
// Windows ilovada — faqat parol (kompyuterda saqlanadi, internet kerak emas)
const useSupabaseAuth = SUPABASE_AUTH && supabase

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false) // Windows ilova: parol hali o'rnatilmagan

  useEffect(() => {
    if (IS_DESKTOP) {
      desktopAuth.status()
        .then((s) => setNeedsSetup(!s?.hasPassword))
        .catch(() => {})
        .finally(() => setLoading(false))
      return
    }
    if (useSupabaseAuth) {
      // --- Supabase Auth rejimi ---
      // Sessiya bor, lekin 'staff' roli yo'q (agent yoki ruxsatsiz hisob) — tizimdan chiqaramiz.
      // signOut callback ichida to'g'ridan-to'g'ri chaqirilmaydi (supabase-js lock), shuning uchun setTimeout.
      const apply = (session) => {
        const u = staffUserFromSession(session)
        if (session && !u) {
          setAuthError(NO_ACCESS_MESSAGE)
          setTimeout(() => supabase.auth.signOut().catch(() => {}), 0)
        }
        setUser(u)
      }
      supabase.auth.getSession().then(({ data }) => {
        apply(data?.session)
        setLoading(false)
      }).catch(() => setLoading(false))
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session))
      return () => sub?.subscription?.unsubscribe?.()
    }

    // --- DEMO rejim: nickname+parol (ma'lumotlar shu brauzerda) ---
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
    setAuthError('')
    if (IS_DESKTOP) {
      const res = needsSetup ? await desktopAuth.setup(password) : await desktopAuth.verify(password)
      if (!res?.ok) return { ok: false, error: res?.error || "Parol noto'g'ri" }
      setNeedsSetup(false)
      setUser(DESKTOP_USER)
      return { ok: true }
    }
    if (useSupabaseAuth) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: String(identifier).trim(),
        password,
      })
      if (error) return { ok: false, error: 'Email yoki parol xato' }
      if (!staffUserFromSession(data?.session)) {
        await supabase.auth.signOut().catch(() => {})
        return { ok: false, error: NO_ACCESS_MESSAGE }
      }
      return { ok: true }
    }

    // DEMO login
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
    if (IS_DESKTOP) {
      setUser(null)
      return
    }
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
    <AuthContext.Provider value={{ user, login, logout, loading, authError, needsSetup }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak')
  return ctx
}
