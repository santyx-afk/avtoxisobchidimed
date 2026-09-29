// Hikvision ISAPI (AcsEvent) mijozi: Digest-auth + oy hodisalarini sahifalab olish +
// IVMS «Отчет об исходных записях» HTML jadvaliga aylantirish (agent/ivms_agent.py ning JS varianti).
const http = require('node:http')
const https = require('node:https')
const crypto = require('node:crypto')

// Hikvision "attendanceStatus" -> IVMS "Состояние посещения"
const STATUS_RU = {
  checkin: 'Приход',
  checkout: 'Уход',
  breakin: 'Приход при перерыве',
  breakout: 'Уход при перерыве',
}
const NONE_RU = 'Нет'

const RAW_HEADER = [
  'Идентификатор человека', 'Имя', 'Департамент', 'Время', 'Состояние посещения',
  'Точка проверки посещения', 'Пользовательское название', 'Источник данных',
  'Тип обращения', 'Температуры', 'Аварийный режим',
]

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

function parseChallenge(header) {
  const list = Array.isArray(header) ? header : [header]
  const line = list.find((h) => /^\s*digest\s/i.test(h || ''))
  if (!line) return null
  const params = {}
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g
  let m
  const body = line.replace(/^\s*digest\s+/i, '')
  while ((m = re.exec(body))) params[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3]
  return params
}

function digestHeader({ user, password, method, uri, challenge, nc, cnonce }) {
  const alg = String(challenge.algorithm || 'MD5').toUpperCase()
  const H = alg.startsWith('SHA-256') ? sha256 : md5
  let ha1 = H(`${user}:${challenge.realm}:${password}`)
  if (alg.endsWith('-SESS')) ha1 = H(`${ha1}:${challenge.nonce}:${cnonce}`)
  const ha2 = H(`${method}:${uri}`)
  const qop = challenge.qop ? String(challenge.qop).split(',')[0].trim() : ''
  const ncHex = nc.toString(16).padStart(8, '0')
  const response = qop
    ? H(`${ha1}:${challenge.nonce}:${ncHex}:${cnonce}:${qop}:${ha2}`)
    : H(`${ha1}:${challenge.nonce}:${ha2}`)
  const parts = [
    `username="${user}"`, `realm="${challenge.realm}"`, `nonce="${challenge.nonce}"`,
    `uri="${uri}"`, `algorithm=${challenge.algorithm || 'MD5'}`, `response="${response}"`,
  ]
  if (qop) parts.push(`qop=${qop}`, `nc=${ncHex}`, `cnonce="${cnonce}"`)
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`)
  return `Digest ${parts.join(', ')}`
}

function rawRequest({ base, method, path, body, headers, verifyTls, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base)
    const lib = url.protocol === 'https:' ? https : http
    const data = body == null ? null : Buffer.from(JSON.stringify(body))
    const req = lib.request(
      url,
      {
        method,
        headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers },
        rejectUnauthorized: Boolean(verifyTls),
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }))
      },
    )
    req.on('timeout', () => req.destroy(new Error(`Javob kelmadi (${Math.round(timeoutMs / 1000)} soniya)`)))
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

/** Digest (yoki Basic) autentifikatsiyali klient. `cfg`: {scheme, host, port, username, password, verifyTls} */
function createClient(cfg, { timeoutMs = 30000 } = {}) {
  const base = `${cfg.scheme || 'http'}://${cfg.host}${cfg.port ? `:${cfg.port}` : ''}`
  let challenge = null
  let nc = 0

  async function request(method, path, body) {
    const send = (authorization) => rawRequest({
      base, method, path, body, timeoutMs, verifyTls: cfg.verifyTls,
      headers: authorization ? { Authorization: authorization } : {},
    })
    const authFor = () => {
      nc += 1
      return digestHeader({
        user: cfg.username, password: cfg.password, method, uri: path, challenge,
        nc, cnonce: crypto.randomBytes(8).toString('hex'),
      })
    }

    let res = await send(challenge ? authFor() : null)
    if (res.status === 401) {
      const c = parseChallenge(res.headers['www-authenticate'])
      if (c) {
        challenge = c
        nc = 0
        res = await send(authFor())
      } else if (/^basic/i.test(String(res.headers['www-authenticate'] || ''))) {
        const token = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')
        res = await send(`Basic ${token}`)
      }
    }
    if (res.status === 401) {
      const err = new Error("Login yoki parol noto'g'ri (401)")
      err.code = 'AUTH'
      throw err
    }
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`Terminal xato qaytardi: HTTP ${res.status}`)
      err.code = 'HTTP'
      throw err
    }
    try {
      return JSON.parse(res.text)
    } catch (e) {
      throw new Error("Terminal javobi JSON emas (ISAPI manzili yoki turi noto'g'ri bo'lishi mumkin)")
    }
  }
  return { request, base }
}

/** Oy oralig'i: oldingi kun 12:00 dan keyingi oyning 1-kuni 12:00 gacha (tungi smena uzilmasin) */
function monthRange(month, tz = '+05:00') {
  const [y, m] = month.split('-').map(Number)
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${tz}`
  const first = Date.UTC(y, m - 1, 1)
  const next = Date.UTC(y, m, 1)
  return { start: fmt(new Date(first - 12 * 3600e3)), end: fmt(new Date(next + 12 * 3600e3)) }
}

async function fetchEvents(cfg, start, end, { limit = null, onProgress = null } = {}) {
  const client = createClient(cfg)
  const pageSize = Math.max(1, Number(cfg.pageSize) || 30)
  const events = []
  let pos = 0
  for (;;) {
    const data = await client.request('POST', '/ISAPI/AccessControl/AcsEvent?format=json', {
      AcsEventCond: {
        searchID: 'dimed-desktop', searchResultPosition: pos, maxResults: pageSize,
        major: 5, minor: 0, startTime: start, endTime: end,
      },
    })
    const ev = data.AcsEvent || {}
    const batch = ev.InfoList || []
    events.push(...batch)
    const total = Number(ev.totalMatches || 0)
    const got = Number(ev.numOfMatches ?? batch.length)
    pos += got
    if (onProgress) onProgress({ done: pos, total })
    if (got === 0 || pos >= total || (limit && events.length >= limit)) break
  }
  return limit ? events.slice(0, limit) : events
}

function eventToRecord(ev) {
  const name = String(ev.name || '').trim()
  const pid = String(ev.employeeNoString || ev.employeeNo || '').trim()
  const t = String(ev.time || '')
  if (!name || !t.includes('T')) return null
  const status = String(ev.attendanceStatus || '').trim().toLowerCase()
  return {
    pid, name, stamp: `${t.slice(0, 10)} ${t.slice(11, 19)}`,
    state: STATUS_RU[status] || NONE_RU,
    reader: ev.deviceName || ev.doorNo || 'ISAPI',
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function buildRawHtml(records) {
  const tr = (cells) => `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
  const rows = [tr(['Отчет об исходных записях']), tr(RAW_HEADER)]
  for (const r of records) {
    rows.push(tr([r.pid, r.name, 'Dimed', r.stamp, r.state, r.reader, '-', 'ISAPI', '-', '-', '-']))
  }
  return '<html xmlns:x="urn:schemas-microsoft-com:office:excel">\n<head><meta charset="utf-8"></head><body>\n<table border="1">\n'
    + rows.join('\n') + '\n</table></body></html>'
}

/** Oy uchun terminaldan hodisalarni olib, sayt o'qiy oladigan HTML hisobot qaytaradi */
async function fetchMonthReport(cfg, month, opts = {}) {
  const { start, end } = monthRange(month, cfg.timezone || '+05:00')
  const events = await fetchEvents(cfg, start, end, opts)
  const seen = new Set()
  const records = []
  for (const ev of events) {
    const rec = eventToRecord(ev)
    if (!rec) continue
    const key = `${rec.pid}|${rec.name}|${rec.stamp}|${rec.state}`
    if (seen.has(key)) continue // sahifa chegarasida takrorlangan hodisa
    seen.add(key)
    records.push(rec)
  }
  records.sort((a, b) => (a.pid + a.stamp < b.pid + b.stamp ? -1 : a.pid + a.stamp > b.pid + b.stamp ? 1 : 0))
  const stateful = records.filter((r) => r.state !== NONE_RU).length
  return {
    html: buildRawHtml(records),
    fileName: `ivms_${month}.xls`,
    total: records.length,
    stateful,
  }
}

/** Ulanishni sinash: oxirgi 24 soat hodisalari va ularning maydonlari */
async function testConnection(cfg) {
  const pad = (n) => String(n).padStart(2, '0')
  const tz = cfg.timezone || '+05:00'
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${tz}`
  const now = new Date()
  const events = await fetchEvents(cfg, fmt(new Date(now.getTime() - 24 * 3600e3)), fmt(now), { limit: 200 })
  const named = events.map(eventToRecord).filter(Boolean)
  return {
    events: events.length,
    persons: named.length,
    stateful: named.filter((r) => r.state !== NONE_RU).length,
    sample: named.slice(0, 3),
  }
}

module.exports = {
  STATUS_RU, NONE_RU, RAW_HEADER,
  parseChallenge, digestHeader, createClient, monthRange,
  fetchEvents, eventToRecord, buildRawHtml, fetchMonthReport, testConnection,
}
