import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { call, joinLink, useLoad, waLink, type JoinRequest, type MyJoinRequest } from '../lib/biz'
import { useAccount } from '../lib/account'
import { Modal, fmtDate } from './ui'

type Linkable = { id: string; name: string; phone: string; customer_user_id: string | null }

/** Owner only (Settings): the one link for the whole business. Joining by it gives no access to anything on its own. */
export function JoinLinkCard() {
  const { data, error, reload } = useLoad(async () => {
    const r = await call<{ token: string; enabled: boolean }>('get_join_link', {})
    if (r.error) throw new Error(r.error)
    return r.data!
  }, [])
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const { business } = useAccount()
  const link = data ? joinLink(data.token) : ''
  useEffect(() => {
    if (!link || !data?.enabled) { setQr(''); return }
    QRCode.toDataURL(link, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(''))
  }, [link, data?.enabled])
  const msg = `${business?.name ?? 'We'} invite you to connect on OweWise so you can see and pay what you owe. Open this link: ${link}`
  return (
    <section className="card space-y-3">
      <h2 className="font-bold">Invite your customers</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">One link for all your customers. When someone opens it they only type their name. You then pick which customer they are and send them a code on WhatsApp, so nobody sees any debts until you have confirmed them.</p>
      {error && <p className="err" role="alert">{error}</p>}
      {data && (
        <>
          {data.enabled ? (
            <>
              <input readOnly className="input" aria-label="Customer join link" value={link} onFocus={(e) => e.currentTarget.select()} />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true) } catch { setErr('Copy failed. Select the link and copy it.') } }}>{copied ? 'Copied' : 'Copy link'}</button>
                <a className="btn-primary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(msg)}`}>Share on WhatsApp</a>
              </div>
              {qr && <div className="flex flex-col items-center gap-1"><img src={qr} alt="QR code for your customer join link" width={200} height={200} className="rounded-xl bg-white p-2" /><p className="text-xs text-slate-500">Show or print this for your counter.</p></div>}
            </>
          ) : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">The link is switched off. Nobody can use it until you switch it on again.</p>}
          <div className="flex flex-wrap gap-4 text-xs font-semibold">
            <button className="underline" onClick={async () => { setErr(''); const r = await call('set_join_link_enabled', { p_enabled: !data.enabled }); if (r.error) return setErr(r.error); reload() }}>{data.enabled ? 'Switch link off' : 'Switch link on'}</button>
            <button className="text-red-600 underline" onClick={() => setConfirmReset(true)}>Make a new link</button>
          </div>
        </>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      {confirmReset && (
        <Modal title="Make a new link" onClose={() => setConfirmReset(false)}>
          <div className="space-y-3 text-sm">
            <p>The old link will stop working straight away. Use this if the link was shared somewhere you did not want. Requests already waiting are kept.</p>
            <button className="btn-danger w-full" onClick={async () => { const r = await call('reset_join_link', {}); setConfirmReset(false); if (r.error) return setErr(r.error); setCopied(false); reload() }}>Make a new link</button>
          </div>
        </Modal>
      )}
    </section>
  )
}

/** Owner or staff (Customers screen): people who opened the join link. Pick who they are, then send the code by WhatsApp. */
export function JoinRequests({ customers, onChanged }: { customers: Linkable[]; onChanged: () => void }) {
  const { business } = useAccount()
  const { data, reload } = useLoad(async () => (await call<JoinRequest[]>('list_join_requests', {})).data ?? [], [])
  const [pick, setPick] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [sent, setSent] = useState<{ wa: string; name: string } | null>(null)
  const open = customers.filter((c) => !c.customer_user_id)
  if (!data || data.length === 0) return null
  return (
    <section className="card space-y-3 border-l-4 border-l-brand-600">
      <h2 className="font-bold">{data.length} {data.length === 1 ? 'person wants' : 'people want'} to connect</h2>
      <p className="text-xs text-slate-500">They opened your join link and typed a name. Choose which of your customers it is. A code then goes to that customer's phone on WhatsApp, and they see their debts only after typing it. If you do not recognise the name, tap Ignore.</p>
      <ul className="space-y-2">
        {data.map((r) => (
          <li key={r.id} className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0"><span className="block truncate font-semibold">{r.name}</span>
                <span className="block text-xs text-slate-500">Asked {fmtDate(r.created_at)}{r.status === 'code_sent' ? ' · code sent' : r.status === 'locked' ? ' · too many wrong codes' : ''}</span></span>
              <button className="shrink-0 text-xs font-semibold text-red-600 underline" onClick={async () => { setErr(''); const x = await call('ignore_join_request', { p_request: r.id }); if (x.error) return setErr(x.error); reload() }}>Ignore</button>
            </div>
            {open.length === 0 ? <p className="text-xs text-slate-500">You have no customers waiting to be connected. Ignore this request, or record a debt for them first.</p> : (
              <div className="flex gap-2">
                <select className="input min-w-0 flex-1" aria-label={`Which customer is ${r.name}?`} value={pick[r.id] ?? ''} onChange={(e) => setPick((p) => ({ ...p, [r.id]: e.target.value }))}>
                  <option value="">Which customer is this?</option>
                  {open.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
                </select>
                <button className="btn-primary shrink-0" disabled={!pick[r.id]} onClick={async () => {
                  setErr('')
                  const x = await call<{ code: string; phone: string; customer_name: string }>('match_join_request', { p_request: r.id, p_customer: pick[r.id] })
                  if (x.error || !x.data) return setErr(x.error ?? 'Could not make a code.')
                  const text = `Hello ${x.data.customer_name}, your code to connect with ${business?.name ?? 'us'} on OweWise is ${x.data.code}. Open OweWise and type it on the home screen. It works for 24 hours. If you did not ask for this, ignore this message.`
                  setSent({ wa: waLink(x.data.phone, text), name: x.data.customer_name })
                  reload(); onChanged()
                }}>Send code</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {err && <p className="err" role="alert">{err}</p>}
      {sent && (
        <Modal title="Send the code" onClose={() => setSent(null)}>
          <div className="space-y-3 text-sm">
            <p>The code is ready. Send it to <b>{sent.name}</b> on WhatsApp. It goes to the phone number you have saved for them, not to whoever opened the link.</p>
            <a className="btn-primary w-full" target="_blank" rel="noopener noreferrer" href={sent.wa} onClick={() => setSent(null)}>Open WhatsApp</a>
            <p className="text-xs text-slate-500">This code is shown only once. If it is lost, choose the customer again to make a new one.</p>
          </div>
        </Modal>
      )}
    </section>
  )
}

/** Customer home: waiting for the business, or type the code they were sent. */
export function JoinCodeBanner() {
  const { data, reload } = useLoad(async () => (await call<MyJoinRequest[]>('my_join_requests', {})).data ?? [], [])
  const [code, setCode] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Record<string, { ok: boolean; t: string }>>({})
  const [done, setDone] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const list = data ?? []
  if (list.length === 0 && done.length === 0) return null
  const say = (id: string, ok: boolean, t: string) => setMsg((m) => ({ ...m, [id]: { ok, t } }))
  return (
    <div className="space-y-2">
      {done.map((n) => <div key={n} className="card border-l-4 border-l-brand-600 text-sm font-semibold">You are now connected to {n}. Their debts are under “Bills from businesses”.</div>)}
      {list.map((r) => (
        <div key={r.id} className="card space-y-2 border-l-4 border-l-brand-600">
          <p className="font-bold">{r.business_name}</p>
          {r.status === 'waiting' && <p className="text-sm text-slate-600 dark:text-slate-300">Waiting for {r.business_name} to confirm you. They will send a 6-digit code to your phone on WhatsApp. Come back and type it here.</p>}
          {r.status === 'locked' && <p className="text-sm text-slate-600 dark:text-slate-300">Too many wrong codes. Ask {r.business_name} to send you a new one.</p>}
          {r.status === 'code_sent' && (
            <form className="space-y-2" onSubmit={async (e) => {
              e.preventDefault()
              const c = (code[r.id] ?? '').trim()
              if (!/^\d{6}$/.test(c)) return say(r.id, false, 'Enter the 6-digit code.')
              setBusy(r.id)
              const x = await call<{ ok: boolean; error?: string; business_name?: string }>('confirm_join_code', { p_request: r.id, p_code: c })
              setBusy(null)
              if (x.error || !x.data) return say(r.id, false, x.error ?? 'Could not check the code.')
              if (x.data.ok) { setDone((d) => [...d, x.data!.business_name ?? r.business_name]); reload(); return }
              say(r.id, false, x.data.error === 'code_expired' ? 'That code has expired. Ask the business for a new one.' : x.data.error === 'too_many_attempts' ? 'Too many wrong codes. Ask the business to send a new one.' : 'That code is not right. Check it and try again.')
              if (x.data.error !== 'invalid_code') reload()
            }}>
              <p className="text-sm text-slate-600 dark:text-slate-300">{r.business_name} sent a code to your phone on WhatsApp. Type it here.</p>
              <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" aria-label="6-digit code" value={code[r.id] ?? ''} onChange={(e) => setCode((p) => ({ ...p, [r.id]: e.target.value.replace(/\D/g, '') }))} />
              {msg[r.id] && <p className={msg[r.id].ok ? 'text-sm text-green-700' : 'err'} role="alert">{msg[r.id].t}</p>}
              <button className="btn-primary w-full" disabled={busy === r.id}>{busy === r.id ? 'Checking…' : 'Confirm code'}</button>
            </form>
          )}
        </div>
      ))}
    </div>
  )
}
