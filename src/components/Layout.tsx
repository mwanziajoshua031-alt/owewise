import { useEffect, useState, createContext, useContext } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { Home, ListChecks, Wallet, CalendarDays, BarChart3, Settings, Plus, Bell, WifiOff, CloudUpload, Receipt } from 'lucide-react'
import { useStore } from '../lib/store'
import { AddDebtModal, AddPaymentModal } from './forms'
import { Banner, BrandMark } from './ui'
import { StaffInviteBanner } from './staff'
import { useUnread } from '../lib/unread'

type UI = { addDebt: (creditorId?: string) => void; addPayment: (debtId?: string) => void }
const UICtx = createContext<UI>({ addDebt: () => {}, addPayment: () => {} })
export const useUI = () => useContext(UICtx)

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/debts', label: 'Debts', icon: ListChecks },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout() {
  const { profile, notifications, stale, online, queue, retryQueue } = useStore()
  const [debtModal, setDebtModal] = useState<{ creditorId?: string } | null>(null)
  const [payModal, setPayModal] = useState<{ debtId?: string } | null>(null)
  const unread = notifications.filter((n) => !n.read_at).length
  const { total: unreadMsgs } = useUnread()
  const failed = queue.filter((q) => q.error).length

  // Theme: follow the saved profile choice, else the system.
  useEffect(() => {
    const pref = profile?.theme ?? 'system'
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [profile?.theme])

  return (
    <UICtx.Provider value={{ addDebt: (creditorId) => setDebtModal({ creditorId }), addPayment: (debtId) => setPayModal({ debtId }) }}>
      <div className="mx-auto flex min-h-full max-w-5xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-navy-900 md:flex">
          <div className="mb-4 flex items-center gap-2 text-lg font-extrabold text-navy-900 dark:text-white">
            <BrandMark className="h-8 w-8 rounded-lg" /> OweWise
          </div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-600/10 text-brand-700 dark:text-brand-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'}`}>
              <n.icon className="h-5 w-5" /> {n.label}{n.to === '/bills' && unreadMsgs > 0 ? <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs text-white">{unreadMsgs}</span> : null}
            </NavLink>
          ))}
          <button className="btn-primary mt-4" onClick={() => setDebtModal({})}><Plus className="h-4 w-4" /> Add debt</button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-navy-900/90 md:hidden">
            <span className="flex items-center gap-2 font-extrabold text-navy-900 dark:text-white">
              <BrandMark className="h-7 w-7 rounded-lg" /> OweWise
            </span>
            <Link to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative rounded-full p-2">
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500" />}
            </Link>
          </header>

          <main className="flex-1 space-y-3 px-4 pb-32 pt-4 md:pb-10">
            {(!online || stale) && (
              <Banner tone="warn">
                <span className="flex items-center gap-2"><WifiOff className="h-4 w-4" /> Offline. You are seeing data last saved on this device. New debts and payments will sync when you reconnect.</span>
              </Banner>
            )}
            {queue.length > 0 && (
              <Banner tone={failed ? 'warn' : 'info'}>
                <span className="flex flex-wrap items-center gap-2">
                  <CloudUpload className="h-4 w-4" /> {queue.length} item{queue.length > 1 ? 's' : ''} waiting to sync{failed ? `, ${failed} need attention` : ''}.
                  <Link to="/settings" className="font-semibold underline">Review</Link>
                  <button className="font-semibold underline" onClick={retryQueue}>Retry</button>
                </span>
              </Banner>
            )}
            <StaffInviteBanner />
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom nav + prominent Add Debt */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-white/10 dark:bg-navy-900 md:hidden">
        <button
          aria-label="Add debt"
          onClick={() => setDebtModal({})}
          className="absolute -top-7 left-1/2 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-slate-50 dark:ring-navy-950"
        >
          <Plus className="h-7 w-7" />
        </button>
        <ul className="grid grid-cols-7">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'}`}>
                <span className="relative"><n.icon className="h-5 w-5" />{n.to === '/bills' && unreadMsgs > 0 ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" /> : null}</span> {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {debtModal && <AddDebtModal creditorId={debtModal.creditorId} onClose={() => setDebtModal(null)} />}
      {payModal && <AddPaymentModal debtId={payModal.debtId} onClose={() => setPayModal(null)} />}
    </UICtx.Provider>
  )
}
