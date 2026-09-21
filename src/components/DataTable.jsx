import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react'
import clsx from 'clsx'
import { EmptyState } from './ui'

/**
 * Umumiy jadval: saralanadigan (sortable) va qidiriladigan (filterable).
 *
 * columns: [{ key, header, render?(row), sortValue?(row), align?, className?, thClassName? }]
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (r) => r.id,
  searchable = true,
  searchPlaceholder = 'Qidirish…',
  getSearchText,
  initialSort = null, // { key, dir }
  onRowClick,
  toolbar,
  emptyTitle = "Ma'lumot yo'q",
  emptyDescription,
  dense = false,
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState(initialSort)

  const filtered = useMemo(() => {
    if (!query.trim()) return rows
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      const text = getSearchText
        ? getSearchText(row)
        : columns.map((c) => String(c.sortValue ? c.sortValue(row) : row[c.key] ?? '')).join(' ')
      return text.toLowerCase().includes(q)
    })
  }, [rows, query, columns, getSearchText])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered
    const val = (row) => (col.sortValue ? col.sortValue(row) : row[col.key])
    return [...filtered].sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      let cmp
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'uz', { numeric: true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort, columns])

  function toggleSort(key) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  return (
    <div className="space-y-3">
      {(searchable || toolbar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {searchable ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          ) : (
            <div />
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40">
                <tr>
                  {columns.map((col) => {
                    const active = sort?.key === col.key
                    const sortable = col.sortable !== false
                    return (
                      <th
                        key={col.key}
                        className={clsx('table-th', col.thClassName, col.align === 'right' && 'text-right', col.align === 'center' && 'text-center')}
                      >
                        {sortable ? (
                          <button
                            onClick={() => toggleSort(col.key)}
                            className={clsx('inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200', col.align === 'right' && 'flex-row-reverse')}
                          >
                            {col.header}
                            {active ? (
                              sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                            )}
                          </button>
                        ) : (
                          col.header
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sorted.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={clsx(
                      'transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={clsx(
                          'table-td',
                          dense && 'py-1.5',
                          col.className,
                          col.align === 'right' && 'text-right',
                          col.align === 'center' && 'text-center',
                        )}
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="px-1 text-xs text-slate-400">
        Jami: {sorted.length}
        {sorted.length !== rows.length && ` / ${rows.length}`}
      </p>
    </div>
  )
}
