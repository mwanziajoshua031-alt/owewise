import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../../lib/account'
import { call, reminderText, useLoad, waLink, type ReminderRow } from '../../lib/biz'
import { formatMoney } from '../../lib/money'
import { Empty, ErrorBox, fmtDate, PageHeader, Spinner } from '../../components/ui'

const GROUPS: { k: ReminderRow['stage']; title: string }[] = [
  { k: 'overdue', title: 'Overdue' },
  { k: 'due_today', title: 'Due today' },
  { k: 'due_soon', title: 'Due in the next 3 days' },
]

function when(r: ReminderRow): string {
  if (r.days_to_due < 0) return `${-r.days_to_due} day${r.days_to_due === -1 ? '' : 's'} overdue`
  if (r.days_to_due === 0) return 'due today'
  return `due in ${r.days_to_due} day${r.days_to_due === 1 ? '' : 's'}`
}

/** Today's reminder list. The app works out who is due; the owner or staff taps once to send each on WhatsApp. */
export default function Reminders() {
  const { business } = useAccount()
  const { data, loading, error, reload } = useLoad(async () => {
    const r = await call<ReminderRow[]>('reminders_due', {})
    if (r.error) throw new Error(r.error)
    return r.data ?? []
  }, [])
  const [sent, setSent] = useState<Set<string>>(new Set())
  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />
  const left = data.filter((r) => !sent.has(r.debt_id))
  return (
    <>
      <Link to="/" className="text-sm font-semibold text-brand-700 underline dark:text-brand-400">← Home</Link>
      <PageHeader title="Reminders today" />
      <p className="text-sm text-slate-600 dark:text-slate-300">Customers whose debt is due within 3 days or is overdue. Tap Send to open WhatsApp with the message ready. Each customer is listed again after 3 days (7 days once overdue).</p>
      {left.length === 0 ? <Empty title="No reminders to send" hint="Everyone due has been reminded recently, or nothing is due soon." /> : GROUPS.map((g) => {
        const rows = left.filter((r) => r.stage === g.k)
        if (rows.length === 0) return null
        return (
          <section key={g.k} className="space-y-2">
            <h2 className="text-sm font-bold">{g.title} ({rows.length})</h2>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.debt_id} className="card flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <Link to={`/debts/${r.debt_id}`} className="block truncate font-semibold">{r.customer_name}</Link>
                    <span className="block truncate text-xs text-slate-500">{r.description} · {when(r)}</span>
                    <span className="block text-xs text-slate-500">{r.last_reminded ? `Last reminded ${fmtDate(r.last_reminded)}` : 'Not reminded yet'}</span>
                  </span>
                  <span className="shrink-0 space-y-1 text-right">
                    <span className="block text-sm font-bold">{formatMoney(r.outstanding, r.currency)}</span>
                    <a className="btn-primary !min-h-0 px-3 py-1.5 text-xs" target="_blank" rel="noopener noreferrer"
                      href={waLink(r.customer_phone, reminderText({ id: r.debt_id, customer_name: r.customer_name, description: r.description, currency: r.currency, outstanding: r.outstanding, due_date: r.due_date, customer_user_id: r.customer_user_id }, business?.name ?? 'us', formatMoney(r.outstanding, r.currency), fmtDate(r.due_date), r.days_to_due < 0))}
                      onClick={() => { call('log_reminder', { p_debt: r.debt_id, p_channel: 'whatsapp' }).then(() => setSent((s) => new Set(s).add(r.debt_id))) }}>Send</a>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {sent.size > 0 && <p className="text-xs text-slate-500">{sent.size} sent just now. They will come back after the waiting period if still unpaid.</p>}
    </>
  )
}
