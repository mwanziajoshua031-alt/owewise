import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { currenciesOf, download, isActive, toCSV } from '../lib/derive'
import { addMonthsISO, formatMoney, parseAmountInput, planRepayment, todayNairobi, type PlanStrategy } from '../lib/money'
import { Banner, Empty, ErrorBox, PageHeader, Spinner, fmtDate } from '../components/ui'

type Report = {
  month: string; currency: string; opening_balance: number; new_debts_total: number; new_debts_count: number
  payments_made: number; closing_balance: number
  upcoming: { debt_id: string; creditor: string; description: string; outstanding: number; due_date: string }[]
}

export default function Insights() {
  const { loading, debts, payments, creditors, isPremium, profile } = useStore()
  const currencies = useMemo(() => currenciesOf(debts), [debts])
  const [currency, setCurrency] = useState(profile?.default_currency ?? 'KES')
  const cur = currencies.includes(currency) ? currency : currencies[0] ?? 'KES'

  if (loading) return <Spinner />
  if (!debts.length) return (<><PageHeader title="Insights" /><Empty title="Nothing to analyse yet" hint="Add a few debts and payments and your monthly report and repayment plan will appear here." /></>)

  return (
    <>
      <PageHeader title="Insights" />
      {currencies.length > 1 && (
        <div className="flex gap-2" role="tablist" aria-label="Currency">
          {currencies.map((c) => (
            <button key={c} role="tab" aria-selected={c === cur} onClick={() => setCurrency(c)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${c === cur ? 'bg-navy-900 text-white dark:bg-brand-600' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}>{c}</button>
          ))}
        </div>
      )}
      <MonthlyReport currency={cur} />
      <Planner currency={cur} />
      <ExportCard isPremium={isPremium} debts={debts} payments={payments} creditors={creditors} />
    </>
  )
}

function MonthlyReport({ currency }: { currency: string }) {
  const [month, setMonth] = useState(todayNairobi().slice(0, 7))
  const [rep, setRep] = useState<Report | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    setRep(null)
    setErr('')
    supabase.rpc('monthly_report', { p_month: `${month}-01`, p_currency: currency }).then(({ data, error }) => {
      if (!live) return
      if (error) setErr(error.message)
      else setRep(data as Report)
    })
    return () => { live = false }
  }, [month, currency])

  const shift = (n: number) => setMonth(addMonthsISO(`${month}-01`, n).slice(0, 7))
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Monthly report</h2>
        <div className="flex items-center gap-1 text-sm">
          <button className="rounded px-2 py-1" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
          <span className="w-24 text-center font-medium">{month}</span>
          <button className="rounded px-2 py-1" aria-label="Next month" onClick={() => shift(1)}>›</button>
        </div>
      </div>
      {err && <ErrorBox message={err} />}
      {!rep && !err && <Spinner />}
      {rep && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Opening balance" v={formatMoney(rep.opening_balance, currency)} />
            <Stat label={`New debts (${rep.new_debts_count})`} v={formatMoney(rep.new_debts_total, currency)} />
            <Stat label="Paid" v={formatMoney(rep.payments_made, currency)} good />
            <Stat label="Closing balance" v={formatMoney(rep.closing_balance, currency)} />
          </dl>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Due in the 30 days after</h3>
            {rep.upcoming.length === 0 ? <p className="text-sm text-slate-500">Nothing due.</p> : (
              <ul className="space-y-1 text-sm">
                {rep.upcoming.map((u) => (
                  <li key={u.debt_id} className="flex justify-between gap-2">
                    <Link to={`/debts/${u.debt_id}`} className="truncate">{u.description} <span className="text-slate-500">· {u.creditor}</span></Link>
                    <span className="shrink-0 font-medium">{fmtDate(u.due_date)} · {formatMoney(u.outstanding, currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function Stat({ label, v, good }: { label: string; v: string; good?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`font-bold ${good ? 'text-brand-700 dark:text-brand-400' : ''}`}>{v}</dd>
    </div>
  )
}

const STRATEGY: Record<PlanStrategy, { label: string; hint: string }> = {
  smallest_first: { label: 'Smallest first', hint: 'Clear small debts quickly for momentum.' },
  due_date: { label: 'Soonest due first', hint: 'Avoid late fees by paying what is due next.' },
  largest_first: { label: 'Largest first', hint: 'Tackle the biggest balance first.' },
}

function Planner({ currency }: { currency: string }) {
  const { debts, creditors } = useStore()
  const [budget, setBudget] = useState('')
  const [strategy, setStrategy] = useState<PlanStrategy>('smallest_first')
  const open = debts.filter((d) => isActive(d) && d.currency === currency && d.outstanding > 0)
  const total = open.reduce((s, d) => s + d.outstanding, 0)
  const parsed = budget ? parseAmountInput(budget, currency) : null

  const plan = useMemo(
    () => (parsed && parsed.ok ? planRepayment(open.map((d) => ({ id: d.id, name: d.description, outstanding: d.outstanding, dueDate: d.due_date })), parsed.value, currency, strategy) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [budget, strategy, currency, debts],
  )

  const chart = useMemo(() => {
    if (!plan || !plan.months) return []
    let rem = total
    const rows = [{ month: 0, left: total }]
    for (const s of plan.schedule) {
      rem -= s.payments.reduce((a, p) => a + p.amount, 0)
      rows.push({ month: s.month, left: Math.max(0, Math.round(rem * 100) / 100) })
    }
    return rows
  }, [plan, total])

  return (
    <section className="card space-y-3">
      <h2 className="font-bold">Repayment planner</h2>
      {open.length === 0 ? <p className="text-sm text-slate-500">No unpaid {currency} debts to plan.</p> : (
        <>
          <p className="text-sm text-slate-500">You owe {formatMoney(total, currency)} across {open.length} debt{open.length > 1 ? 's' : ''}. How much can you put toward debts each month?</p>
          <input className="input" inputMode="decimal" placeholder={`Monthly budget (${currency})`} value={budget} onChange={(e) => setBudget(e.target.value)} aria-label="Monthly budget" />
          {parsed && !parsed.ok && <p className="err">{parsed.error}</p>}
          <div className="grid gap-2">
            {(Object.keys(STRATEGY) as PlanStrategy[]).map((s) => (
              <label key={s} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${strategy === s ? 'border-brand-500 bg-brand-500/5' : 'border-slate-200 dark:border-white/10'}`}>
                <input type="radio" name="strategy" checked={strategy === s} onChange={() => setStrategy(s)} className="mt-1" />
                <span><b>{STRATEGY[s].label}</b><br /><span className="text-slate-500">{STRATEGY[s].hint}</span></span>
              </label>
            ))}
          </div>
          {plan && (
            plan.months === null ? <Banner tone="warn">That budget will not clear these debts within 50 years. Try a higher amount.</Banner> : (
              <div className="space-y-3">
                <Banner>
                  Debt-free in <b>{plan.months} month{plan.months === 1 ? '' : 's'}</b>, around <b>{fmtDate(addMonthsISO(todayNairobi(), plan.months))}</b>, if you pay {formatMoney(parsed && parsed.ok ? parsed.value : 0, currency)} every month.
                </Banner>
                <div className="h-48" role="img" aria-label="Line chart of remaining balance by month">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid strokeOpacity={0.15} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                      <Tooltip formatter={(v: number) => formatMoney(v, currency)} labelFormatter={(l) => `Month ${l}`} />
                      <Line type="monotone" dataKey="left" stroke="#16A34A" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <ol className="space-y-1 text-sm">
                  {plan.payoffOrder.map((p, i) => (
                    <li key={p.id}>{i + 1}. <b>{p.name}</b> <span className="text-slate-500">· {creditors.find((c) => c.id === debts.find((d) => d.id === p.id)?.creditor_id)?.name} · cleared in month {p.month}</span></li>
                  ))}
                </ol>
                <p className="text-xs text-slate-500">This plan uses your recorded balances only. It does not include interest or new charges.</p>
              </div>
            )
          )}
        </>
      )}
    </section>
  )
}

function ExportCard({ isPremium, debts, payments, creditors }: { isPremium: boolean; debts: ReturnType<typeof useStore>['debts']; payments: ReturnType<typeof useStore>['payments']; creditors: ReturnType<typeof useStore>['creditors'] }) {
  const name = (id: string) => creditors.find((c) => c.id === id)?.name ?? ''
  return (
    <section className="card space-y-2">
      <h2 className="font-bold">Export {isPremium ? '' : '(Premium)'}</h2>
      {isPremium ? (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={() => download('owewise-debts.csv', toCSV([
            ['Creditor', 'Description', 'Currency', 'Original', 'Charges', 'Total due', 'Paid', 'Outstanding', 'Status', 'Incurred', 'Due'],
            ...debts.map((d) => [name(d.creditor_id), d.description, d.currency, d.original_amount, d.additional_charges, d.total_due, d.paid_total, d.outstanding, d.status, d.incurred_on, d.due_date]),
          ]))}>Debts CSV</button>
          <button className="btn-secondary" onClick={() => download('owewise-payments.csv', toCSV([
            ['Date', 'Debt', 'Type', 'Currency', 'Amount', 'Method', 'Reference', 'Note'],
            ...payments.map((p) => [p.paid_on, debts.find((d) => d.id === p.debt_id)?.description, p.kind, p.currency, p.amount, p.method, p.reference, p.note]),
          ]))}>Payments CSV</button>
          <button className="btn-secondary col-span-2" onClick={() => window.print()}>Print / save as PDF</button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">CSV and PDF exports are part of Premium. <Link className="font-semibold underline" to="/subscription">See Premium</Link>. You can always export all your data as JSON from Settings.</p>
      )}
    </section>
  )
}
