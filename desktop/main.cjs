// Dimed Salary — Windows ilova (Electron asosiy jarayoni).
// Ma'lumotlar kompyuterda saqlanadi; turniketga ISAPI orqali shu yerdan ulanadi.
const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, Menu } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { createFileStore } = require('./fileStore.cjs')
const { createAuthStore } = require('./authStore.cjs')
const isapi = require('./isapi.cjs')

if (!app.requestSingleInstanceLock()) app.quit()

let win = null
let store = null
let auth = null

const readJson = (name) => {
  try {
    const text = store.read(name)
    return text ? JSON.parse(text) : null
  } catch (e) {
    return null
  }
}
const writeJson = (name, value) => store.write(name, JSON.stringify(value))

// ---------- Terminal (ISAPI) sozlamalari; parol OS shifrlashi bilan saqlanadi ----------
function encryptSecret(text) {
  if (!text) return null
  if (safeStorage.isEncryptionAvailable()) return { enc: safeStorage.encryptString(text).toString('base64') }
  return { plain: text }
}
function decryptSecret(secret) {
  if (!secret) return ''
  if (secret.enc) {
    try { return safeStorage.decryptString(Buffer.from(secret.enc, 'base64')) } catch (e) { return '' }
  }
  return secret.plain || ''
}

const ISAPI_DEFAULTS = { scheme: 'http', host: '', port: '', username: 'admin', timezone: '+05:00', pageSize: 30, verifyTls: false }

function loadIsapiConfig() {
  const saved = readJson('isapi') || {}
  return { ...ISAPI_DEFAULTS, ...saved, password: decryptSecret(saved.secret) }
}

function publicIsapiConfig() {
  const { password, ...rest } = loadIsapiConfig()
  return { ...rest, hasPassword: Boolean(password) }
}

function saveIsapiConfig(input) {
  const cur = readJson('isapi') || {}
  const next = { ...ISAPI_DEFAULTS, ...cur }
  for (const k of Object.keys(ISAPI_DEFAULTS)) if (input[k] !== undefined) next[k] = input[k]
  next.host = String(next.host || '').trim()
  next.port = next.port === '' || next.port == null ? '' : Number(next.port) || ''
  next.pageSize = Math.min(200, Math.max(1, Number(next.pageSize) || 30))
  next.verifyTls = Boolean(next.verifyTls)
  if (input.password) next.secret = encryptSecret(input.password) // bo'sh bo'lsa eskisi qoladi
  delete next.password
  writeJson('isapi', next)
}

function effectiveConfig(input) {
  const merged = { ...loadIsapiConfig(), ...(input || {}) }
  if (!merged.password) merged.password = loadIsapiConfig().password
  return merged
}

function describeError(e) {
  const map = { ECONNREFUSED: 'Terminal ulanishni rad etdi (IP yoki port noto\'g\'ri)', ETIMEDOUT: 'Terminal javob bermadi (IP noto\'g\'ri yoki tarmoqda emas)', EHOSTUNREACH: 'Terminalga yo\'l topilmadi (IP yoki tarmoq)', ENOTFOUND: 'Manzil topilmadi (IP/host xato)', ECONNRESET: 'Ulanish uzildi (http/https turini tekshiring)' }
  return map[e.code] || e.message || String(e)
}

function registerIpc() {
  ipcMain.on('store:read', (e, name) => {
    e.returnValue = name === 'db' ? store.read('db') : null
  })
  ipcMain.on('store:write', (e, name, text) => {
    try {
      if (name !== 'db') throw new Error('Noma\'lum ombor')
      store.write('db', text)
      e.returnValue = { ok: true }
    } catch (err) {
      e.returnValue = { ok: false, error: err.message }
    }
  })
  ipcMain.on('app:info', (e) => { e.returnValue = { version: app.getVersion(), dataDir: store.dir } })

  ipcMain.handle('auth:status', () => auth.status())
  ipcMain.handle('auth:setup', (_e, pw) => auth.setup(pw))
  ipcMain.handle('auth:verify', (_e, pw) => auth.verify(pw))
  ipcMain.handle('auth:change', (_e, oldPw, newPw) => auth.change(oldPw, newPw))

  ipcMain.handle('isapi:getConfig', () => publicIsapiConfig())
  ipcMain.handle('isapi:setConfig', (_e, cfg) => { saveIsapiConfig(cfg || {}); return { ok: true } })
  ipcMain.handle('isapi:test', async (_e, cfg) => {
    const c = effectiveConfig(cfg)
    if (!c.host) return { ok: false, error: 'Terminal IP manzili kiritilmagan' }
    try {
      return { ok: true, ...(await isapi.testConnection(c)) }
    } catch (err) {
      return { ok: false, error: describeError(err) }
    }
  })
  ipcMain.handle('isapi:fetchMonth', async (e, month) => {
    const c = effectiveConfig()
    if (!c.host) return { ok: false, error: 'Avval Sozlamalarda terminal IP manzili va parolini kiriting' }
    if (!/^\d{4}-\d{2}$/.test(String(month))) return { ok: false, error: 'Oy noto\'g\'ri' }
    try {
      const res = await isapi.fetchMonthReport(c, month, {
        onProgress: (p) => e.sender.send('isapi:progress', p),
      })
      return { ok: true, ...res }
    } catch (err) {
      return { ok: false, error: describeError(err) }
    }
  })

  ipcMain.handle('backup:save', async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Zaxira nusxani saqlash', defaultPath: `dimed-zaxira-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    fs.writeFileSync(filePath, store.read('db') || '{}', 'utf8')
    return { ok: true, path: filePath }
  })
  ipcMain.handle('backup:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Zaxira nusxani tiklash', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePaths[0]) return { ok: false, canceled: true }
    const text = fs.readFileSync(filePaths[0], 'utf8')
    let parsed
    try { parsed = JSON.parse(text) } catch (e) { return { ok: false, error: 'Fayl JSON emas' } }
    if (!parsed || !Array.isArray(parsed.employees) || !Array.isArray(parsed.monthly_reports)) {
      return { ok: false, error: 'Bu Dimed Salary zaxira fayli emas' }
    }
    const current = path.join(store.dir, 'db.json')
    if (fs.existsSync(current)) { // joriy holatni ham saqlab qo'yamiz
      fs.copyFileSync(current, path.join(store.dir, `db-tiklashdan-oldin-${Date.now()}.json`))
    }
    store.write('db', text)
    return { ok: true }
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1000, minHeight: 640,
    title: 'Dimed Salary',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.loadFile(path.join(__dirname, '..', 'dist-desktop', 'index.html'))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) e.preventDefault() })
}

app.whenReady().then(() => {
  store = createFileStore(path.join(app.getPath('userData'), 'data'))
  auth = createAuthStore({
    read: () => readJson('auth'),
    write: (rec) => writeJson('auth', rec),
  })
  try { store.dailyBackup('db') } catch (e) { /* zaxira muhim, lekin ilovani to'xtatmasin */ }
  registerIpc()
  Menu.setApplicationMenu(null)
  createWindow()
})

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})
app.on('window-all-closed', () => app.quit())
