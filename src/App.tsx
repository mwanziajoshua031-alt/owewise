import { lazy, Suspense, useState, type FormEvent } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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

function Gate() {
  const { session, loading, recovery } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Login />
  if (recovery) return <NewPassword />
  return (
    <DataProvider>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="debts" element={<Debts />} />
            <Route path="debts/:id" element={<DebtDetail />} />
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
