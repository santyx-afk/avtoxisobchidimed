import { describe, it, expect } from 'vitest'
import { initialGroups, assignEmployees, groupPatches } from './rateGroups'

describe('guruh stavkalari', () => {
  it("bo'sh bo'lsa to'rtta tayyor guruh", () => {
    expect(initialGroups([]).map((g) => g.name)).toEqual(['Tungi hamshiralar', 'Tungi farroshlar', 'Kunduzgi hamshiralar', 'Kunduzgi farroshlar'])
  })
  it("xodim bitta guruhda: boshqasiga o'tkazilganda avvalgidan chiqadi", () => {
    const g = [{ id: 'a', employee_ids: ['x', 'y'] }, { id: 'b', employee_ids: [] }]
    const next = assignEmployees(g, 'b', ['y', 'z'])
    expect(next.find((x) => x.id === 'a').employee_ids).toEqual(['x'])
    expect(next.find((x) => x.id === 'b').employee_ids).toEqual(['y', 'z'])
  })
  it('oylik (fix) va smena uchun (kunbay) yangilanishlarini yasaydi', () => {
    const patches = groupPatches([
      { id: 'a', name: 'Tungi hamshiralar', type: 'fix', amount: 3000000, employee_ids: ['x'] },
      { id: 'b', name: 'Farroshlar', type: 'daily', amount: 150000, employee_ids: ['y', 'z'] },
      { id: 'c', name: 'Bo\'sh', type: 'fix', amount: '', employee_ids: [] },
    ])
    expect(patches).toEqual([
      { id: 'x', patch: { calc_type: 'fix', monthly_salary: 3000000, daily_rate: null, hourly_rate: null } },
      { id: 'y', patch: { calc_type: 'daily', daily_rate: 150000, monthly_salary: null, hourly_rate: null } },
      { id: 'z', patch: { calc_type: 'daily', daily_rate: 150000, monthly_salary: null, hourly_rate: null } },
    ])
  })
  it("a'zosi bor guruhda summa bo'lmasa xato", () => {
    expect(() => groupPatches([{ id: 'a', name: 'Tungi', type: 'fix', amount: '', employee_ids: ['x'] }])).toThrow('summa')
  })
})
