import { describe, it, expect } from 'vitest'
import { isMonthLocked, setMonthLocked, getLockedMonths } from './monthLock'

describe('monthLock (oyni qulflash)', () => {
  it('boshida qulflanmagan', async () => {
    expect(await isMonthLocked('2099-01')).toBe(false)
  })

  it('qulflaydi va ochadi', async () => {
    await setMonthLocked('2099-02', true)
    expect(await isMonthLocked('2099-02')).toBe(true)
    expect(await getLockedMonths()).toContain('2099-02')

    await setMonthLocked('2099-02', false)
    expect(await isMonthLocked('2099-02')).toBe(false)
    expect(await getLockedMonths()).not.toContain('2099-02')
  })

  it('takroriy qulflash dublikat yaratmaydi', async () => {
    await setMonthLocked('2099-03', true)
    await setMonthLocked('2099-03', true)
    const list = await getLockedMonths()
    expect(list.filter((m) => m === '2099-03')).toHaveLength(1)
  })
})
