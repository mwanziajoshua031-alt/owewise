import { useState } from 'react'
import { Link } from 'react-router-dom'
import { call, useIsAdmin, useLoad } from '../lib/biz'
import { Banner, Empty, ErrorBox, fmtDate, Modal, PageHeader, Spinner } from '../components/ui'
import { formatMoney } from '../lib/money'

type Tab = 'overview' | 'businesses' | 'reports' | 'payments' | 'audit' | 'plans'
const TABS: [Tab, string][] = [['overview', 'Overview'], ['businesses', 'Businesses'], ['reports', 'Reports'], ['payments', 'Payments to check'], ['audit', 'Audit log'], ['plans', 'Plans']]

/** Small hook: runs an admin function and returns rows. */
function useAdmin<T>(fn: string, args: Record<string, unknown> = {}) {
  return useLoad(async () => {
    const r = await call<T>(fn, args)
    if (r.error) throw new Error(r.error)
    return r.data as T
  }, [fn])
}

export default function Admin() {
  const isAdmin = useIsAdmin()
  const [tab, setTab] = useState<Tab>('overview')
  if (isAdmin === null) return <Spinner />
  if (!isAdmin) return <Empty title="Not available" hint="This area is for platform administrators." action={<Link className="btn-secondary" to="/">Go home</Link>} />
  return (
    <>
      <PageHeader title="Admin" />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${tab === k ? 'bg-navy-900 text-white dark:bg-brand-600' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}>{l}</button>)}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'businesses' && <Businesses />}
      {tab === 'reports' && <Reports />}
      {tab === 'payments' && <PaymentsReview />}
      {tab === 'audit' && <Audit />}
      {tab === 'plans' && <Plans />}
    </>
  )
}

type Ov = { businesses: number; suspended: number; customers: number; debts: number; open_disputes: number; review_payments: number; open_reports: number; volume: Record<string, number>; billed: Record<string, number> }
function Overview() {
  const { data, loading, error } = useAdmin<Ov>('admin_overview')
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} />
  const money = (m: Record<string, number>) => Object.keys(m).length ? Object.entries(m).map(([c, v]) => <span key={c} className="block">{formatMoney(v, c)}</span>) : '—'
  const Tile = ({ l, v }: { l: string; v: React.ReactNode }) => <div className="card"><p className="text-xs text-slate-500">{l}</p><p className="text-lg font-extrabold">{v}</p></div>
  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile l="Businesses" v={`${data.businesses} (${data.suspended} suspended)`} /><Tile l="Customers" v={data.customers} />
      <Tile l="Active debts" v={data.debts} /><Tile l="Open disputes" v={data.open_disputes} />
      <Tile l="Payments to check" v={data.review_payments} /><Tile l="Open reports" v={data.open_reports} />
      <Tile l="Total billed" v={money(data.billed)} /><Tile l="Total collected" v={money(data.volume)} />
    </div>
  )
}

type Biz = { id: string; name: string; email: string | null; owner_email: string; status: 'active' | 'suspended'; created_at: string; debts: number; mpesa: boolean }
function Businesses() {
  const { data, loading, error, reload } = useAdmin<Biz[]>('admin_list_businesses')
  const [target, setTarget] = useState<Biz | null>(null)
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} />
  return (
    <>
      {data.length === 0 ? <Empty title="No businesses yet" /> : (
        <ul className="space-y-2">{data.map((b) => (
          <li key={b.id} className="card flex items-center justify-between gap-2">
            <div className="min-w-0"><p className="truncate font-semibold">{b.name} {b.status === 'suspended' && <span className="rounded-full bg-red-100 px-2 text-xs text-red-800">Suspended</span>}</p>
              <p className="truncate text-xs text-slate-500">{b.owner_email} · {b.debts} debts · M-Pesa {b.mpesa ? 'on' : 'off'} · {fmtDate(b.created_at)}</p></div>
            <button className="btn-secondary !min-h-0 shrink-0 px-3 py-1.5 text-xs" onClick={() => setTarget(b)}>{b.status === 'active' ? 'Suspend' : 'Reinstate'}</button>
          </li>))}</ul>
      )}
      {target && <ReasonModal title={`${target.status === 'active' ? 'Suspend' : 'Reinstate'} ${target.name}`} cta={target.status === 'active' ? 'Suspend' : 'Reinstate'} onClose={() => setTarget(null)}
        run={(reason) => call('admin_set_business_status', { p_business: target.id, p_status: target.status === 'active' ? 'suspended' : 'active', p_reason: reason })} onDone={() => { setTarget(null); reload() }} />}
    </>
  )
}

type Rep = { id: string; business_id: string; business_name: string; reason: string; status: 'open' | 'reviewed'; created_at: string }
function Reports() {
  const { data, loading, error, reload } = useAdmin<Rep[]>('admin_list_reports')
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} />
  if (!data.length) return <Empty title="No reports" hint="Customer reports about businesses show up here." />
  return (
    <ul className="space-y-2">{data.map((r) => (
      <li key={r.id} className={`card space-y-1 ${r.status === 'open' ? 'border-l-4 border-l-orange-400' : 'opacity-70'}`}>
        <p className="font-semibold">{r.business_name}</p><p className="text-sm">{r.reason}</p>
        <p className="text-xs text-slate-500">{fmtDate(r.created_at)} · {r.status}</p>
        {r.status === 'open' && <button className="text-xs font-semibold underline" onClick={async () => { await call('admin_resolve_report', { p_report: r.id }); reload() }}>Mark reviewed</button>}
      </li>))}</ul>
  )
}

type Pay = { id: string; debt_id: string; business_name: string; customer_name: string; amount: number; currency: string; mpesa_receipt: string | null; result_desc: string | null; created_at: string }
function PaymentsReview() {
  const { data, loading, error, reload } = useAdmin<Pay[]>('admin_review_payments')
  const [t, setT] = useState<Pay | null>(null)
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} />
  if (!data.length) return <Empty title="Nothing to check" hint="M-Pesa payments that could not be confirmed automatically appear here." />
  return (
    <>
      <Banner tone="warn">Check the business&rsquo;s M-Pesa statement. Only confirm a payment if you can see the matching M-Pesa receipt. Do not confirm from a screenshot alone.</Banner>
      <ul className="space-y-2">{data.map((p) => (
        <li key={p.id} className="card space-y-1">
          <p className="font-semibold">{formatMoney(p.amount, p.currency)} · {p.business_name}</p>
          <p className="text-sm">From {p.customer_name}{p.mpesa_receipt ? ` · receipt on file ${p.mpesa_receipt}` : ''}</p>
          <p className="text-xs text-slate-500">{fmtDate(p.created_at)} · {p.result_desc}</p>
          <button className="btn-secondary !min-h-0 px-3 py-1.5 text-xs" onClick={() => setT(p)}>Decide</button>
        </li>))}</ul>
      {t && <DecideModal p={t} onClose={() => setT(null)} onDone={() => { setT(null); reload() }} />}
    </>
  )
}

function DecideModal({ p, onClose, onDone }: { p: Pay; onClose: () => void; onDone: () => void }) {
  const [action, setAction] = useState<'succeed' | 'fail'>('succeed')
  const [receipt, setReceipt] = useState(p.mpesa_receipt ?? '')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  return (
    <Modal title="Decide on this payment" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        const r = await call('admin_resolve_payment', { p_payment: p.id, p_action: action, p_receipt: receipt, p_note: note })
        if (r.error) return setErr(r.error.includes('Something went wrong') ? 'Could not apply. Check the receipt code and amount.' : r.error)
        onDone()
      }}>
        <select className="input" value={action} onChange={(e) => setAction(e.target.value as 'succeed' | 'fail')} aria-label="Decision"><option value="succeed">Money was received: confirm</option><option value="fail">No money received: reject</option></select>
        {action === 'succeed' && <input className="input" placeholder="M-Pesa receipt code (required)" value={receipt} onChange={(e) => setReceipt(e.target.value)} />}
        <textarea className="input min-h-[70px] py-2" placeholder="Note (what you checked)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full">Apply decision</button>
      </form>
    </Modal>
  )
}

type Log = { id: number; actor_email: string | null; table_name: string; action: string; detail: Record<string, unknown>; created_at: string }
function Audit() {
  const { data, loading, error } = useAdmin<Log[]>('admin_audit_logs', { p_limit: 100 })
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} />
  return (
    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-xs dark:divide-white/10 dark:border-white/10 dark:bg-navy-900">
      {data.map((l) => <li key={l.id} className="p-3"><b>{l.table_name}</b> · {l.action} · {l.actor_email ?? 'system'}<br /><span className="text-slate-500">{new Date(l.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} {JSON.stringify(l.detail)}</span></li>)}
    </ul>
  )
}

type Plan = { id: string; name: string; price_kes: number | null; max_open_debts: number | null; features: string[]; note?: string }
function Plans() {
  const { data, loading, error, reload } = useLoad(async () => {
    const { supabase } = await import('../lib/supabase')
    const { data, error } = await supabase.from('platform_settings').select('value').eq('key', 'business_plans').maybeSingle()
    if (error) throw new Error(error.message)
    return (data?.value ?? []) as Plan[]
  }, [])
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [msg, setMsg] = useState('')
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} />
  const rows = plans ?? data
  const upd = (i: number, p: Partial<Plan>) => setPlans(rows.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="space-y-3">
      <Banner>Business plans are configured here. Charging businesses for a plan needs a payment provider (Paystack or similar), which is not connected yet, so these settings are not enforced for now.</Banner>
      {rows.map((p, i) => (
        <div key={p.id} className="card space-y-2">
          <input className="input" aria-label="Plan name" value={p.name} onChange={(e) => upd(i, { name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" inputMode="numeric" aria-label="Monthly price in KES" placeholder="Monthly price (KES)" value={p.price_kes ?? ''} onChange={(e) => upd(i, { price_kes: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })} />
            <input className="input" inputMode="numeric" aria-label="Max open debts" placeholder="Max open debts (blank = unlimited)" value={p.max_open_debts ?? ''} onChange={(e) => upd(i, { max_open_debts: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })} />
          </div>
        </div>
      ))}
      <button className="btn-primary w-full" onClick={async () => { const r = await call('admin_set_plans', { p_plans: rows }); setMsg(r.error ?? 'Saved'); if (!r.error) { setPlans(null); reload() } }}>Save plans</button>
      {msg && <p className="text-sm" role="status">{msg}</p>}
    </div>
  )
}

function ReasonModal({ title, cta, run, onClose, onDone }: { title: string; cta: string; run: (reason: string) => Promise<{ error: string | null }>; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  return (
    <Modal title={title} onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (reason.trim().length < 3) return setErr('Give a reason'); const r = await run(reason); if (r.error) return setErr(r.error); onDone() }}>
        <textarea className="input min-h-[80px] py-2" placeholder="Reason (kept in the audit log)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-danger w-full">{cta}</button>
      </form>
    </Modal>
  )
}
