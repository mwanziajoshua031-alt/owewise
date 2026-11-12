import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { call, claimLink, DEBT_COLS, reminderText, useLoad, waLink, type BizDebt, type BizPayment } from '../../lib/biz'
import { useAccount } from '../../lib/account'
import { formatMoney, parseAmountInput } from '../../lib/money'
import { BranchSelect, useBranches } from '../../components/branches'
import { BizBadge, InvoiceLink, PaymentsList, Thread } from '../../components/biz'
import { Banner, ErrorBox, Field, fmtDate, Modal, Spinner } from '../../components/ui'

export default function BizDebtDetail() {
  const { id } = useParams()
  const [k, setK] = useState(0)
  const [modal, setModal] = useState<null | 'cash' | 'cancel' | 'resolve'>(null)
  const [reverse, setReverse] = useState<BizPayment | null>(null)
  const { business, role } = useAccount()
  const isStaff = role === 'staff'
  const [link, setLink] = useState('')
  const { data: branches } = useBranches()
  const [err, setErr] = useState('')
  const { data, loading, error, reload } = useLoad(async () => {
    const d = await supabase.from('business_debt_balances').select(DEBT_COLS).eq('id', id!).maybeSingle()
    if (d.error) throw new Error(d.error.message)
    const x = await supabase.from('disputes').select('id,reason,details').eq('debt_id', id!).eq('status', 'open').maybeSingle()
    const rm = await supabase.from('debt_messages').select('created_at').eq('debt_id', id!).eq('kind', 'reminder').order('created_at', { ascending: false }).limit(1)
    return { debt: d.data as unknown as BizDebt | null, dispute: x.data as { id: string; reason: string; details: string } | null, lastReminder: (rm.data?.[0]?.created_at ?? null) as string | null }
  }, [id, k])
  const done = () => { setModal(null); setReverse(null); setK((n) => n + 1); reload() }

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  const d = data?.debt
  if (!d) return <ErrorBox message="Debt not found" />
  const locked = d.status === 'cancelled'

  return (
    <>
      <Link to="/debts" className="text-sm font-semibold text-brand-700 underline dark:text-brand-400">← Debts</Link>
      <div className="card space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div><p className="text-lg font-bold">{d.customer_name}</p><p className="text-xs text-slate-500">{d.customer_phone} · {d.claimed_at ? 'Linked' : 'Not linked yet'}</p></div>
          <BizBadge status={d.status} as="business" />
        </div>
        <p className="text-sm">{d.description}</p>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><dt className="text-xs text-slate-500">Amount</dt><dd className="font-bold">{formatMoney(d.amount, d.currency)}</dd></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><dt className="text-xs text-slate-500">Paid</dt><dd className="font-bold text-brand-700 dark:text-brand-400">{formatMoney(d.paid_total, d.currency)}</dd></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><dt className="text-xs text-slate-500">Still owed</dt><dd className="font-bold">{formatMoney(d.outstanding, d.currency)}</dd></div>
        </dl>
        <p className="text-xs text-slate-500">Incurred {fmtDate(d.incurred_on)} · Due {fmtDate(d.due_date)}{d.customer_confirmed_at ? ` · Confirmed ${fmtDate(d.customer_confirmed_at)}` : ' · Not yet confirmed by customer'}</p>
        {(branches?.length ?? 0) > 0 && <BranchSelect branches={branches ?? []} value={d.branch_id ?? ''} onChange={async (v) => { setErr(''); const r = await call('set_debt_branch', { p_debt: d.id, p_branch: v || null }); if (r.error) return setErr(r.error); reload() }} />}
        {data?.lastReminder && <p className="text-xs text-slate-500">Last reminder sent {fmtDate(data.lastReminder)}</p>}
        {d.source === 'quick' && !d.claimed_at && !isStaff && <p className="text-xs text-slate-500">Your own record. The customer has not been asked to confirm it. Use “New claim link” to invite them.</p>}
        {d.pending_total > 0 && <Banner>An M-Pesa payment of {formatMoney(d.pending_total, d.currency)} is waiting for the customer to approve on their phone.</Banner>}
        {d.invoice_path && !isStaff && <InvoiceLink path={d.invoice_path} />}
        {d.cancelled_at && <Banner tone="warn">Cancelled {fmtDate(d.cancelled_at)}{d.cancel_reason ? `: ${d.cancel_reason}` : ''}</Banner>}
      </div>

      {!isStaff && data?.dispute && (
        <div className="card space-y-2 border-orange-300">
          <p className="font-bold">Open dispute · {data.dispute.reason.replace(/_/g, ' ')}</p>
          <p className="text-sm">{data.dispute.details}</p>
          <button className="btn-primary w-full" onClick={() => setModal('resolve')}>Resolve dispute</button>
        </div>
      )}

      {!locked && (
        <div className="grid grid-cols-2 gap-2">
          {d.outstanding > 0 && <button className="btn-primary" onClick={() => setModal('cash')}>Record cash payment</button>}
          {d.outstanding > 0 && d.status !== 'disputed' && <a className="btn-secondary" target="_blank" rel="noopener noreferrer"
            href={waLink(d.customer_phone, reminderText(d, business?.name ?? 'us', formatMoney(d.outstanding, d.currency), fmtDate(d.due_date), d.status === 'overdue'))}
            onClick={() => { call('log_reminder', { p_debt: d.id, p_channel: 'whatsapp' }).then(() => setK((n) => n + 1)) }}>Remind on WhatsApp</a>}
          {!d.claimed_at && !isStaff && <button className="btn-secondary" onClick={async () => {
            setErr('')
            const r = await call<string>('regenerate_claim_link', { p_debt: d.id })
            if (r.error) return setErr(r.error)
            setLink(claimLink(r.data!))
          }}>New claim link</button>}
          {d.paid_total === 0 && d.pending_total === 0 && !isStaff && <button className="btn-secondary" onClick={() => setModal('cancel')}>Cancel request</button>}
        </div>
      )}
      {link && (
        <div className="card space-y-2"><p className="text-sm">New private link (the old one no longer works):</p>
          <input readOnly className="input" aria-label="Claim link" value={link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn-secondary w-full" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button></div>
      )}
      {err && <p className="err" role="alert">{err}</p>}

      <section className="card"><h2 className="mb-2 font-bold">Payments</h2><PaymentsList debtId={d.id} refreshKey={k} onReverse={isStaff ? undefined : setReverse} /></section>
      {!isStaff && <section className="card"><h2 className="mb-2 font-bold">Messages</h2><Thread debtId={d.id} role="business" locked={locked || !d.customer_user_id} refreshKey={k} onChanged={() => setK((n) => n + 1)} />
        {!d.customer_user_id && <p className="mt-2 text-xs text-slate-500">Messaging opens once the customer links their account.</p>}</section>}

      {modal === 'cash' && <CashModal d={d} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'cancel' && <ReasonModal title="Cancel debt request" cta="Cancel request" onClose={() => setModal(null)} run={(r) => call('cancel_debt_request', { p_debt: d.id, p_reason: r })} onDone={done} />}
      {reverse && <ReasonModal title="Reverse payment" cta="Add reversal" required onClose={() => setReverse(null)} run={(r) => call('reverse_business_payment', { p_payment: reverse.id, p_reason: r })} onDone={done}
        hint={`Adds a reversal of ${formatMoney(reverse.amount, reverse.currency)}. The original payment stays on record. This does not move money; refund the customer yourself.`} />}
      {modal === 'resolve' && data?.dispute && <ResolveModal d={d} disputeId={data.dispute.id} onClose={() => setModal(null)} onDone={done} />}
    </>
  )
}

function CashModal({ d, onClose, onDone }: { d: BizDebt; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(d.outstanding))
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Record payment received" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setErr('')
        const a = parseAmountInput(amount, d.currency)
        if (!a.ok) return setErr(a.error)
        setBusy(true)
        const r = await call('record_manual_payment', { p_debt: d.id, p_amount: a.value, p_method: method, p_note: note, p_ref: null })
        setBusy(false)
        if (r.error) return setErr(r.error)
        onDone()
      }}>
        <p className="text-sm text-slate-600 dark:text-slate-300">Use this when the customer paid you outside the app. It is a permanent record: mistakes are fixed with a reversal.</p>
        <Field label={`Amount (${d.currency})`}><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Method"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="other">Other (bank, cheque…)</option></select></Field>
        <Field label="Note (optional)"><input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
      </form>
    </Modal>
  )
}

function ReasonModal({ title, cta, required, hint, run, onClose, onDone }: { title: string; cta: string; required?: boolean; hint?: string; run: (reason: string) => Promise<{ error: string | null }>; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={title} onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        if (required && reason.trim().length < 3) return setErr('Give a short reason')
        setBusy(true)
        const r = await run(reason)
        setBusy(false)
        if (r.error) return setErr(r.error)
        onDone()
      }}>
        {hint && <p className="text-sm text-slate-600 dark:text-slate-300">{hint}</p>}
        <Field label="Reason"><textarea className="input min-h-[80px] py-2" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-danger w-full" disabled={busy}>{cta}</button>
      </form>
    </Modal>
  )
}

function ResolveModal({ d, disputeId, onClose, onDone }: { d: BizDebt; disputeId: string; onClose: () => void; onDone: () => void }) {
  const [res, setRes] = useState('upheld')
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState(String(d.amount))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Resolve dispute" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setErr('')
        let amt: number | null = null
        if (res === 'amount_adjusted') { const a = parseAmountInput(amount, d.currency); if (!a.ok) return setErr(a.error); amt = a.value }
        setBusy(true)
        const r = await call('resolve_dispute', { p_dispute: disputeId, p_resolution: res, p_note: note, p_new_amount: amt })
        setBusy(false)
        if (r.error) return setErr(r.error)
        onDone()
      }}>
        {([['upheld', 'Keep the debt as it is', 'The customer will be told the debt stands.'], ['amount_adjusted', 'Change the amount', 'The customer must confirm the new amount.'], ['cancelled', 'Cancel the debt', 'Only possible if no payments were made.']] as const).map(([v, l, h]) => (
          <label key={v} className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${res === v ? 'border-brand-500 bg-brand-500/5' : 'border-slate-200 dark:border-white/10'}`}>
            <input type="radio" name="res" checked={res === v} onChange={() => setRes(v)} className="mt-1" /><span><b>{l}</b><br /><span className="text-slate-500">{h}</span></span>
          </label>
        ))}
        {res === 'amount_adjusted' && <Field label={`New amount (${d.currency})`}><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
        <Field label="Message to the customer"><textarea className="input min-h-[70px] py-2" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>Resolve</button>
      </form>
    </Modal>
  )
}
