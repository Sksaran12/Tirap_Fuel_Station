import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DailyEntry from './pages/DailyEntry'
import Stock from './pages/Stock'
import Credit from './pages/Credit'
import Expenses from './pages/Expenses'
import CashBook from './pages/CashBook'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DayProvider } from './context/DayContext'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-[12px] text-[#4E525A]">
        <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-[#D2D5D9] border-t-[#17191F]" />
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <DayProvider>
                <AppLayout />
              </DayProvider>
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="daily-entry" element={<DailyEntry />} />
          <Route path="stock" element={<Stock />} />
          <Route path="credit" element={<Credit />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="cash-book" element={<CashBook />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
