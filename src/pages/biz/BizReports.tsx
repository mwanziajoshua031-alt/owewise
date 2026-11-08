import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAccount } from '../../lib/account'
import { call, loadDebts, useLoad, waLink } from '../../lib/biz'
import { download, toCSV } from '../../lib/derive'
import { formatMoney } from '../../lib/money'
import { Empty, ErrorBox, PageHeader, Spinner } from '../../components/ui'

type Rep = {
  billed: number; collected: number; outstanding: number; overdue: number; collection_rate: number | null; on_time_rate: number | null
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number }
  top_debtors: { business_customer_id: string; name: string; phone: string; outstanding: number; days_overdue: number | null; open_debts: number }[]
}

export default function BizReports() {
  const { business } = useAccount()
  const [cur, setCur] = useState('KES')
  const meta = useLoad(async () => {
    const d = await loadDebts()
    return { debts: d, currencies: [...new Set(['KES', ...d.map((x) => x.currency)])] }
  }, [])
  const rep = useLoad(async () => {
    const r = await call<Rep>('business_report', { p_currency: cur })
    if (r.error) throw new Error(r.error)
    return r.data as Rep
  }, [cur])

  if (meta.loading) return <Spinner />
  if (meta.error || !meta.data) return <ErrorBox message={meta.error} onRetry={meta.reload} />
  const { debts, currencies } = meta.data
  const r = rep.data
  const agingRows: [string, number][] = r ? [['Not due yet', r.aging.current], ['1–30 days late', r.aging.d1_30], ['31–60 days', r.aging.d31_60], ['61–90 days', r.aging.d61_90], ['Over 90 days', r.aging.d90_plus]] : []
  const max = Math.max(1, ...agingRows.map(([, v]) => v))

  async function exportPayments() {
    const { data } = await supabase.from('business_payments').select('created_at,debt_id,kind,amount,currency,method,status,mpesa_receipt,note').order('created_at', { ascending: false }).limit(5000)
    const byId = new Map(debts.map((d) => [d.id, d]))
    download('owewise-payments.csv', toCSV([
      ['Date', 'Customer', 'Debt', 'Type', 'Currency', 'Amount', 'Method', 'Status', 'M-Pesa receipt', 'Note'],
      ...(data ?? []).map((p) => [String(p.created_at).slice(0, 10), byId.get(p.debt_id)?.customer_name, byId.get(p.debt_id)?.description, p.kind, p.currency, p.amount, p.method, p.status, p.mpesa_receipt, p.note]),
    ]))
  }

  return (
    <>
      <Link to="/" className="text-sm font-semibold text-brand-700 underline dark:text-brand-400">← Home</Link>
      <PageHeader title="Reports" />
      {currencies.length > 1 && (
        <div className="flex gap-2" role="tablist" aria-label="Currency">
          {currencies.map((c) => <button key={c} role="tab" aria-selected={c === cur} onClick={() => setCur(c)} className={`rounded-full px-3 py-1 text-sm font-semibold ${c === cur ? 'bg-navy-900 text-white dark:bg-brand-600' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}>{c}</button>)}
        </div>
      )}
      {rep.loading && !r ? <Spinner /> : rep.error || !r ? <ErrorBox message={rep.error} onRetry={rep.reload} /> : r.billed === 0 ? <Empty title={`No ${cur} debts yet`} hint="Reports appear once you have recorded or sent a debt." /> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Tile l="Total billed" v={formatMoney(r.billed, cur)} />
            <Tile l="Collected" v={formatMoney(r.collected, cur)} good />
            <Tile l="Still owed" v={formatMoney(r.outstanding, cur)} />
            <Tile l="Overdue" v={formatMoney(r.overdue, cur)} bad={r.overdue > 0} />
            <Tile l="Collection rate" v={r.collection_rate === null ? '—' : `${r.collection_rate}%`} />
            <Tile l="Paid on time" v={r.on_time_rate === null ? 'No paid debts yet' : `${r.on_time_rate}%`} />
          </div>
          <section className="card space-y-2">
            <h2 className="font-bold">How old is what you are owed</h2>
            {agingRows.map(([l, v]) => (
              <div key={l} className="text-sm">
                <div className="flex justify-between"><span>{l}</span><span className="font-semibold">{formatMoney(v, cur)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="img" aria-label={`${l}: ${formatMoney(v, cur)}`}><div className={`h-full rounded-full ${l === 'Not due yet' ? 'bg-brand-600' : 'bg-red-500'}`} style={{ width: `${(v / max) * 100}%` }} /></div>
              </div>
            ))}
          </section>
          <section className="card space-y-2">
            <h2 className="font-bold">Who owes you most</h2>
            {r.top_debtors.length === 0 ? <p className="text-sm text-slate-500">Nobody owes you anything right now.</p> : (
              <ul className="divide-y divide-slate-100 dark:divide-white/10">
                {r.top_debtors.map((t) => (
                  <li key={t.business_customer_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-semibold">{t.name}</span><span className="block text-xs text-slate-500">{t.open_debts} open · {t.days_overdue ? `${t.days_overdue} days late` : 'not late'}</span></span>
                    <span className="flex shrink-0 items-center gap-2"><b>{formatMoney(t.outstanding, cur)}</b>
                      <a className="text-xs font-semibold text-brand-700 underline dark:text-brand-400" target="_blank" rel="noopener noreferrer"
                        href={waLink(t.phone, `Hello ${t.name}, a friendly reminder from ${business?.name ?? 'us'}: you have an outstanding balance of ${formatMoney(t.outstanding, cur)}. Thank you.`)}>Remind</a></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <section className="card space-y-2">
        <h2 className="font-bold">Export</h2>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={() => download('owewise-debts.csv', toCSV([
            ['Customer', 'Phone', 'Description', 'Currency', 'Amount', 'Paid', 'Outstanding', 'Status', 'Incurred', 'Due', 'Type'],
            ...debts.map((d) => [d.customer_name, d.customer_phone, d.description, d.currency, d.amount, d.paid_total, d.outstanding, d.status, d.incurred_on, d.due_date, d.source]),
          ]))}>Debts CSV</button>
          <button className="btn-secondary" onClick={exportPayments}>Payments CSV</button>
        </div>
        <p className="text-xs text-slate-500">Open in Excel or Google Sheets. For a single customer&rsquo;s PDF statement, use the Customers page.</p>
      </section>
    </>
  )
}

function Tile({ l, v, good, bad }: { l: string; v: string; good?: boolean; bad?: boolean }) {
  return <div className="card"><p className="text-xs text-slate-500">{l}</p><p className={`text-lg font-extrabold ${good ? 'text-brand-700 dark:text-brand-400' : bad ? 'text-red-600' : ''}`}>{v}</p></div>
}
