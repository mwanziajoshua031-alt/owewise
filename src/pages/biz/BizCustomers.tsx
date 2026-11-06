import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { loadDebts, useLoad } from '../../lib/biz'
import { formatMoney } from '../../lib/money'
import { Empty, ErrorBox, PageHeader, Spinner } from '../../components/ui'

export default function BizCustomers() {
  const { data, loading, error, reload } = useLoad(async () => {
    const [c, d] = await Promise.all([supabase.from('business_customers').select('id,name,phone,customer_user_id').order('name'), loadDebts()])
    if (c.error) throw new Error(c.error.message)
    return { customers: c.data ?? [], debts: d }
  }, [])
  if (loading) return <Spinner />
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />
  return (
    <>
      <PageHeader title="Customers" />
      {data.customers.length === 0 ? <Empty title="No customers yet" hint="Customers are added automatically when you send a debt request." /> : (
        <ul className="space-y-2">
          {data.customers.map((c) => {
            const mine = data.debts.filter((d) => d.business_customer_id === c.id && d.status !== 'cancelled')
            const owed: Record<string, number> = {}
            mine.forEach((d) => { owed[d.currency] = (owed[d.currency] ?? 0) + d.outstanding })
            return (
              <li key={c.id} className="card">
                <div className="flex justify-between gap-2">
                  <div><p className="font-semibold">{c.name}</p><p className="text-xs text-slate-500">{c.phone} · {c.customer_user_id ? 'Linked to an OweWise account' : 'Not linked yet'}</p></div>
                  <div className="text-right text-sm font-bold">{Object.entries(owed).map(([cur, v]) => <span key={cur} className="block">{formatMoney(v, cur)}</span>)}</div>
                </div>
                {mine.length > 0 && <div className="mt-1 flex flex-wrap gap-x-3 text-xs">{mine.slice(0, 5).map((d) => <Link key={d.id} className="font-semibold text-brand-700 underline dark:text-brand-400" to={`/debts/${d.id}`}>{d.description.slice(0, 24)}</Link>)}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
