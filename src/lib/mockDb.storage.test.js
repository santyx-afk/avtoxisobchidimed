import { describe, it, expect, afterEach } from 'vitest'
import * as mock from './mockDb'

describe('mockDb — almashtiriladigan saqlash (Windows ilova)', () => {
  afterEach(() => {
    mock.setStorage({ read: () => localStorage.getItem('dimed-db'), write: (t) => localStorage.setItem('dimed-db', t) })
  })

  it("ma'lumot berilgan adapterga yoziladi va undan o'qiladi", async () => {
    let disk = null
    mock.setStorage({ read: () => disk, write: (t) => { disk = t } })
    await mock.createEmployee({ name: 'Test Ishchi', calc_type: 'fix' })
    expect(JSON.parse(disk).employees).toHaveLength(1)
    expect((await mock.listEmployees())[0].name).toBe('Test Ishchi')
  })
})
