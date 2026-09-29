// Windows ilova sozlamalari: terminal (ISAPI), parol, zaxira nusxa.
import { useEffect, useState } from 'react'
import { Radio, KeyRound, HardDriveDownload, CheckCircle2, Loader2, AlertTriangle, Save, Upload } from 'lucide-react'
import { Field, ConfirmDialog } from './ui'
import { desktopIsapi, desktopAuth, desktopBackup, desktopInfo } from '../lib/desktop'

const Notice = ({ ok, children }) => (
  <p className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'}`}>
    {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
    <span>{children}</span>
  </p>
)

function TerminalCard() {
  const [cfg, setCfg] = useState(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const set = (k, v) => { setCfg((c) => ({ ...c, [k]: v })); setMsg(null) }

  useEffect(() => { desktopIsapi.getConfig().then(setCfg).catch(() => setCfg({})) }, [])

  const payload = () => ({
    scheme: cfg.scheme, host: cfg.host, port: cfg.port, username: cfg.username,
    timezone: cfg.timezone, pageSize: cfg.pageSize, verifyTls: cfg.verifyTls,
    ...(password ? { password } : {}),
  })

  async function save() {
    setBusy('save')
    try {
      await desktopIsapi.setConfig(payload())
      setPassword('')
      setCfg(await desktopIsapi.getConfig())
      setMsg({ ok: true, text: 'Terminal sozlamalari saqlandi.' })
    } finally { setBusy('') }
  }

  async function test() {
    setBusy('test')
    setMsg(null)
    try {
      const r = await desktopIsapi.test(payload())
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return }
      setMsg({
        ok: true,
        text: `Ulanish muvaffaqiyatli. Oxirgi 24 soatda ${r.events} ta hodisa (${r.persons} tasi ism bilan, ${r.stateful} tasida Приход/Уход belgisi bor).`,
      })
    } finally { setBusy('') }
  }

  if (!cfg) return null
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Radio className="h-5 w-5 text-emerald-500" />
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Turniket (Hikvision terminal)</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="IP manzil" hint="masalan 192.168.1.64">
          <input className="input" value={cfg.host || ''} onChange={(e) => set('host', e.target.value)} placeholder="192.168.1.64" />
        </Field>
        <Field label="Port" hint="bo'sh = standart (80 / 443)">
          <input className="input tabular" value={cfg.port || ''} onChange={(e) => set('port', e.target.value)} placeholder="80" />
        </Field>
        <Field label="Login">
          <input className="input" value={cfg.username || ''} onChange={(e) => set('username', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Parol" hint={cfg.hasPassword ? 'Saqlangan (o\'zgartirish uchun yangisini kiriting)' : 'Terminal paroli'}>
          <input className="input" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null) }} placeholder={cfg.hasPassword ? '••••••••' : ''} autoComplete="new-password" />
        </Field>
        <Field label="Protokol">
          <select className="input" value={cfg.scheme || 'http'} onChange={(e) => set('scheme', e.target.value)}>
            <option value="http">http</option>
            <option value="https">https</option>
          </select>
        </Field>
        <Field label="Vaqt zonasi" hint="Toshkent: +05:00">
          <input className="input tabular" value={cfg.timezone || ''} onChange={(e) => set('timezone', e.target.value)} placeholder="+05:00" />
        </Field>
        <Field label="Sahifa hajmi" hint="bir so'rovda nechta yozuv (30 — ishonchli)">
          <input type="number" min="1" max="200" className="input tabular" value={cfg.pageSize ?? 30} onChange={(e) => set('pageSize', e.target.value)} />
        </Field>
        {cfg.scheme === 'https' && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={Boolean(cfg.verifyTls)} onChange={(e) => set('verifyTls', e.target.checked)} />
            Sertifikatni tekshirish
          </label>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={save} disabled={Boolean(busy)}>
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Saqlash
        </button>
        <button className="btn-secondary" onClick={test} disabled={Boolean(busy) || !cfg.host}>
          {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />} Ulanishni tekshirish
        </button>
      </div>
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
    </div>
  )
}

function PasswordCard() {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function change() {
    if (newPw !== newPw2) { setMsg({ ok: false, text: 'Yangi parollar bir xil emas' }); return }
    setBusy(true)
    try {
      const r = await desktopAuth.change(oldPw, newPw)
      if (r.ok) { setOldPw(''); setNewPw(''); setNewPw2('') }
      setMsg({ ok: r.ok, text: r.ok ? "Parol o'zgartirildi." : r.error })
    } finally { setBusy(false) }
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-brand-500" />
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Dastur paroli</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Joriy parol"><input className="input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="Yangi parol"><input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Takrorlang"><input className="input" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" /></Field>
      </div>
      <button className="btn-secondary mt-4" onClick={change} disabled={busy || !oldPw || !newPw}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Parolni o'zgartirish
      </button>
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
    </div>
  )
}

function BackupCard() {
  const [msg, setMsg] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const info = desktopInfo()

  async function save() {
    const r = await desktopBackup.save()
    if (r.ok) setMsg({ ok: true, text: `Zaxira nusxa saqlandi: ${r.path}` })
    else if (!r.canceled) setMsg({ ok: false, text: r.error || 'Saqlab bo\'lmadi' })
  }
  async function restore() {
    setConfirm(false)
    const r = await desktopBackup.restore()
    if (r.ok) window.location.reload()
    else if (!r.canceled) setMsg({ ok: false, text: r.error || 'Tiklab bo\'lmadi' })
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <HardDriveDownload className="h-5 w-5 text-amber-500" />
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Ma'lumotlar va zaxira</h3>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Barcha ma'lumot shu kompyuterda saqlanadi (internet kerak emas). Dastur har kuni avtomatik zaxira nusxa oladi
        (oxirgi 14 kun). Muhim bo'lsa, qo'shimcha nusxani flesh-diskka saqlab qo'ying.
      </p>
      <p className="mt-2 break-all text-xs text-slate-400">Papka: {info.dataDir} · versiya {info.version}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={save}><HardDriveDownload className="h-4 w-4" /> Zaxira nusxani saqlash</button>
        <button className="btn-secondary" onClick={() => setConfirm(true)}><Upload className="h-4 w-4" /> Zaxiradan tiklash</button>
      </div>
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={restore}
        title="Zaxiradan tiklash"
        message="Tanlangan zaxira fayli hozirgi ma'lumotlar o'rniga qo'yiladi (hozirgisi ham alohida nusxada saqlab qo'yiladi). Davom etasizmi?"
        confirmText="Ha, tiklash"
        danger={false}
      />
    </div>
  )
}

export default function DesktopSettings() {
  return (
    <>
      <TerminalCard />
      <PasswordCard />
      <BackupCard />
    </>
  )
}
