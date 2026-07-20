import type { CurrentUser } from '../types'
import { request } from './client'

// GET /users returns the same shape as /auth/me — every known user
// (anyone who has signed in at least once), for the invite picker.
export const listUsers = () => request<CurrentUser[]>('/users')
