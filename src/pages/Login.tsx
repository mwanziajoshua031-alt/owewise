import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { readClaimToken } from '../lib/biz'

type Mode = 'signin' | 'signup' | 'reset'

export default function Login() {
  const { signIn, signUp, resetPassword } = useAuth()
  const [mode, setMode] = useState<Mode>(readClaimToken() ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const claiming = !!readClaimToken()
  const [kind, setKind] = useState<'customer' | 'business'>('customer')
  const [bizName, setBizName] = useState('')
  const [bizCategory, setBizCategory] = useState('')
  const [bizLocation, setBizLocation] = useState('')
  const [bizPhone, setBizPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    setInfo('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Enter a valid email address')
    if (mode !== 'reset' && password.length < 8) return setErr('Password must be at least 8 characters')
    if (mode === 'signup' && kind === 'business' && bizName.trim().length < 2) return setErr('Enter your business name')
    if (mode === 'signup' && !agree) return setErr('Please agree to the Terms and Privacy Policy to continue')
    setBusy(true)
    let e2: string | null = null
    if (mode === 'signin') e2 = await signIn(email, password)
    else if (mode === 'signup') {
      e2 = await signUp(email, password, name, kind === 'business' && !claiming
        ? { account_type: 'business', business_name: bizName.trim(), business_category: bizCategory.trim(), business_location: bizLocation.trim(), business_phone: bizPhone.trim() }
        : { account_type: 'customer' })
      if (!e2) setInfo('Check your email for a verification link, then sign in.')
    } else {
      e2 = await resetPassword(email)
      if (!e2) setInfo('If that email has an account, a reset link is on its way.')
    }
    setBusy(false)
    if (e2) setErr(e2)
  }

  return (
    <div className="grid min-h-full place-items-center bg-navy-900 px-4 pb-28 pt-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-2xl font-extrabold">O</div>
          <h1 className="text-2xl font-extrabold">OweWise</h1>
          <p className="mt-1 text-sm text-slate-300">Know what you owe. Pay it down with a plan.</p>
        </div>
        <form onSubmit={submit} noValidate className="card space-y-3">
          <h2 className="text-lg font-bold">{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}</h2>
          {claiming && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">A business sent you a debt request. Sign in or create a customer account to review it.</p>}
          {mode === 'signup' && !claiming && (
            <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-2">
              {([['customer', 'I owe / I pay'], ['business', 'I am a business']] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${kind === k ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-slate-300 text-slate-600'}`}>{l}</button>
              ))}
            </div>
          )}
          {mode === 'signup' && kind === 'business' && !claiming && (
            <>
              <div><label className="label" htmlFor="bn">Business name</label><input id="bn" className="input" maxLength={120} value={bizName} onChange={(e) => setBizName(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="bc">Category</label><input id="bc" className="input" maxLength={60} placeholder="e.g. Shop" value={bizCategory} onChange={(e) => setBizCategory(e.target.value)} /></div>
                <div><label className="label" htmlFor="bl">Location</label><input id="bl" className="input" maxLength={120} placeholder="e.g. Nakuru" value={bizLocation} onChange={(e) => setBizLocation(e.target.value)} /></div>
              </div>
              <div><label className="label" htmlFor="bp">Business phone</label><input id="bp" className="input" inputMode="tel" placeholder="07XX XXX XXX" value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} /></div>
            </>
          )}
          {mode === 'signup' && (
            <div>
              <label className="label" htmlFor="name">{kind === 'business' && !claiming ? 'Your full name' : 'Full name'}</label>
              <input id="name" className="input" autoComplete="name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== 'reset' && (
            <div>
              <label className="label" htmlFor="pw">Password</label>
              <input id="pw" className="input" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {mode === 'signup' && (
            <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I am 18 or older and agree to the <Link className="underline" to="/terms">Terms</Link> and <Link className="underline" to="/privacy">Privacy Policy</Link>.</span>
            </label>
          )}
          {err && <p className="err" role="alert">{err}</p>}
          {info && <p className="text-sm text-green-700 dark:text-green-400" role="status">{info}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
          <div className="flex justify-between text-sm">
            {mode === 'signin' ? (
              <>
                <button type="button" className="text-brand-700 underline dark:text-brand-400" onClick={() => setMode('signup')}>Create account</button>
                <button type="button" className="text-slate-500 underline" onClick={() => setMode('reset')}>Forgot password?</button>
              </>
            ) : (
              <button type="button" className="text-brand-700 underline dark:text-brand-400" onClick={() => setMode('signin')}>Back to sign in</button>
            )}
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          Your records are private to you. <Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/terms">Terms</Link>
        </p>
      </div>
    </div>
  )
}
