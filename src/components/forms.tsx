import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { formatMoney, parseAmountInput, todayNairobi } from '../lib/money'
import { FREE_LIMITS, METHOD_LABEL, type Payment } from '../lib/types'
import { Banner, Field, Modal } from './ui'

const CURRENCIES = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS']

export function AddDebtModal({ onClose, creditorId }: { onClose: () => void; creditorId?: string }) {
  const { creditors, debts, profile, isPremium, addCreditor, addDebt } = useStore()
  const active = creditors.filter((c) => !c.archived_at)
  const [cid, setCid] = useState(creditorId ?? active[0]?.id ?? '__new')
  const [newName, setNewName] = useState('')
  const [category, setCategory] = useState('')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState(profile?.default_currency ?? 'KES')
  const [amount, setAmount] = useState('')
  const [charges, setCharges] = useState('')
  const [chargesNote, setChargesNote] = useState('')
  const [incurred, setIncurred] = useState(todayNairobi())
  const [due, setDue] = useState('')
  const [notes, setNotes] = useState('')
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [serverErr, setServerErr] = useState<{ msg: string; limit?: boolean } | null>(null)

  const activeCount = debts.filter((d) => !d.archived_at && d.status !== 'paid').length
  const atLimit = !isPremium && activeCount >= FREE_LIMITS.debts

  async function submit(e: FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (cid === '__new' && !newName.trim()) er.creditor = 'Enter who you owe'
    if (!description.trim()) er.description = 'Describe the debt'
    const a = parseAmountInput(amount, currency)
    if (!a.ok) er.amount = a.error
    const c = charges ? parseAmountInput(charges, currency, { allowZero: true }) : ({ ok: true, value: 0 } as const)
    if (!c.ok) er.charges = c.error
    if (due && due < incurred) er.due = 'Due date is before the date it was incurred'
    setErrs(er)
    if (Object.keys(er).length || !a.ok || !c.ok) return

    setBusy(true)
    setServerErr(null)
    let creditor = cid
    if (cid === '__new') {
      const r = await addCreditor({ name: newName, category, contact_phone: phone })
      if (!r.ok) {
        setBusy(false)
        return setServerErr({ msg: r.error, limit: r.limit })
      }
      creditor = r.id
    }
    const r = await addDebt({
      creditor_id: creditor, description, currency, original_amount: a.value, additional_charges: c.value,
      charges_note: chargesNote, incurred_on: incurred, due_date: due || null, notes,
    })
    setBusy(false)
    if (!r.ok) return setServerErr({ msg: r.error, limit: r.limit })
    onClose()
  }

  return (
    <Modal title="Add debt" onClose={onClose}>
      {atLimit && (
        <div className="mb-3">
          <Banner tone="warn">
            Free plan allows {FREE_LIMITS.debts} active debts. <Link className="font-semibold underline" to="/subscription" onClick={onClose}>Upgrade</Link> to add more.
          </Banner>
        </div>
      )}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label="Who do you owe?" error={errs.creditor}>
          <select className="input" value={cid} onChange={(e) => setCid(e.target.value)}>
            {active.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="__new">+ New creditor…</option>
          </select>
        </Field>
        {cid === '__new' && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <Field label="Creditor name" error={errs.creditor}>
              <input className="input" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Mama Njeri shop" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category (optional)">
                <input className="input" value={category} maxLength={60} onChange={(e) => setCategory(e.target.value)} placeholder="Shop, friend, loan…" />
              </Field>
              <Field label="Phone (optional)">
                <input className="input" inputMode="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>
          </div>
        )}
        <Field label="What is it for?" error={errs.description}>
          <input className="input" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. School fees balance" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <Field label="Currency">
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Amount owed" error={errs.amount}>
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Extra charges (optional)" error={errs.charges}>
            <input className="input" inputMode="decimal" value={charges} onChange={(e) => setCharges(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Charges note">
            <input className="input" value={chargesNote} maxLength={300} onChange={(e) => setChargesNote(e.target.value)} placeholder="Late fee…" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date incurred">
            <input className="input" type="date" value={incurred} onChange={(e) => setIncurred(e.target.value)} />
          </Field>
          <Field label="Due date" error={errs.due}>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <textarea className="input min-h-[70px] py-2" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {serverErr && (
          <p className="err" role="alert">
            {serverErr.msg}{' '}
            {serverErr.limit && <Link to="/subscription" className="font-semibold underline" onClick={onClose}>See Premium</Link>}
          </p>
        )}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save debt'}</button>
      </form>
    </Modal>
  )
}

export function AddPaymentModal({ onClose, debtId }: { onClose: () => void; debtId?: string }) {
  const { debts, addPayment } = useStore()
  const open = debts.filter((d) => !d.archived_at && d.outstanding > 0)
  const [id, setId] = useState(debtId ?? open[0]?.id ?? '')
  const debt = debts.find((d) => d.id === id)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(todayNairobi())
  const [method, setMethod] = useState<Payment['method']>('mpesa')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [serverErr, setServerErr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (!debt) er.debt = 'Choose a debt'
    const a = debt ? parseAmountInput(amount, debt.currency) : ({ ok: false, error: 'Choose a debt first' } as const)
    if (!a.ok) er.amount = a.error
    else if (debt && a.value > debt.outstanding) er.amount = `That is more than the ${formatMoney(debt.outstanding, debt.currency)} still owed`
    if (paidOn > todayNairobi()) er.date = 'Date cannot be in the future'
    setErr(er)
    if (Object.keys(er).length || !debt || !a.ok) return
    setBusy(true)
    const r = await addPayment({ debt_id: debt.id, amount: a.value, currency: debt.currency, paid_on: paidOn, method, reference, note })
    setBusy(false)
    if (!r.ok) return setServerErr(r.error)
    onClose()
  }

  if (!open.length)
    return (
      <Modal title="Record payment" onClose={onClose}>
        <p className="text-sm text-slate-600 dark:text-slate-300">You have no unpaid debts to record a payment against.</p>
      </Modal>
    )

  return (
    <Modal title="Record payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label="Which debt?" error={err.debt}>
          <select className="input" value={id} onChange={(e) => setId(e.target.value)}>
            {open.map((d) => (
              <option key={d.id} value={d.id}>{d.description} — {formatMoney(d.outstanding, d.currency)} left</option>
            ))}
          </select>
        </Field>
        <Field label={`Amount paid${debt ? ` (${debt.currency})` : ''}`} error={err.amount}>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date paid" error={err.date}>
            <input className="input" type="date" max={todayNairobi()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <Field label="Method">
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as Payment['method'])}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Reference / M-Pesa code (optional)">
          <input className="input" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">Payments cannot be edited later. If you make a mistake, you add a reversal with a reason.</p>
        {serverErr && <p className="err" role="alert">{serverErr}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button>
      </form>
    </Modal>
  )
}
