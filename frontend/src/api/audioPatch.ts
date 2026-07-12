import type { AudioPatchOutput, AudioPatchResponse, BusRequest, InputCable, InputChannel, InputDevice, InputSource, MixerDCA, MixerGroup, OutputCable, OutputDevice, Stagebox, StageMulti } from '../types'
import { get, request } from './client'

// Forwards TanStack Query's AbortSignal — this query is invalidated very
// frequently by the output graph (every cable/device/position edit), so
// cancelling superseded fetches matters here more than almost anywhere
// else in the app (see client.ts's `get` doc comment).
export const getAudioPatch = (eventId: number, signal?: AbortSignal) => get<AudioPatchResponse>(`/events/${eventId}/audio-patch`, signal)

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

export const createInputChannel = (eventId: number, data: Omit<InputChannel, 'id' | 'event_id'>) =>
  request<InputChannel>(`/events/${eventId}/input-channels`, { method: 'POST', body: JSON.stringify(data) })
export const updateInputChannel = (eventId: number, channelId: number, data: Omit<InputChannel, 'id' | 'event_id'>) =>
  request<InputChannel>(`/events/${eventId}/input-channels/${channelId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteInputChannel = (eventId: number, channelId: number) =>
  request<void>(`/events/${eventId}/input-channels/${channelId}`, { method: 'DELETE' })

export const createInputSource = (eventId: number, data: Omit<InputSource, 'id' | 'event_id'>) =>
  request<InputSource>(`/events/${eventId}/input-sources`, { method: 'POST', body: JSON.stringify(data) })
export const updateInputSource = (eventId: number, sourceId: number, data: Omit<InputSource, 'id' | 'event_id'>) =>
  request<InputSource>(`/events/${eventId}/input-sources/${sourceId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteInputSource = (eventId: number, sourceId: number) =>
  request<void>(`/events/${eventId}/input-sources/${sourceId}`, { method: 'DELETE' })

export const createInputDevice = (eventId: number, data: Omit<InputDevice, 'id' | 'event_id'>) =>
  request<InputDevice>(`/events/${eventId}/input-devices`, { method: 'POST', body: JSON.stringify(data) })
export const updateInputDevice = (eventId: number, deviceId: number, data: Omit<InputDevice, 'id' | 'event_id'>) =>
  request<InputDevice>(`/events/${eventId}/input-devices/${deviceId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteInputDevice = (eventId: number, deviceId: number) =>
  request<void>(`/events/${eventId}/input-devices/${deviceId}`, { method: 'DELETE' })

export const createInputCable = (eventId: number, data: Omit<InputCable, 'id' | 'event_id'>) =>
  request<InputCable>(`/events/${eventId}/input-cables`, { method: 'POST', body: JSON.stringify(data) })
export const updateInputCable = (eventId: number, cableId: number, cableItemId: number | undefined) =>
  request<InputCable>(`/events/${eventId}/input-cables/${cableId}`, { method: 'PATCH', body: JSON.stringify({ cable_item_id: cableItemId ?? null }) })
export const deleteInputCable = (eventId: number, cableId: number) =>
  request<void>(`/events/${eventId}/input-cables/${cableId}`, { method: 'DELETE' })

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

export const createOutputCable = (eventId: number, data: Omit<OutputCable, 'id' | 'event_id'>) =>
  request<OutputCable>(`/events/${eventId}/output-cables`, { method: 'POST', body: JSON.stringify(data) })
export const updateOutputCable = (eventId: number, cableId: number, cableItemId: number | undefined) =>
  request<OutputCable>(`/events/${eventId}/output-cables/${cableId}`, { method: 'PATCH', body: JSON.stringify({ cable_item_id: cableItemId ?? null }) })
export const deleteOutputCable = (eventId: number, cableId: number) =>
  request<void>(`/events/${eventId}/output-cables/${cableId}`, { method: 'DELETE' })

export const updateOutputMixerPosition = (eventId: number, positionY: number) =>
  request<void>(`/events/${eventId}/output-mixer-position`, { method: 'PATCH', body: JSON.stringify({ position_y: positionY }) })
