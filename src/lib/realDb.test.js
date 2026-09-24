import { describe, it, expect, vi, afterEach } from 'vitest'
import { getAttendanceByReport } from './realDb'

// Soxta Supabase: server bitta so'rovga ko'pi bilan "Max rows" qator qaytaradi
vi.mock('./supabase', () => {
  const rows = Array.from({ length: 2345 }, (_, i) => ({
    id: String(i).padStart(5, '0'), report_id: i < 2300 ? 'r1' : 'r2',
  }))
  const from = () => {
    const st = { eq: [], from: 0, to: Infinity }
    const q = {
      select: () => q,
      eq: (c, v) => { st.eq.push([c, v]); return q },
      order: () => q,
      range: (a, b) => { st.from = a; st.to = b; return q },
      then: (res, rej) => {
        const all = rows.filter((r) => st.eq.every(([c, v]) => r[c] === v))
        const max = globalThis.__MAX_ROWS__ ?? 1000
        const data = all.slice(st.from, Math.min(st.to + 1, st.from + max))
        return Promise.resolve({ data, count: all.length, error: null }).then(res, rej)
      },
    }
    return q
  }
  return { supabase: { from } }
})

describe("realDb — sahifalash (Supabase 'Max rows')", () => {
  afterEach(() => { delete globalThis.__MAX_ROWS__ })

  it("1000 dan ko'p davomat qatorini to'liq o'qiydi", async () => {
    const rows = await getAttendanceByReport('r1')
    expect(rows).toHaveLength(2300)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2300)
  })

  it("server limiti sahifadan kichik bo'lsa ham (300) hammasini o'qiydi", async () => {
    globalThis.__MAX_ROWS__ = 300
    expect(await getAttendanceByReport('r1')).toHaveLength(2300)
  })
})
