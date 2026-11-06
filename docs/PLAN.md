# OweWise two-sided platform: plan and decisions

Branch: `two-sided-platform` (merge to `main` deploys the live site via GitHub Actions). Database migrations are ADDITIVE and applied to the live Supabase project, so they must never break the current app.

## Decisions (made without the owner; change if wrong)
1. **Money goes straight to the business.** Each business connects its OWN M-Pesa Till/Paybill (Daraja credentials stored server-side only). OweWise never holds customer funds. Holding funds would likely need a Central Bank of Kenya payment-service-provider licence. Platform revenue = business subscriptions only. Owner should get legal advice.
2. **Customers link by secure invite link, not by phone matching.** A business enters the customer's phone, the debt is created with a one-time claim token (only its hash is stored), and the business shares the link (WhatsApp/SMS/copy). Matching unverified phone numbers could expose one person's debt to another. Once a customer claims one link, that business's other debts for the same phone attach to them.
3. **Existing personal tracker stays** as the "Personal tracker" for customer accounts. Existing users become customer accounts. Existing data is untouched.
4. **One role per account** (customer or business). Admin is a separate table that only the database owner can write.
5. **No client writes to financial tables.** Clients can only read what they are party to. All changes go through checked database functions (RPCs). Payments are append-only and immutable once final.
6. **M-Pesa success is verified server-side**: callback arrives on a secret URL, the Edge Function re-queries Daraja's STK status, then calls a service-only SQL function that is idempotent (duplicate callbacks ignored). Pending amounts are reserved so two parallel pushes cannot overpay.
7. A disputed debt cannot be paid until the dispute is resolved. A customer must confirm a debt before paying.
8. Kenyan law: Data Protection Act 2019 (privacy pages exist), no threatening collection messages, no hidden fees.

## Phases
0. Inspect + plan (this file)
1. Database: accounts, businesses, customers, business debts, payments, receipts, disputes, messages, reports, RLS, RPCs, audit, tests
2. App: registration by type, business dashboard, send debt request (review step), customer claim link, My Debts, confirm/dispute/messages/extensions
3. M-Pesa Edge Functions (stk-push, callback, reconcile), receipts, notifications. NEEDS Safaricom credentials to go live
4. Admin panel, configurable business plans/pricing, rate limiting review, end-to-end test, docs

## Known gaps / to revisit
- Deleting a business account is blocked while it has debt records (financial-record retention vs erasure). Needs a "close and anonymise" flow and legal advice.
- SMS/WhatsApp sending needs provider credentials. Until then: in-app notifications + shareable wa.me / sms: links opened from the business's own phone.
- Daraja has no payload signature; defence is secret URL + status re-query + idempotency.

## Progress log
- 2026-11-06 Phase 1 DONE (database): applied to Supabase: two_sided_accounts, two_sided_debt_tables, two_sided_rls_and_helpers, two_sided_rpcs, revoke_trigger_fn_exec.
  Tested in a rolled-back transaction: claim link single-use, pay-before-confirm blocked, overpay blocked, idempotent M-Pesa result, immutable payments, no delete, dispute blocks payment, stranger blocked, receipts numbered, audit rows written.
  Security advisor: no errors. Owner TODO: turn on Leaked Password Protection in Supabase Auth settings.
- Next: Phase 2 (app UI), Phase 3 (M-Pesa edge functions, needs Daraja credentials), Phase 4 (admin).
