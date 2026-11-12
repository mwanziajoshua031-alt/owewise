import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { call, useLoad, type BizDebt, type Branch } from '../lib/biz'
import { Modal } from './ui'

export function useBranches() {
  return useLoad(async () => {
    const { data, error } = await supabase.from('business_branches').select('id,name').order('name')
    if (error) throw new Error(error.message)
    return (data ?? []) as Branch[]
  }, [])
}

/** '' = all branches, 'none' = debts with no branch, otherwise a branch id. */
export type BranchSel = '' | 'none' | string
export function byBranch(debts: BizDebt[], sel: BranchSel): BizDebt[] {
  if (!sel) return debts
  if (sel === 'none') return debts.filter((d) => !d.branch_id)
  return debts.filter((d) => d.branch_id === sel)
}

/** Chips to look at one branch or all together. Renders nothing for a business with no branches. */
export function BranchChips({ branches, value, onChange, hasUntagged }: { branches: Branch[]; value: BranchSel; onChange: (v: BranchSel) => void; hasUntagged: boolean }) {
  if (branches.length === 0) return null
  const items: { k: BranchSel; l: string }[] = [{ k: '', l: 'All branches' }, ...branches.map((b) => ({ k: b.id, l: b.name })), ...(hasUntagged ? [{ k: 'none', l: 'No branch' }] : [])]
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Branch">
      {items.map((x) => (
        <button key={x.k || 'all'} role="tab" aria-selected={value === x.k} onClick={() => onChange(x.k)}
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${value === x.k ? 'bg-navy-900 text-white dark:bg-brand-600' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200'}`}>{x.l}</button>
      ))}
    </div>
  )
}

/** Dropdown used when recording a debt or changing one. Renders nothing when there are no branches. */
export function BranchSelect({ branches, value, onChange, blankLabel = 'No branch' }: { branches: Branch[]; value: string; onChange: (v: string) => void; blankLabel?: string }) {
  if (branches.length === 0) return null
  return (
    <label className="block"><span className="label">Branch (optional)</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{blankLabel}</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select></label>
  )
}

/** Owner only (Settings): add, rename, delete branches. Businesses with one place can ignore this card. */
export function BranchManager() {
  const { data, error, reload } = useBranches()
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<Branch | null>(null)
  const [editName, setEditName] = useState('')
  const [del, setDel] = useState<Branch | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (!name.trim()) return setErr('Enter a branch name.')
    setBusy(true)
    const r = await call('add_branch', { p_name: name })
    setBusy(false)
    if (r.error) return setErr(r.error)
    setName(''); reload()
  }
  return (
    <section className="card space-y-3">
      <h2 className="font-bold">Branches</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">Own more than one shop or counter? Add each branch, tag debts with it, and see every branch together on Home or one at a time. Working from one place? You do not need this.</p>
      <form onSubmit={add} className="flex gap-2" noValidate>
        <input className="input min-w-0 flex-1" maxLength={60} placeholder="e.g. Westlands shop" aria-label="Branch name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={busy}>Add</button>
      </form>
      {(err || error) && <p className="err" role="alert">{err || error}</p>}
      {data && data.length > 0 && (
        <ul className="space-y-1">
          {data.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2 text-sm dark:border-white/10">
              <span className="min-w-0 truncate">{b.name}</span>
              <span className="flex shrink-0 gap-3 text-xs font-semibold">
                <button className="underline" onClick={() => { setEdit(b); setEditName(b.name); setErr('') }}>Rename</button>
                <button className="text-red-600 underline" onClick={() => setDel(b)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <Modal title="Rename branch" onClose={() => setEdit(null)}>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            const r = await call('rename_branch', { p_branch: edit.id, p_name: editName })
            if (r.error) return setErr(r.error)
            setEdit(null); reload()
          }}>
            <input className="input" maxLength={60} aria-label="New branch name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <button className="btn-primary w-full">Save</button>
          </form>
        </Modal>
      )}
      {del && (
        <Modal title="Delete branch" onClose={() => setDel(null)}>
          <div className="space-y-3 text-sm">
            <p>Delete “{del.name}”? Its debts are kept and show as “No branch”.</p>
            <button className="btn-danger w-full" onClick={async () => {
              const r = await call('delete_branch', { p_branch: del.id })
              setDel(null)
              if (r.error) return setErr(r.error)
              reload()
            }}>Delete branch</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
