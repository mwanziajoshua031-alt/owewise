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
