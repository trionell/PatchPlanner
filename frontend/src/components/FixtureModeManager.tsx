import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createFixtureMode, deleteFixtureMode, listFixtureModes, updateFixtureMode } from '../api/inventories'
import type { FixtureMode } from '../types'
import { Button } from './ui/Button'
import { FieldStack } from './ui/GearList'
import { Input } from './ui/Input'

/**
 * Editor for one catalog fixture model's DMX modes. Modes are fill-in
 * templates: patching copies name + channel count onto the rig fixture, so
 * edits and deletions here never rewrite existing rigs.
 *
 * Work-tier sizing since Slice 29, when its dialog was deleted: it now renders
 * inside the inventory row editor's `notice` slot, and a `h-10` input inside a
 * `h-8` editor reads as a different component rather than part of the row.
 */
export function FixtureModeManager({ inventoryId, itemId }: { inventoryId: number; itemId: number }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState({ name: '', channels: '' })
  const [error, setError] = useState('')

  const modesQuery = useQuery({ queryKey: ['fixture-modes', itemId], queryFn: () => listFixtureModes(inventoryId, itemId) })

  const invalidate = async () => {
    setError('')
    await queryClient.invalidateQueries({ queryKey: ['fixture-modes', itemId] })
  }
  const onError = (mutationError: Error) => setError(mutationError.message)

  const addMutation = useMutation({
    mutationFn: () => createFixtureMode(inventoryId, itemId, draft.name.trim(), Number(draft.channels)),
    onSuccess: async () => {
      setDraft({ name: '', channels: '' })
      await invalidate()
    },
    onError,
  })
  const updateMutation = useMutation({
    mutationFn: ({ mode, name, channels }: { mode: FixtureMode; name: string; channels: number }) =>
      updateFixtureMode(inventoryId, mode.id, name, channels),
    onSuccess: invalidate,
    onError,
  })
  const deleteMutation = useMutation({
    mutationFn: (modeId: number) => deleteFixtureMode(inventoryId, modeId),
    onSuccess: invalidate,
    onError,
  })

  const modes = modesQuery.data ?? []

  return (
    <div className="space-y-2">
      {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-2.5 py-1.5 text-xs text-red-300">{error}</div>}
      <div className="space-y-1.5">
        {modes.map((mode) => (
          <div key={`${mode.id}-${mode.name}-${mode.channel_count}`} className="flex items-center gap-2">
            <Input
              size="sm"
              defaultValue={mode.name}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== mode.name) updateMutation.mutate({ mode, name, channels: mode.channel_count })
              }}
              className="flex-1"
            />
            <Input
              size="sm"
              type="number"
              min={1}
              defaultValue={mode.channel_count}
              onBlur={(e) => {
                const channels = Number(e.target.value)
                if (channels >= 1 && channels !== mode.channel_count) updateMutation.mutate({ mode, name: mode.name, channels })
              }}
              className="w-24"
            />
            <span className="text-[11px] text-zinc-500">ch</span>
            <Button size="xs" variant="ghost" title="Delete mode" onClick={() => deleteMutation.mutate(mode.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {modes.length === 0 && !modesQuery.isPending && (
          <p className="text-xs text-zinc-500">No modes defined — fixtures of this model use manual mode text and channel count.</p>
        )}
      </div>
      <div className="flex items-end gap-2 border-t border-zinc-800 pt-2">
        <FieldStack label="Mode name" width="grow">
          <Input size="sm" value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Extended" />
        </FieldStack>
        <FieldStack label="Channels" width="count">
          <Input size="sm" type="number" min={1} value={draft.channels} onChange={(e) => setDraft((prev) => ({ ...prev, channels: e.target.value }))} placeholder="39" />
        </FieldStack>
        <Button
          size="xs"
          disabled={!draft.name.trim() || Number(draft.channels) < 1 || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />Add
        </Button>
      </div>
    </div>
  )
}
