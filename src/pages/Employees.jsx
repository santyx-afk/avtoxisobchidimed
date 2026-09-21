import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Users, Clock, Building2 } from 'lucide-react'
import { PageHeader, PageLoader, Modal, ConfirmDialog, Field, MoneyInput, Toggle } from '../components/ui'
import DataTable from '../components/DataTable'
import { formatSom, shortTime } from '../lib/format'
import { CALC_TYPE_LABEL } from '../lib/constants'
import * as db from '../lib/db'

const emptyForm = {
  name: '', calc_type: 'fix', monthly_salary: '', hourly_rate: '',
  work_start: '08:00', work_end: '17:00', lunch_minutes: 60,
  department: 'Dimed', position: '', is_active: true,
}

export default function Employees() {
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [filter, setFilter] = useState('all')

  async function reload() {
    setEmployees(await db.listEmployees())
  }

  useEffect(() => {
    ;(async () => {
      await reload()
      setLoading(false)
    })()
  }, [])

  function openAdd() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(emp) {
    setEditing(emp)
    setModalOpen(true)
  }
  async function confirmDelete() {
    await db.deleteEmployee(deleteTarget.id)
    setDeleteTarget(null)
    reload()
  }

  if (loading) return <PageLoader />

  const filtered = employees.filter((e) => {
    if (filter === 'active') return e.is_active
    if (filter === 'inactive') return !e.is_active
    if (filter === 'fix') return e.calc_type === 'fix'
    if (filter === 'hourly') return e.calc_type === 'hourly'
    return true
  })

  const columns = [
    {
      key: 'name',
      header: 'Ism',
      render: (e) => (
        <div>
          <div className="font-medium text-slate-800 dark:text-slate-100">{e.name}</div>
          {e.position && <div className="text-xs text-slate-400">{e.position}</div>}
        </div>
      ),
    },
    {
      key: 'calc_type',
      header: 'Turi',
      render: (e) =>
        e.calc_type === 'fix' ? (
          <span className="badge-brand">{CALC_TYPE_LABEL.fix}</span>
        ) : (
          <span className="badge-amber">{CALC_TYPE_LABEL.hourly}</span>
        ),
    },
    {
      key: 'salary',
      header: 'Oylik / Stavka',
      align: 'right',
      sortValue: (e) => (e.calc_type === 'fix' ? e.monthly_salary : e.hourly_rate) || 0,
      render: (e) => (
        <span className="tabular font-medium">
          {e.calc_type === 'fix'
            ? formatSom(e.monthly_salary)
            : `${formatSom(e.hourly_rate)}/soat`}
        </span>
      ),
    },
    {
      key: 'work',
      header: 'Ish vaqti',
      sortValue: (e) => e.work_start,
      render: (e) => (
        <span className="tabular text-slate-500 dark:text-slate-400">
          {shortTime(e.work_start)}–{shortTime(e.work_end)}
        </span>
      ),
    },
    { key: 'department', header: 'Departament', render: (e) => e.department || '—' },
    {
      key: 'is_active',
      header: 'Holat',
      align: 'center',
      sortValue: (e) => (e.is_active ? 1 : 0),
      render: (e) =>
        e.is_active ? <span className="badge-green">Faol</span> : <span className="badge-slate">Nofaol</span>,
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      align: 'right',
      render: (e) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => openEdit(e)} className="btn-ghost p-1.5" title="Tahrirlash">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => setDeleteTarget(e)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600" title="O'chirish">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  const filterBtns = [
    ['all', 'Barchasi'],
    ['active', 'Faol'],
    ['fix', 'Fix'],
    ['hourly', 'Soatbay'],
  ]

  return (
    <div>
      <PageHeader title="Ishchilar" subtitle={`${employees.length} ta ishchi`}>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="h-4 w-4" /> Yangi ishchi
        </button>
      </PageHeader>

      <DataTable
        columns={columns}
        rows={filtered}
        searchPlaceholder="Ism, departament bo'yicha qidirish…"
        initialSort={{ key: 'name', dir: 'asc' }}
        emptyTitle="Ishchilar yo'q"
        emptyDescription="Yangi ishchi qo'shish uchun tugmani bosing."
        toolbar={
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {filterBtns.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === key
                    ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {modalOpen && (
        <EmployeeForm
          employee={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            reload()
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Ishchini o'chirish"
        message={`"${deleteTarget?.name}" ishchisini o'chirmoqchimisiz? Uning barcha attendance va hisob-kitoblari ham o'chadi.`}
      />
    </div>
  )
}

function EmployeeForm({ employee, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    employee
      ? {
          ...emptyForm,
          ...employee,
          monthly_salary: employee.monthly_salary ?? '',
          hourly_rate: employee.hourly_rate ?? '',
        }
      : emptyForm,
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Ism kiritilishi shart (IVMS dagi ism bilan bir xil)')
    if (form.calc_type === 'fix' && !form.monthly_salary) return setError('Fix oylik uchun oylik summa kiriting')
    if (form.calc_type === 'hourly' && !form.hourly_rate) return setError('Soatbay uchun soat stavkasini kiriting')
    if (form.work_end <= form.work_start) return setError("Tugash vaqti boshlanishdan keyin bo'lishi kerak")

    const payload = {
      name: form.name.trim(),
      calc_type: form.calc_type,
      monthly_salary: form.calc_type === 'fix' ? Number(form.monthly_salary) : null,
      hourly_rate: form.calc_type === 'hourly' ? Number(form.hourly_rate) : null,
      work_start: form.work_start,
      work_end: form.work_end,
      lunch_minutes: Number(form.lunch_minutes) || 0,
      department: form.department?.trim() || null,
      position: form.position?.trim() || null,
      is_active: form.is_active,
    }

    setBusy(true)
    try {
      if (employee) await db.updateEmployee(employee.id, payload)
      else await db.createEmployee(payload)
      onSaved()
    } catch (err) {
      setError(err.message || 'Xatolik yuz berdi')
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={employee ? 'Ishchini tahrirlash' : 'Yangi ishchi'} size="lg">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Ism (IVMS dagi bilan aynan bir xil)" required>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Aliyeva Nigora" autoFocus />
        </Field>

        <Field label="Hisoblash turi" required>
          <div className="grid grid-cols-2 gap-2">
            {[['fix', 'Fix oylik', 'Belgilangan oylik, kunlarga bo\'linadi'],
              ['hourly', 'Soatbay', 'Ishlagan soatlar bo\'yicha']].map(([val, title, desc]) => (
              <button
                type="button"
                key={val}
                onClick={() => set('calc_type', val)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  form.calc_type === val
                    ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                }`}
              >
                <div className="font-semibold text-slate-800 dark:text-slate-100">{title}</div>
                <div className="text-xs text-slate-400">{desc}</div>
              </button>
            ))}
          </div>
        </Field>

        {form.calc_type === 'fix' ? (
          <Field label="Oylik summa (so'm)" required>
            <MoneyInput value={form.monthly_salary} onChange={(v) => set('monthly_salary', v)} placeholder="3,000,000" />
          </Field>
        ) : (
          <Field label="Soat stavkasi (so'm/soat)" required>
            <MoneyInput value={form.hourly_rate} onChange={(v) => set('hourly_rate', v)} placeholder="25,000" />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Ish boshlanishi">
            <input type="time" className="input" value={form.work_start} onChange={(e) => set('work_start', e.target.value)} />
          </Field>
          <Field label="Ish tugashi">
            <input type="time" className="input" value={form.work_end} onChange={(e) => set('work_end', e.target.value)} />
          </Field>
          <Field label="Tushlik (daqiqa)">
            <input type="number" min="0" className="input" value={form.lunch_minutes} onChange={(e) => set('lunch_minutes', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Departament">
            <input className="input" value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="Dimed" />
          </Field>
          <Field label="Lavozim">
            <input className="input" value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="Hamshira" />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Faol</p>
            <p className="text-xs text-slate-400">Nofaol ishchilar hisoblashda qatnashmaydi</p>
          </div>
          <Toggle checked={form.is_active} onChange={(v) => set('is_active', v)} />
        </div>

        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Bekor qilish</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {employee ? 'Saqlash' : "Qo'shish"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
