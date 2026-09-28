import { describe, it, expect, vi } from 'vitest'
import { saveMonthReport, replaceCalculationsForReport } from './realDb'

const calls = []
// Soxta Supabase: sessions ustuni yo'q (schema.sql qayta ishga tushirilmagan)
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ limit: () => Promise.resolve({ data: null, error: { code: '42703', message: 'column attendance_records.sessions does not exist' } }) }),
    }),
    rpc: (name, args) => { calls.push([name, args]); return Promise.resolve({ data: {}, error: null }) },
  },
}))

describe('realDb — eski sxema himoyasi', () => {
  it("xom format juftliklarini eski sxemaga jimgina yozmaydi (aniq xato)", async () => {
    const attendance = [{ date: '2026-09-08', sessions: [], issues: [] }]
    await expect(saveMonthReport({ month: '2026-09', file_name: 'x', source: 'manual', attendance, calculations: [] }))
      .rejects.toThrow('schema.sql')
    expect(calls).toHaveLength(0)
  })

  it("eski (Punch Report) saqlash sxemadan qat'i nazar ishlaydi", async () => {
    await saveMonthReport({ month: '2026-09', file_name: 'x', source: 'manual', attendance: [{ date: '2026-09-08' }], calculations: [] })
    expect(calls[0][0]).toBe('save_month_report')
  })

  it('p_attendance faqat berilganda yuboriladi', async () => {
    await replaceCalculationsForReport('r', [])
    await replaceCalculationsForReport('r', [], null, [{ date: '2026-09-08' }])
    expect(calls[1][1]).not.toHaveProperty('p_attendance')
    expect(calls[2][1]).toHaveProperty('p_attendance')
  })
})
