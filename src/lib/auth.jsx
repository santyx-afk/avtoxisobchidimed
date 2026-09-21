import { createContext, useContext, useEffect, useState } from 'react'
import { parseUsers } from './config'

const AuthContext = createContext(null)
const SESSION_KEY = 'dimed-session'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
   * @returns {{ok: boolean, error?: string}}
   */
  function login(nickname, password) {
    const users = parseUsers()
    const found = users.find(
      (u) => u.nickname === String(nickname).trim() && u.password === String(password),
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

  function logout() {
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
