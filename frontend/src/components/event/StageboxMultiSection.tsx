import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createStagebox, createStageMulti, deleteStagebox, deleteStageMulti, updateStagebox, updateStageMulti } from '../../api/audioPatch'
import type { InventoryItem, Stagebox, StageMulti } from '../../types'
import { StageboxMultiManager } from '../StageboxMultiManager'

interface StageboxMultiSectionProps {
  eventId: number
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  audioItems: InventoryItem[]
  readOnly?: boolean
}

/**
 * StageboxMultiManager wired with its own mutations, shared by the audio
 * inputs and outputs tabs.
 */
export function StageboxMultiSection({ eventId, stageboxes, stageMultis, audioItems, readOnly = false }: StageboxMultiSectionProps) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  const createSb = useMutation({ mutationFn: (d: Omit<Stagebox, 'id'>) => createStagebox(eventId, d), onSuccess: invalidate })
  const updateSb = useMutation({ mutationFn: ({ id, d }: { id: number; d: Omit<Stagebox, 'id'> }) => updateStagebox(eventId, id, d), onSuccess: invalidate })
  const deleteSb = useMutation({ mutationFn: (id: number) => deleteStagebox(eventId, id), onSuccess: invalidate })
  const createSm = useMutation({ mutationFn: (d: Omit<StageMulti, 'id'>) => createStageMulti(eventId, d), onSuccess: invalidate })
  const updateSm = useMutation({ mutationFn: ({ id, d }: { id: number; d: Omit<StageMulti, 'id'> }) => updateStageMulti(eventId, id, d), onSuccess: invalidate })
  const deleteSm = useMutation({ mutationFn: (id: number) => deleteStageMulti(eventId, id), onSuccess: invalidate })

  return (
    <StageboxMultiManager
      stageboxes={stageboxes}
      stageMultis={stageMultis}
      audioItems={audioItems}
      eventId={eventId}
      onCreateStagebox={(d) => createSb.mutate(d)}
      onUpdateStagebox={(id, d) => updateSb.mutate({ id, d })}
      onDeleteStagebox={(id) => deleteSb.mutate(id)}
      onCreateStageMulti={(d) => createSm.mutate(d)}
      onUpdateStageMulti={(id, d) => updateSm.mutate({ id, d })}
      onDeleteStageMulti={(id) => deleteSm.mutate(id)}
      readOnly={readOnly}
    />
  )
}
