// deno-lint-ignore-file no-explicit-any
// Lets the paying screen ask "did it go through?" If Safaricom's callback was lost, this asks Safaricom directly.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, json, settle } from './daraja.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '')
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u?.user) return json(req, { error: 'not_authenticated' }, 401)
  let b: any
  try { b = await req.json() } catch { return json(req, { error: 'invalid_request' }, 400) }
  const { data: p } = await admin.from('business_payments').select('id,status,checkout_request_id,customer_user_id,business_id,created_at').eq('id', String(b.payment_id ?? '')).maybeSingle()
  if (!p) return json(req, { error: 'not_found' }, 404)
  const { data: biz } = await admin.from('businesses').select('owner_id').eq('id', p.business_id).maybeSingle()
  if (p.customer_user_id !== u.user.id && biz?.owner_id !== u.user.id) return json(req, { error: 'not_found' }, 404)
  await admin.rpc('_rate', { p_key: `mpesastatus:${u.user.id}`, p_max: 120, p_window: '1 hour' })
  if (p.status === 'pending' && p.checkout_request_id && Date.now() - Date.parse(p.created_at) > 15000) await settle(admin, p.checkout_request_id, null)
  const { data: after } = await admin.from('business_payments').select('status,needs_review').eq('id', p.id).maybeSingle()
  return json(req, { status: after?.status, needs_review: after?.needs_review })
})
