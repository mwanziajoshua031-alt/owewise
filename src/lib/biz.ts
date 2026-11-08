import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type BizStatus = 'awaiting_review' | 'awaiting_payment' | 'partially_paid' | 'paid' | 'overdue' | 'disputed' | 'cancelled'

export type BizDebt = {
  id: string; business_id: string; business_customer_id: string; customer_user_id: string | null
  customer_name: string; customer_phone: string; amount: number; currency: string; description: string
  incurred_on: string; due_date: string; invoice_path: string | null; sent_at: string
  claimed_at: string | null; customer_confirmed_at: string | null; cancelled_at: string | null; cancel_reason: string | null
  created_at: string; source: 'request' | 'quick'; paid_total: number; pending_total: number; outstanding: number; status: BizStatus
}
export const DEBT_COLS = 'id,business_id,business_customer_id,customer_user_id,customer_name,customer_phone,amount,currency,description,incurred_on,due_date,invoice_path,sent_at,claimed_at,customer_confirmed_at,cancelled_at,cancel_reason,created_at,source,paid_total,pending_total,outstanding,status'

export type BizPayment = {
  id: string; debt_id: string; kind: 'payment' | 'reversal'; reverses_payment_id: string | null; amount: number; currency: string
  method: 'mpesa_stk' | 'cash' | 'other'; status: 'pending' | 'succeeded' | 'failed' | 'cancelled'
  mpesa_receipt: string | null; result_desc: string | null; needs_review: boolean; note: string | null; created_at: string; completed_at: string | null
}
export const PAY_COLS = 'id,debt_id,kind,reverses_payment_id,amount,currency,method,status,mpesa_receipt,result_desc,needs_review,note,created_at,completed_at'

export type Receipt = {
  id: string; receipt_no: string; payment_id: string; business_name: string; customer_name: string; debt_description: string
  amount: number; currency: string; method: string; mpesa_receipt: string | null; balance_after: number; issued_at: string
}
export type Dispute = { id: string; reason: string; details: string; status: 'open' | 'resolved' | 'withdrawn'; resolution: string | null; resolution_note: string | null; created_at: string }
export type DebtMessage = { id: string; sender_role: 'customer' | 'business' | 'system'; kind: string; body: string; requested_due_date: string | null; status: 'pending' | 'approved' | 'rejected' | null; created_at: string }
export type Business = { id: string; name: string; owner_name: string | null; phone: string | null; email: string | null; category: string | null; location: string | null; status: 'active' | 'suspended' }

export const STATUS_TEXT: Record<BizStatus, { business: string; customer: string }> = {
  awaiting_review: { business: 'Awaiting customer', customer: 'Needs your review' },
  awaiting_payment: { business: 'Awaiting payment', customer: 'Ready to pay' },
  partially_paid: { business: 'Partially paid', customer: 'Partially paid' },
  paid: { business: 'Paid', customer: 'Paid' },
  overdue: { business: 'Overdue', customer: 'Overdue' },
  disputed: { business: 'Disputed', customer: 'Disputed' },
  cancelled: { business: 'Cancelled', customer: 'Cancelled' },
}

const ERRORS: Record<string, string> = {
  not_authenticated: 'Please sign in again.',
  not_a_business: 'This action needs a business account.',
  business_suspended: 'This business account is suspended.',
  rate_limited: 'Too many attempts. Please wait a while and try again.',
  invalid_phone: 'Enter a valid Kenyan phone number, e.g. 0712 345 678.',
  name_required: 'Enter the customer name.',
  invalid_amount: 'Enter a valid amount.',
  invalid_invoice_path: 'That invoice file is not valid.',
  cannot_bill_yourself: 'You cannot send a debt request to your own account.',
  already_claimed: 'This request has already been claimed.',
  invalid_or_expired_link: 'This link is invalid, expired or already used. Ask the business to send a new one.',
  customer_account_required: 'Only customer accounts can claim a debt request. Sign out and create a customer account.',
  debt_cancelled: 'This debt request was cancelled.',
  debt_disputed: 'This debt is under dispute, so payments are paused until it is resolved.',
  payment_in_progress: 'A payment is in progress. Wait for it to finish first.',
  already_resolved: 'This dispute is already resolved.',
  invalid_resolution: 'Choose a resolution.',
  has_payments_reverse_first: 'Payments were already made. Reverse them first, or choose another resolution.',
  has_payments: 'This debt already has payments, so it cannot be cancelled.',
  invalid_method: 'Choose cash or other.',
  amount_exceeds_outstanding: 'That is more than the amount still owed.',
  not_reversible: 'This payment cannot be reversed.',
  reason_required: 'Give a short reason.',
  already_reversed: 'This payment was already reversed.',
  invalid_message: 'Write a message (up to 1000 characters).',
  invalid_extension: 'Pick a date after the current due date.',
  extension_pending: 'You already have a pending request for more time.',
  already_decided: 'This request was already answered.',
  confirm_first: 'Please confirm the debt before paying.',
  mpesa_kes_only: 'M-Pesa payments are for KES debts only.',
  mpesa_whole_amount: 'M-Pesa needs a whole-shilling amount (no cents).',
  mpesa_not_configured: 'This business has not set up M-Pesa payments yet. Please pay them directly and ask them to record it.',
  mpesa_rejected: 'M-Pesa did not accept the request. Check the number and try again.',
  mpesa_unavailable: 'M-Pesa could not be reached just now. Please try again in a moment.',
  mpesa_credentials_rejected: 'Safaricom rejected these credentials. Check the consumer key and secret, and the environment.',
  invalid_shortcode: 'Enter the Paybill or Till number (5 to 8 digits).',
  invalid_credentials: 'Fill in the consumer key, consumer secret and passkey.',
  save_failed: 'Could not save. Please try again.',
  business_has_open_debts: 'You still have unpaid debts or payments in progress. Collect, cancel or resolve them first, then close your account.',
  credit_limit_exceeded: 'This would take the customer over their credit limit. Raise the limit on the Customers page or ask for a payment first.',
  customer_linked_use_request: 'This customer already uses OweWise. Send them a normal debt request so they can confirm it.',
  invalid_description: 'Describe what this is for.',
  not_found: 'That record was not found.',
}
export function friendly(message: string | undefined | null): string {
  if (!message) return 'Something went wrong. Please try again.'
  for (const [k, v] of Object.entries(ERRORS)) if (message.includes(k)) return v
  return 'Something went wrong. Please try again.'
}

/** Call a server function; returns an error string instead of throwing. */
export async function call<T = unknown>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { data: null, error: friendly(error.message) }
  return { data: data as T, error: null }
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    setLoading(true)
    fn().then((d) => { if (live) { setData(d); setError(''); setLoading(false) } })
      .catch((e: unknown) => { if (live) { setError(e instanceof Error ? e.message : 'Could not load'); setLoading(false) } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

export async function loadDebts(): Promise<BizDebt[]> {
  const { data, error } = await supabase.from('business_debt_balances').select(DEBT_COLS).order('created_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as BizDebt[]
}

export function claimLink(token: string): string {
  return `${window.location.origin}/claim#${token}`
}

const CLAIM_KEY = 'owewise.claim'
export function saveClaimToken(t: string) { try { localStorage.setItem(CLAIM_KEY, t) } catch { /* ignore */ } }
export function readClaimToken(): string | null { try { return localStorage.getItem(CLAIM_KEY) } catch { return null } }
export function clearClaimToken() { try { localStorage.removeItem(CLAIM_KEY) } catch { /* ignore */ } }

/** null while loading; true only for platform administrators (checked on the server). */
export function useIsAdmin(): boolean | null {
  const { data, loading } = useLoad(async () => (await call<boolean>('is_admin', {})).data === true, [])
  return loading ? null : data === true
}

export function waLink(phone: string, text: string): string {
  const d = phone.replace(/\D/g, '').replace(/^0/, '254')
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`
}

export function reminderText(d: Pick<BizDebt, 'customer_name' | 'description' | 'currency' | 'outstanding' | 'due_date' | 'id' | 'customer_user_id'>, business: string, money: string, due: string, overdue: boolean): string {
  const link = d.customer_user_id ? ` You can see it and pay in OweWise: ${window.location.origin}/bills/${d.id}` : ''
  return `Hello ${d.customer_name}, a friendly reminder from ${business}: ${money} for "${d.description}" ${overdue ? 'was due on' : 'is due on'} ${due}.${link} Thank you.`
}
