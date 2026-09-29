// Renderer (sayt kodi) uchun xavfsiz ko'prik. Node/Electron to'g'ridan-to'g'ri ochilmaydi.
const { contextBridge, ipcRenderer } = require('electron')

const info = ipcRenderer.sendSync('app:info')

contextBridge.exposeInMainWorld('dimed', {
  isDesktop: true,
  version: info.version,
  dataDir: info.dataDir,
  store: {
    read: (name) => ipcRenderer.sendSync('store:read', name),
    write: (name, text) => ipcRenderer.sendSync('store:write', name, text),
  },
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    setup: (pw) => ipcRenderer.invoke('auth:setup', pw),
    verify: (pw) => ipcRenderer.invoke('auth:verify', pw),
    change: (oldPw, newPw) => ipcRenderer.invoke('auth:change', oldPw, newPw),
  },
  isapi: {
    getConfig: () => ipcRenderer.invoke('isapi:getConfig'),
    setConfig: (cfg) => ipcRenderer.invoke('isapi:setConfig', cfg),
    test: (cfg) => ipcRenderer.invoke('isapi:test', cfg),
    fetchMonth: (month) => ipcRenderer.invoke('isapi:fetchMonth', month),
    onProgress: (cb) => {
      const handler = (_e, p) => cb(p)
      ipcRenderer.on('isapi:progress', handler)
      return () => ipcRenderer.removeListener('isapi:progress', handler)
    },
  },
  backup: {
    save: () => ipcRenderer.invoke('backup:save'),
    restore: () => ipcRenderer.invoke('backup:restore'),
  },
})
