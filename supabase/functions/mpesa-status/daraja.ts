// Safaricom Daraja helpers. Credentials belong to each business and are decrypted server-side only.
// deno-lint-ignore-file no-explicit-any
export type Creds = { environment: 'sandbox' | 'production'; account_type: 'paybill' | 'till'; shortcode: string; till_number: string | null; key: string; secret: string; passkey: string }
const HOST = { sandbox: 'https://sandbox.safaricom.co.ke', production: 'https://api.safaricom.co.ke' }

export const ORIGINS = ['https://owewise.netlify.app']
export function cors(req: Request): Record<string, string> {
  const o = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
  }
}
export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } })
}

export function msisdn(p: string): string | null {
  const d = (p ?? '').replace(/[\s\-()+]/g, '')
  if (/^254[17][0-9]{8}$/.test(d)) return d
  if (/^0[17][0-9]{8}$/.test(d)) return '254' + d.slice(1)
  if (/^[17][0-9]{8}$/.test(d)) return '254' + d
  return null
}

function stamp(): string {
  const t = new Date(Date.now() + 3 * 3600 * 1000) // East Africa Time
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`
}

export async function accessToken(c: Pick<Creds, 'environment' | 'key' | 'secret'>): Promise<string> {
  const r = await fetch(`${HOST[c.environment]}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: 'Basic ' + btoa(`${c.key}:${c.secret}`) }, signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw new Error('oauth_failed')
  const j = await r.json()
  if (!j.access_token) throw new Error('oauth_failed')
  return j.access_token as string
}

async function post(c: Creds, path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: any }> {
  const tok = await accessToken(c)
  const ts = stamp()
  const r = await fetch(`${HOST[c.environment]}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ BusinessShortCode: c.shortcode, Password: btoa(c.shortcode + c.passkey + ts), Timestamp: ts, ...body }),
  })
  let data: any = {}
  try { data = await r.json() } catch { /* empty */ }
  return { ok: r.ok, data }
}

export async function stkPush(c: Creds, a: { amount: number; phone: string; callbackUrl: string; reference: string; desc: string }) {
  const till = c.account_type === 'till'
  const { ok, data } = await post(c, '/mpesa/stkpush/v1/processrequest', {
    TransactionType: till ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
    Amount: a.amount, PartyA: a.phone, PartyB: till ? (c.till_number ?? c.shortcode) : c.shortcode, PhoneNumber: a.phone,
    CallBackURL: a.callbackUrl, AccountReference: a.reference.slice(0, 12), TransactionDesc: a.desc.slice(0, 13),
  })
  return { ok: ok && String(data.ResponseCode) === '0', merchantRequestId: data.MerchantRequestID as string | undefined, checkoutRequestId: data.CheckoutRequestID as string | undefined, message: (data.CustomerMessage ?? data.ResponseDescription ?? data.errorMessage ?? '') as string }
}

/** Asks Safaricom for the final result. `pending` means "no final answer yet". */
export async function stkQuery(c: Creds, checkoutId: string): Promise<{ pending: boolean; code?: number; desc?: string }> {
  const { ok, data } = await post(c, '/mpesa/stkpushquery/v1/query', { CheckoutRequestID: checkoutId })
  if (!ok || data.ResultCode === undefined) return { pending: true }
  return { pending: false, code: Number(data.ResultCode), desc: String(data.ResultDesc ?? '') }
}

/** Confirm a payment's outcome with Safaricom, then record it. Idempotent. */
export async function settle(admin: any, checkoutId: string, cb: { amount?: number; receipt?: string } | null): Promise<string> {
  const { data: p } = await admin.from('business_payments').select('id,business_id,status').eq('checkout_request_id', checkoutId).maybeSingle()
  if (!p || p.status !== 'pending') return 'ignored'
  const { data: creds } = await admin.rpc('read_mpesa_credentials', { p_business: p.business_id })
  if (!creds) return 'no_credentials'
  let q
  try { q = await stkQuery(creds as Creds, checkoutId) } catch { return 'pending' }
  if (q.pending) return 'pending'
  const ok = q.code === 0
  const { data } = await admin.rpc('apply_mpesa_result', {
    p_checkout: checkoutId, p_code: q.code, p_desc: q.desc ?? '',
    p_receipt: ok ? (cb?.receipt ?? null) : null, p_amount: ok ? (cb?.amount ?? null) : null, p_verified: ok && !!cb?.receipt,
  })
  return String(data)
}
