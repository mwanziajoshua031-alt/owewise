# OweWise: handoff (attach this in a new chat and say "continue building")

## Goal
OweWise: consumer debt tracker for Kenya (KES default, multi-currency, never add currencies together). Mobile-first PWA. React + TypeScript + Tailwind + Recharts, Supabase. Freemium: Free (5 active debts, 5 creditors, 20 files) / Premium $1.99/mo (KES equivalent, annual discount), M-Pesa + card via Paystack Kenya.

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

## 2026-11-08 Message alerts (built, waiting for Netlify deploy credits ~23 Nov)
- DB: `debt_reads` + RPCs `mark_debt_read(debt)` and `unread_counts()` (messages and disputes from the other side that you have not opened). Opening a debt's thread marks it read and clears its message notifications.
- App: `src/lib/unread.tsx` polls every 30s and on return to foreground. Red "N new" badges on business Debts/Home and customer Bills, red dots on nav, summary banner on business Home, app-icon badge where supported, and a browser/phone notification if the user allows it (only while the app is open or backgrounded).
- NOT built: delivery when the app is fully closed (needs email via Resend, SMS provider, or Web Push).
- Deploy: main contains Phase 5 + message alerts; CI deploy step fails with Netlify "Forbidden" (credits). Re-run the failed GitHub Actions run after credits return.

## 2026-11-08 — Counter tools
- Migration `quick_record_limits_reports`: `create_quick_debt` (owner's own record, no customer confirmation), `set_credit_limit` (enforced in both debt flows), `log_reminder`, `business_report(p_currency)`.
- UI: Quick record (`/new?mode=quick`), WhatsApp reminders + share balance (wa.me links, no API/keys), customer PDF statement, credit-limit modal, `/reports` (tiles, aging, top debtors, Debts/Payments CSV).
- Tested: DB logic via rolled-back SQL; UI via mocked-Supabase Playwright. Not tested against real WhatsApp.
- Deploy blocked until Netlify credits (23rd): then `gh run rerun <id> --repo mwanziajoshua031-alt/owewise`.

## 2026-11-10: staff roles (database done), new owl icon, Premium price
- Owner decisions: Premium is now **$1.99/month** (replaces $0.99); staff is part of Premium. The paywall is NOT enforced yet (subscriptions/Paystack still deferred). Only the price text on the Subscription page was changed in code.
- Staff roles, database only. Migration file: `supabase/migrations/20261110_staff_roles.sql` (already applied to the live project in four steps; the file is the consolidated final state, do not re-apply). Adds `business_members`, `business_invites`, helpers `can_work_business`, `is_staff_of`, `acting_business_id`, RPCs `invite_staff(email)`, `accept_staff_invite(invite_id)`, `revoke_staff_invite`, `remove_staff`. Invites are by email, expire in 7 days, max 10 staff, rate limited; invite/join/remove are written to `business_audit_logs`.
- Permission split (owner approved). Staff CAN: view customers/debts/payments/receipts, add customers and debts (quick record + debt request), record manual cash/other payments, log reminders. Owner ONLY: business reports (owner confirmed), M-Pesa settings, business profile, credit limits, cancelling debts, reversing payments, resolving disputes, managing staff. A staff member belongs to one business; a person's own business wins in `acting_business_id()`.
- Tested in rolled-back SQL transactions as a real staff user and as an unrelated user: staff see the shop's debts and can record a debt, a cash payment (receipt issued) and a reminder; blocked from credit limit, reversal, cancel, invite, reports; a stranger sees nothing. Solo owners unchanged. Not tested through the app UI (there is no staff UI yet).
- (SUPERSEDED, all built later on 2026-11-10, see the section at the bottom) Was not built at the time:
  1. Two read RPCs the invite flow needs: one so an invited person can find their pending invite(s) by their signed-in email (today only the owner can read `business_invites`, so the invitee has no way to learn the invite id, and no email is sent because Resend is not set up), and one so the owner can list staff with email (the `business_members` table only has user ids).
  2. App screens: Settings > Staff (invite by email, pending invites with revoke, staff list with remove), an "accept invite" step after sign-in, and a staff mode that hides owner-only buttons (reports, M-Pesa, credit limits, reversals, cancel, disputes). Check how the app decides business vs customer account at sign-in, since a staff user is not a business owner.
  3. Optional: staff-created records already store `created_by`; show "added by" in the UI.
- Icon: the owl logo supplied by the owner (owl only, without the "owewiseReminder" wording) now provides every icon: `public/icons/` (192, 512, maskable 512, apple-touch 180, favicon 32/48), manifest `background_color` set to the logo cream `#FAF6EB`, `theme_color` stays navy. Old `public/icon.svg` removed. The placeholder "O" squares in both layouts and the login page now use `BrandMark` (`src/components/ui.tsx`). The 2000x2000 original is not stored in the repo; ask the owner for it if icons need regenerating.
- GitHub: in a chat where the repo is not attached, call `add_repo` for `mwanziajoshua031-alt/owewise` (push access), then clone. This worked on 2026-11-10 after earlier sessions could not see the repo.
- Deploy: pushes to `main` run the CI build and tests; the Netlify deploy step is expected to fail with "Forbidden" until the owner's Netlify credits return (~23 Nov). Then re-run the failed GitHub Actions run to publish the latest version.

## 2026-11-10 (later): staff screens built
- Migration `supabase/migrations/20261110_staff_invite_reads.sql` (already applied live, do not re-apply): `list_staff()`, `my_staff_invites()`, hardened `accept_staff_invite` (confirmed email required, owners cannot join another shop, one shop per staff, suspended shops refused), `leave_business()`.
- App: Settings > Staff for owners (`src/components/staff.tsx`), invite banner on the customer home screen, staff mode (`role` in `useAccount()`): staff see the business screens but no Reports, Alerts, M-Pesa, business profile, credit limits, cancel, reversal, disputes, invoice upload or messages. Staff Settings has Sign out and "Stop working for this business".
- Tested only with a mocked browser (40 checks) and rolled-back SQL, NOT with a real staff sign-in on the live backend. Do that before relying on it.
- Still to do: invites are NOT emailed (needs Resend; owner copies a message and sends it by WhatsApp/SMS); staff cannot upload invoices (storage policy is owner-only); "added by" display; staff Alerts; paywall for staff (Premium $1.99).

## 2026-11-12: trust score, reminder list, branches
- Migration `supabase/migrations/20261112_trust_reminders_branches.sql` (already applied live in two steps, do not re-apply). Adds `customer_trust(customer)` and `customer_trust_all()` (reliable / mixed / risky from finished debts only; needs 3 finished debts; cancelled, disputed and awaiting_review ignored), `reminders_due()` (due within 3 days and not reminded in 3 days, or overdue and not reminded in 7 days), table `business_branches`, `branch_id` on `business_debts` and `business_members`, view `business_debt_balances` now has `branch_id`, RPCs `add_branch`, `rename_branch`, `delete_branch` (owner), `set_debt_branch` (owner or staff), `set_staff_branch` (owner), `list_staff` now returns `branch_id`. A staff member with a default branch gets it on the debts they create (trigger).
- App: trust badge and sentence on Customers (owner and staff); `/reminders` screen plus a "N reminders to send today" card on Home (one tap opens WhatsApp and logs the reminder); Settings > Branches (owner); branch chips on Home and Debts, branch dropdown when recording a debt and on the debt page; staff default branch dropdown in Settings > Staff. Owners with no branches see none of the branch UI.
- Tested with rolled-back SQL (owner, staff, stranger) and a mocked browser (24 new checks plus the 40 staff checks). NOT tested with a real account on the live app.
- Limits to know: reminders are NOT sent automatically (a person taps Send; automatic SMS/WhatsApp needs a provider such as Africa's Talking or the WhatsApp Business API); staff are not restricted to their branch (the default branch only tags new debts); reports and the customer list are not split by branch; M-Pesa auto-matching untouched (needs Daraja credentials); paywall still not enforced.
