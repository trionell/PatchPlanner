import type { Event } from '../types'
import { request } from './client'

export const listEvents = () => request<Event[]>('/events')
export const getEvent = (id: number) => request<Event>(`/events/${id}`)
export const createEvent = (data: Omit<Event, 'id' | 'created_at' | 'updated_at'>) =>
  request<Event>('/events', { method: 'POST', body: JSON.stringify(data) })
export const updateEvent = (id: number, data: Omit<Event, 'id' | 'created_at' | 'updated_at'>) =>
  request<Event>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteEvent = (id: number) => request<void>(`/events/${id}`, { method: 'DELETE' })
