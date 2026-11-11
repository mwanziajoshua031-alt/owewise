import { createContext, useContext, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useLoad, type Business } from './biz'

/** role: 'owner' runs the business, 'staff' works for it, null = a normal customer account. */
type Acct = { type: 'customer' | 'business'; role: 'owner' | 'staff' | null; business: Business | null; fullName: string | null; phone: string | null; reload: () => void }
const Ctx = createContext<Acct | null>(null)

const BIZ_COLS = 'id,name,owner_name,phone,email,category,location,status'

export function AccountProvider({ children, fallback, failed }: { children: ReactNode; fallback: ReactNode; failed: (retry: () => void, msg: string) => ReactNode }) {
  const { user } = useAuth()
  const uid = user?.id
  const { data, loading, error, reload } = useLoad(async () => {
    if (!uid) throw new Error('Please sign in again.')
    const p = await supabase.from('profiles').select('account_type,full_name,phone').maybeSingle()
    if (p.error) throw new Error(p.error.message)
    let type = (p.data?.account_type ?? 'customer') as 'customer' | 'business'
    let role: 'owner' | 'staff' | null = null
    let business: Business | null = null
    if (type === 'business') {
      const b = await supabase.from('businesses').select(BIZ_COLS).eq('owner_id', uid).maybeSingle()
      if (b.error) throw new Error(b.error.message)
      business = b.data as Business | null
      role = 'owner'
    } else {
      // A customer account that was added as staff works inside that business.
      const m = await supabase.from('business_members').select('business_id').eq('user_id', uid).maybeSingle()
      if (m.error) throw new Error(m.error.message)
      if (m.data) {
        const b = await supabase.from('businesses').select(BIZ_COLS).eq('id', m.data.business_id).maybeSingle()
        if (b.error) throw new Error(b.error.message)
        if (b.data) { business = b.data as Business; type = 'business'; role = 'staff' }
      }
    }
    return { type, role, business, fullName: p.data?.full_name ?? null, phone: p.data?.phone ?? null }
  }, [uid])
  if (loading) return <>{fallback}</>
  if (error || !data) return <>{failed(reload, error)}</>
  return <Ctx.Provider value={{ ...data, reload }}>{children}</Ctx.Provider>
}

export function useAccount(): Acct {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAccount outside AccountProvider')
  return c
}
