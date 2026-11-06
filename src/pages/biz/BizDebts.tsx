import { useState } from 'react'
import { Link } from 'react-router-dom'
import { loadDebts, useLoad, type BizStatus } from '../../lib/biz'
import { formatMoney } from '../../lib/money'
import { BizBadge } from '../../components/biz'
import { Empty, ErrorBox, fmtDate, PageHeader, Spinner } from '../../components/ui'

const FILTERS: { k: 'all' | BizStatus; l: string }[] = [
  { k: 'all', l: 'All' }, { k: 'awaiting_review', l: 'Awaiting customer' }, { k: 'awaiting_payment', l: 'Awaiting payment' },
  { k: 'partially_paid', l: 'Partial' }, { k: 'overdue', l: 'Overdue' }, { k: 'disputed', l: 'Disputed' }, { k: 'paid', l: 'Paid' }, { k: 'cancelled', l: 'Cancelled' },
]

export default function BizDebts() {
  const { data, loading, error, reload } = useLoad(loadDebts, [])
  const [f, setF] = useState<'all' | BizStatus>('all')
  const [q, setQ] = useState('')
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />
  const rows = data.filter((d) => (f === 'all' || d.status === f) && (!q || (d.customer_name + d.description + d.customer_phone).toLowerCase().includes(q.toLowerCase())))
  return (
    <>
      <PageHeader title="Debts" right={<Link to="/new" className="btn-primary">New request</Link>} />
      <input className="input" placeholder="Search customer or description" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filter">
        {FILTERS.map((x) => <button key={x.k} role="tab" aria-selected={f === x.k} onClick={() => setF(x.k)} className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${f === x.k ? 'bg-navy-900 text-white dark:bg-brand-600' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}>{x.l}</button>)}
      </div>
      {rows.length === 0 ? <Empty title="Nothing here" hint="No debts match this filter." /> : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li key={d.id}><Link to={`/debts/${d.id}`} className="card flex items-center justify-between gap-2">
              <span className="min-w-0"><span className="block truncate font-semibold">{d.customer_name}</span><span className="block truncate text-xs text-slate-500">{d.description} · due {fmtDate(d.due_date)}</span></span>
              <span className="shrink-0 text-right"><span className="block text-sm font-bold">{formatMoney(d.outstanding, d.currency)}</span><BizBadge status={d.status} as="business" /></span>
            </Link></li>
          ))}
        </ul>
      )}
    </>
  )
}
