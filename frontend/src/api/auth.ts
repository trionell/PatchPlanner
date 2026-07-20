import type { CurrentUser } from '../types'
import { API_BASE, request } from './client'

export const loginUrl = `${API_BASE}/auth/google/login`

/** Resolves to null for any unauthenticated/failed request — the caller
 * doesn't need to distinguish "not signed in" from a transient error. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await request<CurrentUser>('/auth/me')
  } catch {
    return null
  }
}

export const logout = () => request<void>('/auth/logout', { method: 'POST' })
