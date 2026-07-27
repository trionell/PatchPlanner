import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createReferenceValue, deleteReferenceValue, updateReferenceValue } from '../../api/reference'
import { useReferenceData } from '../../hooks/useReferenceData'
import { VocabularyPanel } from '../VocabularyPanel'

/**
 * This event's own planning vocabulary — a one-time copy of the creating
 * user's personal template (Slice 17), fully independent from it and from
 * every other event from the moment the event was created. Owners and
 * contributors can edit it; viewers see it read-only.
 *
 * Nine cards became one panel in Slice 29, and the values gained the one thing
 * this surface never said: how many plan rows use each of them. The server has
 * refused to delete a referenced value since Slice 17 — the interface used to
 * find out by trying.
 */
export function SettingsTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const { data } = useReferenceData(eventId)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reference-data', eventId] })

  const createMutation = useMutation({
    mutationFn: ({ vocabulary, value, label }: { vocabulary: string; value: string; label: string }) =>
      createReferenceValue(eventId, vocabulary, value, label),
    onSuccess: invalidate,
  })
  const renameMutation = useMutation({
    mutationFn: ({ vocabulary, id, label }: { vocabulary: string; id: number; label: string }) =>
      updateReferenceValue(eventId, vocabulary, id, label),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: ({ vocabulary, id }: { vocabulary: string; id: number }) => deleteReferenceValue(eventId, vocabulary, id),
    onSuccess: invalidate,
  })

  return (
    <VocabularyPanel
      title="Vocabularies"
      data={data}
      showUsage
      note="this event's own copy — editing it changes nothing anywhere else"
      readOnly={readOnly}
      onCreate={(vocabulary, value, label) => createMutation.mutateAsync({ vocabulary, value, label })}
      onRename={(vocabulary, id, label) => renameMutation.mutateAsync({ vocabulary, id, label })}
      onDelete={(vocabulary, id) => deleteMutation.mutateAsync({ vocabulary, id })}
    />
  )
}
