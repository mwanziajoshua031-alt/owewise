import { createContext, useContext, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useLoad, type Business } from './biz'

type Acct = { type: 'customer' | 'business'; business: Business | null; fullName: string | null; phone: string | null; reload: () => void }
const Ctx = createContext<Acct | null>(null)

export function AccountProvider({ children, fallback, failed }: { children: ReactNode; fallback: ReactNode; failed: (retry: () => void, msg: string) => ReactNode }) {
  const { data, loading, error, reload } = useLoad(async () => {
    const p = await supabase.from('profiles').select('account_type,full_name,phone').maybeSingle()
    if (p.error) throw new Error(p.error.message)
    let business: Business | null = null
    if (p.data?.account_type === 'business') {
      const b = await supabase.from('businesses').select('id,name,owner_name,phone,email,category,location,status').maybeSingle()
      if (b.error) throw new Error(b.error.message)
      business = b.data as Business | null
    }
    return { type: (p.data?.account_type ?? 'customer') as 'customer' | 'business', business, fullName: p.data?.full_name ?? null, phone: p.data?.phone ?? null }
  }, [])
  if (loading) return <>{fallback}</>
  if (error || !data) return <>{failed(reload, error)}</>
  return <Ctx.Provider value={{ ...data, reload }}>{children}</Ctx.Provider>
}

export function useAccount(): Acct {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAccount outside AccountProvider')
  return c
}
