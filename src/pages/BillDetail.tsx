import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { call, DEBT_COLS, friendly, useLoad, type BizDebt } from '../lib/biz'
import { useAccount } from '../lib/account'
import { formatMoney } from '../lib/money'
import { BizBadge, InvoiceLink, PaymentsList, Thread } from '../components/biz'
import { Banner, ErrorBox, Field, fmtDate, Modal, Spinner } from '../components/ui'

const REASONS = [['incorrect_amount', 'The amount is wrong'], ['unrecognized_debt', 'I do not recognise this debt'], ['payment_not_recognized', 'I already paid this'], ['duplicate', 'This is a duplicate'], ['other', 'Something else']] as const

export default function BillDetail() {
  const { id } = useParams()
  const [k, setK] = useState(0)
  const [modal, setModal] = useState<null | 'dispute' | 'report'>(null)
  const [err, setErr] = useState('')
  const { data, loading, error, reload } = useLoad(async () => {
    const d = await supabase.from('business_debt_balances').select(DEBT_COLS).eq('id', id!).maybeSingle()
    if (d.error) throw new Error(d.error.message)
    const debt = d.data as unknown as BizDebt | null
    let business = ''
    if (debt) { const b = await supabase.from('businesses').select('name').eq('id', debt.business_id).maybeSingle(); business = b.data?.name ?? 'Business' }
    return { debt, business }
  }, [id, k])
  const refresh = () => { setModal(null); setK((n) => n + 1); reload() }

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  const d = data?.debt
  if (!d) return <ErrorBox message="Bill not found" />
  const closed = d.status === 'cancelled'
  const canPay = !closed && d.customer_confirmed_at && d.status !== 'disputed' && d.outstanding > 0

  return (
    <>
      <Link to="/bills" className="text-sm font-semibold text-brand-700 underline dark:text-brand-400">← Bills</Link>
      <div className="card space-y-2">
        <div className="flex items-start justify-between gap-2"><div><p className="text-lg font-bold">{data?.business}</p><p className="text-sm">{d.description}</p></div><BizBadge status={d.status} as="customer" /></div>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><dt className="text-xs text-slate-500">Amount</dt><dd className="font-bold">{formatMoney(d.amount, d.currency)}</dd></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><dt className="text-xs text-slate-500">Paid</dt><dd className="font-bold text-brand-700 dark:text-brand-400">{formatMoney(d.paid_total, d.currency)}</dd></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><dt className="text-xs text-slate-500">Still owed</dt><dd className="font-bold">{formatMoney(d.outstanding, d.currency)}</dd></div>
        </dl>
        <p className="text-xs text-slate-500">Incurred {fmtDate(d.incurred_on)} · Due {fmtDate(d.due_date)}</p>
        {d.invoice_path && <InvoiceLink path={d.invoice_path} />}
        {closed && <Banner tone="warn">This request was cancelled by the business{d.cancel_reason ? `: ${d.cancel_reason}` : ''}.</Banner>}
      </div>

      {!closed && !d.customer_confirmed_at && d.status !== 'disputed' && (
        <div className="card space-y-2 border-amber-300">
          <p className="font-bold">Please review this request</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">Check the amount and what it is for. If it is right, confirm it so you can pay. If not, dispute it and tell the business why.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={async () => { setErr(''); const r = await call('confirm_debt', { p_debt: d.id }); if (r.error) return setErr(r.error); refresh() }}>Confirm debt</button>
            <button className="btn-secondary" onClick={() => setModal('dispute')}>Dispute</button>
          </div>
        </div>
      )}
      {d.status === 'disputed' && <Banner tone="warn">You disputed this debt. Payments are paused until the business responds.</Banner>}
      {err && <p className="err" role="alert">{err}</p>}

      {canPay && <PaySection d={d} onChanged={refresh} />}
      {!closed && d.customer_confirmed_at && d.status !== 'disputed' && d.outstanding > 0 && d.pending_total === 0 && (
        <button className="text-sm text-slate-500 underline" onClick={() => setModal('dispute')}>Something wrong? Dispute this debt</button>
      )}

      <section className="card"><h2 className="mb-2 font-bold">Payments & receipts</h2><PaymentsList debtId={d.id} refreshKey={k} /></section>
      <section className="card"><h2 className="mb-2 font-bold">Messages</h2><Thread debtId={d.id} role="customer" locked={closed} refreshKey={k} onChanged={() => setK((n) => n + 1)} /></section>
      <button className="text-xs text-slate-500 underline" onClick={() => setModal('report')}>Report this business</button>

      {modal === 'dispute' && <DisputeModal debtId={d.id} onClose={() => setModal(null)} onDone={refresh} />}
      {modal === 'report' && <ReportModal businessId={d.business_id} onClose={() => setModal(null)} />}
    </>
  )
}

function PaySection({ d, onChanged }: { d: BizDebt; onChanged: () => void }) {
  const { phone } = useAccount()
  const [amount, setAmount] = useState(String(Math.floor(d.outstanding)))
  const [msisdn, setMsisdn] = useState(phone ?? d.customer_phone ?? '')
  const [state, setState] = useState<'idle' | 'sending' | 'waiting' | 'done'>('idle')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current) }, [])

  const waiting = d.pending_total > 0 || state === 'waiting'
  if (d.currency !== 'KES') return <Banner>M-Pesa payments work for KES debts only. Pay the business directly and ask them to record it.</Banner>

  function poll(paymentId: string) {
    let tries = 0
    timer.current = window.setInterval(async () => {
      tries++
      const { data } = await supabase.from('business_payments').select('status,result_desc,needs_review').eq('id', paymentId).maybeSingle()
      if (data && data.status !== 'pending') {
        if (timer.current) window.clearInterval(timer.current)
        setState('done')
        setMsg(data.status === 'succeeded' ? { ok: true, t: 'Payment received. Your receipt is below.' } : { ok: false, t: data.status === 'cancelled' ? 'The payment was cancelled.' : `The payment did not go through${data.result_desc ? `: ${data.result_desc}` : '.'}` })
        onChanged()
      } else if (data?.needs_review) {
        if (timer.current) window.clearInterval(timer.current)
        setState('done'); setMsg({ ok: false, t: 'We received a payment notice that needs checking. Do not pay again. Support will confirm shortly.' }); onChanged()
      } else if (tries > 40) {
        if (timer.current) window.clearInterval(timer.current)
        setState('done'); setMsg({ ok: false, t: 'Still waiting for M-Pesa. If money left your account it will appear here once confirmed. Do not pay twice.' }); onChanged()
      }
    }, 3000)
  }

  async function pay() {
    setMsg(null)
    const n = Number(amount)
    if (!Number.isInteger(n) || n < 1) return setMsg({ ok: false, t: 'Enter a whole-shilling amount.' })
    if (n > d.outstanding - d.pending_total) return setMsg({ ok: false, t: 'That is more than you still owe.' })
    if (!/^(\+?254|0)?[17][0-9]{8}$/.test(msisdn.replace(/[\s-]/g, ''))) return setMsg({ ok: false, t: 'Enter the M-Pesa number to charge, e.g. 0712 345 678.' })
    setState('sending')
    const { data, error } = await supabase.functions.invoke('mpesa-stk-push', { body: { debt_id: d.id, amount: n, phone: msisdn } })
    if (error) {
      setState('idle')
      let body = ''
      try { body = JSON.stringify(await (error as { context?: Response }).context?.json()) } catch { /* ignore */ }
      if (/not.?found|404|Failed to send/i.test(`${error.message} ${body}`) && !body.includes('"error"')) return setMsg({ ok: false, t: 'M-Pesa payments are not switched on yet. Please pay the business directly and ask them to record it.' })
      return setMsg({ ok: false, t: friendly(body || error.message) })
    }
    const pid = (data as { payment_id?: string } | null)?.payment_id
    if (!pid) { setState('idle'); return setMsg({ ok: false, t: 'The payment request could not be started. Please try again.' }) }
    setState('waiting')
    setMsg({ ok: true, t: 'Check your phone and enter your M-Pesa PIN to approve the payment.' })
    poll(pid)
  }

  return (
    <div className="card space-y-3">
      <p className="font-bold">Pay with M-Pesa</p>
      {waiting && state !== 'done' ? (
        <Banner>Waiting for you to approve on your phone. This page updates by itself. Do not pay again.</Banner>
      ) : (
        <>
          <Field label="Amount (KES)"><input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="M-Pesa number"><input className="input" inputMode="tel" value={msisdn} onChange={(e) => setMsisdn(e.target.value)} /></Field>
          <button className="btn-primary w-full" disabled={state === 'sending'} onClick={pay}>{state === 'sending' ? 'Sending request…' : `Pay KES ${Number(amount || 0).toLocaleString('en-KE')}`}</button>
          <p className="text-xs text-slate-500">You will get a prompt on your phone. The money goes straight to the business. OweWise never sees your PIN.</p>
        </>
      )}
      {msg && <p className={msg.ok ? 'text-sm text-green-700 dark:text-green-400' : 'err'} role="status">{msg.t}</p>}
    </div>
  )
}

function DisputeModal({ debtId, onClose, onDone }: { debtId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('incorrect_amount')
  const [details, setDetails] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Dispute this debt" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        if (details.trim().length < 3) return setErr('Tell the business what is wrong')
        setBusy(true)
        const r = await call('raise_dispute', { p_debt: debtId, p_reason: reason, p_details: details })
        setBusy(false)
        if (r.error) return setErr(r.error)
        onDone()
      }}>
        <Field label="Reason"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Details"><textarea className="input min-h-[90px] py-2" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">Payments pause until the business replies.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>Send dispute</button>
      </form>
    </Modal>
  )
}

function ReportModal({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <Modal title="Report this business" onClose={onClose}>
      {sent ? <p className="text-sm">Thank you. Our team will review your report.</p> : (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          if (reason.trim().length < 3) return setErr('Tell us what happened')
          const r = await call('report_account', { p_business: businessId, p_reason: reason })
          if (r.error) return setErr(r.error)
          setSent(true)
        }}>
          <Field label="What is the problem?"><textarea className="input min-h-[90px] py-2" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn-danger w-full">Send report</button>
        </form>
      )}
    </Modal>
  )
}
