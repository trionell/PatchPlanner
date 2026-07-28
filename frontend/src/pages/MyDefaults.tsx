import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createReferenceTemplateValue, deleteReferenceTemplateValue, updateReferenceTemplateValue } from '../api/referenceTemplates'
import { VocabularyPanel } from '../components/VocabularyPanel'
import { useReferenceTemplate } from '../hooks/useReferenceData'

/**
 * A user's own personal planning-vocabulary template (Slice 17) — used
 * only to seed new events at creation time. Editing it here never has any
 * live effect on an already-created event; an event's own vocabulary is
 * edited on that event's Settings tab instead.
 */
export function MyDefaultsPage() {
  const queryClient = useQueryClient()
  const { data } = useReferenceTemplate()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reference-template'] })

  const createMutation = useMutation({
    mutationFn: ({ vocabulary, value, label }: { vocabulary: string; value: string; label: string }) =>
      createReferenceTemplateValue(vocabulary, value, label),
    onSuccess: invalidate,
  })
  const renameMutation = useMutation({
    mutationFn: ({ vocabulary, id, label }: { vocabulary: string; id: number; label: string }) =>
      updateReferenceTemplateValue(vocabulary, id, label),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: ({ vocabulary, id }: { vocabulary: string; id: number }) => deleteReferenceTemplateValue(vocabulary, id),
    onSuccess: invalidate,
  })

  return (
    <VocabularyPanel
      title="My defaults"
      data={data}
      // A template is not referenced by any plan, so it has no usage to report —
      // showing `0` would imply it could have one (Slice 29 FR-034).
      showUsage={false}
      note="every new event starts with a copy of these — editing them changes no existing event"
      onCreate={(vocabulary, value, label) => createMutation.mutateAsync({ vocabulary, value, label })}
      onRename={(vocabulary, id, label) => renameMutation.mutateAsync({ vocabulary, id, label })}
      onDelete={(vocabulary, id) => deleteMutation.mutateAsync({ vocabulary, id })}
    />
  )
}
