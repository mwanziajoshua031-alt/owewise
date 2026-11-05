import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bell, Flag, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useUI } from '../components/Layout'
import { dueLabel, reversedIds } from '../lib/derive'
import { formatMoney, parseAmountInput } from '../lib/money'
import { DISPUTE_REASONS, METHOD_LABEL, type DebtBalance, type DocumentRow, type Payment } from '../lib/types'
import { Upload } from './Documents'
import { Banner, Empty, Field, Modal, PendingTag, Spinner, StatusBadge, fmtDate } from '../components/ui'

export default function DebtDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { loading, debts, creditors, payments, reminders, refresh, reversePayment } = useStore()
  const { addPayment } = useUI()
  const [modal, setModal] = useState<null | 'edit' | 'dispute' | 'reminder'>(null)
  const [reverse, setReverse] = useState<Payment | null>(null)
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [docTotal, setDocTotal] = useState(0)
  const [addingDoc, setAddingDoc] = useState(false)
  const loadDocs = useCallback(async () => {
    if (!id) return
    const [list, all] = await Promise.all([
      supabase.from('documents').select('*').eq('debt_id', id).order('created_at', { ascending: false }),
      supabase.from('documents').select('id', { count: 'exact', head: true }),
    ])
    setDocs((list.data ?? []) as DocumentRow[])
    setDocTotal(all.count ?? 0)
  }, [id])
  useEffect(() => { void loadDocs() }, [loadDocs])
  async function openDoc(d: DocumentRow) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 60)
    if (error || !data) return setErr(error?.message ?? 'Could not open file')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  const [err, setErr] = useState('')

  if (loading) return <Spinner />
  const debt = debts.find((d) => d.id === id)
  if (!debt)
    return (
      <Empty title="Debt not found" hint="It may have been deleted or belongs to another account." action={<Link className="btn-secondary" to="/debts">Back to debts</Link>} />
    )

  const creditor = creditors.find((c) => c.id === debt.creditor_id)
  const mine = payments.filter((p) => p.debt_id === debt.id)
  const reversed = reversedIds(payments)
  const myReminders = reminders.filter((r) => r.debt_id === debt.id)
  const pct = debt.total_due > 0 ? Math.min(100, Math.round((debt.paid_total / debt.total_due) * 100)) : 0

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setErr('')
    const { error } = await p
    if (error) return setErr(error.message)
    await refresh()
  }

  return (
    <>
      <button className="flex items-center gap-1 text-sm text-slate-500" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4" /> Back</button>

      <section className="card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{debt.description}</h1>
            <p className="text-sm text-slate-500">{creditor?.name} · {dueLabel(debt.due_date)}</p>
          </div>
          <div className="flex flex-col items-end gap-1"><StatusBadge status={debt.status} />{debt.pending && <PendingTag />}</div>
        </div>
        <div>
          <p className="text-xs text-slate-500">Still owed</p>
          <p className="text-3xl font-extrabold">{formatMoney(debt.outstanding, debt.currency)}</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Paid">
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Original</dt><dd className="text-right font-medium">{formatMoney(debt.original_amount, debt.currency)}</dd>
          <dt className="text-slate-500">Extra charges</dt><dd className="text-right font-medium">{formatMoney(debt.additional_charges, debt.currency)}</dd>
          <dt className="text-slate-500">Total due</dt><dd className="text-right font-medium">{formatMoney(debt.total_due, debt.currency)}</dd>
          <dt className="text-slate-500">Paid so far</dt><dd className="text-right font-medium text-brand-700 dark:text-brand-400">{formatMoney(debt.paid_total, debt.currency)}</dd>
          <dt className="text-slate-500">Incurred</dt><dd className="text-right">{fmtDate(debt.incurred_on)}</dd>
          <dt className="text-slate-500">Due</dt><dd className="text-right">{fmtDate(debt.due_date)}</dd>
        </dl>
        {debt.charges_note && <p className="text-xs text-slate-500">Charges: {debt.charges_note}</p>}
        {debt.notes && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm dark:bg-white/5">{debt.notes}</p>}
        {debt.is_disputed && (
          <Banner tone="warn">
            <p className="font-semibold">Disputed: {debt.dispute_reason ? DISPUTE_REASONS[debt.dispute_reason] : 'reason not set'}</p>
            {debt.dispute_notes && <p className="mt-1 whitespace-pre-wrap">{debt.dispute_notes}</p>}
          </Banner>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" disabled={debt.outstanding <= 0} onClick={() => addPayment(debt.id)}>Record payment</button>
          <button className="btn-secondary" onClick={() => setModal('edit')} disabled={debt.pending}>Edit</button>
          {debt.is_disputed ? (
            <button className="btn-secondary" onClick={() => run(supabase.from('debts').update({ is_disputed: false, dispute_reason: null, dispute_notes: null }).eq('id', debt.id))}>Resolve dispute</button>
          ) : (
            <button className="btn-secondary" onClick={() => setModal('dispute')} disabled={debt.pending}><Flag className="h-4 w-4" /> Dispute</button>
          )}
          <button className="btn-secondary" onClick={() => setModal('reminder')} disabled={debt.pending}><Bell className="h-4 w-4" /> Reminder</button>
        </div>
        <button className="w-full text-center text-xs text-slate-500 underline" onClick={() => run(supabase.from('debts').update({ archived_at: debt.archived_at ? null : new Date().toISOString() }).eq('id', debt.id))}>
          {debt.archived_at ? 'Restore from archive' : 'Archive this debt'}
        </button>
        {err && <p className="err" role="alert">{err}</p>}
      </section>

      {myReminders.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold">Reminders</h2>
          <ul className="space-y-2">
            {myReminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span>{fmtDate(r.remind_on)} · {r.frequency} · {r.channels.join(', ')}</span>
                <span className="flex items-center gap-3">
                  <button className="text-xs font-semibold underline" onClick={() => run(supabase.from('reminders').update({ active: !r.active }).eq('id', r.id))}>{r.active ? 'Pause' : 'Resume'}</button>
                  <button aria-label="Delete reminder" onClick={() => run(supabase.from('reminders').delete().eq('id', r.id))}><Trash2 className="h-4 w-4 text-slate-400" /></button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Receipts &amp; documents</h2>
          <button className="text-sm font-semibold text-brand-700 underline dark:text-brand-400" disabled={debt.pending} onClick={() => setAddingDoc(true)}>Add</button>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-slate-500">No files attached to this debt.</p>
        ) : (
          <ul className="space-y-1">
            {docs.map((d) => (
              <li key={d.id}>
                <button className="w-full truncate text-left text-sm underline" onClick={() => openDoc(d)}>{d.title}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2 font-bold">Payment history</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/10">
            {mine.map((p) => (
              <PaymentRow key={p.id} p={p} reversed={reversed.has(p.id)} onReverse={() => setReverse(p)} />
            ))}
          </ul>
        )}
      </section>

      {modal === 'edit' && <EditDebt debt={debt} onClose={() => setModal(null)} onDone={refresh} />}
      {modal === 'dispute' && <DisputeModal debtId={debt.id} onClose={() => setModal(null)} onDone={refresh} />}
      {modal === 'reminder' && <ReminderModal debt={debt} onClose={() => setModal(null)} onDone={refresh} />}
      {addingDoc && <Upload debtId={debt.id} count={docTotal} onClose={() => setAddingDoc(false)} onDone={loadDocs} />}
      {reverse && <ReverseModal p={reverse} onClose={() => setReverse(null)} onSubmit={reversePayment} />}
    </>
  )
}

export function PaymentRow({ p, reversed, onReverse }: { p: Payment; reversed: boolean; onReverse: () => void }) {
  const rev = p.kind === 'reversal'
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${rev ? 'text-red-600 dark:text-red-400' : ''} ${reversed ? 'line-through opacity-60' : ''}`}>
          {rev ? '−' : ''}{formatMoney(p.amount, p.currency)} {rev && <span className="text-xs font-normal">(reversal)</span>} {p.pending && <PendingTag />}
        </p>
        <p className="text-xs text-slate-500">{fmtDate(p.paid_on)} · {METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ''}</p>
        {p.note && <p className="text-xs text-slate-500">{p.note}</p>}
      </div>
      {!rev && !reversed && !p.pending && <button className="shrink-0 text-xs font-semibold text-red-600 underline dark:text-red-400" onClick={onReverse}>Reverse</button>}
      {reversed && <span className="text-xs text-slate-500">Reversed</span>}
    </li>
  )
}

function ReverseModal({ p, onClose, onSubmit }: { p: Payment; onClose: () => void; onSubmit: (p: Payment, reason: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function go(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return setErr('A reason is required')
    setBusy(true)
    const r = await onSubmit(p, reason)
    setBusy(false)
    if (!r.ok) return setErr(r.error ?? 'Could not reverse')
    onClose()
  }
  return (
    <Modal title="Reverse payment" onClose={onClose}>
      <form onSubmit={go} className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This adds a reversal of {formatMoney(p.amount, p.currency)} to your history. The original payment stays on record and is never changed.
        </p>
        <Field label="Why are you reversing it?" error={err}>
          <textarea className="input min-h-[80px] py-2" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <button className="btn-danger w-full" disabled={busy}>{busy ? 'Saving…' : 'Add reversal'}</button>
      </form>
    </Modal>
  )
}

function EditDebt({ debt, onClose, onDone }: { debt: DebtBalance; onClose: () => void; onDone: () => Promise<void> }) {
  const [description, setDescription] = useState(debt.description)
  const [charges, setCharges] = useState(String(debt.additional_charges))
  const [chargesNote, setChargesNote] = useState(debt.charges_note ?? '')
  const [due, setDue] = useState(debt.due_date ?? '')
  const [notes, setNotes] = useState(debt.notes ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!description.trim()) return setErr('Describe the debt')
    const c = parseAmountInput(charges || '0', debt.currency, { allowZero: true })
    if (!c.ok) return setErr(c.error)
    if (due && due < debt.incurred_on) return setErr('Due date is before the date it was incurred')
    setBusy(true)
    const { error } = await supabase.from('debts').update({
      description: description.trim(), additional_charges: c.value, charges_note: chargesNote.trim() || null, due_date: due || null, notes: notes.trim() || null,
    }).eq('id', debt.id)
    setBusy(false)
    if (error) return setErr(error.message)
    await onDone()
    onClose()
  }
  return (
    <Modal title="Edit debt" onClose={onClose}>
      <form onSubmit={save} className="space-y-3" noValidate>
        <Field label="Description"><input className="input" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Extra charges (${debt.currency})`}><input className="input" inputMode="decimal" value={charges} onChange={(e) => setCharges(e.target.value)} /></Field>
          <Field label="Charges note"><input className="input" maxLength={300} value={chargesNote} onChange={(e) => setChargesNote(e.target.value)} /></Field>
        </div>
        <Field label="Due date"><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Notes"><textarea className="input min-h-[70px] py-2" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">The original amount and currency are fixed so your payment history stays accurate.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </form>
    </Modal>
  )
}

function DisputeModal({ debtId, onClose, onDone }: { debtId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState('incorrect_amount')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('debts').update({ is_disputed: true, dispute_reason: reason, dispute_notes: notes.trim() || null }).eq('id', debtId)
    setBusy(false)
    if (error) return setErr(error.message)
    await onDone()
    onClose()
  }
  return (
    <Modal title="Dispute this debt" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Reason">
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(DISPUTE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="What happened? (optional)"><textarea className="input min-h-[90px] py-2" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">This is a private note for your own records. It is not sent to the creditor.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Mark as disputed'}</button>
      </form>
    </Modal>
  )
}

function ReminderModal({ debt, onClose, onDone }: { debt: DebtBalance; onClose: () => void; onDone: () => Promise<void> }) {
  const [on, setOn] = useState(debt.due_date ?? '')
  const [freq, setFreq] = useState('once')
  const [email, setEmail] = useState(false)
  const [sms, setSms] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!on) return setErr('Pick a reminder date')
    setBusy(true)
    const channels = ['in_app', ...(email ? ['email'] : []), ...(sms ? ['sms'] : [])]
    const { error } = await supabase.from('reminders').insert({ debt_id: debt.id, remind_on: on, frequency: freq, channels })
    setBusy(false)
    if (error) return setErr(error.message)
    await onDone()
    onClose()
  }
  return (
    <Modal title="Add reminder" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Remind me on"><input className="input" type="date" value={on} onChange={(e) => setOn(e.target.value)} /></Field>
        <Field label="Repeat">
          <select className="input" value={freq} onChange={(e) => setFreq(e.target.value)}>
            <option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </Field>
        <fieldset className="space-y-2 text-sm">
          <legend className="label">Send via</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked disabled /> In-app</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> SMS</label>
        </fieldset>
        <p className="text-xs text-slate-500">In-app reminders work now. Email and SMS only send once those services are connected on the server.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save reminder'}</button>
      </form>
    </Modal>
  )
}
