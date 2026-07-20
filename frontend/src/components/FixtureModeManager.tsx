import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createFixtureMode, deleteFixtureMode, listFixtureModes, updateFixtureMode } from '../api/inventories'
import type { FixtureMode } from '../types'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

/**
 * Editor for one catalog fixture model's DMX modes. Modes are fill-in
 * templates: patching copies name + channel count onto the rig fixture, so
 * edits and deletions here never rewrite existing rigs.
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
    <div className="space-y-3">
      {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
      <div className="space-y-2">
        {modes.map((mode) => (
          <div key={`${mode.id}-${mode.name}-${mode.channel_count}`} className="flex items-center gap-2">
            <Input
              defaultValue={mode.name}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== mode.name) updateMutation.mutate({ mode, name, channels: mode.channel_count })
              }}
              className="flex-1"
            />
            <Input
              type="number"
              min={1}
              defaultValue={mode.channel_count}
              onBlur={(e) => {
                const channels = Number(e.target.value)
                if (channels >= 1 && channels !== mode.channel_count) updateMutation.mutate({ mode, name: mode.name, channels })
              }}
              className="w-24"
            />
            <span className="text-xs text-zinc-500">ch</span>
            <Button size="sm" variant="ghost" title="Delete mode" onClick={() => deleteMutation.mutate(mode.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {modes.length === 0 && !modesQuery.isPending && (
          <p className="text-sm text-zinc-500">No modes defined — fixtures of this model use manual mode text and channel count.</p>
        )}
      </div>
      <div className="flex items-end gap-2 border-t border-zinc-800 pt-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-400">Mode name</label>
          <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Extended" />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs text-zinc-400">Channels</label>
          <Input type="number" min={1} value={draft.channels} onChange={(e) => setDraft((prev) => ({ ...prev, channels: e.target.value }))} placeholder="39" />
        </div>
        <Button
          size="sm"
          disabled={!draft.name.trim() || Number(draft.channels) < 1 || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          <Plus className="mr-2 h-4 w-4" />Add
        </Button>
      </div>
    </div>
  )
}
