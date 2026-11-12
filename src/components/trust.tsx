import { formatMoney } from '../lib/money'
import type { Trust } from '../lib/biz'

const LOOK: Record<Trust['rating'], { label: string; cls: string }> = {
  reliable: { label: 'Reliable payer', cls: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
  mixed: { label: 'Mixed record', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  risky: { label: 'Risky', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  not_enough: { label: 'Not enough history', cls: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' },
}

export function TrustBadge({ t }: { t: Trust | undefined }) {
  if (!t) return null
  const l = LOOK[t.rating]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${l.cls}`}>{l.label}</span>
}

/** One plain sentence under the badge: how many finished debts, how many on time, how late on average. */
export function trustLine(t: Trust | undefined): string {
  if (!t) return ''
  if (t.rating === 'not_enough') return t.finished === 0 ? 'No finished debts yet. A rating appears after 3.' : `${t.finished} finished debt${t.finished === 1 ? '' : 's'} so far. A rating appears after 3.`
  const late = t.avg_days_late > 0 ? `, ${t.avg_days_late} days late on average` : ''
  return `Paid on time ${t.on_time} of ${t.finished} finished debts${late}.`
}

export function overdueNow(t: Trust | undefined): string {
  if (!t || t.overdue_now.length === 0) return ''
  return 'Overdue now: ' + t.overdue_now.map((o) => `${formatMoney(o.amount, o.currency)} (${o.debts})`).join(' · ')
}
