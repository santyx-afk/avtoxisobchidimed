// Diskdagi JSON ombor: atomik yozish (tmp -> rename), xotirada nusxa, avtomatik zaxira.
const fs = require('node:fs')
const path = require('node:path')

const BACKUP_KEEP = 14

function createFileStore(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const cache = new Map()
  const file = (name) => path.join(dir, `${name}.json`)

  function read(name) {
    if (cache.has(name)) return cache.get(name)
    let text = null
    try {
      text = fs.readFileSync(file(name), 'utf8')
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
    cache.set(name, text)
    return text
  }

  function write(name, text) {
    const target = file(name)
    const tmp = `${target}.tmp`
    fs.writeFileSync(tmp, text, 'utf8')
    fs.renameSync(tmp, target) // yarim yozilgan fayl qolmaydi
    cache.set(name, text)
  }

  /** Kuniga bir marta zaxira nusxa (oxirgi BACKUP_KEEP tasi saqlanadi) */
  function dailyBackup(name, now = new Date()) {
    const src = file(name)
    if (!fs.existsSync(src)) return null
    const backupDir = path.join(dir, 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const day = now.toISOString().slice(0, 10)
    const dest = path.join(backupDir, `${name}-${day}.json`)
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest)
    const all = fs.readdirSync(backupDir).filter((f) => f.startsWith(`${name}-`)).sort()
    for (const old of all.slice(0, Math.max(0, all.length - BACKUP_KEEP))) {
      fs.unlinkSync(path.join(backupDir, old))
    }
    return dest
  }

  return { read, write, dailyBackup, dir }
}

module.exports = { createFileStore, BACKUP_KEEP }
