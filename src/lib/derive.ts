import { sumByCurrency, todayNairobi } from './money'
import type { DebtBalance, Payment } from './types'

export function currenciesOf(debts: DebtBalance[]): string[] {
  const set = new Set(debts.map((d) => d.currency))
  return [...set].sort((a, b) => (a === 'KES' ? -1 : b === 'KES' ? 1 : a.localeCompare(b)))
}

export const isActive = (d: DebtBalance) => !d.archived_at && d.status !== 'paid'

export function totalsFor(debts: DebtBalance[], currency: string) {
  const mine = debts.filter((d) => d.currency === currency && !d.archived_at)
  const active = mine.filter((d) => d.status !== 'paid')
  const get = (rows: DebtBalance[], f: (d: DebtBalance) => number) =>
    sumByCurrency(rows.map((d) => ({ currency, amount: f(d) })))[currency] ?? 0
  return {
    outstanding: get(active, (d) => d.outstanding),
    overdue: get(active.filter((d) => d.status === 'overdue'), (d) => d.outstanding),
    paid: get(mine, (d) => d.paid_total),
    activeCount: active.length,
    overdueCount: active.filter((d) => d.status === 'overdue').length,
  }
}

/** Net paid (payments minus reversals) for a calendar month YYYY-MM, per currency. */
export function paidInMonth(payments: Payment[], month: string, currency: string): number {
  const rows = payments
    .filter((p) => p.currency === currency && p.paid_on.startsWith(month))
    .map((p) => ({ currency, amount: p.kind === 'reversal' ? -p.amount : p.amount }))
  return sumByCurrency(rows)[currency] ?? 0
}

export function reversedIds(payments: Payment[]): Set<string> {
  return new Set(payments.filter((p) => p.kind === 'reversal' && p.reverses_payment_id).map((p) => p.reverses_payment_id as string))
}

export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const [ty, tm, td] = todayNairobi().split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000)
}

export function dueLabel(iso: string | null): string {
  if (!iso) return 'No due date'
  const n = daysUntil(iso)
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} overdue`
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  return `Due in ${n} days`
}

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@]/.test(s)) s = "'" + s // neutralise spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n')
}

export function download(name: string, content: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
