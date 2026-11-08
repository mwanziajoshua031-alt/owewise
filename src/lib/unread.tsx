import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

type Ctx = { counts: Record<string, number>; total: number; refresh: () => void; permission: NotificationPermission | 'unsupported'; enable: () => Promise<void> }
const U = createContext<Ctx>({ counts: {}, total: 0, refresh: () => {}, permission: 'unsupported', enable: async () => {} })
export const useUnread = () => useContext(U)

const supported = typeof window !== 'undefined' && 'Notification' in window

/**
 * Tracks unread messages and disputes from the other side, per debt.
 * Checks every 30 seconds and whenever the app comes back to the foreground. If the person allowed
 * notifications and the app is in the background, it also shows a phone/desktop notification.
 * (It cannot reach a phone when the app is fully closed: that needs email/SMS/push delivery.)
 */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(supported ? Notification.permission : 'unsupported')
  const last = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('unread_counts')
    if (error || !Array.isArray(data)) return
    const map: Record<string, number> = {}
    let total = 0
    for (const r of data as { debt_id: string; n: number }[]) { map[r.debt_id] = Number(r.n); total += Number(r.n) }
    setCounts(map)
    try { const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }; if (total) nav.setAppBadge?.(total); else nav.clearAppBadge?.() } catch { /* not supported */ }
    if (last.current !== null && total > last.current && document.hidden && supported && Notification.permission === 'granted') {
      try { new Notification('OweWise', { body: `You have ${total} new message${total === 1 ? '' : 's'} to read.`, tag: 'owewise-unread' }) } catch { /* ignore */ }
    }
    last.current = total
  }, [])

  useEffect(() => {
    refresh()
    const t = window.setInterval(refresh, 30000)
    const v = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', v)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', v) }
  }, [refresh])

  const enable = useCallback(async () => {
    if (!supported) return
    setPermission(await Notification.requestPermission())
  }, [])

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return <U.Provider value={{ counts, total, refresh, permission, enable }}>{children}</U.Provider>
}

export function NewBadge({ n }: { n: number | undefined }) {
  if (!n) return null
  return <span className="ml-1 inline-flex shrink-0 items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white" aria-label={`${n} new`}>{n} new</span>
}

/** Offer to turn on phone alerts (only shown when it can help). */
export function EnableAlerts() {
  const { permission, enable } = useUnread()
  if (permission === 'unsupported' || permission === 'granted') return null
  if (permission === 'denied') return <p className="text-xs text-slate-500">Phone alerts are blocked in your browser settings for this site.</p>
  return (
    <div className="card flex items-center justify-between gap-3">
      <p className="text-sm">Get an alert on this device when someone sends you a message.</p>
      <button className="btn-secondary shrink-0" onClick={enable}>Turn on</button>
    </div>
  )
}
