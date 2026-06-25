import type { AudioPatchInput, AudioPatchOutput, AudioPatchResponse } from '../types'
import { request } from './client'

export const getAudioPatch = (eventId: number) => request<AudioPatchResponse>(`/events/${eventId}/audio-patch`)
export const createAudioInput = (eventId: number, data: Omit<AudioPatchInput, 'id'>) =>
  request<AudioPatchInput>(`/events/${eventId}/audio-inputs`, { method: 'POST', body: JSON.stringify(data) })
export const updateAudioInput = (eventId: number, inputId: number, data: Omit<AudioPatchInput, 'id'>) =>
  request<AudioPatchInput>(`/events/${eventId}/audio-inputs/${inputId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteAudioInput = (eventId: number, inputId: number) =>
  request<void>(`/events/${eventId}/audio-inputs/${inputId}`, { method: 'DELETE' })
export const createAudioOutput = (eventId: number, data: Omit<AudioPatchOutput, 'id'>) =>
  request<AudioPatchOutput>(`/events/${eventId}/audio-outputs`, { method: 'POST', body: JSON.stringify(data) })
export const updateAudioOutput = (eventId: number, outputId: number, data: Omit<AudioPatchOutput, 'id'>) =>
  request<AudioPatchOutput>(`/events/${eventId}/audio-outputs/${outputId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteAudioOutput = (eventId: number, outputId: number) =>
  request<void>(`/events/${eventId}/audio-outputs/${outputId}`, { method: 'DELETE' })
