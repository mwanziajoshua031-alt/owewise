// deno-lint-ignore-file no-explicit-any
// Called by Safaricom. It carries no user login, so we require a secret in the URL AND confirm the result
// with Safaricom directly before recording anything.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { settle } from './daraja.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const ack = () => new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), { headers: { 'Content-Type': 'application/json' } })

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const k = new URL(req.url).searchParams.get('k') ?? ''
  const { data: secret } = await admin.rpc('mpesa_callback_secret')
  if (!secret || !same(k, String(secret))) return new Response('Forbidden', { status: 403 })
  try {
    const body: any = await req.json()
    const cb = body?.Body?.stkCallback
    const checkout = String(cb?.CheckoutRequestID ?? '')
    if (checkout) {
      const items: any[] = cb?.CallbackMetadata?.Item ?? []
      const get = (n: string) => items.find((i) => i.Name === n)?.Value
      const amount = get('Amount'); const receipt = get('MpesaReceiptNumber')
      await settle(admin, checkout, Number(cb.ResultCode) === 0 ? { amount: amount === undefined ? undefined : Number(amount), receipt: receipt ? String(receipt) : undefined } : null)
    }
  } catch { /* always acknowledge so Safaricom does not keep retrying; reconcile covers misses */ }
  return ack()
})
