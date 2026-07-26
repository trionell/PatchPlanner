import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createConsole, deleteConsole, updateConsole } from '../../api/audioPatch'
import { itemLabel } from '../../lib/utils'
import type { AudioPatchOutput, Console, InputChannel, InventoryItem, OwnedItem } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

const ROLES: Console['role'][] = ['foh', 'monitor', 'broadcast']

interface ConsoleSectionProps {
  eventId: number
  consoles: Console[]
  channels: InputChannel[]
  outputs: AudioPatchOutput[]
  audioItems: InventoryItem[]
  ownedItems: OwnedItem[]
  readOnly?: boolean
}

/**
 * The desks themselves, at the top of the Rig drawer (Slice 23). Each is a
 * summary line — name, item, capacity, and what the patch actually puts on it —
 * with its fields revealed on Edit, the same shape the other rig sections use.
 *
 * Counts are typed here rather than read from the catalog item: a desk's usable
 * channel count depends on its card fit and licence, not on its model name, and
 * a count left at 0 simply means nobody has said yet (it never warns).
 */
export function ConsoleSection({ eventId, consoles, channels, outputs, audioItems, ownedItems, readOnly = false }: ConsoleSectionProps) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftRole, setDraftRole] = useState<Console['role']>('foh')
  const [draftItem, setDraftItem] = useState('')

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const create = useMutation({
    mutationFn: (data: Partial<Console>) => createConsole(eventId, data),
    onSuccess: async () => {
      setAdding(false)
      setDraftName('')
      setDraftItem('')
      await invalidate()
    },
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Console> }) => updateConsole(eventId, id, data),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: (id: number) => deleteConsole(eventId, id), onSuccess: invalidate })

  const itemName = (desk: Console) => {
    if (desk.inventory_item_id) {
      const item = audioItems.find((candidate) => candidate.id === desk.inventory_item_id)
      return item ? `${itemLabel(item)} · rental` : `#${desk.inventory_item_id}`
    }
    if (desk.owned_item_id) {
      const owned = ownedItems.find((candidate) => candidate.id === desk.owned_item_id)
      return owned ? `${owned.name} · owned` : `#${desk.owned_item_id}`
    }
    return 'No item picked'
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Consoles</CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={() => setAdding((open) => !open)}>
            <Plus className="mr-2 h-4 w-4" />Console
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-400">
          The desks this event is booked on. A console with a catalog or owned item picked is one line on the rental order; its counts are what the patch is checked against.
        </p>

        {consoles.length === 0 && <p className="text-sm text-zinc-500">No console declared — the graph will show an unnamed desk and nothing is checked against capacity.</p>}

        {consoles.map((desk) => {
          const inputsUsed = channels.filter((channel) => channel.console_id === desk.id).length
          const outputsUsed = outputs.filter((output) => output.console_id === desk.id).length
          const overIn = desk.input_count > 0 && inputsUsed > desk.input_count
          const overOut = desk.output_count > 0 && outputsUsed > desk.output_count
          return (
            <div key={desk.id} className="space-y-2 border-b border-zinc-800 pb-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={desk.role === 'monitor' ? 'monitor' : desk.role === 'broadcast' ? 'matrix' : 'foh'}>{desk.role}</Badge>
                <span className="font-medium text-zinc-100">{desk.name || 'Console'}</span>
                <span className="text-sm text-zinc-500">{itemName(desk)}</span>
                <span className="ml-auto flex items-center gap-3 font-mono text-xs text-zinc-500">
                  <span>in {desk.input_count || '—'}</span>
                  <span>out {desk.output_count || '—'}</span>
                  <span>local {desk.local_input_count}/{desk.local_output_count}</span>
                  <span className={overIn || overOut ? 'text-red-400' : undefined}>
                    used {inputsUsed} in · {outputsUsed} out
                  </span>
                </span>
                {!readOnly && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(editingId === desk.id ? null : desk.id)}>
                      {editingId === desk.id ? 'Done' : 'Edit'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Delete console"
                      onClick={() => {
                        if (window.confirm(`Delete ${desk.name || 'this console'}? Cables patched to its local jacks are cleared; channels and outputs are kept.`)) {
                          remove.mutate(desk.id)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>

              {editingId === desk.id && !readOnly && (
                <div className="grid gap-2 md:grid-cols-[1fr_9rem_1fr] md:items-end">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">Name</span>
                    <Input
                      defaultValue={desk.name}
                      placeholder="e.g. FOH · SD10"
                      onBlur={(event) => {
                        const name = event.target.value.trim()
                        if (name !== desk.name) update.mutate({ id: desk.id, data: { name } })
                      }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">Role</span>
                    <Select value={desk.role} onChange={(event) => update.mutate({ id: desk.id, data: { role: event.target.value as Console['role'] } })}>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role.toUpperCase()}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">Catalog item</span>
                    <Select
                      value={desk.inventory_item_id ?? ''}
                      onChange={(event) =>
                        update.mutate({
                          id: desk.id,
                          data: { inventory_item_id: event.target.value ? Number(event.target.value) : undefined, owned_item_id: undefined },
                        })
                      }
                    >
                      <option value="">Pick a desk…</option>
                      {audioItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {itemLabel(item)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">Owned</span>
                    <Select
                      value={desk.owned_item_id ?? ''}
                      onChange={(event) =>
                        update.mutate({
                          id: desk.id,
                          data: { owned_item_id: event.target.value ? Number(event.target.value) : undefined, inventory_item_id: undefined },
                        })
                      }
                    >
                      <option value="">—</option>
                      {ownedItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </label>

                  {(
                    [
                      ['input_count', 'Inputs'],
                      ['output_count', 'Outputs'],
                      ['local_input_count', 'Local in'],
                      ['local_output_count', 'Local out'],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
                      <Input
                        type="number"
                        min={0}
                        defaultValue={desk[field]}
                        onBlur={(event) => {
                          const value = Math.max(0, Number(event.target.value) || 0)
                          if (value !== desk[field]) update.mutate({ id: desk.id, data: { [field]: value } })
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {adding && !readOnly && (
          <div className="grid gap-2 md:grid-cols-[1fr_9rem_1fr_auto] md:items-end">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Name</span>
              <Input value={draftName} placeholder="e.g. FOH · SD10" onChange={(event) => setDraftName(event.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Role</span>
              <Select value={draftRole} onChange={(event) => setDraftRole(event.target.value as Console['role'])}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.toUpperCase()}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Catalog item</span>
              <Select value={draftItem} onChange={(event) => setDraftItem(event.target.value)}>
                <option value="">Pick a desk…</option>
                {audioItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {itemLabel(item)}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              size="sm"
              onClick={() =>
                create.mutate({
                  name: draftName.trim(),
                  role: draftRole,
                  inventory_item_id: draftItem ? Number(draftItem) : undefined,
                })
              }
            >
              Add
            </Button>
          </div>
        )}

        {(create.error ?? update.error ?? remove.error) && (
          <p className="text-sm text-red-400">{(create.error ?? update.error ?? remove.error)?.message}</p>
        )}
      </CardContent>
    </Card>
  )
}
