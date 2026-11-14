import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { call, clearJoinToken, readJoinToken } from '../lib/biz'
import { useAccount } from '../lib/account'
import { useAuth } from '../lib/auth'

/** Customer opens a business's general link and asks to connect. Only a name is asked for, never a phone number. */
export default function Join() {
  const nav = useNavigate()
  const { type } = useAccount()
  const { signOut, user } = useAuth()
  const [token] = useState(() => readJoinToken() ?? '')
  const [name, setName] = useState(String((user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  if (type !== 'customer') return (
    <div className="card space-y-3"><p className="font-bold">Customer account needed</p>
      <p className="text-sm">Only a customer account can connect to a business this way. This account is a business account. Sign out and create a customer account with a different email.</p>
      <button className="btn-secondary w-full" onClick={() => { signOut() }}>Sign out</button></div>
  )
  if (!token) return (
    <div className="card space-y-3"><p className="font-bold">This link cannot be used</p>
      <p className="text-sm">Ask the business to send you its link again.</p>
      <button className="btn-secondary w-full" onClick={() => nav('/', { replace: true })}>Continue to OweWise</button></div>
  )
  if (sent) return (
    <div className="card space-y-3">
      <p className="text-lg font-bold">Request sent to {sent}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">The business will confirm who you are and send a 6-digit code to your phone on WhatsApp. When it arrives, open OweWise and type it on the home screen. Until then you will not see anything from them.</p>
      <button className="btn-primary w-full" onClick={() => nav('/', { replace: true })}>Go to OweWise</button>
    </div>
  )

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (!name.trim()) return setErr('Enter your name.')
    setBusy(true)
    const r = await call<{ business_name: string; status: string }>('request_join', { p_token: token, p_name: name.trim() })
    setBusy(false)
    if (r.error || !r.data) return setErr(r.error ?? 'Could not send the request.')
    clearJoinToken()
    setSent(r.data.business_name)
  }

  return (
    <form onSubmit={submit} className="card space-y-3" noValidate>
      <p className="text-lg font-bold">Connect with a business on OweWise</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">Type your name the way the business knows you. They will confirm it is you and send a code to your phone on WhatsApp. You do not need to enter your phone number.</p>
      <label className="block"><span className="label">Your name</span>
        <input className="input" maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Ask to connect'}</button>
      <button type="button" className="block w-full text-center text-sm text-slate-500 underline" onClick={() => { clearJoinToken(); nav('/', { replace: true }) }}>Not now</button>
    </form>
  )
}
