import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { call, useLoad, STATUS_TEXT, type BizPayment, type BizStatus, type DebtMessage, type Dispute, type Receipt } from '../lib/biz'
import { downloadReceipt } from '../lib/receiptPdf'
import { useUnread } from '../lib/unread'
import { formatMoney } from '../lib/money'
import { ErrorBox, fmtDate, Spinner } from './ui'

const TONE: Record<BizStatus, string> = {
  awaiting_review: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  awaiting_payment: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
  partially_paid: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200',
  disputed: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200',
  cancelled: 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400',
}
export function BizBadge({ status, as }: { status: BizStatus; as: 'business' | 'customer' }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[status]}`}>{STATUS_TEXT[status][as]}</span>
}

const METHOD = { mpesa_stk: 'M-Pesa', cash: 'Cash', other: 'Other' } as const

/** Payments and receipts for one debt. `onReverse` is given to business users only. */
export function PaymentsList({ debtId, refreshKey, onReverse }: { debtId: string; refreshKey?: number; onReverse?: (p: BizPayment) => void }) {
  const { data, loading, error } = useLoad(async () => {
    const [p, r] = await Promise.all([
      supabase.from('business_payments').select('id,debt_id,kind,reverses_payment_id,amount,currency,method,status,mpesa_receipt,result_desc,needs_review,note,created_at,completed_at').eq('debt_id', debtId).order('created_at', { ascending: false }),
      supabase.from('payment_receipts').select('*').eq('debt_id', debtId),
    ])
    if (p.error) throw new Error(p.error.message)
    return { payments: (p.data ?? []) as BizPayment[], receipts: (r.data ?? []) as Receipt[] }
  }, [debtId, refreshKey])
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error || 'Could not load payments'} />
  const reversed = new Set(data.payments.filter((p) => p.kind === 'reversal' && p.status === 'succeeded').map((p) => p.reverses_payment_id))
  if (!data.payments.length) return <p className="text-sm text-slate-500">No payments yet.</p>
  return (
    <ul className="divide-y divide-slate-100 dark:divide-white/10">
      {data.payments.map((p) => {
        const rc = data.receipts.find((x) => x.payment_id === p.id)
        return (
          <li key={p.id} className="space-y-1 py-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-semibold">{p.kind === 'reversal' ? 'Reversal' : 'Payment'} · {METHOD[p.method]}</span>
              <span className={`font-semibold ${p.kind === 'reversal' ? 'text-red-600' : ''}`}>{p.kind === 'reversal' ? '−' : ''}{formatMoney(p.amount, p.currency)}</span>
            </div>
            <p className="text-xs text-slate-500">
              {fmtDate(p.created_at)} · {p.status === 'succeeded' ? 'Completed' : p.status === 'pending' ? (p.needs_review ? 'Needs review by support' : 'Waiting for M-Pesa') : p.status === 'cancelled' ? 'Cancelled' : 'Failed'}
              {p.mpesa_receipt ? ` · ${p.mpesa_receipt}` : ''}{reversed.has(p.id) ? ' · reversed' : ''}
            </p>
            {p.note && <p className="text-xs text-slate-500">{p.note}</p>}
            <div className="flex gap-3 text-xs font-semibold">
              {rc && <button className="underline" onClick={() => downloadReceipt(rc)}>Receipt {rc.receipt_no}</button>}
              {onReverse && p.kind === 'payment' && p.status === 'succeeded' && !reversed.has(p.id) && <button className="text-red-600 underline" onClick={() => onReverse(p)}>Reverse</button>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Messages, disputes and extension requests for one debt. */
export function Thread({ debtId, role, locked, refreshKey, onChanged }: { debtId: string; role: 'customer' | 'business'; locked: boolean; refreshKey?: number; onChanged?: () => void }) {
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ext, setExt] = useState('')
  const { data, loading, reload } = useLoad(async () => {
    const [m, d] = await Promise.all([
      supabase.from('debt_messages').select('id,sender_role,kind,body,requested_due_date,status,created_at').eq('debt_id', debtId).order('created_at'),
      supabase.from('disputes').select('id,reason,details,status,resolution,resolution_note,created_at').eq('debt_id', debtId).order('created_at'),
    ])
    return { messages: (m.data ?? []) as DebtMessage[], disputes: (d.data ?? []) as Dispute[] }
  }, [debtId, refreshKey])

  const { refresh: refreshUnread } = useUnread()
  const seen = (data?.messages.length ?? 0) + (data?.disputes.length ?? 0)
  useEffect(() => {
    if (!data) return
    supabase.rpc('mark_debt_read', { p_debt: debtId }).then(() => refreshUnread())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debtId, seen])

  async function send(e: FormEvent) {
    e.preventDefault()
    setErr('')
    if (!body.trim()) return
    setBusy(true)
    const r = await call('post_message', { p_debt: debtId, p_body: body })
    setBusy(false)
    if (r.error) return setErr(r.error)
    setBody('')
    reload(); onChanged?.()
  }
  async function requestExt() {
    setErr('')
    if (!ext) return setErr('Pick the new date you can pay by.')
    setBusy(true)
    const r = await call('request_extension', { p_debt: debtId, p_new_due: ext, p_body: body })
    setBusy(false)
    if (r.error) return setErr(r.error)
    setBody(''); setExt('')
    reload(); onChanged?.()
  }
  async function decide(id: string, approve: boolean) {
    const r = await call('decide_extension', { p_message: id, p_approve: approve })
    if (r.error) return setErr(r.error)
    reload(); onChanged?.()
  }

  if (loading && !data) return <Spinner />
  const items = [
    ...(data?.messages ?? []).map((m) => ({ t: m.created_at, m, d: null as Dispute | null })),
    ...(data?.disputes ?? []).map((d) => ({ t: d.created_at, m: null as DebtMessage | null, d })),
  ].sort((a, b) => a.t.localeCompare(b.t))

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}
      <ul className="space-y-2">
        {items.map(({ t, m, d }) => d ? (
          <li key={d.id} className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm dark:border-orange-500/30 dark:bg-orange-950/30">
            <p className="font-semibold">Dispute · {d.reason.replace(/_/g, ' ')} <span className="font-normal text-slate-500">({d.status})</span></p>
            <p>{d.details}</p>
            {d.status === 'resolved' && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Resolved: {d.resolution?.replace(/_/g, ' ')}{d.resolution_note ? ` — ${d.resolution_note}` : ''}</p>}
            <p className="text-xs text-slate-500">{fmtDate(t)}</p>
          </li>
        ) : m && (
          <li key={m.id} className={`rounded-xl p-3 text-sm ${m.sender_role === role ? 'ml-6 bg-brand-500/10' : m.sender_role === 'system' ? 'bg-slate-100 dark:bg-white/5' : 'mr-6 bg-slate-100 dark:bg-white/5'}`}>
            <p className="text-xs font-semibold text-slate-500">{m.sender_role === role ? 'You' : m.sender_role === 'business' ? 'Business' : m.sender_role === 'customer' ? 'Customer' : 'System'}{m.kind === 'extension_request' ? ' · asks for more time' : ''}</p>
            <p>{m.body}</p>
            {m.kind === 'extension_request' && (
              <p className="mt-1 text-xs">New due date: <b>{fmtDate(m.requested_due_date)}</b> · {m.status}</p>
            )}
            {role === 'business' && m.kind === 'extension_request' && m.status === 'pending' && (
              <div className="mt-2 flex gap-2">
                <button className="btn-primary !min-h-0 px-3 py-1 text-xs" onClick={() => decide(m.id, true)}>Approve</button>
                <button className="btn-secondary !min-h-0 px-3 py-1 text-xs" onClick={() => decide(m.id, false)}>Decline</button>
              </div>
            )}
            <p className="text-xs text-slate-500">{fmtDate(t)}</p>
          </li>
        ))}
      </ul>
      {!locked && (
        <form onSubmit={send} className="space-y-2">
          <textarea className="input min-h-[70px] py-2" maxLength={1000} placeholder="Write a message…" aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} />
          {role === 'customer' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label htmlFor="ext" className="w-full">Ask for more time until</label>
              <input id="ext" type="date" className="input !min-h-[36px] min-w-0 flex-1 py-1" value={ext} onChange={(e) => setExt(e.target.value)} />
              <button type="button" className="btn-secondary !min-h-0 shrink-0 px-3 py-1.5" disabled={busy} onClick={requestExt}>Request</button>
            </div>
          )}
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn-primary w-full" disabled={busy || !body.trim()}>Send message</button>
        </form>
      )}
    </div>
  )
}

export async function openInvoice(path: string, bucket = 'business-docs'): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
  if (error || !data) return null
  return data.signedUrl
}

export function InvoiceLink({ path }: { path: string }) {
  const [err, setErr] = useState('')
  return (
    <span>
      <button className="font-semibold text-brand-700 underline dark:text-brand-400" onClick={async () => {
        const u = await openInvoice(path)
        if (!u) return setErr('Could not open the file')
        window.open(u, '_blank', 'noopener')
      }}>View invoice</button>
      {err && <span className="err ml-2">{err}</span>}
    </span>
  )
}

/** Small card for the customer home screen: shows only when the customer has bills from businesses. */
export function BillsCard() {
  const { data } = useLoad(async () => {
    const { data } = await supabase.from('business_debt_balances').select('status,outstanding,currency')
    return (data ?? []) as { status: BizStatus; outstanding: number; currency: string }[]
  }, [])
  const live = (data ?? []).filter((d) => d.status !== 'cancelled' && d.status !== 'paid')
  if (!live.length) return null
  const review = live.filter((d) => d.status === 'awaiting_review').length
  const overdue = live.filter((d) => d.status === 'overdue').length
  return (
    <Link to="/bills" className="card block border-l-4 border-l-brand-500">
      <p className="font-bold">Bills from businesses</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">{live.length} open{review ? ` · ${review} need your review` : ''}{overdue ? ` · ${overdue} overdue` : ''}</p>
    </Link>
  )
}
