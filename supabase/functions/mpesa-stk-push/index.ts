// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, json, msisdn, stkPush, type Creds } from './daraja.ts'

const URL_ = Deno.env.get('SUPABASE_URL')!
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const UUID = /^[0-9a-f-]{36}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '')
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u?.user) return json(req, { error: 'not_authenticated' }, 401)

  let b: any
  try { b = await req.json() } catch { return json(req, { error: 'invalid_request' }, 400) }
  const phone = msisdn(String(b.phone ?? ''))
  const amount = Number(b.amount)
  if (!UUID.test(String(b.debt_id ?? '')) || !phone) return json(req, { error: 'invalid_phone' }, 400)
  if (!Number.isInteger(amount) || amount < 1) return json(req, { error: 'mpesa_whole_amount' }, 400)

  const { data: debt } = await admin.from('business_debts').select('business_id,customer_user_id').eq('id', b.debt_id).maybeSingle()
  if (!debt || debt.customer_user_id !== u.user.id) return json(req, { error: 'not_found' }, 404)
  const { data: creds } = await admin.rpc('read_mpesa_credentials', { p_business: debt.business_id })
  if (!creds) return json(req, { error: 'mpesa_not_configured' }, 400)

  const { data: pid, error: pe } = await admin.rpc('create_pending_mpesa_payment', { p_user: u.user.id, p_debt: b.debt_id, p_amount: amount, p_phone: phone })
  if (pe) return json(req, { error: pe.message }, 400)

  const { data: secret } = await admin.rpc('mpesa_callback_secret')
  try {
    const r = await stkPush(creds as Creds, { amount, phone, callbackUrl: `${URL_}/functions/v1/mpesa-callback?k=${secret}`, reference: `OW${String(b.debt_id).slice(0, 8)}`, desc: 'Debt payment' })
    if (!r.ok || !r.checkoutRequestId) {
      await admin.rpc('fail_pending_payment', { p_payment: pid, p_desc: r.message || 'Request rejected' })
      return json(req, { error: 'mpesa_rejected', detail: r.message }, 502)
    }
    await admin.rpc('attach_mpesa_request', { p_payment: pid, p_merchant: r.merchantRequestId ?? '', p_checkout: r.checkoutRequestId })
    return json(req, { payment_id: pid })
  } catch {
    await admin.rpc('fail_pending_payment', { p_payment: pid, p_desc: 'M-Pesa unreachable' })
    return json(req, { error: 'mpesa_unavailable' }, 502)
  }
})
