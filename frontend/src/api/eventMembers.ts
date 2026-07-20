import type { EventMember } from '../types'
import { request } from './client'

export const listMembers = (eventId: number) => request<EventMember[]>(`/events/${eventId}/members`)

export const inviteMember = (eventId: number, userId: number, role: 'contributor' | 'viewer') =>
  request<EventMember>(`/events/${eventId}/members`, { method: 'POST', body: JSON.stringify({ userId, role }) })

export const updateMemberRole = (eventId: number, userId: number, role: 'contributor' | 'viewer') =>
  request<EventMember>(`/events/${eventId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) })

export const removeMember = (eventId: number, userId: number) =>
  request<void>(`/events/${eventId}/members/${userId}`, { method: 'DELETE' })
