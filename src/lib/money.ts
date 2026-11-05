// Money helpers. All arithmetic is done in integer minor units to avoid float drift.
// Currencies are NEVER added together: totals are always returned per currency.

const ZERO_DECIMAL = new Set(['JPY', 'UGX', 'RWF', 'XOF', 'XAF', 'KRW'])

export function decimalsFor(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2
}

/** Convert a decimal amount (number or numeric string) to integer minor units. */
export function toMinor(amount: number | string, currency: string): number {
  const n = typeof amount === 'string' ? Number(amount.replace(/,/g, '').trim()) : amount
  if (!Number.isFinite(n)) throw new Error('Invalid amount')
  return Math.round(n * 10 ** decimalsFor(currency))
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** decimalsFor(currency)
}

export function formatMoney(amount: number, currency: string, locale = 'en-KE'): string {
  const d = decimalsFor(currency)
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(d)}`
  }
}

/** Parse user input into a positive amount; returns an error string or the value. */
export function parseAmountInput(
  raw: string,
  currency: string,
  opts: { allowZero?: boolean; max?: number } = {},
): { ok: true; value: number } | { ok: false; error: string } {
  const s = raw.replace(/,/g, '').trim()
  if (!s) return { ok: false, error: 'Enter an amount' }
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: 'Use numbers only' }
  const d = decimalsFor(currency)
  const frac = s.split('.')[1]
  if (frac && frac.length > d) return { ok: false, error: d === 0 ? 'No decimals for this currency' : 'Max 2 decimal places' }
  const v = Number(s)
  if (!opts.allowZero && v <= 0) return { ok: false, error: 'Amount must be above zero' }
  if (v >= (opts.max ?? 1_000_000_000)) return { ok: false, error: 'Amount is too large' }
  return { ok: true, value: v }
}

export type Moneyish = { currency: string; amount: number }

/** Sum amounts per currency (in minor units internally). Returns decimal amounts keyed by currency. */
export function sumByCurrency(items: Moneyish[]): Record<string, number> {
  const minor: Record<string, number> = {}
  for (const it of items) {
    const c = it.currency.toUpperCase()
    minor[c] = (minor[c] ?? 0) + toMinor(it.amount, c)
  }
  const out: Record<string, number> = {}
  for (const c of Object.keys(minor)) out[c] = fromMinor(minor[c], c)
  return out
}

// ---------- Repayment planner (single currency, no interest data stored) ----------

export type PlanStrategy = 'smallest_first' | 'due_date' | 'largest_first'

export type PlanDebt = { id: string; name: string; outstanding: number; dueDate?: string | null }

export type PlanResult = {
  currency: string
  months: number | null // null = never finishes within horizon
  payoffOrder: { id: string; name: string; month: number }[]
  schedule: { month: number; payments: { id: string; name: string; amount: number }[] }[]
  totalPaid: number
}

const MAX_MONTHS = 600

function orderDebts(debts: (PlanDebt & { rem: number })[], strategy: PlanStrategy) {
  const copy = [...debts]
  if (strategy === 'smallest_first') copy.sort((a, b) => a.rem - b.rem)
  else if (strategy === 'largest_first') copy.sort((a, b) => b.rem - a.rem)
  else
    copy.sort((a, b) => {
      const ad = a.dueDate ?? '9999-12-31'
      const bd = b.dueDate ?? '9999-12-31'
      return ad < bd ? -1 : ad > bd ? 1 : a.rem - b.rem
    })
  return copy
}

/**
 * Plan repayment of debts in ONE currency with a fixed monthly budget.
 * Debts have no stored interest, so this is a straight allocation plan:
 * the full budget goes to the priority debt each month and rolls over as debts clear.
 */
export function planRepayment(
  debts: PlanDebt[],
  monthlyBudget: number,
  currency: string,
  strategy: PlanStrategy,
): PlanResult {
  const budget = toMinor(monthlyBudget, currency)
  const live = debts
    .map((d) => ({ ...d, rem: toMinor(d.outstanding, currency) }))
    .filter((d) => d.rem > 0)

  const result: PlanResult = { currency, months: 0, payoffOrder: [], schedule: [], totalPaid: 0 }
  if (live.length === 0) return result
  if (budget <= 0) return { ...result, months: null }

  let month = 0
  let totalMinor = 0
  while (live.some((d) => d.rem > 0) && month < MAX_MONTHS) {
    month++
    let left = budget
    const paid: { id: string; name: string; amount: number }[] = []
    for (const d of orderDebts(live.filter((x) => x.rem > 0), strategy)) {
      if (left <= 0) break
      const pay = Math.min(left, d.rem)
      d.rem -= pay
      left -= pay
      totalMinor += pay
      paid.push({ id: d.id, name: d.name, amount: fromMinor(pay, currency) })
      if (d.rem === 0) result.payoffOrder.push({ id: d.id, name: d.name, month })
    }
    result.schedule.push({ month, payments: paid })
  }
  result.totalPaid = fromMinor(totalMinor, currency)
  result.months = live.some((d) => d.rem > 0) ? null : month
  return result
}

/** Add whole months to a YYYY-MM-DD date string (UTC-safe), returns YYYY-MM-DD. */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  dt.setUTCDate(Math.min(d, last))
  return dt.toISOString().slice(0, 10)
}

/** Today's date in Africa/Nairobi as YYYY-MM-DD. */
export function todayNairobi(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date())
}
