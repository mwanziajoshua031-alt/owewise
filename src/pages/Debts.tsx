import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Archive, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useUI } from '../components/Layout'
import { dueLabel } from '../lib/derive'
import { formatMoney } from '../lib/money'
import { FREE_LIMITS, STATUS_LABEL, type Creditor, type DebtStatus } from '../lib/types'
import { Empty, ErrorBox, Field, Modal, PageHeader, PendingTag, Spinner, StatusBadge } from '../components/ui'

const FILTERS: ('all' | DebtStatus)[] = ['all', 'overdue', 'unpaid', 'partially_paid', 'disputed', 'paid']

export default function Debts() {
  const [tab, setTab] = useState<'debts' | 'creditors'>('debts')
  return (
    <>
      <PageHeader title="My debts" />
      <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1 text-sm font-semibold dark:bg-white/10" role="tablist">
        {(['debts', 'creditors'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-lg py-2 capitalize ${tab === t ? 'bg-white shadow dark:bg-navy-700' : 'text-slate-600 dark:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'debts' ? <DebtList /> : <Creditors />}
    </>
  )
}

function DebtList() {
  const { loading, error, refresh, debts, creditors, isPremium } = useStore()
  const { addDebt } = useUI()
  const [filter, setFilter] = useState<'all' | DebtStatus>('all')
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  if (loading) return <Spinner />
  if (error) return <ErrorBox message={error} onRetry={refresh} />

  const activeCount = debts.filter((d) => !d.archived_at && d.status !== 'paid').length
  const list = debts
    .filter((d) => (showArchived ? !!d.archived_at : !d.archived_at))
    .filter((d) => filter === 'all' || d.status === filter)
    .filter((d) => {
      if (!q.trim()) return true
      const cn = creditors.find((c) => c.id === d.creditor_id)?.name ?? ''
      return (d.description + ' ' + cn).toLowerCase().includes(q.toLowerCase())
    })

  return (
    <>
      {!isPremium && <p className="text-xs text-slate-500">{activeCount} of {FREE_LIMITS.debts} active debts used on the Free plan.</p>}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" aria-hidden />
        <input className="input pl-10" placeholder="Search debts or creditors" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? 'bg-navy-900 text-white dark:bg-brand-600' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}>
            {f === 'all' ? 'All' : STATUS_LABEL[f]}
          </button>
        ))}
        <button onClick={() => setShowArchived((s) => !s)} aria-pressed={showArchived}
          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${showArchived ? 'bg-navy-900 text-white dark:bg-brand-600' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}>
          <Archive className="h-3 w-3" /> Archived
        </button>
      </div>

      {list.length === 0 ? (
        <Empty
          title={debts.length ? 'No debts match' : 'No debts yet'}
          hint={debts.length ? 'Try a different filter or search.' : 'Add your first debt to start tracking.'}
          action={!debts.length && <button className="btn-primary" onClick={() => addDebt()}>Add debt</button>}
        />
      ) : (
        <ul className="space-y-2">
          {list.map((d) => {
            const pct = d.total_due > 0 ? Math.min(100, Math.round((d.paid_total / d.total_due) * 100)) : 0
            return (
              <li key={d.id}>
                <Link to={`/debts/${d.id}`} className="card block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{d.description}</p>
                      <p className="text-xs text-slate-500">{creditors.find((c) => c.id === d.creditor_id)?.name ?? 'Creditor'} · {dueLabel(d.due_date)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={d.status} />
                      {d.pending && <PendingTag />}
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <p className="text-lg font-bold">{formatMoney(d.outstanding, d.currency)}</p>
                    <p className="text-xs text-slate-500">of {formatMoney(d.total_due, d.currency)}</p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Paid">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function Creditors() {
  const { creditors, debts, refresh, addCreditor, isPremium } = useStore()
  const { addDebt } = useUI()
  const [edit, setEdit] = useState<Creditor | 'new' | null>(null)
  const active = creditors.filter((c) => !c.archived_at)

  return (
    <>
      {!isPremium && <p className="text-xs text-slate-500">{active.length} of {FREE_LIMITS.creditors} creditors used on the Free plan.</p>}
      <button className="btn-secondary w-full" onClick={() => setEdit('new')}><Plus className="h-4 w-4" /> Add creditor</button>
      {active.length === 0 ? (
        <Empty title="No creditors yet" hint="Creditors are the people or businesses you owe." />
      ) : (
        <ul className="space-y-2">
          {active.map((c) => {
            const mine = debts.filter((d) => d.creditor_id === c.id && !d.archived_at && d.status !== 'paid')
            const byCur = mine.reduce<Record<string, number>>((a, d) => ({ ...a, [d.currency]: (a[d.currency] ?? 0) + d.outstanding }), {})
            return (
              <li key={c.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <button className="min-w-0 text-left" onClick={() => setEdit(c)}>
                    <p className="truncate font-semibold">{c.name} {c.pending && <PendingTag />}</p>
                    <p className="text-xs text-slate-500">{[c.category, c.contact_phone].filter(Boolean).join(' · ') || 'No details'}</p>
                  </button>
                  <button className="text-xs font-semibold text-brand-700 underline dark:text-brand-400" onClick={() => addDebt(c.id)}>Add debt</button>
                </div>
                <p className="mt-2 text-sm">
                  {Object.keys(byCur).length === 0 ? <span className="text-slate-500">Nothing owed</span> : Object.entries(byCur).map(([cur, v]) => <span key={cur} className="mr-3 font-semibold">{formatMoney(v, cur)}</span>)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
      {edit && (
        <CreditorModal
          creditor={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onCreate={async (v) => addCreditor(v)}
          onDone={refresh}
        />
      )}
    </>
  )
}

function CreditorModal({ creditor, onClose, onCreate, onDone }: {
  creditor: Creditor | null
  onClose: () => void
  onCreate: (v: { name: string; category: string; contact_phone: string; notes: string }) => Promise<{ ok: boolean; error?: string }>
  onDone: () => Promise<void>
}) {
  const [name, setName] = useState(creditor?.name ?? '')
  const [category, setCategory] = useState(creditor?.category ?? '')
  const [phone, setPhone] = useState(creditor?.contact_phone ?? '')
  const [notes, setNotes] = useState(creditor?.notes ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setErr('Enter a name')
    setBusy(true)
    setErr('')
    if (creditor && !creditor.pending) {
      const { error } = await supabase.from('creditors').update({
        name: name.trim(), category: category.trim() || null, contact_phone: phone.trim() || null, notes: notes.trim() || null,
      }).eq('id', creditor.id)
      setBusy(false)
      if (error) return setErr(error.message)
      await onDone()
      return onClose()
    }
    const r = await onCreate({ name, category, contact_phone: phone, notes })
    setBusy(false)
    if (!r.ok) return setErr(r.error ?? 'Could not save')
    onClose()
  }

  async function archive() {
    if (!creditor) return
    setBusy(true)
    const { error } = await supabase.from('creditors').update({ archived_at: new Date().toISOString() }).eq('id', creditor.id)
    setBusy(false)
    if (error) return setErr(error.message)
    await onDone()
    onClose()
  }

  return (
    <Modal title={creditor ? 'Edit creditor' : 'New creditor'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3" noValidate>
        <Field label="Name"><input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><input className="input" value={category} maxLength={60} onChange={(e) => setCategory(e.target.value)} /></Field>
          <Field label="Phone"><input className="input" inputMode="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} /></Field>
        </div>
        <Field label="Notes"><textarea className="input min-h-[70px] py-2" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {creditor && !creditor.pending && (
          <button type="button" className="btn-secondary w-full" onClick={archive} disabled={busy}>Archive creditor</button>
        )}
      </form>
    </Modal>
  )
}
