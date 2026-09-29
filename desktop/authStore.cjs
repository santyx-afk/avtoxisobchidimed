// Windows ilova paroli: faqat scrypt hash saqlanadi (parolning o'zi hech qayerda yo'q).
const crypto = require('node:crypto')

const MIN_LENGTH = 4
const KEYLEN = 64

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex')
  return { salt, hash }
}

function checkPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false
  const { hash } = hashPassword(password, record.salt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(record.hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** @param {{read: () => object|null, write: (rec: object) => void}} io  parol yozuvi ombori */
function createAuthStore(io) {
  let failures = 0
  let lockedUntil = 0

  return {
    status: () => ({ hasPassword: Boolean(io.read()) }),

    setup(password) {
      if (io.read()) return { ok: false, error: "Parol allaqachon o'rnatilgan" }
      if (String(password || '').length < MIN_LENGTH) {
        return { ok: false, error: `Parol kamida ${MIN_LENGTH} belgidan iborat bo'lsin` }
      }
      io.write(hashPassword(password))
      return { ok: true }
    },

    verify(password, now = Date.now()) {
      if (now < lockedUntil) {
        return { ok: false, error: `Ko'p marta xato kiritildi. ${Math.ceil((lockedUntil - now) / 1000)} soniyadan keyin urinib ko'ring` }
      }
      if (checkPassword(password, io.read())) {
        failures = 0
        return { ok: true }
      }
      failures += 1
      if (failures >= 5) {
        lockedUntil = now + 30000
        failures = 0
      }
      return { ok: false, error: "Parol noto'g'ri" }
    },

    change(oldPassword, newPassword) {
      if (!checkPassword(oldPassword, io.read())) return { ok: false, error: "Joriy parol noto'g'ri" }
      if (String(newPassword || '').length < MIN_LENGTH) {
        return { ok: false, error: `Yangi parol kamida ${MIN_LENGTH} belgidan iborat bo'lsin` }
      }
      io.write(hashPassword(newPassword))
      return { ok: true }
    },
  }
}

module.exports = { createAuthStore, hashPassword, checkPassword, MIN_LENGTH }
