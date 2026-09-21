import { describe, it, expect } from 'vitest'
import { SUPABASE_AUTH, parseUsers } from './config'

describe('config — SUPABASE_AUTH default', () => {
  it('env sozlanmaganda Supabase Auth OFF (custom login ishlaydi)', () => {
    expect(SUPABASE_AUTH).toBe(false)
  })

  it('env bo\'sh bo\'lsa demo foydalanuvchilar qaytadi', () => {
    const users = parseUsers()
    expect(users.length).toBeGreaterThanOrEqual(1)
    expect(users[0]).toHaveProperty('nickname')
    expect(users[0]).toHaveProperty('password')
  })
})
