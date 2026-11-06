import { Fragment, useEffect } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { Home, ListChecks, Users, Bell, Settings, Plus } from 'lucide-react'
import { useAccount } from '../../lib/account'
import { supabase } from '../../lib/supabase'
import { useLoad } from '../../lib/biz'
import { Banner } from '../../components/ui'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/debts', label: 'Debts', icon: ListChecks },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function BizLayout() {
  const { business } = useAccount()
  const { data: unread } = useLoad(async () => {
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
    return count ?? 0
  }, [])
  useEffect(() => { document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches) }, [])
  return (
    <>
      <div className="mx-auto flex min-h-full max-w-5xl">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-navy-900 md:flex">
          <div className="mb-4 flex items-center gap-2 text-lg font-extrabold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">O</span> OweWise</div>
          <p className="mb-2 truncate text-xs font-semibold text-slate-500">{business?.name}</p>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-600/10 text-brand-700 dark:text-brand-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'}`}>
              <n.icon className="h-5 w-5" /> {n.label}{n.to === '/notifications' && unread ? <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs text-white">{unread}</span> : null}
            </NavLink>
          ))}
          <Link to="/new" className="btn-primary mt-4"><Plus className="h-4 w-4" /> Send debt request</Link>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-navy-900/90 md:hidden">
            <span className="flex items-center gap-2 font-extrabold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white">O</span> <span className="truncate">{business?.name ?? 'OweWise'}</span></span>
          </header>
          <main className="flex-1 space-y-3 px-4 pb-32 pt-4 md:pb-10">
            {business?.status === 'suspended' && <Banner tone="warn">This business account is suspended. You cannot send new requests. Contact support.</Banner>}
            <Outlet />
          </main>
        </div>
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-white/10 dark:bg-navy-900 md:hidden">
        <Link to="/new" aria-label="Send debt request" className="absolute -top-7 left-1/2 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-slate-50 dark:ring-navy-950"><Plus className="h-7 w-7" /></Link>
        <ul className="grid grid-cols-6">
          {NAV.map((n, i) => (
            <Fragment key={n.to}>
            {i === 2 && <li aria-hidden />}
            <li>
              <NavLink to={n.to} end={n.end} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'}`}>
                <n.icon className="h-5 w-5" /> {n.label}
                {n.to === '/notifications' && unread ? <span className="absolute right-3 top-1 h-2.5 w-2.5 rounded-full bg-red-500" /> : null}
              </NavLink>
            </li>
            </Fragment>
          ))}
        </ul>
      </nav>
    </>
  )
}
