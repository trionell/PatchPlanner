import { Navigate, Outlet } from 'react-router-dom'
import { useCurrentUser } from '../hooks/useCurrentUser'

export function RequireAuth() {
  const { user, isLoading } = useCurrentUser()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
