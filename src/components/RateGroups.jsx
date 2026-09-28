import { useMemo, useState } from 'react'
import { Plus, Trash2, Loader2, Check } from 'lucide-react'
import { Modal, MoneyInput } from './ui'
import { RATE_TYPES, initialGroups, newGroup, assignEmployees, groupPatches } from '../lib/rateGroups'
import * as db from '../lib/db'

/** Guruh stavkalari: guruh (masalan «Tungi hamshiralar»), turi (oylik / smena uchun), summa, xodimlar */
export default function RateGroups({ employees, savedGroups, onClose, onSaved }) {
  const [groups, setGroups] = useState(() => initialGroups(savedGroups))
  const [openId, setOpenId] = useState(null) // xodim tanlash ro'yxati ochiq guruh
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useMemo(() => employees.filter((e) => e.is_active), [employees])
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])
  const patchGroup = (id, patch) => setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)))

  async function save() {
    setError('')
    try {
      const patches = groupPatches(groups)
      setBusy(true)
      if (patches.length) await db.updateEmployeesBulk(patches)
      await db.updateSettings({ rate_groups: groups })
      onSaved(patches.length)
    } catch (e) {
      setError(e.message || 'Saqlashda xatolik')
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Guruh stavkalari" size="xl">
      <div className="space-y-4">
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
          Guruhga xodimlarni tanlang va oylik yoki smena uchun summani kiriting — «Saqlash» bosilganda tanlangan xodimlarning oyligi shunga o'zgaradi.
          Bir xodim bitta guruhda bo'ladi.
        </p>

        {groups.map((g) => {
          const list = active.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
          return (
            <div key={g.id} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <input className="input w-56 font-semibold" value={g.name} placeholder="Guruh nomi" onChange={(e) => patchGroup(g.id, { name: e.target.value })} />
                <select className="input w-auto" value={g.type} onChange={(e) => patchGroup(g.id, { type: e.target.value })}>
                  {RATE_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                <MoneyInput className="w-40" value={g.amount} onChange={(v) => patchGroup(g.id, { amount: v })} placeholder={g.type === 'daily' ? 'smena uchun' : 'oylik'} />
                <button className="btn-ghost ml-auto p-1.5" title="Guruhni o'chirish" onClick={() => setGroups((gs) => gs.filter((x) => x.id !== g.id))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {g.employee_ids.map((id) => (
                  <span key={id} className="badge-slate">{byId.get(id)?.name || '?'}</span>
                ))}
                {g.employee_ids.length === 0 && <span className="text-xs text-slate-400">Xodim tanlanmagan</span>}
                <button className="btn-secondary btn-sm ml-1" onClick={() => { setOpenId(openId === g.id ? null : g.id); setQ('') }}>
                  Xodimlarni tanlash
                </button>
              </div>

              {openId === g.id && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <input className="input" placeholder="Ishchi qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
                  <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                    {list.map((e) => {
                      const on = g.employee_ids.includes(e.id)
                      return (
                        <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white dark:hover:bg-slate-700/50">
                          <input
                            type="checkbox" checked={on}
                            onChange={() => setGroups((gs) => assignEmployees(gs, g.id, on ? g.employee_ids.filter((x) => x !== e.id) : [...g.employee_ids, e.id]))}
                          />
                          <span className="truncate">{e.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <button className="btn-secondary btn-sm" onClick={() => setGroups((gs) => [...gs, newGroup('')])}>
          <Plus className="h-3.5 w-3.5" /> Guruh qo'shish
        </button>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Bekor qilish</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Saqlash va qo'llash
          </button>
        </div>
      </div>
    </Modal>
  )
}
