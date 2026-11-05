import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useUI } from '../components/Layout'
import { reversedIds } from '../lib/derive'
import { Empty, ErrorBox, PageHeader, Spinner } from '../components/ui'
import { PaymentRow } from './DebtDetail'
import { Modal, Field } from '../components/ui'
import { formatMoney } from '../lib/money'
import type { Payment } from '../lib/types'

export default function Payments() {
  const { loading, error, refresh, payments, debts, reversePayment } = useStore()
  const { addPayment } = useUI()
  const [reverse, setReverse] = useState<Payment | null>(null)
  const [reason, setReason] = useState('')
  const [shown, setShown] = useState(60)
  const [err, setErr] = useState('')
  const reversed = useMemo(() => reversedIds(payments), [payments])

  if (loading) return <Spinner />
  if (error) return <ErrorBox message={error} onRetry={refresh} />

  const groups = payments.slice(0, shown).reduce<Record<string, Payment[]>>((a, p) => {
    const k = p.paid_on.slice(0, 7)
    ;(a[k] ??= []).push(p)
    return a
  }, {})

  return (
    <>
      <PageHeader title="Payments" right={<button className="btn-primary" onClick={() => addPayment()}>Record</button>} />
      {payments.length === 0 ? (
        <Empty title="No payments yet" hint="When you pay something off, record it here to keep your balances accurate." />
      ) : (
        Object.entries(groups).map(([month, rows]) => (
          <section key={month} className="card">
            <h2 className="mb-1 text-sm font-bold text-slate-500">
              {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-KE', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </h2>
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {rows.map((p) => {
                const d = debts.find((x) => x.id === p.debt_id)
                return (
                  <div key={p.id}>
                    {d && <Link to={`/debts/${d.id}`} className="block pt-2 text-xs font-medium text-brand-700 dark:text-brand-400">{d.description}</Link>}
                    <PaymentRow p={p} reversed={reversed.has(p.id)} onReverse={() => { setReverse(p); setReason(''); setErr('') }} />
                  </div>
                )
              })}
            </ul>
          </section>
        ))
      )}
      {payments.length > shown && (
        <button className="btn-secondary w-full" onClick={() => setShown((n) => n + 60)}>Show more ({payments.length - shown} older)</button>
      )}
      {reverse && (
        <Modal title="Reverse payment" onClose={() => setReverse(null)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const r = await reversePayment(reverse, reason)
              if (!r.ok) return setErr(r.error)
              setReverse(null)
            }}
          >
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Adds a reversal of {formatMoney(reverse.amount, reverse.currency)}. The original payment stays on record.
            </p>
            <Field label="Reason" error={err}>
              <textarea className="input min-h-[80px] py-2" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <button className="btn-danger w-full">Add reversal</button>
          </form>
        </Modal>
      )}
    </>
  )
}
