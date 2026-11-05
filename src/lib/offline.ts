import { get, set } from 'idb-keyval'
import { supabase } from './supabase'

// Offline queue for CREATING creditors, debts and payments only.
// - Every row has a client-generated uuid used as both `id` and `client_id`,
//   so retries are idempotent (unique(user_id, client_id)) and dependent rows can reference it.
// - Existing payments are never edited offline. Corrections are reversal rows, online only.
// - A row the server rejects (e.g. overpayment) stays in the queue marked as failed; it is never silently dropped.

export type QueueTable = 'creditors' | 'debts' | 'payments'
export type QueueItem = {
  id: string
  table: QueueTable
  row: Record<string, unknown>
  queuedAt: number
  error?: string
}

const KEY = 'owewise-queue-v1'
const RANK: Record<QueueTable, number> = { creditors: 0, debts: 1, payments: 2 }

export async function getQueue(): Promise<QueueItem[]> {
  try {
    return ((await get(KEY)) as QueueItem[] | undefined) ?? []
  } catch {
    return []
  }
}

async function saveQueue(q: QueueItem[]) {
  try {
    await set(KEY, q)
  } catch {
    /* storage unavailable; nothing else to do */
  }
}

export async function enqueue(item: Omit<QueueItem, 'queuedAt'>): Promise<QueueItem[]> {
  const q = await getQueue()
  if (!q.some((x) => x.id === item.id)) q.push({ ...item, queuedAt: Date.now() })
  await saveQueue(q)
  return q
}

export async function discardQueued(id: string): Promise<QueueItem[]> {
  const q = (await getQueue()).filter((x) => x.id !== id)
  await saveQueue(q)
  return q
}

export function isNetworkError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return !err.code && /failed to fetch|network|load failed|fetch/i.test(err.message ?? '')
}

export async function flushQueue(): Promise<{ synced: number; queue: QueueItem[] }> {
  let q = (await getQueue()).sort((a, b) => RANK[a.table] - RANK[b.table] || a.queuedAt - b.queuedAt)
  let synced = 0
  const remaining: QueueItem[] = []
  let offline = false
  for (const item of q) {
    if (offline) {
      remaining.push(item)
      continue
    }
    if (item.error) {
      remaining.push(item) // needs the user's attention; do not retry blindly
      continue
    }
    const { error } = await supabase
      .from(item.table)
      .upsert(item.row, { onConflict: 'user_id,client_id', ignoreDuplicates: true })
    if (!error) {
      synced++
    } else if (isNetworkError(error)) {
      offline = true
      remaining.push(item)
    } else {
      remaining.push({ ...item, error: error.message })
    }
  }
  await saveQueue(remaining)
  q = remaining
  return { synced, queue: q }
}
