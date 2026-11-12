import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { download } from '../../lib/derive'
import { useAccount } from '../../lib/account'
import { call, friendly, useIsAdmin, useLoad } from '../../lib/biz'
import { Banner, Field, Modal, PageHeader } from '../../components/ui'
import { StaffManager } from '../../components/staff'
import { BranchManager } from '../../components/branches'

type MStatus = { configured: boolean; enabled?: boolean; environment?: string; account_type?: string; shortcode?: string; till_number?: string | null }

function MpesaCard() {
  const { data: st, reload } = useLoad(async () => (await call<MStatus>('my_mpesa_status', {})).data ?? { configured: false }, [])
  const [f, setF] = useState({ environment: 'sandbox', account_type: 'paybill', shortcode: '', till_number: '', key: '', secret: '', passkey: '' })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function save(e: FormEvent) {
    e.preventDefault(); setMsg(null); setBusy(true)
    const { data, error } = await supabase.functions.invoke('mpesa-settings', { body: f })
    setBusy(false)
    if (error) {
      let body = ''
      try { body = JSON.stringify(await (error as { context?: Response }).context?.json()) } catch { /* ignore */ }
      return setMsg({ ok: false, t: body ? friendly(body) : 'Could not reach the server. Please try again.' })
    }
    if (!(data as { ok?: boolean })?.ok) return setMsg({ ok: false, t: 'Could not save. Please try again.' })
    setF({ ...f, key: '', secret: '', passkey: '' }); setOpen(false); setMsg({ ok: true, t: 'Saved. Credentials were verified with Safaricom and stored encrypted.' }); reload()
  }
  return (
    <section className="card space-y-3">
      <h2 className="font-bold">M-Pesa payments</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">Customers pay straight into <b>your</b> Paybill or Till through an M-Pesa prompt on their phone. OweWise never holds the money. You need your own Safaricom Daraja app credentials (from developer.safaricom.co.ke).</p>
      {st?.configured ? (
        <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5">
          <p><b>{st.account_type === 'till' ? 'Till' : 'Paybill'} {st.shortcode}</b> · {st.environment === 'sandbox' ? 'Sandbox (test money only)' : 'Live'} · {st.enabled ? 'On' : 'Off'}</p>
          <div className="mt-2 flex gap-3 text-xs font-semibold">
            <button className="underline" onClick={async () => { await call('set_mpesa_enabled', { p_enabled: !st.enabled }); reload() }}>{st.enabled ? 'Turn off' : 'Turn on'}</button>
            <button className="underline" onClick={() => setOpen(!open)}>Replace credentials</button>
          </div>
        </div>
      ) : <Banner>Not set up yet. Until you add credentials, customers cannot pay you by M-Pesa in the app (you can still record cash payments).</Banner>}
      {(open || !st?.configured) && (
        <form onSubmit={save} className="space-y-3" autoComplete="off">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Environment"><select className="input" value={f.environment} onChange={(e) => set('environment', e.target.value)}><option value="sandbox">Sandbox (testing)</option><option value="production">Production (real money)</option></select></Field>
            <Field label="Account type"><select className="input" value={f.account_type} onChange={(e) => set('account_type', e.target.value)}><option value="paybill">Paybill</option><option value="till">Till (Buy Goods)</option></select></Field>
          </div>
          <Field label={f.account_type === 'till' ? 'Store / head-office number' : 'Paybill number'}><input className="input" inputMode="numeric" value={f.shortcode} onChange={(e) => set('shortcode', e.target.value)} /></Field>
          {f.account_type === 'till' && <Field label="Till number (if different)"><input className="input" inputMode="numeric" value={f.till_number} onChange={(e) => set('till_number', e.target.value)} /></Field>}
          <Field label="Consumer key"><input className="input" type="password" autoComplete="off" value={f.key} onChange={(e) => set('key', e.target.value)} /></Field>
          <Field label="Consumer secret"><input className="input" type="password" autoComplete="off" value={f.secret} onChange={(e) => set('secret', e.target.value)} /></Field>
          <Field label="Passkey"><input className="input" type="password" autoComplete="off" value={f.passkey} onChange={(e) => set('passkey', e.target.value)} /></Field>
          <p className="text-xs text-slate-500">These are checked with Safaricom, then encrypted on the server. They are never shown again.</p>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Checking with Safaricom…' : 'Verify and save'}</button>
        </form>
      )}
      {msg && <p className={msg.ok ? 'text-sm text-green-700 dark:text-green-400' : 'err'} role="status">{msg.t}</p>}
    </section>
  )
}

function CloseAccount() {
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const [err, setErr] = useState('')
  return (
    <>
      <button className="w-full text-center text-xs text-red-600 underline" onClick={() => setOpen(true)}>Close my business account</button>
      {open && (
        <Modal title="Close business account" onClose={() => setOpen(false)}>
          <div className="space-y-3 text-sm">
            <p>This removes your login, business profile, contact details and M-Pesa credentials. You can only do it when no debts are unpaid and no payment is in progress.</p>
            <p className="text-slate-500">Debt and payment records are kept without your name, because your customers and the tax and audit rules need them to stay accurate. Download your data first if you want a copy.</p>
            <input className="input" aria-label="Type CLOSE to confirm" placeholder="Type CLOSE to confirm" value={word} onChange={(e) => setWord(e.target.value)} />
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn-danger w-full" disabled={word !== 'CLOSE'} onClick={async () => {
              const r = await call('delete_my_account', {})
              if (r.error) return setErr(r.error)
              await signOut()
            }}>Close account permanently</button>
          </div>
        </Modal>
      )}
    </>
  )
}

function OwnerSettings() {
  const isAdmin = useIsAdmin()
  const { signOut, user } = useAuth()
  const { business, reload } = useAccount()
  const [f, setF] = useState({ name: business?.name ?? '', owner_name: business?.owner_name ?? '', phone: business?.phone ?? '', email: business?.email ?? '', category: business?.category ?? '', location: business?.location ?? '' })
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function save(e: FormEvent) {
    e.preventDefault()
    if (f.name.trim().length < 2) return setMsg({ ok: false, t: 'Enter your business name' })
    const { error } = await supabase.from('businesses').update({ name: f.name.trim(), owner_name: f.owner_name.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null, category: f.category.trim() || null, location: f.location.trim() || null }).eq('id', business!.id)
    if (error) return setMsg({ ok: false, t: 'Could not save. Check the details and try again.' })
    setMsg({ ok: true, t: 'Saved' }); reload()
  }
  return (
    <>
      <PageHeader title="Settings" />
      <form onSubmit={save} className="card space-y-3">
        <h2 className="font-bold">Business profile</h2>
        <Field label="Business name"><input className="input" maxLength={120} value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Owner name"><input className="input" maxLength={120} value={f.owner_name} onChange={(e) => set('owner_name', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Category"><input className="input" maxLength={60} value={f.category} onChange={(e) => set('category', e.target.value)} /></Field>
          <Field label="Location"><input className="input" maxLength={120} value={f.location} onChange={(e) => set('location', e.target.value)} /></Field>
        </div>
        <Field label="Business phone"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Business email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        {msg && <p className={msg.ok ? 'text-sm text-green-700' : 'err'} role="status">{msg.t}</p>}
        <button className="btn-primary w-full">Save</button>
      </form>
      {isAdmin && <Link to="/admin" className="card block text-sm font-semibold text-brand-700 underline dark:text-brand-400">Open admin panel</Link>}
      <BranchManager />
      <StaffManager />
      <MpesaCard />
      <section className="card space-y-2 text-sm">
        <h2 className="font-bold">Account</h2>
        <p className="text-slate-500">Signed in as {user?.email}</p>
        <button className="btn-secondary w-full" onClick={async () => {
          const { data, error } = await supabase.rpc('export_my_data')
          if (!error) download('owewise-business-data.json', JSON.stringify(data, null, 2), 'application/json')
        }}>Download all my data (JSON)</button>
        <button className="btn-secondary w-full" onClick={() => signOut()}>Sign out</button>
        <CloseAccount />
        <p className="text-xs text-slate-500"><Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/terms">Terms</Link></p>
      </section>
    </>
  )
}

function StaffSettings() {
  const { signOut, user } = useAuth()
  const { business, reload } = useAccount()
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  return (
    <>
      <PageHeader title="Settings" />
      <section className="card space-y-2 text-sm">
        <h2 className="font-bold">Your role</h2>
        <p>You work for <b>{business?.name}</b> as staff. You can add customers and debts, record payments and send reminders. The owner manages reports, M-Pesa, credit limits and the other settings.</p>
        <p className="text-slate-500">Signed in as {user?.email}</p>
      </section>
      <section className="card space-y-2 text-sm">
        <h2 className="font-bold">Account</h2>
        <button className="btn-secondary w-full" onClick={() => signOut()}>Sign out</button>
        <button className="w-full text-center text-xs text-red-600 underline" onClick={() => setOpen(true)}>Stop working for this business</button>
        <p className="text-xs text-slate-500"><Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/terms">Terms</Link></p>
      </section>
      {open && (
        <Modal title="Stop working for this business" onClose={() => setOpen(false)}>
          <div className="space-y-3 text-sm">
            <p>You will lose access to {business?.name}. What you recorded stays in the business's records. Your own account stays, and you will see your personal tracker again.</p>
            {err && <p className="err" role="alert">{err}</p>}
            <button className="btn-danger w-full" onClick={async () => {
              const r = await call('leave_business', {})
              if (r.error) return setErr(r.error)
              reload()
            }}>Stop working here</button>
          </div>
        </Modal>
      )}
    </>
  )
}

export default function BizSettings() {
  const { role } = useAccount()
  return role === 'staff' ? <StaffSettings /> : <OwnerSettings />
}
