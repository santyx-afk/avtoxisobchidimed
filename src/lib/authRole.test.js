import { describe, it, expect } from 'vitest'
import { staffUserFromSession, STAFF_ROLE } from './authRole'

const session = (user) => ({ user: { id: 'u1', email: 'admin@dimed.uz', ...user } })

describe('staffUserFromSession', () => {
  it("'staff' roli bo'lsa foydalanuvchini qaytaradi", () => {
    expect(staffUserFromSession(session({ app_metadata: { role: STAFF_ROLE } })))
      .toEqual({ nickname: 'admin@dimed.uz', id: 'u1', role: 'staff' })
  })

  it("rolsiz yoki boshqa rol (masalan agent) — ruxsat yo'q", () => {
    expect(staffUserFromSession(session({ app_metadata: {} }))).toBeNull()
    expect(staffUserFromSession(session({ app_metadata: { role: 'agent' } }))).toBeNull()
  })

  it("user_metadata dagi rol hisobga olinmaydi (uni foydalanuvchi o'zi o'zgartira oladi)", () => {
    expect(staffUserFromSession(session({ app_metadata: {}, user_metadata: { role: 'staff' } }))).toBeNull()
  })

  it("sessiya yo'q — null", () => {
    expect(staffUserFromSession(null)).toBeNull()
    expect(staffUserFromSession({})).toBeNull()
  })
})
