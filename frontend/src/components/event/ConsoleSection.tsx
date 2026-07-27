import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { createConsole, deleteConsole, updateConsole } from '../../api/audioPatch'
import { itemLabel } from '../../lib/utils'
import type { AudioPatchOutput, Console, InputChannel, InventoryItem, OwnedItem } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { DrawerSection, FieldStack, FormActions, GearCard, GearForm, GearSpecs, GearTop, Meter, Spec } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

const ROLES: Console['role'][] = ['foh', 'monitor', 'broadcast']

/**
 * Which of a desk's two capacities to meter: whichever is proportionally fuller,
 * among the ones actually declared. An undeclared count (0) is not a capacity, so
 * it is never the answer — `Meter` draws nothing for it, which is what keeps an
 * undeclared desk from appearing to be full or empty.
 */
function fullerSide(desk: Console, inputsUsed: number, outputsUsed: number): { used: number; capacity: number } {
  const asIn = { used: inputsUsed, capacity: desk.input_count }
  const asOut = { used: outputsUsed, capacity: desk.output_count }
  if (desk.input_count <= 0) return asOut
  if (desk.output_count <= 0) return asIn
  return inputsUsed / desk.input_count >= outputsUsed / desk.output_count ? asIn : asOut
}

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
 * The desks themselves, first in the Rig drawer — signal order starts here.
 *
 * Counts are typed rather than read from the catalog item: a desk's usable channel
 * count depends on its card fit and licence, not on its model name. A count left
 * at 0 means nobody has said yet, so it shows as `—`, draws no meter and never
 * warns (FR-022).
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
  const remove = useMutation({
    mutationFn: (id: number) => deleteConsole(eventId, id),
    onSuccess: async () => {
      setEditingId(null)
      await invalidate()
    },
  })

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
    <DrawerSection
      label="Consoles"
      count={consoles.length}
      action={
        !readOnly && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAdding((open) => !open)}>
            <Plus className="mr-1 h-3.5 w-3.5" />Console
          </Button>
        )
      }
    >
      {consoles.length === 0 && (
        <p className="text-xs text-zinc-500">No console declared — the graph shows an unnamed desk and nothing is checked against capacity.</p>
      )}

      {consoles.map((desk) => {
        const inputsUsed = channels.filter((channel) => channel.console_id === desk.id).length
        const outputsUsed = outputs.filter((output) => output.console_id === desk.id).length
        const overIn = desk.input_count > 0 && inputsUsed > desk.input_count
        const overOut = desk.output_count > 0 && outputsUsed > desk.output_count
        const editing = editingId === desk.id && !readOnly
        return (
          <GearCard key={desk.id} accent>
            <GearTop
              badge={<Badge variant={desk.role === 'monitor' ? 'monitor' : desk.role === 'broadcast' ? 'matrix' : 'foh'}>{desk.role}</Badge>}
              name={desk.name || 'Console'}
              item={itemName(desk)}
              actions={
                !readOnly && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingId(editing ? null : desk.id)}>
                    {editing ? 'Done' : 'Edit'}
                  </Button>
                )
              }
            />
            <GearSpecs>
              <Spec label="in" value={desk.input_count || '—'} />
              <Spec label="out" value={desk.output_count || '—'} />
              <Spec label="local" value={`${desk.local_input_count} in / ${desk.local_output_count} out`} />
              <Spec label="used" value={`${inputsUsed} in · ${outputsUsed} out`} tone={overIn || overOut ? 'warning' : undefined} />
            </GearSpecs>
            {/* One meter, on the side that is fuller — two bars on one card read
                as a chart rather than as an answer, and the fuller side is the
                one that decides whether the desk is big enough. */}
            <Meter {...fullerSide(desk, inputsUsed, outputsUsed)} />

            {editing && (
              <GearForm>
                <FieldStack label="Name" width="grow">
                  <Input
                    size="sm"
                    defaultValue={desk.name}
                    placeholder="e.g. FOH · SD10"
                    onBlur={(event) => {
                      const name = event.target.value.trim()
                      if (name !== desk.name) update.mutate({ id: desk.id, data: { name } })
                    }}
                  />
                </FieldStack>
                <FieldStack label="Role" width="short">
                  <Select size="sm" value={desk.role} onChange={(event) => update.mutate({ id: desk.id, data: { role: event.target.value as Console['role'] } })}>
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role.toUpperCase()}
                      </option>
                    ))}
                  </Select>
                </FieldStack>
                <FieldStack label="Catalog item" width="grow">
                  <Select
                    size="sm"
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
                </FieldStack>
                <FieldStack label="Owned" width="default">
                  <Select
                    size="sm"
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
                </FieldStack>

                {(
                  [
                    ['input_count', 'Inputs'],
                    ['output_count', 'Outputs'],
                    ['local_input_count', 'Local in'],
                    ['local_output_count', 'Local out'],
                  ] as const
                ).map(([field, label]) => (
                  <FieldStack key={field} label={label} width="count">
                    <Input
                      size="sm"
                      type="number"
                      min={0}
                      defaultValue={desk[field]}
                      onBlur={(event) => {
                        const value = Math.max(0, Number(event.target.value) || 0)
                        if (value !== desk[field]) update.mutate({ id: desk.id, data: { [field]: value } })
                      }}
                    />
                  </FieldStack>
                ))}

                <FormActions>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => {
                      if (window.confirm(`Delete ${desk.name || 'this console'}? Cables patched to its local jacks are cleared; channels and outputs are kept.`)) {
                        remove.mutate(desk.id)
                      }
                    }}
                  >
                    Delete
                  </Button>
                </FormActions>
              </GearForm>
            )}
          </GearCard>
        )
      })}

      {adding && !readOnly && (
        <GearForm>
          <FieldStack label="Name" width="grow">
            <Input size="sm" value={draftName} placeholder="e.g. FOH · SD10" onChange={(event) => setDraftName(event.target.value)} />
          </FieldStack>
          <FieldStack label="Role" width="short">
            <Select size="sm" value={draftRole} onChange={(event) => setDraftRole(event.target.value as Console['role'])}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.toUpperCase()}
                </option>
              ))}
            </Select>
          </FieldStack>
          <FieldStack label="Catalog item" width="grow">
            <Select size="sm" value={draftItem} onChange={(event) => setDraftItem(event.target.value)}>
              <option value="">Pick a desk…</option>
              {audioItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {itemLabel(item)}
                </option>
              ))}
            </Select>
          </FieldStack>
          <FormActions>
            <Button
              size="sm"
              className="h-8 px-4 text-xs"
              onClick={() =>
                create.mutate({
                  name: draftName.trim(),
                  role: draftRole,
                  inventory_item_id: draftItem ? Number(draftItem) : undefined,
                })
              }
            >
              Add console
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </FormActions>
        </GearForm>
      )}

      {(create.error ?? update.error ?? remove.error) && (
        <p className="text-xs text-red-400">{(create.error ?? update.error ?? remove.error)?.message}</p>
      )}
    </DrawerSection>
  )
}
