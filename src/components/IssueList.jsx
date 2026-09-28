import { useMemo, useState } from 'react'
import { Pencil, Search } from 'lucide-react'
import { Modal } from './ui'
import { collectDayIssues, issueDetail } from '../lib/dayEdit'
import { formatDate } from '../lib/format'

const LIMIT = 150

/** Bir turdagi muammolar ro'yxati (ishchi, kun, nima bo'lgani) — bosib tuzatishga o'tiladi */
export default function IssueList({ open, onClose, type, title, results, daysByEmp, onFix, canFix }) {
  const [q, setQ] = useState('')
  const items = useMemo(() => (open ? collectDayIssues(results, daysByEmp, type) : []), [open, results, daysByEmp, type])
  const filtered = items.filter((x) => x.employee.name.toLowerCase().includes(q.trim().toLowerCase()))
  const shown = filtered.slice(0, LIMIT)

  return (
    <Modal open={open} onClose={() => { setQ(''); onClose() }} title={title || 'Muammolar'} size="xl">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Ishchi qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {shown.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Muammo topilmadi</p>}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {shown.map((x) => (
            <li key={`${x.employee.id}|${x.day.date}|${x.issue.at}`} className="flex items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-800 dark:text-slate-100">{x.employee.name}</div>
                <div className="text-xs text-slate-500">
                  {formatDate(x.day.date)} {x.day.day_of_week && `(${x.day.day_of_week})`} · {issueDetail(x.issue)}
                </div>
              </div>
              <button className="btn-secondary btn-sm shrink-0" onClick={() => onFix(x)} title={canFix ? 'Kunni tuzatish' : 'Tafsilotni ochish'}>
                <Pencil className="h-3.5 w-3.5" /> {canFix ? 'Tuzatish' : "Ko'rish"}
              </button>
            </li>
          ))}
        </ul>
        {filtered.length > LIMIT && (
          <p className="text-center text-xs text-slate-400">Dastlabki {LIMIT} ta ko'rsatildi ({filtered.length} tadan) — qidiruvdan foydalaning</p>
        )}
      </div>
    </Modal>
  )
}
