import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLoad } from '../lib/biz'
import { EnableAlerts } from '../lib/unread'
import { Empty, ErrorBox, fmtDate, PageHeader, Spinner } from '../components/ui'

type N = { id: string; title: string; body: string | null; read_at: string | null; created_at: string; business_debt_id: string | null }

/** Alerts for business accounts (customers use the personal-tracker alerts page). */
export default function Alerts() {
  const { data, loading, error, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('notifications').select('id,title,body,read_at,created_at,business_debt_id').order('created_at', { ascending: false }).limit(100)
    if (error) throw new Error(error.message)
    return (data ?? []) as N[]
  }, [])
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />
  const unread = data.filter((n) => !n.read_at).length
  return (
    <>
      <PageHeader title="Alerts" right={unread > 0 && <button className="text-sm font-semibold underline" onClick={async () => { await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null); reload() }}>Mark all read</button>} />
      <EnableAlerts />
      {data.length === 0 ? <Empty title="No alerts" hint="Payments, disputes and customer messages show up here." /> : (
        <ul className="space-y-2">
          {data.map((n) => (
            <li key={n.id} className={`card ${n.read_at ? 'opacity-70' : 'border-l-4 border-l-brand-500'}`}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{n.title}</p>{n.body && <p className="text-sm text-slate-600 dark:text-slate-300">{n.body}</p>}<p className="mt-1 text-xs text-slate-500">{fmtDate(n.created_at)}</p></div>
                {!n.read_at && <button className="shrink-0 text-xs font-semibold underline" onClick={async () => { await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id); reload() }}>Read</button>}
              </div>
              {n.business_debt_id && <Link className="mt-1 inline-block text-xs font-semibold text-brand-700 dark:text-brand-400" to={`/debts/${n.business_debt_id}`}>View debt</Link>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
