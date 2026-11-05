import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { currenciesOf, totalsFor } from '../lib/derive'
import { formatMoney, parseAmountInput } from '../lib/money'
import { Empty, Field, Modal, PageHeader, Spinner, fmtDate } from '../components/ui'

export default function Goals() {
  const { loading, goals, debts, refresh, profile } = useStore()
  const [adding, setAdding] = useState(false)
  if (loading) return <Spinner />

  async function remove(id: string) {
    if (!window.confirm('Delete this goal?')) return
    await supabase.from('goals').delete().eq('id', id)
    await refresh()
  }

  return (
    <>
      <PageHeader title="Goals" right={<button className="btn-primary" onClick={() => setAdding(true)}>New goal</button>} />
      {goals.length === 0 ? (
        <Empty title="No goals yet" hint='Set a target like "get my KES debts under 20,000 by March" and watch your progress.' />
      ) : (
        <ul className="space-y-2">
          {goals.map((g) => {
            const now = totalsFor(debts, g.currency).outstanding
            const span = g.start_amount - g.target_amount
            const pct = span <= 0 ? 100 : Math.max(0, Math.min(100, Math.round(((g.start_amount - now) / span) * 100)))
            const done = now <= g.target_amount
            return (
              <li key={g.id} className="card space-y-2">
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-semibold">{g.title}</p>
                    <p className="text-xs text-slate-500">From {formatMoney(g.start_amount, g.currency)} to {formatMoney(g.target_amount, g.currency)}{g.target_date ? ` by ${fmtDate(g.target_date)}` : ''}</p>
                  </div>
                  <button className="text-xs text-slate-500 underline" onClick={() => remove(g.id)}>Delete</button>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Goal progress">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-sm">{done ? 'Goal reached 🎉' : `You owe ${formatMoney(now, g.currency)} now · ${pct}%`}</p>
              </li>
            )
          })}
        </ul>
      )}
      {adding && <NewGoal onClose={() => setAdding(false)} onDone={refresh} defaultCurrency={currenciesOf(debts)[0] ?? profile?.default_currency ?? 'KES'} />}
    </>
  )
}

function NewGoal({ onClose, onDone, defaultCurrency }: { onClose: () => void; onDone: () => Promise<void>; defaultCurrency: string }) {
  const { debts } = useStore()
  const [title, setTitle] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [target, setTarget] = useState('0')
  const [date, setDate] = useState('')
  const [err, setErr] = useState('')
  const start = totalsFor(debts, currency).outstanding

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setErr('Name your goal')
    const t = parseAmountInput(target || '0', currency, { allowZero: true })
    if (!t.ok) return setErr(t.error)
    if (t.value >= start) return setErr(`Target must be below what you owe now (${formatMoney(start, currency)})`)
    const { error } = await supabase.from('goals').insert({ title: title.trim(), currency, start_amount: start, target_amount: t.value, target_date: date || null })
    if (error) return setErr(error.message)
    await onDone()
    onClose()
  }

  return (
    <Modal title="New goal" onClose={onClose}>
      <form onSubmit={save} className="space-y-3" noValidate>
        <Field label="Goal"><input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Clear my shop debts" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([...currenciesOf(debts), 'KES'])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Target total owed"><input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        </div>
        <Field label="Target date (optional)"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">Starting point: you owe {formatMoney(start, currency)} today.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full">Create goal</button>
      </form>
    </Modal>
  )
}
