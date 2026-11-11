import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { call, useLoad, type MyInvite, type StaffInvite, type StaffMember } from '../lib/biz'
import { useAccount } from '../lib/account'
import { Banner, fmtDate, Modal } from './ui'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Owner only (Settings): invite staff by email, revoke pending invites, remove staff. */
export function StaffManager() {
  const { business } = useAccount()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [removing, setRemoving] = useState<StaffMember | null>(null)
  const [actionErr, setActionErr] = useState('')
  const { data, loading, error, reload } = useLoad(async () => {
    const [m, i] = await Promise.all([
      call<StaffMember[]>('list_staff', {}),
      supabase.from('business_invites').select('id,email,expires_at').eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
    ])
    if (m.error) throw new Error(m.error)
    if (i.error) throw new Error('Could not load invitations.')
    return { staff: m.data ?? [], invites: (i.data ?? []) as StaffInvite[] }
  }, [])

  async function invite(e: FormEvent) {
    e.preventDefault(); setMsg(null); setActionErr('')
    const v = email.trim().toLowerCase()
    if (!EMAIL_RE.test(v)) return setMsg({ ok: false, t: 'Enter a valid email address.' })
    setBusy(true)
    const r = await call('invite_staff', { p_email: v })
    setBusy(false)
    if (r.error) return setMsg({ ok: false, t: r.error })
    setEmail('')
    setMsg({ ok: true, t: `Invitation ready for ${v}. OweWise does not email it yet, so tell them yourself.` })
    reload()
  }

  const shareText = `I have invited you to work at ${business?.name ?? 'my business'} on OweWise. Create a free customer account at ${window.location.origin} with this same email, confirm your email, then tap Accept on the home screen.`

  return (
    <section className="card space-y-3">
      <h2 className="font-bold">Staff</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">Staff can add customers and debts, record payments and send reminders. They cannot see reports or change settings, M-Pesa, credit limits, reversals or cancellations. Every action they take is recorded with their name. Working alone? You do not need to do anything here.</p>
      <form onSubmit={invite} className="space-y-2" noValidate>
        <label className="block"><span className="label">Staff member's email</span>
          <input className="input" type="email" inputMode="email" autoComplete="off" maxLength={254} placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {msg && <p className={msg.ok ? 'text-sm text-green-700 dark:text-green-400' : 'err'} role="status">{msg.t}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Inviting…' : 'Invite staff'}</button>
      </form>
      {msg?.ok && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5">
          <p className="text-xs text-slate-500">Message you can send them (WhatsApp, SMS…):</p>
          <p>{shareText}</p>
          <button className="btn-secondary w-full" type="button" onClick={() => navigator.clipboard?.writeText(shareText)}>Copy message</button>
        </div>
      )}
      {loading && !data && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <Banner tone="warn">{error}</Banner>}
      {data && data.invites.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Waiting to accept</h3>
          <ul className="space-y-1">
            {data.invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2 text-sm dark:border-white/10">
                <span className="min-w-0"><span className="block truncate">{i.email}</span><span className="block text-xs text-slate-500">Expires {fmtDate(i.expires_at)}</span></span>
                <button className="shrink-0 text-xs font-semibold text-red-600 underline" onClick={async () => {
                  setActionErr('')
                  const r = await call('revoke_staff_invite', { p_invite: i.id })
                  if (r.error) return setActionErr(r.error)
                  reload()
                }}>Cancel</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data && data.staff.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Your staff</h3>
          <ul className="space-y-1">
            {data.staff.map((s) => (
              <li key={s.user_id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2 text-sm dark:border-white/10">
                <span className="min-w-0"><span className="block truncate">{s.email}</span><span className="block text-xs text-slate-500">Joined {fmtDate(s.joined_at)}</span></span>
                <button className="shrink-0 text-xs font-semibold text-red-600 underline" onClick={() => setRemoving(s)}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {actionErr && <p className="err" role="alert">{actionErr}</p>}
      {removing && (
        <Modal title="Remove staff member" onClose={() => setRemoving(null)}>
          <div className="space-y-3 text-sm">
            <p>{removing.email} will lose access to {business?.name ?? 'your business'} straight away. What they already recorded stays in your records.</p>
            <button className="btn-danger w-full" onClick={async () => {
              const r = await call('remove_staff', { p_user: removing.user_id })
              setRemoving(null)
              if (r.error) return setActionErr(r.error)
              reload()
            }}>Remove access</button>
          </div>
        </Modal>
      )}
    </section>
  )
}

/** Shown on a customer's home screen when a business has invited their (confirmed) email as staff. */
export function StaffInviteBanner() {
  const { reload: reloadAccount } = useAccount()
  const { data } = useLoad(async () => (await call<MyInvite[]>('my_staff_invites', {})).data ?? [], [])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  if (!data || data.length === 0) return null
  return (
    <div className="space-y-2">
      {data.map((inv) => (
        <div key={inv.id} className="card space-y-2 border-l-4 border-l-brand-600">
          <p className="font-bold">{inv.business_name} invited you to join as staff</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">Staff can add customers and debts, record payments and send reminders for the business. While you work there, OweWise shows the business screens instead of your personal tracker. You can stop at any time in Settings.</p>
          <button className="btn-primary w-full" disabled={busy === inv.id} onClick={async () => {
            setErr(''); setBusy(inv.id)
            const r = await call('accept_staff_invite', { p_invite: inv.id })
            setBusy(null)
            if (r.error) return setErr(r.error)
            reloadAccount()
          }}>{busy === inv.id ? 'Joining…' : 'Accept invitation'}</button>
        </div>
      ))}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  )
}
