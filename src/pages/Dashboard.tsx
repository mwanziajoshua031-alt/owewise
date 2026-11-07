import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../lib/store'
import { useUI } from '../components/Layout'
import { currenciesOf, daysUntil, dueLabel, isActive, paidInMonth, totalsFor } from '../lib/derive'
import { formatMoney, todayNairobi } from '../lib/money'
import { BillsCard } from '../components/biz'
import { Empty, ErrorBox, PageHeader, Spinner, StatusBadge } from '../components/ui'

export default function Dashboard() {
  const { loading, error, refresh, debts, creditors, payments, profile } = useStore()
  const { addDebt, addPayment } = useUI()
  const currencies = useMemo(() => currenciesOf(debts), [debts])
  const [picked, setPicked] = useState<string | null>(null)
  const currency = picked && currencies.includes(picked) ? picked : currencies.includes(profile?.default_currency ?? 'KES') ? (profile?.default_currency ?? 'KES') : currencies[0] ?? 'KES'

  if (loading) return <Spinner />
  if (error) return <ErrorBox message={error} onRetry={refresh} />

  const name = profile?.full_name?.split(' ')[0]
  if (!debts.length)
    return (
      <>
        <PageHeader title={name ? `Hi, ${name}` : 'Welcome'} />
        <BillsCard />
        <Empty
          title="No debts yet"
          hint="Add what you owe and OweWise will track balances, due dates and payments for you."
          action={<button className="btn-primary" onClick={() => addDebt()}>Add your first debt</button>}
        />
      </>
    )

  const t = totalsFor(debts, currency)
  const month = todayNairobi().slice(0, 7)
  const paidThisMonth = paidInMonth(payments, month, currency)
  const upcoming = debts
    .filter((d) => isActive(d) && d.currency === currency && d.due_date && daysUntil(d.due_date) <= 14)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 5)

  const byCreditor = Object.values(
    debts
      .filter((d) => isActive(d) && d.currency === currency)
      .reduce<Record<string, { name: string; value: number }>>((acc, d) => {
        const n = creditors.find((c) => c.id === d.creditor_id)?.name ?? 'Unknown'
        acc[d.creditor_id] = { name: n, value: (acc[d.creditor_id]?.value ?? 0) + d.outstanding }
        return acc
      }, {}),
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  return (
    <>
      <PageHeader title={name ? `Hi, ${name}` : 'Overview'} />
      <BillsCard />

      {currencies.length > 1 && (
        <div className="flex gap-2" role="tablist" aria-label="Currency">
          {currencies.map((c) => (
            <button key={c} role="tab" aria-selected={c === currency} onClick={() => setPicked(c)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${c === currency ? 'bg-navy-900 text-white dark:bg-brand-600' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}>
              {c}
            </button>
          ))}
        </div>
      )}
      {currencies.length > 1 && <p className="text-xs text-slate-500">Totals are shown per currency. Different currencies are never added together.</p>}

      <section className="card bg-navy-900 text-white dark:bg-navy-800">
        <p className="text-sm text-slate-300">Total you owe ({currency})</p>
        <p className="mt-1 text-3xl font-extrabold">{formatMoney(t.outstanding, currency)}</p>
        <p className="mt-1 text-sm text-slate-300">across {t.activeCount} active debt{t.activeCount === 1 ? '' : 's'}</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-slate-500">Overdue</p>
          <p className={`text-lg font-bold ${t.overdue > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatMoney(t.overdue, currency)}</p>
          <p className="text-xs text-slate-500">{t.overdueCount} debt{t.overdueCount === 1 ? '' : 's'}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Paid this month</p>
          <p className="text-lg font-bold text-brand-700 dark:text-brand-400">{formatMoney(paidThisMonth, currency)}</p>
          <p className="text-xs text-slate-500">Net of reversals</p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button className="btn-primary" onClick={() => addPayment()}>Record payment</button>
        <button className="btn-secondary" onClick={() => addDebt()}>Add debt</button>
      </div>

      <section className="card">
        <h2 className="mb-2 font-bold">Coming up</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing due in the next 14 days.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/10">
            {upcoming.map((d) => (
              <li key={d.id}>
                <Link to={`/debts/${d.id}`} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{d.description}</p>
                    <p className="text-xs text-slate-500">{creditors.find((c) => c.id === d.creditor_id)?.name} · {dueLabel(d.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatMoney(d.outstanding, d.currency)}</p>
                    <StatusBadge status={d.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {byCreditor.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold">Who you owe most</h2>
          <div className="h-56" role="img" aria-label={`Bar chart of outstanding balance by creditor in ${currency}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCreditor} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} strokeOpacity={0.15} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {byCreditor.map((_, i) => <Cell key={i} fill={i === 0 ? '#16A34A' : '#3B6EA8'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </>
  )
}
