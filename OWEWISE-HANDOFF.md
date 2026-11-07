# OweWise: handoff (attach this in a new chat and say "continue building")

## Goal
OweWise: consumer debt tracker for Kenya (KES default, multi-currency, never add currencies together). Mobile-first PWA. React + TypeScript + Tailwind + Recharts, Supabase. Freemium: Free (5 active debts, 5 creditors, 20 files) / Premium $0.99/mo (KES equivalent, annual discount), M-Pesa + card via Paystack Kenya.

## Standing rules from the owner
- Follow Kenyan law (Data Protection Act 2019) and protect the app from attackers.
- Be honest about what is untested. Never claim an integration works without credentials.
- Never modify historical payments (corrections are reversal rows). Never add different currencies.
- Do NOT touch the other Supabase project "denitracker".

## Live
- App: https://owewise.netlify.app (Netlify, manual zip upload; every change = new zip of `dist`).
- Supabase project: `cfbblqvtjnmwsxdqlkiv` (eu-west-1, Ireland). Publishable key is in `.env.example`.
- Owner signed up and signed in successfully on the live site (account confirmed, profile + free subscription created).
- Auth redirect URLs set to https://owewise.netlify.app and https://owewise.netlify.app/** (owner did this).

## Built and verified
- Database (RLS everywhere, append-only payments, overpayment block, reversals, free limits, idempotent client_id, monthly_report, export, delete, cancel): checked in a rolled-back transaction as a signed-in user.
- Frontend: auth + reset, dashboard + charts, debts/creditors CRUD, payments + reversals, disputes, reminders, calendar, insights + planner, receipts wallet (private bucket, signed URLs), goals, alerts, settings (export JSON, delete account), subscription page, offline queue, dark/light theme, Privacy + Terms pages, sign-up consent (terms version stored in user metadata).
- tsc clean, build OK, 11 unit tests pass, 0 production npm vulnerabilities (react-router-dom 7.18.x), app tested under strict security headers with no CSP violations.
- Security headers + CSP in `public/_headers`; SPA redirect in `public/_redirects`.
- Account deletion now removes uploaded files first, then the account (was a gap before; the new client code is NOT yet tested against the live backend).

## Known issues / not verified
- Signed-in screens only verified with mock data; owner is doing a manual phone test (add debt, payment, reversal, planner, offline mode).
- Email: custom SMTP in Supabase (smtp.gmail.com:465) was failing with `535 Authentication failed` (needs a Gmail app password). Current state of "Confirm email" unknown. Plan: move to Resend.
- Privacy/Terms pages contain placeholders in `src/lib/legal.ts` (OPERATOR_NAME, CONTACT_EMAIL) that MUST be filled before launch. Text is a plain-language draft, needs review by a Kenyan lawyer.

## Remaining
1. Fill legal placeholders; lawyer review; register with the Office of the Data Protection Commissioner (odpc.go.ke) as a data controller (owner's obligation).
2. Supabase dashboard: fix SMTP (Resend), turn "Confirm email" on, set minimum password length 8+, check leaked-password protection and auth rate limits.
3. Paystack: `paystack-checkout` and `paystack-webhook` edge functions (verify HMAC signature, dedupe via webhook_events, verify amount, update subscriptions/billing_transactions). Needs sk_test key as secret PAYSTACK_SECRET_KEY (set in Supabase dashboard, never in chat) and owner's KES prices. Paystack fees: M-Pesa 1.5%, local cards 2.9%, intl cards 3.8%, no setup/monthly fee.
4. `send-notifications` edge function (Resend) for notifications rows where email_sent_at/sms_sent_at is null; optional SMS (Africa's Talking).
5. AI assistant: edge function reading only the user's own rows with their JWT, rate-limited via assistant_usage, no invented data; needs ANTHROPIC_API_KEY; decide free-tier daily limit.
6. Phone-number sign-in (needs SMS provider). PNG app icons. Real PDF export (currently print). Receipts shown on debt page. Edit goals. Paginate payments. Custom domain. Connect Netlify to GitHub for auto-deploys. Backups + error monitoring.

## Local files
`/home/claude/owewise` (may be gone in a new session; rebuild from this file and the Supabase schema). Key files: src/lib/{money,store,offline,auth,derive,legal}.ts(x), src/pages/*, src/components/{Layout,forms,ui}.tsx.

## Update: deployment via GitHub (in progress)
- Netlify site `owewise` (id 21ced5b3-f8ed-4caa-8737-9b81743f2bd3) is live at https://owewise.netlify.app but was deployed by manual zip. The build sandbox cannot reach Netlify's upload service (403), so deploys from the sandbox do not work.
- Plan: push code to GitHub repo `mwanziajoshua031-alt/owewise` (owner created it, private, empty), then link it in Netlify (Project configuration > Continuous deployment). `netlify.toml` and `.gitignore` are already in the project.
- Blocker: the GitHub link in Claude only lists the owner's 4 other public repos (smartbasket-kenya, goofreel, joshua.ai, efootball-squadlab) and does not include `owewise`. DO NOT push to those other repos. The owner has no computer (phone only). Owner was told to either make `owewise` public temporarily or revoke and reconnect GitHub with private-repo access; add_repo still failed after that.
- Fallback: `owewise-source.zip` (49 files) and `owewise-netlify.zip` (built site) were sent to the owner.
- Latest changes (security headers, Privacy/Terms, file cleanup on delete, router upgrade) are built into owewise-netlify.zip but NOT yet live on owewise.netlify.app.

## Update 2026-11-05
- Auto-deploy works: GitHub Actions (`.github/workflows/deploy.yml`) builds, tests and deploys to Netlify on every push to `main` (secret NETLIFY_AUTH_TOKEN set by owner). Netlify's own Git linking is NOT used. The sandbox cannot reach netlify.app or supabase.co.
- Live deploy confirmed with security headers and SPA redirect.
- "Powered by Netlify" badge is a Netlify setting: Project configuration > General > Powered by Netlify badge (switch off). Not controllable from code.
- Added: PNG app icons + apple-touch-icon, receipts section on each debt, edit goals, "show more" on payments, real PDF statement (jspdf, lazy loaded), login bottom padding. 0 production npm vulnerabilities.
- Legal contact set (email only; operator name currently just "OweWise", owner should give full legal name or business name). Still to do: lawyer review; ODPC registration; SMTP/Resend; Paystack; reminders email/SMS; AI assistant; phone login; custom domain.


## 2026-11-07 update: two-sided platform
- Account types: customer (personal tracker + Bills from businesses) and business (dashboard, send debt request, customers, payments, disputes, messages, M-Pesa setup). Admin panel at /admin for platform admins (table platform_admins; owner seeded).
- Database: migrations two_sided_accounts, two_sided_debt_tables, two_sided_rls_and_helpers, two_sided_rpcs, revoke_trigger_fn_exec, disputes_raised_by_set_null, mpesa_settings_vault, admin_panel_rpcs. All financial writes go through SECURITY DEFINER RPCs; clients have no direct write access to financial tables. Payments are append-only.
- Edge functions (source in supabase/functions): mpesa-stk-push, mpesa-callback, mpesa-status, mpesa-settings. Deployed with verify_jwt=false; each authenticates the user itself (callback uses a secret URL + Safaricom confirmation).
- Claim link format: /claim#<token> (token in URL fragment; stored hash only in DB; single use; 30 days).
- Untested: anything that talks to Safaricom. To test: create a Daraja sandbox app, then in a business account Settings > M-Pesa payments, enter sandbox credentials (Paybill 174379 + the public sandbox passkey), then pay from a customer account with a sandbox test number.
- Owner TODOs: enable Leaked Password Protection (Supabase Auth); decide Daraja vs aggregator for real businesses; lawyer review of Privacy/Terms; ODPC registration; OPERATOR_NAME; Paystack for business plans; SMTP/Resend.

## 2026-11-07 Phase 5 (done)
- Business account closing: Settings > Close my business account (blocked while debts are unpaid or payments pending; record is anonymised, login removed). `delete_my_account` handles customers and businesses.
- `export_my_data` now includes business-side records (no claim-token hashes). Business Settings has a Download button.
- Daily in-app reminders for business debts: `generate_business_notifications()` (pg_cron 02:05 UTC = 05:05 Nairobi). Customers get due-soon, overdue (weekly) and please-review nudges; businesses get a weekly overdue summary.
- Customer home shows a Bills card when they have open bills.
- Still deferred: subscriptions/Paystack, email + SMS delivery (needs Resend/SMS provider keys).
