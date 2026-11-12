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
