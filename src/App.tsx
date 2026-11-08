import { lazy, Suspense, useState, type FormEvent } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { DataProvider } from './lib/store'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Debts from './pages/Debts'
import DebtDetail from './pages/DebtDetail'
import Payments from './pages/Payments'
import { Privacy, Terms } from './pages/Legal'
import { Spinner } from './components/ui'
import { AccountProvider, useAccount } from './lib/account'
import { saveClaimToken, readClaimToken } from './lib/biz'
import BizLayout from './pages/biz/BizLayout'
import BizHome from './pages/biz/BizHome'
import BizDebts from './pages/biz/BizDebts'
import BizDebtDetail from './pages/biz/BizDebtDetail'
import BizCustomers from './pages/biz/BizCustomers'
import NewRequest from './pages/biz/NewRequest'
import BizSettings from './pages/biz/BizSettings'
import Alerts from './pages/Alerts'
import Bills from './pages/Bills'
import BillDetail from './pages/BillDetail'
import Claim from './pages/Claim'
import { UnreadProvider } from './lib/unread'
const Admin = lazy(() => import('./pages/Admin'))

// Heavier pages load on demand.
const Calendar = lazy(() => import('./pages/Calendar'))
const Insights = lazy(() => import('./pages/Insights'))
const Documents = lazy(() => import('./pages/Documents'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const Subscription = lazy(() => import('./pages/Subscription'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Goals = lazy(() => import('./pages/Goals'))

function NewPassword() {
  const { updatePassword } = useAuth()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  async function go(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 8) return setErr('Password must be at least 8 characters')
    const m = await updatePassword(pw)
    if (m) setErr(m)
  }
  return (
    <div className="grid min-h-full place-items-center bg-navy-900 px-4">
      <form onSubmit={go} className="card w-full max-w-sm space-y-3">
        <h1 className="text-lg font-bold">Choose a new password</h1>
        <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" />
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn-primary w-full">Save password</button>
      </form>
    </div>
  )
}

// A debt-request link looks like /claim#<token>. The token stays in the URL fragment (never sent to servers);
// we keep it on this device until the person signs in and claims it.
function captureClaim() {
  if (window.location.pathname === '/claim' && window.location.hash.length > 20) {
    saveClaimToken(window.location.hash.slice(1))
    window.history.replaceState(null, '', '/claim')
  }
}

function ClaimRedirect() {
  const loc = useLocation()
  if (readClaimToken() && loc.pathname !== '/claim') return <Navigate to="/claim" replace />
  return null
}

function BusinessApp() {
  return (
    <Suspense fallback={<Spinner />}>
      <ClaimRedirect />
      <Routes>
        <Route element={<BizLayout />}>
          <Route index element={<BizHome />} />
          <Route path="debts" element={<BizDebts />} />
          <Route path="debts/:id" element={<BizDebtDetail />} />
          <Route path="new" element={<NewRequest />} />
          <Route path="customers" element={<BizCustomers />} />
          <Route path="notifications" element={<Alerts />} />
          <Route path="settings" element={<BizSettings />} />
          <Route path="claim" element={<Claim />} />
          <Route path="admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

function CustomerApp() {
  return (
    <DataProvider>
      <Suspense fallback={<Spinner />}>
        <ClaimRedirect />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="debts" element={<Debts />} />
            <Route path="debts/:id" element={<DebtDetail />} />
            <Route path="bills" element={<Bills />} />
            <Route path="bills/:id" element={<BillDetail />} />
            <Route path="claim" element={<Claim />} />
          <Route path="admin" element={<Admin />} />
            <Route path="payments" element={<Payments />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="insights" element={<Insights />} />
            <Route path="documents" element={<Documents />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="subscription" element={<Subscription />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="goals" element={<Goals />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </DataProvider>
  )
}

function RoleSwitch() {
  const { type } = useAccount()
  return <UnreadProvider>{type === 'business' ? <BusinessApp /> : <CustomerApp />}</UnreadProvider>
}

function Gate() {
  const { session, loading, recovery } = useAuth()
  captureClaim()
  if (loading) return <Spinner />
  if (!session) return <Login />
  if (recovery) return <NewPassword />
  return (
    <AccountProvider
      fallback={<Spinner />}
      failed={(retry, msg) => (
        <div className="grid min-h-full place-items-center px-4"><div className="card max-w-sm space-y-3"><p className="font-bold">Could not load your account</p><p className="text-sm text-slate-500">{msg}</p><button className="btn-primary w-full" onClick={retry}>Try again</button></div></div>
      )}
    >
      <RoleSwitch />
    </AccountProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<Gate />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
