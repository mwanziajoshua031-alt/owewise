import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { TERMS_VERSION } from './legal'

type AuthCtx = {
  session: Session | null
  user: User | null
  loading: boolean
  recovery: boolean
  signUp: (email: string, password: string, fullName: string, extra?: Record<string, string>) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    loading,
    recovery,
    async signUp(email, password, fullName, extra = {}) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        // Record when and to which version of the terms the user agreed.
        options: {
          data: { ...extra, full_name: fullName, terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION },
          emailRedirectTo: window.location.origin,
        },
      })
      return error?.message ?? null
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error?.message ?? null
    },
    async signOut() {
      await supabase.auth.signOut()
    },
    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      return error?.message ?? null
    },
    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password })
      if (!error) setRecovery(false)
      return error?.message ?? null
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
