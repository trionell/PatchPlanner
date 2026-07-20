import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createReferenceValue, deleteReferenceValue, updateReferenceValue } from '../../api/reference'
import { useReferenceData } from '../../hooks/useReferenceData'
import { vocabularyTitles } from '../../lib/vocabularyTitles'
import { VocabularyCard } from '../VocabularyCard'

/**
 * This event's own planning vocabulary — a one-time copy of the creating
 * user's personal template (Slice 17), fully independent from it and
 * from every other event from the moment the event was created. Owners
 * and contributors can edit it; viewers see it read-only.
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
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        This event's own planning vocabularies — the choices offered by every dropdown on this event's tabs. Editing them
        never affects any other event or your personal defaults. Values in use by a plan cannot be deleted; renaming a
        label never changes saved plans.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        {Object.keys(vocabularyTitles).map((vocabulary) => (
          <VocabularyCard
            key={vocabulary}
            title={vocabularyTitles[vocabulary]}
            values={data?.[vocabulary] ?? []}
            readOnly={readOnly}
            onCreate={(value, label) => createMutation.mutateAsync({ vocabulary, value, label })}
            onRename={(id, label) => renameMutation.mutateAsync({ vocabulary, id, label })}
            onDelete={(id) => deleteMutation.mutateAsync({ vocabulary, id })}
          />
        ))}
      </div>
    </div>
  )
}
