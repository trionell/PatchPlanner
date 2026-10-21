import { useQuery } from '@tanstack/react-query'
import { getDeskModels } from '../api/audioPatch'
import type { Console, DeskModel } from '../types'

/**
 * The desk model list (Slice 47). It changes only with a release, so it is
 * fetched once per session and never refetched.
 */
export function useDeskModels() {
  const query = useQuery({ queryKey: ['desk-models'], queryFn: getDeskModels, staleTime: Infinity, gcTime: Infinity })
  const models = query.data ?? []
  return { models, modelOf: (desk: Pick<Console, 'desk_model' | 'bus_mode'>) => deskModelOf(models, desk) }
}

/** The model a console is, with an LV1 80's bus mode applied; Generic while the list loads. */
export function deskModelOf(models: DeskModel[], desk: Pick<Console, 'desk_model' | 'bus_mode'>): DeskModel {
  const model = models.find((candidate) => candidate.key === desk.desk_model) ?? models.find((candidate) => candidate.key === 'generic') ?? GENERIC
  if (!model.has_bus_modes) return model
  return desk.bus_mode === 'monitors' ? { ...model, groups: 8, mon: 24 } : { ...model, groups: 16, mon: 16 }
}

/** What a desk is before the list arrives: exactly today's typed-count desk. */
export const GENERIC: DeskModel = {
  key: 'generic', family: 'Generic', label: 'Generic', engine: 'generic', stereo: 'asis',
  strips: 0, aux_in: 0, aux_sockets: 0, local_in: 0, local_out: 0, buses: 0, groups: 0, mon: 0, fx_aux: 0, matrix: 0,
  dca: 0, mute: 0, fx_returns: 0, mains: '', name_length: 0, colours: 0, has_bus_modes: false,
}
