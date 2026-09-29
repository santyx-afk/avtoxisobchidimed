// Windows ilova (Electron) ko'prigi: preload.cjs bergan `window.dimed` ustidagi yupqa qatlam.
// Brauzerda (sayt) `window.dimed` yo'q — bu funksiyalar chaqirilmaydi.

const api = () => (typeof window !== 'undefined' ? window.dimed : null)

/** mockDb uchun saqlash adapteri: ma'lumot diskdagi faylga yoziladi (sinxron — yarim yozilib qolmaydi) */
export const desktopStorage = {
  read: () => api().store.read('db'),
  write: (text) => {
    const res = api().store.write('db', text)
    if (res && res.ok === false) throw new Error(res.error || 'Diskka yozib bo\'lmadi')
  },
}

export const desktopAuth = {
  status: () => api().auth.status(), // { hasPassword }
  setup: (password) => api().auth.setup(password), // { ok, error? }
  verify: (password) => api().auth.verify(password),
  change: (oldPassword, newPassword) => api().auth.change(oldPassword, newPassword),
}

export const desktopIsapi = {
  getConfig: () => api().isapi.getConfig(),
  setConfig: (cfg) => api().isapi.setConfig(cfg),
  test: (cfg) => api().isapi.test(cfg),
  fetchMonth: (month) => api().isapi.fetchMonth(month), // { ok, html, fileName, total, stateful, error? }
  onProgress: (cb) => api().isapi.onProgress(cb), // unsubscribe qaytaradi
}

export const desktopBackup = {
  save: () => api().backup.save(), // { ok, path?, canceled? }
  restore: () => api().backup.restore(),
}

export const desktopInfo = () => ({ version: api()?.version || '', dataDir: api()?.dataDir || '' })
