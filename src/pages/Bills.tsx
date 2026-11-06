import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { DEBT_COLS, useLoad, type BizDebt } from '../lib/biz'
import { formatMoney } from '../lib/money'
import { BizBadge } from '../components/biz'
import { Empty, ErrorBox, fmtDate, PageHeader, Spinner } from '../components/ui'

export default function Bills() {
  const [tab, setTab] = useState<'open' | 'paid'>('open')
  const { data, loading, error, reload } = useLoad(async () => {
    const [d, b] = await Promise.all([
      supabase.from('business_debt_balances').select(DEBT_COLS).order('due_date').limit(300),
      supabase.from('businesses').select('id,name'),
    ])
    if (d.error) throw new Error(d.error.message)
    return { debts: (d.data ?? []) as unknown as BizDebt[], names: Object.fromEntries((b.data ?? []).map((x) => [x.id, x.name as string])) }
  }, [])
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />
  const rows = data.debts.filter((d) => (tab === 'paid' ? d.status === 'paid' || d.status === 'cancelled' : d.status !== 'paid' && d.status !== 'cancelled'))
  const owed: Record<string, number> = {}
  data.debts.filter((d) => d.status !== 'cancelled').forEach((d) => { owed[d.currency] = (owed[d.currency] ?? 0) + d.outstanding })
  return (
    <>
      <PageHeader title="Bills from businesses" />
      <div className="card"><p className="text-xs text-slate-500">Total you owe businesses</p>
        <p className="text-xl font-extrabold">{Object.keys(owed).length ? Object.entries(owed).map(([c, v]) => <span key={c} className="block">{formatMoney(v, c)}</span>) : formatMoney(0, 'KES')}</p></div>
      <div className="flex gap-2" role="tablist">
        {(['open', 'paid'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1 text-sm font-semibold ${tab === t ? 'bg-navy-900 text-white dark:bg-brand-600' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}>{t === 'open' ? 'To review / pay' : 'Paid & closed'}</button>)}
      </div>
      {rows.length === 0 ? <Empty title={tab === 'open' ? 'No bills right now' : 'Nothing here yet'} hint="When a business sends you a debt request through OweWise it appears here. Ask them to send you their link." /> : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li key={d.id}><Link to={`/bills/${d.id}`} className="card flex items-center justify-between gap-2">
              <span className="min-w-0"><span className="block truncate font-semibold">{data.names[d.business_id] ?? 'Business'}</span><span className="block truncate text-xs text-slate-500">{d.description} · due {fmtDate(d.due_date)}</span></span>
              <span className="shrink-0 text-right"><span className="block text-sm font-bold">{formatMoney(d.outstanding, d.currency)}</span><BizBadge status={d.status} as="customer" /></span>
            </Link></li>
          ))}
        </ul>
      )}
    </>
  )
}
