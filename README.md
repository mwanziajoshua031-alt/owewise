# OweWise

Consumer debt tracker for Kenya (KES default, multi-currency, never summed across currencies). React + TypeScript + Tailwind + Recharts PWA on Supabase project `cfbblqvtjnmwsxdqlkiv`.

## Run
```
npm install
cp .env.example .env     # publishable key only
npm run dev              # npm test, npm run build
```

## What works (verified)
- `tsc`, production build, 11 unit tests (money math, planner).
- Database rules checked in a rolled-back transaction as a signed-in user: RLS isolation, idempotent client_id replay, append-only payments, overpayment block, reversals, Free-plan limits, monthly report.

## Not yet verified
- Signed-in screens have not been clicked through in a browser against the live backend (the build sandbox cannot reach supabase.co). Do a manual pass on a phone.
- Phone-number login (needs an SMS provider configured in Supabase Auth).
- Offline queue and PWA install are implemented but untested on a real device.

## Needs credentials / server work (not built)
Edge Functions: `paystack-checkout`, `paystack-webhook`, `send-notifications` (Resend), `assistant`.
Secrets to set as Edge Function secrets, never in the frontend: PAYSTACK_SECRET_KEY, RESEND_API_KEY, ANTHROPIC_API_KEY, optional Africa's Talking key.
Until then the upgrade button says online payment is not switched on, and email/SMS reminders are not sent (in-app alerts work).

## Rules
Payments are append-only; corrections are reversal rows. Offline mode only queues new creditors, debts and payments.
