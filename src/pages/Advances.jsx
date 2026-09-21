import { useEffect, useState } from 'react'
import { Plus, Trash2, HandCoins, Wallet, Users, Loader2 } from 'lucide-react'
import { PageHeader, PageLoader, StatCard, Modal, ConfirmDialog, Field, MoneyInput } from '../components/ui'
import DataTable from '../components/DataTable'
import { formatSom, formatDate, formatMonth, currentMonth } from '../lib/format'
import { recalculateMonth } from '../lib/runCalculation'
import * as db from '../lib/db'

export default function Advances() {
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])
  const [months, setMonths] = useState([])
  const [month, setMonth] = useState(currentMonth())
  const [advances, setAdvances] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [recalcing, setRecalcing] = useState(false)

  async function loadMonths() {
    const reports = await db.listReports()
    const set = new Set([currentMonth(), ...reports.map((r) => r.month)])
    const list = [...set].sort().reverse()
    setMonths(list)
    // Ma'lumot bor oyni (oxirgi hisobot) birinchi tanlaymiz
    return { list, preferred: reports[0]?.month || list[0] || currentMonth() }
  }

  async function reloadAdvances(m = month) {
    setAdvances(await db.listAdvances({ month: m }))
  }

  useEffect(() => {
    ;(async () => {
      const [emps] = await Promise.all([db.listEmployees()])
      setEmployees(emps)
      const { preferred } = await loadMonths()
      setMonth(preferred)
      await reloadAdvances(preferred)
      setLoading(false)
    })()
  }, [])

  async function afterChange(m) {
    await reloadAdvances(m)
    // Shu oy uchun hisob bo'lsa — qayta hisoblaymiz (avans oylikka ta'sir qiladi)
    setRecalcing(true)
    await recalculateMonth(m)
    setRecalcing(false)
  }

  const empMap = new Map(employees.map((e) => [e.id, e]))
  const total = advances.reduce((s, a) => s + (a.amount || 0), 0)
  const uniqueEmp = new Set(advances.map((a) => a.employee_id)).size

  const columns = [
    {
      key: 'employee', header: 'Ishchi',
      sortValue: (a) => empMap.get(a.employee_id)?.name || '',
      render: (a) => <span className="font-medium text-slate-800 dark:text-slate-100">{empMap.get(a.employee_id)?.name || '—'}</span>,
    },
    { key: 'amount', header: 'Summa', align: 'right', sortValue: (a) => a.amount,
      render: (a) => <span className="tabular font-semibold text-red-600 dark:text-red-400">−{formatSom(a.amount)}</span> },
    { key: 'date', header: 'Sana', sortValue: (a) => a.date, render: (a) => <span className="tabular">{formatDate(a.date)}</span> },
    { key: 'reason', header: 'Sabab', render: (a) => a.reason || <span className="text-slate-300">—</span> },
    { key: 'actions', header: '', sortable: false, align: 'right',
      render: (a) => (
        <button onClick={() => setDeleteTarget(a)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600" title="O'chirish">
          <Trash2 className="h-4 w-4" />
        </button>
      ) },
  ]

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader title="Avanslar" subtitle="Individual avanslar — oylikdan ushlab qolinadi">
        <select className="input w-auto" value={month} onChange={async (e) => { setMonth(e.target.value); await reloadAdvances(e.target.value) }}>
          {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Avans qo'shish
        </button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Wallet} label="Jami avans" value={formatSom(total)} hint={`${formatMonth(month)}`} tone="red" />
        <StatCard icon={HandCoins} label="Avanslar soni" value={advances.length} hint="ta" tone="amber" />
        <StatCard icon={Users} label="Ishchilar" value={uniqueEmp} hint="ta olgan" tone="brand" />
      </div>

      {recalcing && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          <Loader2 className="h-4 w-4 animate-spin" /> Oylik qayta hisoblanmoqda…
        </div>
      )}

      <DataTable
        columns={columns}
        rows={advances}
        searchPlaceholder="Ishchi, sabab bo'yicha qidirish…"
        getSearchText={(a) => `${empMap.get(a.employee_id)?.name || ''} ${a.reason || ''}`}
        initialSort={{ key: 'date', dir: 'desc' }}
        emptyTitle="Avanslar yo'q"
        emptyDescription="Bu oyda hali avans kiritilmagan."
      />

      {modalOpen && (
        <AdvanceForm
          employees={employees.filter((e) => e.is_active)}
          defaultMonth={month}
          onClose={() => setModalOpen(false)}
          onSaved={async (savedMonth) => {
            setModalOpen(false)
            await loadMonths()
            if (savedMonth !== month) setMonth(savedMonth)
            await afterChange(savedMonth)
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          const m = deleteTarget.month
          await db.deleteAdvance(deleteTarget.id)
          setDeleteTarget(null)
          await afterChange(m)
        }}
        title="Avansni o'chirish"
        message={`${empMap.get(deleteTarget?.employee_id)?.name || ''} — ${formatSom(deleteTarget?.amount)} so'm avansni o'chirasizmi?`}
      />
    </div>
  )
}

function AdvanceForm({ employees, defaultMonth, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const defaultDate = defaultMonth === currentMonth() ? today : `${defaultMonth}-15`
  const [form, setForm] = useState({ employee_id: employees[0]?.id || '', amount: '', date: defaultDate, reason: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.employee_id) return setError('Ishchini tanlang')
    if (!form.amount || form.amount <= 0) return setError("Summani kiriting")
    if (!form.date) return setError('Sanani tanlang')
    const month = form.date.slice(0, 7)
    setBusy(true)
    try {
      await db.createAdvance({
        employee_id: form.employee_id,
        amount: Number(form.amount),
        date: form.date,
        reason: form.reason?.trim() || null,
        month,
      })
      onSaved(month)
    } catch (err) {
      setError(err.message || 'Xatolik')
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Yangi avans" size="md">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Ishchi" required>
          <select className="input" value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Summa (so'm)" required>
          <MoneyInput value={form.amount} onChange={(v) => set('amount', v)} placeholder="500,000" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sana" required>
            <input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Oy">
            <input className="input bg-slate-50 dark:bg-slate-800" value={formatMonth(form.date.slice(0, 7))} disabled />
          </Field>
        </div>
        <Field label="Sabab">
          <input className="input" value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Masalan: shaxsiy ehtiyoj" />
        </Field>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Bekor qilish</button>
          <button type="submit" className="btn-primary" disabled={busy}>Qo'shish</button>
        </div>
      </form>
    </Modal>
  )
}
