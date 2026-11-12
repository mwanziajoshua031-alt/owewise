import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAccount } from '../../lib/account'
import { call, claimLink } from '../../lib/biz'
import { formatMoney, parseAmountInput, todayNairobi } from '../../lib/money'
import { BranchSelect, useBranches } from '../../components/branches'
import { Banner, Field, fmtDate, PageHeader } from '../../components/ui'

const CURRENCIES = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS']
const OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export default function NewRequest() {
  const { business, role } = useAccount()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const quick = params.get('mode') === 'quick'
  const [step, setStep] = useState<'form' | 'review' | 'sent'>('form')
  const [f, setF] = useState({ name: '', phone: '', email: '', amount: '', currency: 'KES', description: '', incurred: todayNairobi(), due: '' })
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ token: string | null; linked: boolean; debtId: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [branch, setBranch] = useState('')
  const { data: branches } = useBranches()
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  const amt = parseAmountInput(f.amount || '0', f.currency)

  function review(e: FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.name.trim()) return setErr('Enter the customer name')
    if (!/^(\+?254|0)?[17][0-9]{8}$/.test(f.phone.replace(/[\s-]/g, ''))) return setErr('Enter a valid Kenyan phone number, e.g. 0712 345 678')
    if (!amt.ok) return setErr(amt.error)
    if (f.description.trim().length < 2) return setErr('Describe what this debt is for')
    if (!f.due) return setErr('Choose a due date')
    if (f.due < f.incurred) return setErr('The due date cannot be before the date the debt was incurred')
    if (quick) return void saveQuick()
    if (file && (!OK_TYPES.includes(file.type) || file.size > 5 * 1024 * 1024)) return setErr('Invoice must be a PDF or image under 5 MB')
    setStep('review')
  }

  async function saveQuick() {
    if (!amt.ok) return
    setBusy(true)
    const r = await call<string>('create_quick_debt', { p_name: f.name, p_phone: f.phone, p_amount: amt.value, p_currency: f.currency, p_description: f.description, p_incurred: f.incurred, p_due: f.due })
    setBusy(false)
    if (r.error || !r.data) return setErr(r.error ?? 'Could not save')
    if (branch) await call('set_debt_branch', { p_debt: r.data, p_branch: branch })
    nav(`/debts/${r.data}`)
  }

  async function send() {
    if (!business || !amt.ok) return
    setBusy(true); setErr('')
    let path: string | null = null
    if (file) {
      const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]
      path = `${business.id}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from('business-docs').upload(path, file, { contentType: file.type })
      if (up.error) { setBusy(false); setStep('form'); return setErr('Could not upload the invoice. Try again or send without it.') }
    }
    const r = await call<{ debt_id: string; claim_token: string | null; linked: boolean }>('create_debt_request', {
      p_name: f.name, p_phone: f.phone, p_email: f.email || null, p_amount: amt.value, p_currency: f.currency,
      p_description: f.description, p_incurred: f.incurred, p_due: f.due, p_invoice_path: path,
    })
    setBusy(false)
    if (r.error || !r.data) {
      if (path) await supabase.storage.from('business-docs').remove([path])
      setStep('form')
      return setErr(r.error ?? 'Could not send')
    }
    if (branch) await call('set_debt_branch', { p_debt: r.data.debt_id, p_branch: branch })
    setResult({ token: r.data.claim_token, linked: r.data.linked, debtId: r.data.debt_id })
    setStep('sent')
  }

  if (step === 'sent' && result) {
    const link = result.token ? claimLink(result.token) : ''
    const digits = f.phone.replace(/\D/g, '').replace(/^0/, '254')
    const msg = `Hello ${f.name}, ${business?.name} has sent you a debt request of ${amt.ok ? formatMoney(amt.value, f.currency) : ''} on OweWise. Review and confirm it here: ${link}`
    return (
      <>
        <PageHeader title="Request sent" />
        <div className="card space-y-3">
          {result.linked ? (
            <p className="text-sm">This customer already uses OweWise with you. They have been notified and can review it in their app.</p>
          ) : (
            <>
              <p className="text-sm">Send this private link to <b>{f.name}</b>. It works once, expires in 30 days, and lets them create an account (or sign in) and review the request.</p>
              <input readOnly className="input" aria-label="Claim link" value={link} onFocus={(e) => e.currentTarget.select()} />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true) } catch { setErr('Copy failed. Select the link and copy it.') } }}>{copied ? 'Copied' : 'Copy link'}</button>
                <a className="btn-primary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`}>WhatsApp</a>
              </div>
              <p className="text-xs text-slate-500">Anyone with this link can claim the request, so send it only to the customer. You can generate a new link later from the debt page.</p>
            </>
          )}
          {err && <p className="err">{err}</p>}
          <button className="btn-secondary w-full" onClick={() => nav(`/debts/${result.debtId}`)}>Open debt</button>
        </div>
      </>
    )
  }

  if (step === 'review' && amt.ok) {
    return (
      <>
        <PageHeader title="Review before sending" />
        <div className="card space-y-2 text-sm">
          <Row k="Customer" v={`${f.name} · ${f.phone}`} />
          <Row k="Amount" v={formatMoney(amt.value, f.currency)} />
          <Row k="For" v={f.description} />
          <Row k="Incurred" v={fmtDate(f.incurred)} />
          <Row k="Due" v={fmtDate(f.due)} />
          {file && <Row k="Invoice" v={file.name} />}
        </div>
        <Banner>The customer must confirm this before they can pay, and they can dispute it. Check the details are right.</Banner>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setStep('form')}>Edit</button>
          <button className="btn-primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title={quick ? 'Quick record' : 'Send debt request'} />
      <div role="tablist" aria-label="Mode" className="grid grid-cols-2 gap-2">
        {([[false, 'Debt request'], [true, 'Quick record']] as const).map(([q, l]) => (
          <button key={l} role="tab" aria-selected={quick === q} onClick={() => setParams(q ? { mode: 'quick' } : {})} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${quick === q ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-slate-300 text-slate-600'}`}>{l}</button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{quick ? 'Your own record, saved straight away at the counter. The customer is not asked to confirm. You can invite them to OweWise later so they can see it and pay by M-Pesa.' : 'The customer reviews and confirms the debt before they can pay. Best for amounts you want agreed in writing.'}</p>
      <form onSubmit={review} noValidate className="card space-y-3">
        <Field label="Customer name"><input className="input" maxLength={120} value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Customer phone"><input className="input" inputMode="tel" placeholder="0712 345 678" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        {!quick && <Field label="Customer email (optional)"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><Field label="Amount"><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field></div>
          <Field label="Currency"><select className="input" value={f.currency} onChange={(e) => set('currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <Field label="What is it for?"><textarea className="input min-h-[70px] py-2" maxLength={500} placeholder="e.g. 50kg maize flour on credit" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date incurred"><input className="input" type="date" value={f.incurred} onChange={(e) => set('incurred', e.target.value)} /></Field>
          <Field label="Due date"><input className="input" type="date" value={f.due} onChange={(e) => set('due', e.target.value)} /></Field>
        </div>
        <BranchSelect branches={branches ?? []} value={branch} onChange={setBranch} blankLabel={role === 'staff' ? 'My default branch' : 'No branch'} />
        {!quick && role !== 'staff' && <Field label="Invoice or proof (optional, PDF or image, max 5 MB)"><input className="input py-2" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>}
        {f.currency !== 'KES' && <p className="text-xs text-slate-500">M-Pesa payments work for KES only. Other currencies can be settled and recorded manually.</p>}
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{quick ? (busy ? 'Saving…' : 'Save record') : 'Review request'}</button>
        <Link to="/debts" className="block text-center text-sm text-slate-500 underline">Cancel</Link>
      </form>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-slate-500">{k}</span><span className="text-right font-medium">{v}</span></div>
}
