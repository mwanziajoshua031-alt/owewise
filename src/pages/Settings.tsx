import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import { download } from '../lib/derive'
import { Banner, Field, Modal, PageHeader } from '../components/ui'

const CURRENCIES = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS']

export default function Settings() {
  const { user, signOut } = useAuth()
  const { profile, refresh, queue, discardQueued, retryQueue, subscription, isPremium } = useStore()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [currency, setCurrency] = useState(profile?.default_currency ?? 'KES')
  const [theme, setTheme] = useState(profile?.theme ?? 'system')
  const [email, setEmail] = useState(profile?.notification_prefs?.email ?? true)
  const [sms, setSms] = useState(profile?.notification_prefs?.sms ?? false)
  const [days, setDays] = useState(profile?.notification_prefs?.days_before ?? 3)
  const [digest, setDigest] = useState(profile?.notification_prefs?.overdue_digest ?? 'weekly')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const p = phone.replace(/[\s-]/g, '')
    if (p && !/^\+?[0-9]{7,15}$/.test(p)) return setMsg({ ok: false, text: 'Phone must be 7 to 15 digits, e.g. +254712345678' })
    setBusy(true)
    const { error } = await supabase.from('profiles').update({
      full_name: name.trim() || null, phone: p || null, default_currency: currency, theme,
      notification_prefs: { email, sms, days_before: days, overdue_digest: digest },
    }).eq('id', user!.id)
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: 'Saved' })
    await refresh()
  }

  async function exportAll() {
    const { data, error } = await supabase.rpc('export_my_data')
    if (error) return setMsg({ ok: false, text: error.message })
    download('owewise-my-data.json', JSON.stringify(data, null, 2), 'application/json')
  }

  return (
    <>
      <PageHeader title="Settings" />
      <Link to="/documents" className="card block text-sm font-semibold text-brand-700 underline dark:text-brand-400">Open my documents (receipts, invoices)</Link>
      <section className="card flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">Signed in as</p>
          <p className="font-semibold">{user?.email}</p>
          <p className="text-xs text-slate-500">{user?.email_confirmed_at ? 'Email verified' : 'Email not verified yet'}</p>
        </div>
        <button className="btn-secondary" onClick={signOut}>Sign out</button>
      </section>

      <section className="grid grid-cols-3 gap-2 text-center text-sm font-semibold">
        <Link className="card py-3" to="/subscription">{isPremium ? 'Premium' : 'Upgrade'}</Link>
        <Link className="card py-3" to="/goals">Goals</Link>
        <Link className="card py-3" to="/notifications">Alerts</Link>
      </section>

      <form onSubmit={save} className="card space-y-3" noValidate>
        <h2 className="font-bold">Profile & preferences</h2>
        <Field label="Full name"><input className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone (for SMS reminders)"><input className="input" inputMode="tel" placeholder="+254712345678" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default currency">
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Theme">
            <select className="input" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
              <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </Field>
        </div>
        <fieldset className="space-y-2 text-sm">
          <legend className="label">Notifications</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email reminders</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> SMS reminders</label>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Remind me before due">
            <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''}</option>)}</select>
          </Field>
          <Field label="Overdue digest">
            <select className="input" value={digest} onChange={(e) => setDigest(e.target.value)}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="off">Off</option>
            </select>
          </Field>
        </div>
        {msg && <p className={msg.ok ? 'text-sm text-green-700 dark:text-green-400' : 'err'} role="status">{msg.text}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <p className="text-xs text-slate-500">In-app alerts work now. Email and SMS alerts are sent only once those services are connected on the server.</p>
      </form>

      {queue.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-bold">Waiting to sync</h2>
          <ul className="space-y-2 text-sm">
            {queue.map((q) => (
              <li key={q.id} className="rounded-lg bg-slate-50 p-2 dark:bg-white/5">
                <p className="font-medium capitalize">{q.table.slice(0, -1)} · {new Date(q.queuedAt).toLocaleString('en-KE')}</p>
                {q.error ? <p className="err">Rejected by the server: {q.error}</p> : <p className="text-xs text-slate-500">Will sync when you are online.</p>}
                {q.error && <button className="mt-1 text-xs font-semibold underline" onClick={() => discardQueued(q.id)}>Discard this item</button>}
              </li>
            ))}
          </ul>
          <button className="btn-secondary w-full" onClick={retryQueue}>Retry sync</button>
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="font-bold">Your data</h2>
        <p className="text-sm text-slate-500">Everything you store is private to your account. You can download it or delete it at any time.</p>
        <button className="btn-secondary w-full" onClick={exportAll}>Download all my data (JSON)</button>
        <button className="btn-danger w-full" onClick={() => setDel(true)}>Delete my account</button>
        <p className="text-center text-xs text-slate-500"><Link className="underline" to="/privacy">Privacy Policy</Link> · <Link className="underline" to="/terms">Terms of Use</Link></p>
        {subscription?.plan === 'premium' &&<p className="text-xs text-slate-500">Cancel Premium on the Subscription page first if you do not want to be billed again.</p>}
      </section>

      {del && <DeleteModal onClose={() => setDel(false)} />}
    </>
  )
}

function DeleteModal({ onClose }: { onClose: () => void }) {
  const { signOut } = useAuth()
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    setErr('')
    // Remove uploaded files first (account deletion alone only removes database rows).
    // If this fails we stop, so no orphaned files are left behind.
    const { data: u } = await supabase.auth.getUser()
    const uid = u.user?.id
    if (uid) {
      for (;;) {
        const { data: files, error: le } = await supabase.storage.from('documents').list(uid, { limit: 100 })
        if (le) { setBusy(false); return setErr(`Could not remove your files: ${le.message}`) }
        if (!files || files.length === 0) break
        const { error: re } = await supabase.storage.from('documents').remove(files.map((f) => `${uid}/${f.name}`))
        if (re) { setBusy(false); return setErr(`Could not remove your files: ${re.message}`) }
      }
    }
    const { error } = await supabase.rpc('delete_my_account')
    if (error) { setBusy(false); return setErr(error.message) }
    await signOut()
  }
  return (
    <Modal title="Delete account" onClose={onClose}>
      <div className="space-y-3">
        <Banner tone="warn">This permanently deletes your debts, payments, reminders and goals. It cannot be undone. Download your data first if you want a copy.</Banner>
        <p className="text-xs text-slate-500">Your uploaded files are removed first, then your account and records.</p>
        <Field label='Type DELETE to confirm'><input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} autoCapitalize="characters" /></Field>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-danger w-full" disabled={txt !== 'DELETE' || busy} onClick={go}>{busy ? 'Deleting…' : 'Delete everything'}</button>
      </div>
    </Modal>
  )
}
