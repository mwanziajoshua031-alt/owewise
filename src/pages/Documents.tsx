import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Image as ImageIcon, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { FREE_LIMITS, type DocumentRow } from '../lib/types'
import { Empty, ErrorBox, Field, Modal, PageHeader, Spinner, fmtDate } from '../components/ui'

const MAX_FREE = 3 * 1024 * 1024
const MAX_PREMIUM = 10 * 1024 * 1024
const OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const KINDS: Record<DocumentRow['kind'], string> = {
  receipt: 'Receipt', invoice: 'Invoice', payment_confirmation: 'Payment confirmation', statement: 'Statement', other: 'Other',
}

export default function Documents() {
  const { isPremium, debts, online } = useStore()
  const [docs, setDocs] = useState<DocumentRow[] | null>(null)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
    if (error) setErr(error.message)
    else { setDocs(data as DocumentRow[]); setErr('') }
  }
  useEffect(() => { void load() }, [])

  async function open(d: DocumentRow) {
    // Private bucket: short-lived signed link, opened on demand.
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 60)
    if (error || !data) return setErr(error?.message ?? 'Could not open file')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function remove(d: DocumentRow) {
    if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return
    const { error: e1 } = await supabase.from('documents').delete().eq('id', d.id)
    if (e1) return setErr(e1.message)
    await supabase.storage.from('documents').remove([d.storage_path])
    await load()
  }

  if (!docs && !err) return <Spinner />
  return (
    <>
      <PageHeader title="Receipts & documents" right={<button className="btn-primary" onClick={() => setAdding(true)} disabled={!online}><Plus className="h-4 w-4" /> Add</button>} />
      {!isPremium && <p className="text-xs text-slate-500">{docs?.length ?? 0} of {FREE_LIMITS.docs} files on the Free plan, up to 3 MB each.</p>}
      {!online && <p className="text-xs text-amber-700">Uploads and viewing need an internet connection.</p>}
      {err && <ErrorBox message={err} onRetry={load} />}
      {docs && docs.length === 0 ? (
        <Empty title="No documents yet" hint="Keep photos of receipts, invoices and M-Pesa confirmations here, linked to the debt they belong to." />
      ) : (
        <ul className="space-y-2">
          {docs?.map((d) => {
            const debt = debts.find((x) => x.id === d.debt_id)
            return (
              <li key={d.id} className="card flex items-center gap-3">
                {d.mime_type === 'application/pdf' ? <FileText className="h-6 w-6 shrink-0 text-slate-400" /> : <ImageIcon className="h-6 w-6 shrink-0 text-slate-400" />}
                <button className="min-w-0 flex-1 text-left" onClick={() => open(d)}>
                  <p className="truncate font-semibold">{d.title}</p>
                  <p className="text-xs text-slate-500">{KINDS[d.kind]} · {fmtDate(d.created_at)} · {(d.size_bytes / 1024).toFixed(0)} KB</p>
                  {debt && <p className="truncate text-xs text-brand-700 dark:text-brand-400">{debt.description}</p>}
                </button>
                <button aria-label={`Delete ${d.title}`} onClick={() => remove(d)}><Trash2 className="h-5 w-5 text-slate-400" /></button>
              </li>
            )
          })}
        </ul>
      )}
      {adding && <Upload onClose={() => setAdding(false)} onDone={load} count={docs?.length ?? 0} />}
      <p className="text-center text-xs text-slate-500">Files are private to you. <Link className="underline" to="/settings">Privacy &amp; data</Link></p>
    </>
  )
}

function Upload({ onClose, onDone, count }: { onClose: () => void; onDone: () => Promise<void>; count: number }) {
  const { isPremium, debts } = useStore()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<DocumentRow['kind']>('receipt')
  const [debtId, setDebtId] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function go(e: FormEvent) {
    e.preventDefault()
    if (!file) return setErr('Choose a file')
    if (!OK.includes(file.type)) return setErr('Use a JPG, PNG, WebP or PDF file')
    if (file.size > (isPremium ? MAX_PREMIUM : MAX_FREE)) return setErr(isPremium ? 'File is over 10 MB' : 'Free plan files can be up to 3 MB')
    if (!isPremium && count >= FREE_LIMITS.docs) return setErr(`Free plan holds ${FREE_LIMITS.docs} files. Upgrade for more.`)
    if (!title.trim()) return setErr('Give it a short title')
    setBusy(true)
    setErr('')
    const { data: u } = await supabase.auth.getUser()
    const uid = u.user?.id
    if (!uid) { setBusy(false); return setErr('Not signed in') }
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]
    const path = `${uid}/${crypto.randomUUID()}.${ext}` // never reuse the user's filename in the path
    const up = await supabase.storage.from('documents').upload(path, file, { contentType: file.type, upsert: false })
    if (up.error) { setBusy(false); return setErr(up.error.message) }
    const { error } = await supabase.from('documents').insert({
      kind, title: title.trim(), storage_path: path, mime_type: file.type, size_bytes: file.size, debt_id: debtId || null,
    })
    if (error) {
      await supabase.storage.from('documents').remove([path]) // do not leave an orphan file behind
      setBusy(false)
      return setErr(error.message)
    }
    await onDone()
    onClose()
  }

  return (
    <Modal title="Add document" onClose={onClose}>
      <form onSubmit={go} className="space-y-3">
        <Field label="File (JPG, PNG, WebP or PDF)">
          <input type="file" accept={OK.join(',')} className="input py-2" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 100)) }} />
        </Field>
        <Field label="Title"><input className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as DocumentRow['kind'])}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Linked debt">
            <select className="input" value={debtId} onChange={(e) => setDebtId(e.target.value)}>
              <option value="">None</option>
              {debts.filter((d) => !d.pending).map((d) => <option key={d.id} value={d.id}>{d.description}</option>)}
            </select>
          </Field>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
      </form>
    </Modal>
  )
}
