import type { AudioPatchInput, AudioPatchOutput, AudioPatchResponse, BusRequest, MixerDCA, MixerGroup, OutputDevice, Stagebox, StageMulti } from '../types'
import { request } from './client'

export const getAudioPatch = (eventId: number) => request<AudioPatchResponse>(`/events/${eventId}/audio-patch`)

export const createStagebox = (eventId: number, data: Omit<Stagebox, 'id'>) =>
  request<Stagebox>(`/events/${eventId}/stageboxes`, { method: 'POST', body: JSON.stringify(data) })
export const updateStagebox = (eventId: number, sbId: number, data: Omit<Stagebox, 'id'>) =>
  request<Stagebox>(`/events/${eventId}/stageboxes/${sbId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteStagebox = (eventId: number, sbId: number) =>
  request<void>(`/events/${eventId}/stageboxes/${sbId}`, { method: 'DELETE' })

export const createStageMulti = (eventId: number, data: Omit<StageMulti, 'id'>) =>
  request<StageMulti>(`/events/${eventId}/stage-multis`, { method: 'POST', body: JSON.stringify(data) })
export const updateStageMulti = (eventId: number, smId: number, data: Omit<StageMulti, 'id'>) =>
  request<StageMulti>(`/events/${eventId}/stage-multis/${smId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteStageMulti = (eventId: number, smId: number) =>
  request<void>(`/events/${eventId}/stage-multis/${smId}`, { method: 'DELETE' })

export const createGroup = (eventId: number, data: BusRequest) =>
  request<MixerGroup>(`/events/${eventId}/groups`, { method: 'POST', body: JSON.stringify(data) })
export const updateGroup = (eventId: number, groupId: number, data: BusRequest) =>
  request<MixerGroup>(`/events/${eventId}/groups/${groupId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteGroup = (eventId: number, groupId: number) =>
  request<void>(`/events/${eventId}/groups/${groupId}`, { method: 'DELETE' })

export const createDCA = (eventId: number, data: BusRequest) =>
  request<MixerDCA>(`/events/${eventId}/dcas`, { method: 'POST', body: JSON.stringify(data) })
export const updateDCA = (eventId: number, dcaId: number, data: BusRequest) =>
  request<MixerDCA>(`/events/${eventId}/dcas/${dcaId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteDCA = (eventId: number, dcaId: number) =>
  request<void>(`/events/${eventId}/dcas/${dcaId}`, { method: 'DELETE' })

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

export const createOutputDevice = (eventId: number, data: Omit<OutputDevice, 'id' | 'event_id'>) =>
  request<OutputDevice>(`/events/${eventId}/output-devices`, { method: 'POST', body: JSON.stringify(data) })
export const updateOutputDevice = (eventId: number, deviceId: number, data: Omit<OutputDevice, 'id' | 'event_id'>) =>
  request<OutputDevice>(`/events/${eventId}/output-devices/${deviceId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteOutputDevice = (eventId: number, deviceId: number) =>
  request<void>(`/events/${eventId}/output-devices/${deviceId}`, { method: 'DELETE' })
