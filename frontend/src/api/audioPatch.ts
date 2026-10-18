import type { AudioPatchOutput, AudioPatchResponse, Console, DeskMapping, DeskMix, DeskModel, DeskRoute, InputCable, InputChannel, InputDevice, InputSource, MixKind, OutputCable, OutputDevice, Stagebox, StageMulti } from '../types'
import { get, request } from './client'

// Forwards TanStack Query's AbortSignal — this query is invalidated very
// frequently by the output graph (every cable/device/position edit), so
// cancelling superseded fetches matters here more than almost anywhere
// else in the app (see client.ts's `get` doc comment).
export const getAudioPatch = (eventId: number, signal?: AbortSignal) => get<AudioPatchResponse>(`/events/${eventId}/audio-patch`, signal)

export const createStagebox = (eventId: number, data: Omit<Stagebox, 'id'>) =>
  request<Stagebox>(`/events/${eventId}/stageboxes`, { method: 'POST', body: JSON.stringify(data) })
/**
 * Only the fields that change. The server merges them onto the stored row, so a
 * stale copy of the box can never write back a value someone else just changed
 * (D8). Clearing the catalog item takes an explicit null.
 */
export type StageboxPatch = Partial<Omit<Stagebox, 'id' | 'event_id' | 'inventory_item_id'>> & { inventory_item_id?: number | null }

export const updateStagebox = (eventId: number, sbId: number, data: StageboxPatch) =>
  request<Stagebox>(`/events/${eventId}/stageboxes/${sbId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteStagebox = (eventId: number, sbId: number) =>
  request<void>(`/events/${eventId}/stageboxes/${sbId}`, { method: 'DELETE' })

export const createStageMulti = (eventId: number, data: Omit<StageMulti, 'id'>) =>
  request<StageMulti>(`/events/${eventId}/stage-multis`, { method: 'POST', body: JSON.stringify(data) })
export const updateStageMulti = (eventId: number, smId: number, data: Omit<StageMulti, 'id'>) =>
  request<StageMulti>(`/events/${eventId}/stage-multis/${smId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteStageMulti = (eventId: number, smId: number) =>
  request<void>(`/events/${eventId}/stage-multis/${smId}`, { method: 'DELETE' })

// Desk routing (Slice 48): a desk's mixes, an output's Fed by, the recorder.
export const createDeskMix = (eventId: number, consoleId: number, data: { kind: MixKind; width?: string; name?: string; color?: string }) =>
  request<DeskMix>(`/events/${eventId}/consoles/${consoleId}/mixes`, { method: 'POST', body: JSON.stringify(data) })
/** The column Save: fields and, when sent, every source that feeds the mix. */
export const updateDeskMix = (
  eventId: number,
  mixId: number,
  data: { slot?: number; name?: string; width?: string; color?: string; sources?: { kind: 'channel' | 'mix'; id: number; port?: number }[] },
) => request<DeskMix>(`/events/${eventId}/mixes/${mixId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteDeskMix = (eventId: number, mixId: number) => request<void>(`/events/${eventId}/mixes/${mixId}`, { method: 'DELETE' })
export const setFedBy = (eventId: number, outputId: number, source: { src_kind: 'mix' | 'channel'; src_id: number; side?: 'L' | 'R' } | null) =>
  request<void>(`/events/${eventId}/audio-outputs/${outputId}/fed-by`, { method: 'PUT', body: JSON.stringify(source) })
export const setRecorder = (eventId: number, consoleId: number, data: { recorder: boolean; recorder_tracks?: number }) =>
  request<Console>(`/events/${eventId}/consoles/${consoleId}/recorder`, { method: 'PUT', body: JSON.stringify(data) })
export const setRecorderRoutes = (eventId: number, consoleId: number, routes: Omit<DeskRoute, 'id' | 'console_id'>[]) =>
  request<void>(`/events/${eventId}/consoles/${consoleId}/recorder/routes`, { method: 'PUT', body: JSON.stringify(routes) })
export const fillRecorder = (eventId: number, consoleId: number) =>
  request<void>(`/events/${eventId}/consoles/${consoleId}/recorder/fill`, { method: 'POST' })

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

// Consoles (Slice 23). The desk's canvas position travels on the console
// itself, which is what replaced the old /output-mixer-position route.
export const createConsole = (eventId: number, data: Partial<Omit<Console, 'id' | 'event_id'>>) =>
  request<Console>(`/events/${eventId}/consoles`, { method: 'POST', body: JSON.stringify(data) })
export const updateConsole = (eventId: number, consoleId: number, data: Partial<Omit<Console, 'id' | 'event_id'>>) =>
  request<Console>(`/events/${eventId}/consoles/${consoleId}`, { method: 'PATCH', body: JSON.stringify(data) })
/** The desk model list — the same for everyone, changing only with a release. */
export const getDeskModels = () => get<DeskModel[]>('/desk-models')

/** Previews a model switch, or with `apply` makes it; both run the same mapping. */
export const switchConsoleModel = (eventId: number, consoleId: number, data: { desk_model: string; bus_mode?: string; apply: boolean }) =>
  request<{ mapping: DeskMapping; console: Console }>(`/events/${eventId}/consoles/${consoleId}/switch`, { method: 'POST', body: JSON.stringify(data) })

/** Previews, or with `apply` makes, putting rows that are on no desk onto this one. No ids means every such row. */
export const placeOnConsole = (eventId: number, consoleId: number, data: { channel_ids?: number[]; output_ids?: number[]; apply: boolean }) =>
  request<{ mapping: DeskMapping }>(`/events/${eventId}/consoles/${consoleId}/place`, { method: 'POST', body: JSON.stringify(data) })

export const deleteConsole = (eventId: number, consoleId: number) =>
  request<{ cleared_cables: number }>(`/events/${eventId}/consoles/${consoleId}`, { method: 'DELETE' })
