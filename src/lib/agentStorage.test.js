import { describe, it, expect } from 'vitest'
import { shouldProcessAgentFile } from './agentStorage'

describe('shouldProcessAgentFile', () => {
  const file = { month: '2026-08', updated_at: '2026-09-01T10:00:00Z' }

  it("shu oy hisoboti yo'q — qayta ishlanadi", () => {
    expect(shouldProcessAgentFile(file, null)).toBe(true)
  })

  it("keyinroq qo'lda yuklangan (tuzatilgan) hisobot ustidan yozilmaydi", () => {
    expect(shouldProcessAgentFile(file, { source: 'manual', uploaded_at: '2026-09-02T09:00:00Z' })).toBe(false)
  })

  it('agent faylni qayta yuklagan (hisobotdan yangiroq) — qayta ishlanadi', () => {
    const newer = { ...file, updated_at: '2026-09-03T08:00:00Z' }
    expect(shouldProcessAgentFile(newer, { source: 'agent', uploaded_at: '2026-09-01T10:05:00Z' })).toBe(true)
  })

  it('allaqachon ishlangan fayl qayta ishlanmaydi', () => {
    expect(shouldProcessAgentFile(file, { source: 'agent', uploaded_at: '2026-09-01T10:05:00Z' })).toBe(false)
  })

  it('qulflangan oyga tegilmaydi', () => {
    expect(shouldProcessAgentFile(file, null, ['2026-08'])).toBe(false)
  })
})
