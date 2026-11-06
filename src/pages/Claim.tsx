import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { call, clearClaimToken, readClaimToken, useLoad } from '../lib/biz'
import { supabase } from '../lib/supabase'
import { useAccount } from '../lib/account'
import { useAuth } from '../lib/auth'
import { Spinner } from '../components/ui'

/** Customer opens a private link from a business and attaches the request to their account. */
export default function Claim() {
  const nav = useNavigate()
  const { type } = useAccount()
  const { signOut } = useAuth()
  const token = readClaimToken() ?? ''
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { data, loading } = useLoad(async () => {
    const { data } = await supabase.rpc('peek_claim', { p_token: token })
    return data as { valid: boolean; business_name?: string } | null
  }, [token])
  if (loading) return <Spinner />

  if (type !== 'customer') return (
    <div className="card space-y-3"><p className="font-bold">Customer account needed</p>
      <p className="text-sm">Debt requests can only be claimed by a customer account. This account is a business account. Sign out and create a customer account with a different email.</p>
      <button className="btn-secondary w-full" onClick={() => { signOut() }}>Sign out</button></div>
  )
  if (!data?.valid) return (
    <div className="card space-y-3"><p className="font-bold">This link cannot be used</p>
      <p className="text-sm">It may have expired or been used already. Ask the business to send you a new link.</p>
      <button className="btn-secondary w-full" onClick={() => { clearClaimToken(); nav('/', { replace: true }) }}>Continue to OweWise</button></div>
  )
  return (
    <div className="card space-y-3">
      <p className="text-lg font-bold">{data.business_name} sent you a debt request</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">Link it to your account to see the details. You can then confirm it or dispute it. Nothing is paid until you choose to pay.</p>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn-primary w-full" disabled={busy} onClick={async () => {
        setBusy(true)
        const r = await call<string>('claim_debt', { p_token: token })
        setBusy(false)
        if (r.error) return setErr(r.error)
        clearClaimToken()
        nav(`/bills/${r.data}`, { replace: true })
      }}>{busy ? 'Linking…' : 'View this request'}</button>
    </div>
  )
}
