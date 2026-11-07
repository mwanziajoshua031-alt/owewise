import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useAccount } from '../../lib/account'
import { CONTACT_EMAIL } from '../../lib/legal'
import { call, friendly, useLoad } from '../../lib/biz'
import { Banner, Field, PageHeader } from '../../components/ui'

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

export default function BizSettings() {
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
      <MpesaCard />
      <section className="card space-y-2 text-sm">
        <h2 className="font-bold">Account</h2>
        <p className="text-slate-500">Signed in as {user?.email}</p>
        <p className="text-slate-500">Because debt and payment records must be kept accurate for both sides, business accounts with records cannot be deleted in the app. To close your account or ask for your data, email <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
        <button className="btn-secondary w-full" onClick={() => signOut()}>Sign out</button>
        <p className="text-xs text-slate-500"><Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/terms">Terms</Link></p>
      </section>
    </>
  )
}
