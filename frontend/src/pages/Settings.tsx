import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createReferenceValue, deleteReferenceValue, updateReferenceValue } from '../api/reference'
import { useReferenceData } from '../hooks/useReferenceData'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import type { ReferenceValue } from '../types'

const vocabularyTitles: Record<string, string> = {
  signal_types: 'Signal types',
  preamp_connectors: 'Preamp connectors',
  signal_cable_types: 'Signal cable types',
  speaker_cable_types: 'Speaker cable types',
  output_types: 'Output types',
  mic_stands: 'Mic stands',
  power_connectors: 'Power connectors',
  truss_types: 'Truss types',
}

export function SettingsPage() {
  const { data } = useReferenceData()

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        Planning vocabularies — the choices offered by every dropdown on the event tabs. Values in use by a plan cannot
        be deleted; renaming a label never changes saved plans.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        {Object.keys(vocabularyTitles).map((vocabulary) => (
          <VocabularySection key={vocabulary} vocabulary={vocabulary} values={data?.[vocabulary] ?? []} />
        ))}
      </div>
    </div>
  )
}

function VocabularySection({ vocabulary, values }: { vocabulary: string; values: ReferenceValue[] }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState({ value: '', label: '' })
  const [error, setError] = useState('')

  const invalidate = async () => {
    setError('')
    await queryClient.invalidateQueries({ queryKey: ['reference-data'] })
  }
  const onError = (mutationError: Error) => setError(mutationError.message)

  const addMutation = useMutation({
    mutationFn: () => createReferenceValue(vocabulary, draft.value, draft.label),
    onSuccess: async () => {
      setDraft({ value: '', label: '' })
      await invalidate()
    },
    onError,
  })
  const renameMutation = useMutation({
    mutationFn: ({ id, label }: { id: number; label: string }) => updateReferenceValue(vocabulary, id, label),
    onSuccess: invalidate,
    onError,
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteReferenceValue(vocabulary, id),
    onSuccess: invalidate,
    onError,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{vocabularyTitles[vocabulary]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="space-y-2">
          {values.map((value) => (
            <div key={value.id} className="flex items-center gap-2">
              <Input
                key={`${value.id}-${value.label}`}
                defaultValue={value.label}
                onBlur={(e) => {
                  const label = e.target.value.trim()
                  if (label && label !== value.label) renameMutation.mutate({ id: value.id, label })
                }}
                className="flex-1"
              />
              <code className="w-32 truncate text-xs text-zinc-500" title={value.value}>{value.value}</code>
              <Button size="sm" variant="ghost" title="Delete value" onClick={() => deleteMutation.mutate(value.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {values.length === 0 && <p className="text-sm text-zinc-500">No values — dropdowns for this vocabulary are empty.</p>}
        </div>
        <div className="flex items-end gap-2 border-t border-zinc-800 pt-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-400">Label</label>
            <Input value={draft.label} onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))} placeholder="DMX 5-pin" />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs text-zinc-400">Value (stored)</label>
            <Input value={draft.value} onChange={(e) => setDraft((prev) => ({ ...prev, value: e.target.value }))} placeholder="dmx5" />
          </div>
          <Button
            size="sm"
            disabled={!draft.value.trim() || !draft.label.trim() || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            <Plus className="mr-2 h-4 w-4" />Add
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
