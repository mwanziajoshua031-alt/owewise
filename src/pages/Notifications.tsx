import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Empty, PageHeader, Spinner, fmtDate } from '../components/ui'

export default function Notifications() {
  const { loading, notifications, refresh } = useStore()
  if (loading) return <Spinner />
  const unread = notifications.filter((n) => !n.read_at)

  async function markAll() {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    await refresh()
  }
  async function mark(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    await refresh()
  }

  return (
    <>
      <PageHeader title="Alerts" right={unread.length > 0 && <button className="text-sm font-semibold underline" onClick={markAll}>Mark all read</button>} />
      {notifications.length === 0 ? (
        <Empty title="No alerts" hint="You will see reminders and overdue notices here." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id} className={`card ${n.read_at ? 'opacity-70' : 'border-l-4 border-l-brand-500'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{n.title}</p>
                  {n.body && <p className="text-sm text-slate-600 dark:text-slate-300">{n.body}</p>}
                  <p className="mt-1 text-xs text-slate-500">{fmtDate(n.created_at)}</p>
                </div>
                {!n.read_at && <button className="shrink-0 text-xs font-semibold underline" onClick={() => mark(n.id)}>Read</button>}
              </div>
              {n.debt_id && <Link className="mt-1 inline-block text-xs font-semibold text-brand-700 dark:text-brand-400" to={`/debts/${n.debt_id}`}>View debt</Link>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
