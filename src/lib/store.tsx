import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { get, set } from 'idb-keyval'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { enqueue, flushQueue, getQueue, isNetworkError, discardQueued, type QueueItem } from './offline'
import { fromMinor, toMinor, todayNairobi } from './money'
import type {
  AppNotification, Creditor, DebtBalance, DebtStatus, Goal, Payment, Profile, Reminder, Subscription,
} from './types'

type Result = { ok: true; queued: boolean; id: string } | { ok: false; error: string; limit?: boolean }

export type CreditorInput = { name: string; category?: string; contact_phone?: string; notes?: string }
export type DebtInput = {
  creditor_id: string
  description: string
  currency: string
  original_amount: number
  additional_charges: number
  charges_note?: string
  incurred_on: string
  due_date?: string | null
  notes?: string
}
export type PaymentInput = {
  debt_id: string
  amount: number
  currency: string
  paid_on: string
  method: Payment['method']
  reference?: string
  note?: string
}

type Snapshot = {
  creditors: Creditor[]
  debts: DebtBalance[]
  payments: Payment[]
  reminders: Reminder[]
  notifications: AppNotification[]
  goals: Goal[]
  profile: Profile | null
  subscription: Subscription | null
}

type Store = Snapshot & {
  loading: boolean
  error: string | null
  stale: boolean // showing cached data because the network is unreachable
  online: boolean
  queue: QueueItem[]
  isPremium: boolean
  refresh: () => Promise<void>
  addCreditor: (i: CreditorInput) => Promise<Result>
  addDebt: (i: DebtInput) => Promise<Result>
  addPayment: (i: PaymentInput) => Promise<Result>
  reversePayment: (p: Payment, reason: string) => Promise<Result>
  discardQueued: (id: string) => Promise<void>
  retryQueue: () => Promise<void>
}

const EMPTY: Snapshot = {
  creditors: [], debts: [], payments: [], reminders: [], notifications: [], goals: [], profile: null, subscription: null,
}

const Ctx = createContext<Store | null>(null)
const cacheKey = (uid: string) => `owewise-cache-v1:${uid}`

function limitHit(msg: string) {
  return /limit|free plan|upgrade/i.test(msg)
}

function computeStatus(d: { outstanding: number; paid_total: number; due_date: string | null; is_disputed: boolean }): DebtStatus {
  if (d.outstanding <= 0) return 'paid'
  if (d.is_disputed) return 'disputed'
  if (d.due_date && d.due_date < todayNairobi()) return 'overdue'
  return d.paid_total > 0 ? 'partially_paid' : 'unpaid'
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const [snap, setSnap] = useState<Snapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [queue, setQueue] = useState<QueueItem[]>([])

  const load = useCallback(async () => {
    if (!uid) return
    setError(null)
    const res = await Promise.all([
      supabase.from('creditors').select('*').order('name'),
      supabase.from('debt_balances').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('payments').select('*').order('paid_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('reminders').select('*').order('remind_on'),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('goals').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').maybeSingle(),
      supabase.from('subscriptions').select('*').maybeSingle(),
    ])
    const firstErr = res.find((r) => r.error)?.error
    if (firstErr) {
      if (isNetworkError(firstErr)) {
        try {
          const cached = (await get(cacheKey(uid))) as Snapshot | undefined
          if (cached) {
            setSnap(cached)
            setStale(true)
            setLoading(false)
            return
          }
        } catch { /* ignore */ }
        setError('You appear to be offline and nothing is saved on this device yet.')
      } else {
        setError(firstErr.message)
      }
      setLoading(false)
      return
    }
    const next: Snapshot = {
      creditors: (res[0].data ?? []) as Creditor[],
      debts: (res[1].data ?? []) as DebtBalance[],
      payments: (res[2].data ?? []) as Payment[],
      reminders: (res[3].data ?? []) as Reminder[],
      notifications: (res[4].data ?? []) as AppNotification[],
      goals: (res[5].data ?? []) as Goal[],
      profile: (res[6].data ?? null) as Profile | null,
      subscription: (res[7].data ?? null) as Subscription | null,
    }
    setSnap(next)
    setStale(false)
    setLoading(false)
    try { await set(cacheKey(uid), next) } catch { /* ignore */ }
  }, [uid])

  const sync = useCallback(async () => {
    if (!uid) return
    const q = await getQueue()
    if (q.length) {
      const r = await flushQueue()
      setQueue(r.queue)
      if (r.synced) await load()
    }
  }, [uid, load])

  useEffect(() => {
    if (!uid) {
      setSnap(EMPTY)
      setLoading(false)
      return
    }
    setLoading(true)
    getQueue().then(setQueue)
    load().then(sync)
  }, [uid, load, sync])

  useEffect(() => {
    const on = () => { setOnline(true); void sync().then(load) }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [sync, load])

  // Merge queued (not yet synced) rows into what the user sees, flagged as pending.
  const merged = useMemo(() => {
    const qc = queue.filter((q) => q.table === 'creditors' && !q.error)
    const qd = queue.filter((q) => q.table === 'debts' && !q.error)
    const qp = queue.filter((q) => q.table === 'payments' && !q.error)

    const creditors: Creditor[] = [
      ...snap.creditors,
      ...qc
        .filter((q) => !snap.creditors.some((c) => c.id === q.id))
        .map((q) => ({ ...(q.row as unknown as Creditor), created_at: new Date(q.queuedAt).toISOString(), archived_at: null, pending: true })),
    ]
    const payments: Payment[] = [
      ...qp
        .filter((q) => !snap.payments.some((p) => p.id === q.id))
        .map((q) => ({ ...(q.row as unknown as Payment), created_at: new Date(q.queuedAt).toISOString(), pending: true })),
      ...snap.payments,
    ]
    const pendingPay = new Map<string, number>()
    for (const p of payments.filter((x) => x.pending)) {
      pendingPay.set(p.debt_id, (pendingPay.get(p.debt_id) ?? 0) + toMinor(p.amount, p.currency))
    }
    const base: DebtBalance[] = [
      ...snap.debts,
      ...qd
        .filter((q) => !snap.debts.some((d) => d.id === q.id))
        .map((q) => {
          const r = q.row as unknown as DebtBalance
          const total = fromMinor(toMinor(r.original_amount, r.currency) + toMinor(r.additional_charges ?? 0, r.currency), r.currency)
          return {
            ...r, user_id: '', archived_at: null, is_disputed: false, dispute_reason: null, dispute_notes: null,
            created_at: new Date(q.queuedAt).toISOString(), total_due: total, paid_total: 0, outstanding: total,
            status: 'unpaid' as DebtStatus, pending: true,
          }
        }),
    ]
    const debts = base.map((d) => {
      const extra = pendingPay.get(d.id)
      if (!extra) return d
      const paid = fromMinor(toMinor(d.paid_total, d.currency) + extra, d.currency)
      const outstanding = fromMinor(Math.max(0, toMinor(d.total_due, d.currency) - toMinor(paid, d.currency)), d.currency)
      return { ...d, paid_total: paid, outstanding, status: computeStatus({ ...d, paid_total: paid, outstanding }) }
    })
    return { creditors, payments, debts }
  }, [snap, queue])

  const submit = useCallback(
    async (table: 'creditors' | 'debts' | 'payments', row: Record<string, unknown>): Promise<Result> => {
      if (!uid) return { ok: false, error: 'Not signed in' }
      const id = crypto.randomUUID()
      const full = { ...row, id, client_id: id, user_id: uid }
      const queueIt = async () => {
        setQueue(await enqueue({ id, table, row: full }))
        return { ok: true, queued: true, id } as Result
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) return queueIt()
      const { error: e } = await supabase.from(table).insert(full)
      if (!e) {
        await load()
        return { ok: true, queued: false, id }
      }
      if (isNetworkError(e)) return queueIt()
      const limit = limitHit(e.message)
      return { ok: false, error: limit ? 'You have reached the Free plan limit.' : e.message, limit }
    },
    [uid, load],
  )

  const store: Store = {
    ...snap,
    ...merged,
    loading,
    error,
    stale,
    online,
    queue,
    isPremium:
      snap.subscription?.plan === 'premium' &&
      snap.subscription.status !== 'expired' &&
      (!snap.subscription.current_period_end || new Date(snap.subscription.current_period_end) > new Date()),
    refresh: load,
    addCreditor: (i) =>
      submit('creditors', {
        name: i.name.trim(),
        category: i.category?.trim() || null,
        contact_phone: i.contact_phone?.trim() || null,
        notes: i.notes?.trim() || null,
      }),
    addDebt: (i) =>
      submit('debts', {
        creditor_id: i.creditor_id,
        description: i.description.trim(),
        currency: i.currency,
        original_amount: i.original_amount,
        additional_charges: i.additional_charges,
        charges_note: i.charges_note?.trim() || null,
        incurred_on: i.incurred_on,
        due_date: i.due_date || null,
        notes: i.notes?.trim() || null,
      }),
    addPayment: (i) =>
      submit('payments', {
        kind: 'payment',
        debt_id: i.debt_id,
        amount: i.amount,
        currency: i.currency,
        paid_on: i.paid_on,
        method: i.method,
        reference: i.reference?.trim() || null,
        note: i.note?.trim() || null,
      }),
    // Corrections are new reversal rows (online only). The original payment is never changed.
    async reversePayment(p, reason) {
      if (!uid) return { ok: false, error: 'Not signed in' }
      if (!reason.trim()) return { ok: false, error: 'A reason is required' }
      if (typeof navigator !== 'undefined' && !navigator.onLine)
        return { ok: false, error: 'Reversals need an internet connection so nothing is overwritten.' }
      const id = crypto.randomUUID()
      const { error: e } = await supabase.from('payments').insert({
        id, client_id: id, user_id: uid, debt_id: p.debt_id, kind: 'reversal', reverses_payment_id: p.id,
        amount: p.amount, currency: p.currency, paid_on: todayNairobi(), method: p.method, note: reason.trim(),
      })
      if (e) return { ok: false, error: e.message }
      await load()
      return { ok: true, queued: false, id }
    },
    async discardQueued(id) {
      setQueue(await discardQueued(id))
    },
    async retryQueue() {
      const q = (await getQueue()).map((x) => ({ ...x, error: undefined }))
      await set('owewise-queue-v1', q)
      setQueue(q)
      await sync()
    },
  }

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore outside DataProvider')
  return c
}
