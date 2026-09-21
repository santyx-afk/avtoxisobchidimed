import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { PageLoader } from './ui'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}
