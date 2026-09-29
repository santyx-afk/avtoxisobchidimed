// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, it, expect, afterEach } from 'vitest'
const require = createRequire(import.meta.url)
const http = require('node:http')
const crypto = require('node:crypto')
const isapi = require('./isapi.cjs')

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex')

// Digest-auth talab qiladigan soxta terminal; `events` — qaytariladigan hodisalar
function fakeDevice(events, { user = 'admin', password = 'secret' } = {}) {
  const realm = 'DS-K1T'
  const nonce = 'abc123'
  const log = []
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || ''
    const challenge = () => {
      res.writeHead(401, { 'WWW-Authenticate': `Digest realm="${realm}", qop="auth", nonce="${nonce}", opaque="op", algorithm=MD5` })
      res.end()
    }
    if (!auth.startsWith('Digest ')) return challenge()
    const p = {}
    for (const m of auth.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) p[m[1]] = m[2] ?? m[3]
    const ha1 = md5(`${user}:${realm}:${password}`)
    const ha2 = md5(`${req.method}:${p.uri}`)
    const expected = md5(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:${p.qop}:${ha2}`)
    if (p.username !== user || p.response !== expected) return challenge()
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const cond = JSON.parse(body).AcsEventCond
      log.push(cond)
      const batch = events.slice(cond.searchResultPosition, cond.searchResultPosition + cond.maxResults)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ AcsEvent: { totalMatches: events.length, numOfMatches: batch.length, InfoList: batch } }))
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, log })))
}

const ev = (name, pid, time, status) => ({ name, employeeNoString: pid, time, attendanceStatus: status })

let dev
afterEach(() => dev && new Promise((r) => dev.server.close(r)))

const cfg = (port, over = {}) => ({ scheme: 'http', host: '127.0.0.1', port, username: 'admin', password: 'secret', timezone: '+05:00', pageSize: 2, ...over })

describe('isapi — terminaldan olish', () => {
  it('Digest-auth bilan barcha sahifalarni oladi va IVMS jadvaliga aylantiradi', async () => {
    dev = await fakeDevice([
      ev('Aliyeva', '00000085', '2026-09-26T08:01:00+05:00', 'checkIn'),
      ev('Aliyeva', '00000085', '2026-09-26T17:02:00+05:00', 'checkOut'),
      ev('Aliyeva', '00000085', '2026-09-26T12:00:00+05:00', 'undefined'),
      { time: '2026-09-26T09:00:00+05:00' }, // ismsiz hodisa — tashlanadi
    ])
    const res = await isapi.fetchMonthReport(cfg(dev.port), '2026-09')
    expect(dev.log.length).toBe(2) // pageSize=2, 4 ta hodisa
    expect(res.total).toBe(3)
    expect(res.stateful).toBe(2)
    expect(res.fileName).toBe('ivms_2026-09.xls')
    expect(res.html).toContain('<td>Приход</td>')
    expect(res.html).toContain('<td>2026-09-26 17:02:00</td>')
    expect(res.html).toContain('<td>00000085</td>')
  })

  it('so\'rov oralig\'i oy chegarasidan yarim sutka kengroq', async () => {
    dev = await fakeDevice([ev('A', '1', '2026-09-01T08:00:00+05:00', 'checkIn')])
    await isapi.fetchMonthReport(cfg(dev.port), '2026-09')
    expect(dev.log[0].startTime).toBe('2026-08-31T12:00:00+05:00')
    expect(dev.log[0].endTime).toBe('2026-10-01T12:00:00+05:00')
  })

  it('noto\'g\'ri parol — AUTH xatosi', async () => {
    dev = await fakeDevice([])
    await expect(isapi.fetchMonthReport(cfg(dev.port, { password: 'xato' }), '2026-09')).rejects.toMatchObject({ code: 'AUTH' })
  })

  it('takrorlangan hodisa bir marta hisoblanadi', async () => {
    const e = ev('A', '1', '2026-09-02T08:00:00+05:00', 'checkIn')
    dev = await fakeDevice([e, e])
    const res = await isapi.fetchMonthReport(cfg(dev.port), '2026-09')
    expect(res.total).toBe(1)
  })

  it('testConnection: hodisalar sonini qaytaradi', async () => {
    dev = await fakeDevice([ev('A', '1', '2026-09-02T08:00:00+05:00', 'checkIn')])
    const r = await isapi.testConnection(cfg(dev.port))
    expect(r.persons).toBe(1)
    expect(r.stateful).toBe(1)
  })
})

describe('isapi — yordamchilar', () => {
  it('monthRange dekabrda yilni almashtiradi', () => {
    expect(isapi.monthRange('2026-12')).toEqual({ start: '2026-11-30T12:00:00+05:00', end: '2027-01-01T12:00:00+05:00' })
  })
  it('eventToRecord: nomsiz yoki vaqtsiz hodisa — null; holat xaritasi', () => {
    expect(isapi.eventToRecord({ time: '2026-09-01T08:00:00+05:00' })).toBeNull()
    expect(isapi.eventToRecord({ name: 'A' })).toBeNull()
    expect(isapi.eventToRecord(ev('A', '7', '2026-09-01T08:00:00+05:00', 'breakOut')).state).toBe('Уход при перерыве')
    expect(isapi.eventToRecord(ev('A', '7', '2026-09-01T08:00:00+05:00', 'weird')).state).toBe('Нет')
  })
  it('HTML da maxsus belgilar escape qilinadi', () => {
    expect(isapi.buildRawHtml([{ pid: '1', name: 'A<b>&', stamp: 'x', state: 'Нет', reader: 'r' }])).toContain('A&lt;b&gt;&amp;')
  })
})
