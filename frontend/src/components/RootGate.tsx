import { Navigate, useLocation } from 'react-router-dom'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { StartPage } from '../pages/StartPage'
import { Layout } from './Layout'

/** Root route: signed-out visitors see the public start page at "/" and are
 * bounced to /login from any other path; signed-in visitors get the app shell. */
export function RootGate() {
  const { user, isLoading } = useCurrentUser()
  const location = useLocation()

  if (isLoading) return null
  if (!user) {
    return location.pathname === '/' ? <StartPage /> : <Navigate to="/login" replace />
  }
  return <Layout />
}
