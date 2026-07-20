import { useQuery } from '@tanstack/react-query'
import { getCurrentUser } from '../api/auth'

export function useCurrentUser() {
  const query = useQuery({ queryKey: ['auth', 'me'], queryFn: getCurrentUser, retry: false })
  return { user: query.data ?? null, isLoading: query.isLoading, isAuthenticated: !!query.data }
}
