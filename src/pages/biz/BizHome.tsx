import { Link } from 'react-router-dom'
import { useAccount } from '../../lib/account'
import { loadDebts, useLoad, type BizDebt } from '../../lib/biz'
import { formatMoney } from '../../lib/money'
import { BizBadge } from '../../components/biz'
import { NewBadge, useUnread } from '../../lib/unread'
import { Empty, ErrorBox, fmtDate, Spinner } from '../../components/ui'

function totals(rows: BizDebt[], pick: (d: BizDebt) => number) {
  const t: Record<string, number> = {}
  for (const d of rows) t[d.currency] = (t[d.currency] ?? 0) + pick(d)
  return t
}
function Money({ t }: { t: Record<string, number> }) {
  const e = Object.entries(t)
  if (!e.length) return <>{formatMoney(0, 'KES')}</>
  return <>{e.map(([c, v]) => <span key={c} className="block">{formatMoney(v, c)}</span>)}</>
}

export default function BizHome() {
  const { business, role } = useAccount()
  const { counts, total } = useUnread()
  const { data, loading, error, reload } = useLoad(loadDebts, [])
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />
  const live = data.filter((d) => d.status !== 'cancelled')
  const open = live.filter((d) => d.outstanding > 0)
  const overdue = open.filter((d) => d.status === 'overdue')
  const collected = live.filter((d) => d.paid_total > 0)
  const count = (s: string) => live.filter((d) => d.status === s).length
  return (
    <>
      <h1 className="text-xl font-bold">Hello, {business?.name}</h1>
      {total > 0 && <Link to="/debts" className="card block border-l-4 border-l-red-500 text-sm font-semibold">You have {total} new message{total === 1 ? '' : 's'} from customers</Link>}
      <div className="grid grid-cols-2 gap-3">
        <div className="card"><p className="text-xs text-slate-500">Owed to you</p><p className="text-lg font-extrabold"><Money t={totals(open, (d) => d.outstanding)} /></p></div>
        <div className="card"><p className="text-xs text-slate-500">Collected so far</p><p className="text-lg font-extrabold text-brand-700 dark:text-brand-400"><Money t={totals(collected, (d) => d.paid_total)} /></p></div>
        <div className="card"><p className="text-xs text-slate-500">Overdue</p><p className="text-lg font-extrabold text-red-600"><Money t={totals(overdue, (d) => d.outstanding)} /></p><p className="text-xs text-slate-500">{overdue.length} debt{overdue.length === 1 ? '' : 's'}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Needs attention</p>
          <p className="text-sm">{count('awaiting_review')} awaiting customer · {count('disputed')} disputed</p></div>
      </div>
      <div className={`grid gap-2 ${role === 'staff' ? 'grid-cols-1' : 'grid-cols-2'}`}><Link to="/new?mode=quick" className="btn-secondary">Quick record</Link>{role !== 'staff' && <Link to="/reports" className="btn-secondary">Reports</Link>}</div>
      <div className="flex items-center justify-between"><h2 className="font-bold">Recent requests</h2><Link className="text-sm font-semibold underline" to="/debts">See all</Link></div>
      {data.length === 0 ? (
        <Empty title="No debt requests yet" hint="Send your first debt request to a customer. They review it, confirm it, then can pay you by M-Pesa." action={<Link className="btn-primary" to="/new">Send debt request</Link>} />
      ) : (
        <ul className="space-y-2">
          {data.slice(0, 6).map((d) => (
            <li key={d.id}><Link to={`/debts/${d.id}`} className="card flex items-center justify-between gap-2">
              <span className="min-w-0"><span className="block truncate font-semibold">{d.customer_name}<NewBadge n={counts[d.id]} /></span><span className="block truncate text-xs text-slate-500">{d.description} · due {fmtDate(d.due_date)}</span></span>
              <span className="shrink-0 text-right"><span className="block text-sm font-bold">{formatMoney(d.outstanding, d.currency)}</span><BizBadge status={d.status} as="business" /></span>
            </Link></li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">Customers pay straight to your M-Pesa; OweWise never holds your money.</p>
    </>
  )
}
