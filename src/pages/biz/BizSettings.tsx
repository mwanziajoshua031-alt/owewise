import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useAccount } from '../../lib/account'
import { CONTACT_EMAIL } from '../../lib/legal'
import { Field, PageHeader } from '../../components/ui'

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
