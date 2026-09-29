// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'
const require = createRequire(import.meta.url)
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAuthStore } = require('./authStore.cjs')
const { createFileStore, BACKUP_KEEP } = require('./fileStore.cjs')

function memAuth() {
  let rec = null
  return createAuthStore({ read: () => rec, write: (r) => { rec = r }, })
}

describe('authStore', () => {
  it('parol o\'rnatiladi, tekshiriladi, faqat hash saqlanadi', () => {
    let rec = null
    const a = createAuthStore({ read: () => rec, write: (r) => { rec = r } })
    expect(a.status().hasPassword).toBe(false)
    expect(a.setup('123').ok).toBe(false) // juda qisqa
    expect(a.setup('parol123').ok).toBe(true)
    expect(JSON.stringify(rec)).not.toContain('parol123')
    expect(a.verify('parol123').ok).toBe(true)
    expect(a.verify('xato').ok).toBe(false)
    expect(a.setup('boshqa1').ok).toBe(false) // qayta o'rnatib bo'lmaydi
  })
  it('5 marta xato — 30 soniya bloklanadi', () => {
    const a = memAuth()
    a.setup('parol123')
    const t = 1000000
    for (let i = 0; i < 5; i++) a.verify('x', t)
    expect(a.verify('parol123', t + 1000).ok).toBe(false)
    expect(a.verify('parol123', t + 31000).ok).toBe(true)
  })
  it('parolni almashtirish eski parolni talab qiladi', () => {
    const a = memAuth()
    a.setup('parol123')
    expect(a.change('xato', 'yangi123').ok).toBe(false)
    expect(a.change('parol123', 'yangi123').ok).toBe(true)
    expect(a.verify('parol123').ok).toBe(false)
    expect(a.verify('yangi123').ok).toBe(true)
  })
})

describe('fileStore', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dimed-'))
  it('yozadi, o\'qiydi, yangi nusxa bilan qayta ochilganda ham saqlanadi', () => {
    const dir = tmp()
    const s = createFileStore(dir)
    expect(s.read('db')).toBeNull()
    s.write('db', '{"a":1}')
    expect(createFileStore(dir).read('db')).toBe('{"a":1}')
    expect(fs.existsSync(path.join(dir, 'db.json.tmp'))).toBe(false)
  })
  it('kunlik zaxira: kuniga bitta, eskilari o\'chadi', () => {
    const dir = tmp()
    const s = createFileStore(dir)
    s.write('db', '{}')
    for (let d = 1; d <= BACKUP_KEEP + 5; d++) s.dailyBackup('db', new Date(Date.UTC(2026, 0, d)))
    s.dailyBackup('db', new Date(Date.UTC(2026, 0, BACKUP_KEEP + 5)))
    expect(fs.readdirSync(path.join(dir, 'backups')).length).toBe(BACKUP_KEEP)
  })
})
