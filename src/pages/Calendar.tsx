import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../lib/store'
import { formatMoney, todayNairobi } from '../lib/money'
import { Empty, PageHeader, Spinner, StatusBadge } from '../components/ui'

const pad = (n: number) => String(n).padStart(2, '0')

export default function Calendar() {
  const { loading, debts, reminders, creditors } = useStore()
  const today = todayNairobi()
  const [ym, setYm] = useState(today.slice(0, 7))
  const [sel, setSel] = useState<string | null>(today)

  const [y, m] = ym.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7 // Monday first
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()

  const byDay = useMemo(() => {
    const map: Record<string, { due: typeof debts; rem: typeof reminders }> = {}
    for (const d of debts) {
      if (d.archived_at || d.status === 'paid' || !d.due_date) continue
      ;(map[d.due_date] ??= { due: [], rem: [] }).due.push(d)
    }
    for (const r of reminders) {
      if (!r.active) continue
      ;(map[r.remind_on] ??= { due: [], rem: [] }).rem.push(r)
    }
    return map
  }, [debts, reminders])

  if (loading) return <Spinner />

  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setYm(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`)
    setSel(null)
  }
  const selected = sel ? byDay[sel] : undefined

  return (
    <>
      <PageHeader title="Calendar" />
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <button aria-label="Previous month" className="rounded-full p-2" onClick={() => shift(-1)}><ChevronLeft className="h-5 w-5" /></button>
          <h2 className="font-bold">{first.toLocaleDateString('en-KE', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
          <button aria-label="Next month" className="rounded-full p-2" onClick={() => shift(1)}><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
          {Array.from({ length: lead }).map((_, i) => <div key={`l${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const iso = `${ym}-${pad(i + 1)}`
            const e = byDay[iso]
            const overdue = e?.due.some((d) => d.status === 'overdue')
            return (
              <button key={iso} onClick={() => setSel(iso)} aria-label={`${iso}${e ? `, ${e.due.length} due, ${e.rem.length} reminders` : ''}`}
                className={`relative grid h-11 place-items-center rounded-xl text-sm ${sel === iso ? 'bg-navy-900 text-white dark:bg-brand-600' : iso === today ? 'ring-2 ring-brand-500' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}>
                {i + 1}
                {e && <span className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${overdue ? 'bg-red-500' : e.due.length ? 'bg-brand-500' : 'bg-sky-400'}`} />}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">Green: due. Red: overdue. Blue: reminder only.</p>
      </section>

      {sel && (
        <section className="card">
          <h2 className="mb-2 font-bold">{sel}</h2>
          {!selected ? (
            <p className="text-sm text-slate-500">Nothing on this day.</p>
          ) : (
            <ul className="space-y-2">
              {selected.due.map((d) => (
                <li key={d.id}>
                  <Link to={`/debts/${d.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate"><b>{d.description}</b> <span className="text-slate-500">· {creditors.find((c) => c.id === d.creditor_id)?.name}</span></span>
                    <span className="flex items-center gap-2 font-semibold">{formatMoney(d.outstanding, d.currency)} <StatusBadge status={d.status} /></span>
                  </Link>
                </li>
              ))}
              {selected.rem.map((r) => {
                const d = debts.find((x) => x.id === r.debt_id)
                return d ? <li key={r.id} className="text-sm text-sky-700 dark:text-sky-300">Reminder: {d.description} ({r.frequency})</li> : null
              })}
            </ul>
          )}
        </section>
      )}
      {debts.length === 0 && <Empty title="No due dates yet" hint="Add a debt with a due date and it will show up here." />}
    </>
  )
}
