// deno-lint-ignore-file no-explicit-any
// A business saves its own Daraja credentials. They are verified with Safaricom, encrypted inside the database,
// and are never sent back to the browser.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { accessToken, cors, json } from './daraja.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '')
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u?.user) return json(req, { error: 'not_authenticated' }, 401)
  const { data: biz } = await admin.from('businesses').select('id,status').eq('owner_id', u.user.id).maybeSingle()
  if (!biz) return json(req, { error: 'not_a_business' }, 403)
  if (biz.status !== 'active') return json(req, { error: 'business_suspended' }, 403)
  let b: any
  try { b = await req.json() } catch { return json(req, { error: 'invalid_request' }, 400) }
  const { error: rl } = await admin.rpc('_rate', { p_key: `mpesaset:${u.user.id}`, p_max: 15, p_window: '1 hour' })
  if (rl) return json(req, { error: 'rate_limited' }, 429)

  const env = b.environment === 'production' ? 'production' : 'sandbox'
  const type = b.account_type === 'till' ? 'till' : 'paybill'
  const f = (k: string) => String(b[k] ?? '').trim()
  if (!/^[0-9]{5,8}$/.test(f('shortcode')) || (f('till_number') && !/^[0-9]{5,8}$/.test(f('till_number')))) return json(req, { error: 'invalid_shortcode' }, 400)
  if (f('key').length < 10 || f('secret').length < 10 || f('passkey').length < 20) return json(req, { error: 'invalid_credentials' }, 400)
  try { await accessToken({ environment: env, key: f('key'), secret: f('secret') }) } catch { return json(req, { error: 'mpesa_credentials_rejected' }, 400) }
  const { error } = await admin.rpc('save_mpesa_credentials', { p_business: biz.id, p_env: env, p_type: type, p_shortcode: f('shortcode'), p_till: f('till_number'), p_key: f('key'), p_secret: f('secret'), p_passkey: f('passkey') })
  if (error) return json(req, { error: 'save_failed' }, 500)
  return json(req, { ok: true })
})
