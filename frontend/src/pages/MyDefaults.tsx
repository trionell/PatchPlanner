import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createReferenceTemplateValue, deleteReferenceTemplateValue, updateReferenceTemplateValue } from '../api/referenceTemplates'
import { VocabularyCard } from '../components/VocabularyCard'
import { useReferenceTemplate } from '../hooks/useReferenceData'
import { vocabularyTitles } from '../lib/vocabularyTitles'

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
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        Your personal planning vocabularies — every new event you create starts with a copy of these. Editing them here
        never changes any event you've already created.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        {Object.keys(vocabularyTitles).map((vocabulary) => (
          <VocabularyCard
            key={vocabulary}
            title={vocabularyTitles[vocabulary]}
            values={data?.[vocabulary] ?? []}
            onCreate={(value, label) => createMutation.mutateAsync({ vocabulary, value, label })}
            onRename={(id, label) => renameMutation.mutateAsync({ vocabulary, id, label })}
            onDelete={(id) => deleteMutation.mutateAsync({ vocabulary, id })}
          />
        ))}
      </div>
    </div>
  )
}
