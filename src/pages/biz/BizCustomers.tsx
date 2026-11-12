import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAccount } from '../../lib/account'
import { call, loadDebts, useLoad, waLink, type BizDebt, type Trust } from '../../lib/biz'
import { TrustBadge } from '../../components/trust'
import { formatMoney, parseAmountInput } from '../../lib/money'
import { downloadStatement } from '../../lib/statementPdf'
import { Empty, ErrorBox, fmtDate, Modal, PageHeader, Spinner } from '../../components/ui'

type Cust = { id: string; name: string; phone: string; customer_user_id: string | null; credit_limit: number | null }

export default function BizCustomers() {
  const { business, role } = useAccount()
  const isStaff = role === 'staff'
  const [limitFor, setLimitFor] = useState<Cust | null>(null)
  const { data, loading, error, reload } = useLoad(async () => {
    const [c, d, t] = await Promise.all([supabase.from('business_customers').select('id,name,phone,customer_user_id,credit_limit').order('name'), loadDebts(), call<{ customer_id: string; trust: Trust }[]>('customer_trust_all', {})])
    if (c.error) throw new Error(c.error.message)
    const trust: Record<string, Trust> = {}
    for (const r of t.data ?? []) trust[r.customer_id] = r.trust
    return { customers: (c.data ?? []) as Cust[], debts: d, trust }
  }, [])
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />
  return (
    <>
      <PageHeader title="Customers" right={isStaff ? undefined : <Link to="/reports" className="btn-secondary">Reports</Link>} />
      {data.customers.length === 0 ? <Empty title="No customers yet" hint="Customers are added automatically when you send a debt request or make a quick record." /> : (
        <ul className="space-y-2">
          {data.customers.map((c) => {
            const mine = data.debts.filter((d) => d.business_customer_id === c.id && d.status !== 'cancelled')
            const open = mine.filter((d) => d.outstanding > 0)
            const owed: Record<string, number> = {}
            open.forEach((d) => { owed[d.currency] = (owed[d.currency] ?? 0) + d.outstanding })
            return (
              <li key={c.id} className="card space-y-2">
                <div className="flex justify-between gap-2">
                  <div><p className="font-semibold">{c.name}</p><p className="text-xs text-slate-500">{c.phone} · {c.customer_user_id ? 'Linked to an OweWise account' : 'Not linked yet'}</p>
                    <p className="text-xs text-slate-500">Credit limit: {c.credit_limit === null ? 'none' : formatMoney(c.credit_limit, 'KES')}</p>
                    <p className="mt-1"><TrustBadge t={data.trust[c.id]} /></p>
                  </div>
                  <div className="text-right text-sm font-bold">{Object.entries(owed).map(([cur, v]) => <span key={cur} className="block">{formatMoney(v, cur)}</span>)}</div>
                </div>
                {mine.length > 0 && <div className="flex flex-wrap gap-x-3 text-xs">{mine.slice(0, 5).map((d) => <Link key={d.id} className="font-semibold text-brand-700 underline dark:text-brand-400" to={`/debts/${d.id}`}>{d.description.slice(0, 24)}</Link>)}</div>}
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  {!isStaff && <button className="btn-secondary !min-h-0 px-3 py-1.5" onClick={() => setLimitFor(c)}>Credit limit</button>}
                  {mine.length > 0 && <button className="btn-secondary !min-h-0 px-3 py-1.5" onClick={() => downloadStatement(business?.name ?? 'Business', c.name, c.phone, mine)}>Statement PDF</button>}
                  {open.length > 0 && <a className="btn-secondary !min-h-0 px-3 py-1.5" target="_blank" rel="noopener noreferrer" href={waLink(c.phone, statementText(business?.name ?? 'us', c.name, open))}>Share balance on WhatsApp</a>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {limitFor && <LimitModal c={limitFor} onClose={() => setLimitFor(null)} onDone={() => { setLimitFor(null); reload() }} />}
    </>
  )
}

function statementText(business: string, name: string, open: BizDebt[]): string {
  const lines = open.map((d) => `• ${d.description}: ${formatMoney(d.outstanding, d.currency)} (due ${fmtDate(d.due_date)})`).join('\n')
  return `Hello ${name}, here is your balance with ${business}:\n${lines}\nThank you.`
}

function LimitModal({ c, onClose, onDone }: { c: Cust; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState(c.credit_limit === null ? '' : String(c.credit_limit))
  const [err, setErr] = useState('')
  return (
    <Modal title={`Credit limit for ${c.name}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        let n: number | null = null
        if (v.trim()) { const p = parseAmountInput(v, 'KES', { allowZero: true }); if (!p.ok) return setErr(p.error); n = p.value }
        const r = await call('set_credit_limit', { p_customer: c.id, p_limit: n })
        if (r.error) return setErr(r.error)
        onDone()
      }}>
        <p className="text-sm text-slate-600 dark:text-slate-300">The most this customer may owe you in KES at one time. New debts that would go over it are refused. Leave blank for no limit.</p>
        <input className="input" inputMode="decimal" placeholder="e.g. 2000" aria-label="Credit limit in KES" value={v} onChange={(e) => setV(e.target.value)} />
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full">Save</button>
      </form>
    </Modal>
  )
}
