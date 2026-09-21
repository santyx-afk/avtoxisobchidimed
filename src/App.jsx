import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { PageLoader } from './components/ui'
import GlobalErrors from './components/GlobalErrors'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

// Og'irroq sahifalar — kerak bo'lganda yuklanadi (kod bo'linishi)
const Employees = lazy(() => import('./pages/Employees'))
const Calculate = lazy(() => import('./pages/Calculate'))
const Advances = lazy(() => import('./pages/Advances'))
const History = lazy(() => import('./pages/History'))
const Ratings = lazy(() => import('./pages/Ratings'))
const Settings = lazy(() => import('./pages/Settings'))

export default function App() {
  return (
    <>
    <GlobalErrors />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/employees" element={<Lazy><Employees /></Lazy>} />
        <Route path="/calculate" element={<Lazy><Calculate /></Lazy>} />
        <Route path="/advances" element={<Lazy><Advances /></Lazy>} />
        <Route path="/history" element={<Lazy><History /></Lazy>} />
        <Route path="/ratings" element={<Lazy><Ratings /></Lazy>} />
        <Route path="/settings" element={<Lazy><Settings /></Lazy>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}

function Lazy({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}
