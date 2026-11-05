import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CONTACT_EMAIL, LAST_UPDATED, OPERATOR_NAME } from '../lib/legal'

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/" className="text-sm font-semibold text-brand-700 underline dark:text-brand-400">← Back to OweWise</Link>
      <h1 className="mt-4 text-2xl font-extrabold">{title}</h1>
      <p className="mb-4 text-xs text-slate-500">Last updated {LAST_UPDATED}</p>
      <div className="space-y-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-bold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{children}</div>
      <p className="mt-8 text-xs text-slate-500">
        <Link className="underline" to="/privacy">Privacy Policy</Link> · <Link className="underline" to="/terms">Terms of Use</Link>
      </p>
    </div>
  )
}

export function Privacy() {
  return (
    <Shell title="Privacy Policy">
      <p>OweWise helps you keep a private record of money you owe. This policy explains what personal data we handle and your rights under the Kenya Data Protection Act, 2019.</p>

      <h2>Who is responsible for your data</h2>
      <p>{OPERATOR_NAME} (&ldquo;we&rdquo;) is the data controller. Contact us by email at {CONTACT_EMAIL}.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account details:</b> your email, name, and optionally your phone number.</li>
        <li><b>Records you enter:</b> creditors (names, optional phone numbers and notes), debts, payments, reminders and goals.</li>
        <li><b>Files you upload:</b> receipts, invoices and similar documents.</li>
        <li><b>Sign-in and device data:</b> a session token and, so the app works offline, a copy of your records stored on your own device.</li>
        <li><b>Subscription status.</b> When paid plans are switched on, payments are handled by Paystack. We do not see or store your card details or M-Pesa PIN.</li>
      </ul>
      <p>The records you enter may include other people&rsquo;s names and phone numbers (your creditors). Please enter only what you need.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To run the app and show you your own records (necessary to provide the service).</li>
        <li>To send reminders by email or SMS, only if you turn them on (your consent, which you can withdraw in Settings).</li>
        <li>To keep the service secure and to meet legal obligations.</li>
      </ul>
      <p>We do not sell your data, we do not contact your creditors, and we do not report your debts to anyone.</p>

      <h2>Who handles data for us</h2>
      <ul>
        <li><b>Supabase</b> for the database, sign-in and file storage. Your data is stored in Ireland (EU West).</li>
        <li><b>Netlify</b> to host the website.</li>
        <li>When the matching features are switched on: <b>Paystack</b> (payments), an <b>email provider</b> (reminders), an <b>SMS provider</b> (reminders) and <b>Anthropic</b> (the AI assistant, which receives your question and only the records needed to answer it).</li>
      </ul>
      <p>Because Ireland and some of these providers are outside Kenya, your data is transferred abroad. We use providers that apply security safeguards, and we transfer only what is needed.</p>

      <h2>How long we keep it</h2>
      <p>We keep your records until you delete them or delete your account. Deleting your account removes your records and uploaded files. Short-lived backups held by our hosting provider may take a limited time to roll off.</p>

      <h2>Your rights</h2>
      <p>You can ask to be told what we hold, to see it, to correct it, to object to its use, to have it deleted, and to receive a copy in a portable format. You can download all your data and delete your account yourself in Settings. For anything else, email {CONTACT_EMAIL}.</p>

      <h2>Security</h2>
      <p>Data is encrypted in transit. Each account can read only its own records, and payments are stored as an append-only history so they cannot be quietly altered. No system is perfectly secure. If a breach puts your data at risk, we will tell the Office of the Data Protection Commissioner and affected users as the law requires.</p>

      <h2>Children</h2>
      <p>OweWise is for people aged 18 and over.</p>

      <h2>Complaints</h2>
      <p>If you are unhappy with how we handle your data, contact us first. You may also complain to the Office of the Data Protection Commissioner of Kenya (odpc.go.ke).</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters to you, we will tell you in the app.</p>
    </Shell>
  )
}

export function Terms() {
  return (
    <Shell title="Terms of Use">
      <p>By creating an account you agree to these terms.</p>

      <h2>What OweWise is</h2>
      <p>OweWise is a personal record-keeping tool. It is not a lender, a bank, a credit bureau, or a debt collector. It does not pay your creditors, and it does not give financial or legal advice. Plans and projections use only the figures you enter, and do not include interest unless you add it as a charge.</p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or older and give accurate details.</li>
        <li>Keep your password private. You are responsible for activity on your account.</li>
        <li>The records you enter are yours. You are responsible for their accuracy.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not try to break into the service or other people&rsquo;s accounts, overload it, upload unlawful or harmful files, or use it to harass anyone.</p>

      <h2>Free and Premium plans</h2>
      <p>The Free plan has limits (currently 5 active debts, 5 creditors and 20 stored files). Premium removes or raises them. When paid plans are available, prices are shown in Kenyan shillings before you pay, you will be asked to confirm before being charged, and you can cancel at any time and keep access until the end of the period you paid for.</p>

      <h2>Availability</h2>
      <p>We work to keep OweWise running but cannot promise it will always be available or error-free. Keep your own copy of anything important; you can download your data in Settings.</p>

      <h2>Liability</h2>
      <p>To the extent the law allows, we are not liable for losses that result from decisions you make using the app, or from interruptions outside our control. Nothing here limits rights you have under Kenyan consumer law.</p>

      <h2>Ending your account</h2>
      <p>You can delete your account at any time in Settings. We may suspend accounts that break these terms.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of Kenya.</p>

      <h2>Contact</h2>
      <p>{OPERATOR_NAME}, {CONTACT_EMAIL}.</p>
    </Shell>
  )
}
