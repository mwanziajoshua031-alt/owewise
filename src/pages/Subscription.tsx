import { useState } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Banner, PageHeader, fmtDate } from '../components/ui'

const FREE = ['Up to 5 active debts', 'Up to 5 creditors', '20 receipt files, 3 MB each', 'Reminders, calendar, planner, monthly report']
const PREMIUM = ['Unlimited debts and creditors', 'Larger receipt storage (10 MB files)', 'CSV and PDF exports', 'Higher AI assistant limits']

export default function Subscription() {
  const { subscription, isPremium, refresh } = useStore()
  const [interval, setInterval_] = useState<'monthly' | 'annual'>('monthly')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function checkout() {
    setMsg('')
    if (!consent) return setMsg('Please confirm you agree to be charged.')
    setBusy(true)
    // The edge function creates the Paystack transaction server-side; no payment keys exist in this app.
    const { data, error } = await supabase.functions.invoke('paystack-checkout', { body: { interval, consent: true } })
    setBusy(false)
    if (error || !data?.authorization_url) {
      return setMsg('Online payment is not switched on yet. Nothing was charged.')
    }
    window.location.href = data.authorization_url as string
  }

  async function cancel() {
    if (!window.confirm('Cancel Premium? You keep access until the end of the period you paid for.')) return
    const { error } = await supabase.rpc('cancel_subscription')
    setMsg(error ? error.message : 'Cancelled. Premium stays active until the period ends.')
    await refresh()
  }

  return (
    <>
      <PageHeader title="Subscription" />
      <section className="card">
        <p className="text-sm text-slate-500">Current plan</p>
        <p className="text-xl font-extrabold">{isPremium ? 'Premium' : 'Free'}</p>
        {isPremium && subscription?.current_period_end && (
          <p className="text-sm text-slate-500">{subscription.cancel_at_period_end ? 'Ends' : 'Renews'} {fmtDate(subscription.current_period_end)}</p>
        )}
      </section>

      <section className="card"><h2 className="mb-2 font-bold">Free</h2><Features items={FREE} /></section>
      <section className="card border-brand-500">
        <h2 className="font-bold">Premium</h2>
        <p className="text-sm text-slate-500">$0.99 per month, charged in Kenyan shillings at the rate shown at checkout. An annual plan is available at a discount.</p>
        <div className="my-3"><Features items={PREMIUM} /></div>
        {!isPremium ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Billing interval">
              {(['monthly', 'annual'] as const).map((i) => (
                <button key={i} role="radio" aria-checked={interval === i} onClick={() => setInterval_(i)} className={`btn ${interval === i ? 'bg-navy-900 text-white dark:bg-brand-600' : 'btn-secondary'}`}>{i === 'monthly' ? 'Monthly' : 'Annual'}</button>
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I agree to pay for Premium via M-Pesa or card (Paystack). I can cancel any time and keep access until the period ends.</span>
            </label>
            <button className="btn-primary w-full" onClick={checkout} disabled={busy}>{busy ? 'Starting…' : 'Upgrade with M-Pesa / card'}</button>
          </div>
        ) : (
          !subscription?.cancel_at_period_end && <button className="btn-secondary w-full" onClick={cancel}>Cancel Premium</button>
        )}
        {msg && <div className="mt-3"><Banner>{msg}</Banner></div>}
      </section>
    </>
  )
}

function Features({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {items.map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {t}</li>)}
    </ul>
  )
}
