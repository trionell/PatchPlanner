import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { createStageMulti, deleteStageMulti, updateStageMulti } from '../../api/audioPatch'
import { usedPorts } from '../../lib/patchCapacity'
import { itemLabel, parseChannels } from '../../lib/utils'
import type { InputCable, InventoryItem, OutputCable, StageMulti } from '../../types'
import { Button } from '../ui/Button'
import { DrawerSection, FieldStack, FormActions, GearCard, GearForm, GearSpecs, GearTop, Spec } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

const CONNECTORS = ['xlr', 'cat5e', 'cat6', 'cat6a', 'bnc', 'optical']

interface StageMultiSectionProps {
  eventId: number
  stageMultis: StageMulti[]
  stageboxCount: number
  audioItems: InventoryItem[]
  cables: (InputCable | OutputCable)[]
  readOnly?: boolean
}

/**
 * Stage multis in the Rig drawer — the other half of the retired
 * `StageboxMultiManager` (Slice 24, research.md R13). Same shape as
 * `StageboxSection`; the differences are real ones, a length in metres and one
 * channel count instead of two.
 */
export function StageMultiSection({ eventId, stageMultis, stageboxCount, audioItems, cables, readOnly = false }: StageMultiSectionProps) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', inventory_item_id: '', channels: '24', connector_type: 'xlr', length_m: '' })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const create = useMutation({
    mutationFn: (data: Omit<StageMulti, 'id'>) => createStageMulti(eventId, data),
    onSuccess: async () => {
      setAdding(false)
      setDraft({ name: '', inventory_item_id: '', channels: '24', connector_type: 'xlr', length_m: '' })
      await invalidate()
    },
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<StageMulti, 'id'> }) => updateStageMulti(eventId, id, data),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteStageMulti(eventId, id),
    onSuccess: async () => {
      setEditingId(null)
      await invalidate()
    },
  })

  // Items that look like multicores — a cable/multi category, or a channel count.
  const multiItems = audioItems.filter(
    (item) =>
      (item.category_name ?? '').toLowerCase().includes('kabel') ||
      (item.category_name ?? '').toLowerCase().includes('multi') ||
      parseChannels(item.description ?? '') !== null,
  )

  const nextPosition = (index: number) => ({
    position_x: 420 + (index % 3) * 220,
    position_y: 60 + Math.floor(index / 3) * 160,
    input_position_x: 420 + (index % 3) * 220,
    input_position_y: 60 + Math.floor(index / 3) * 160,
  })

  return (
    <DrawerSection
      label="Stage multis"
      count={stageMultis.length}
      action={
        !readOnly && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAdding((open) => !open)}>
            <Plus className="mr-1 h-3.5 w-3.5" />Multi
          </Button>
        )
      }
    >
      {stageMultis.length === 0 && <p className="text-xs text-zinc-500">No stage multi declared.</p>}

      {stageMultis.map((multi) => {
        const editing = editingId === multi.id && !readOnly
        const used = usedPorts('stage_multi', multi.id, cables)
        const item = multi.inventory_item_id ? audioItems.find((candidate) => candidate.id === multi.inventory_item_id) : undefined
        return (
          <GearCard key={multi.id}>
            <GearTop
              name={multi.name || 'Stage multi'}
              item={item ? `${itemLabel(item)} · rental` : 'Custom'}
              actions={
                !readOnly && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingId(editing ? null : multi.id)}>
                    {editing ? 'Done' : 'Edit'}
                  </Button>
                )
              }
            />
            <GearSpecs>
              <Spec label="ch" value={multi.channels || '—'} />
              <Spec label="length" value={multi.length_m ? `${multi.length_m} m` : '—'} />
              <Spec label="conn" value={multi.connector_type.toUpperCase()} />
              <Spec label="used" value={`${used} of ${multi.channels || '—'}`} tone={multi.channels > 0 && used > multi.channels ? 'warning' : undefined} />
            </GearSpecs>

            {editing && (
              <GearForm>
                <FieldStack label="Name" width="grow">
                  <Input
                    size="sm"
                    defaultValue={multi.name}
                    placeholder="e.g. FOH snake"
                    onBlur={(event) => {
                      const name = event.target.value.trim()
                      if (name && name !== multi.name) update.mutate({ id: multi.id, data: { ...multi, name } })
                    }}
                  />
                </FieldStack>
                <FieldStack label="Catalog item" width="grow">
                  <Select
                    size="sm"
                    value={multi.inventory_item_id ?? ''}
                    onChange={(event) => {
                      const picked = multiItems.find((candidate) => String(candidate.id) === event.target.value)
                      const channels = picked ? parseChannels(picked.description ?? '') : null
                      update.mutate({
                        id: multi.id,
                        data: {
                          ...multi,
                          inventory_item_id: event.target.value ? Number(event.target.value) : undefined,
                          channels: channels ?? multi.channels,
                        },
                      })
                    }}
                  >
                    <option value="">Custom / none</option>
                    {multiItems.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {itemLabel(candidate)}
                      </option>
                    ))}
                  </Select>
                </FieldStack>
                <FieldStack label="Channels" width="count">
                  <Input
                    size="sm"
                    type="number"
                    min={1}
                    defaultValue={multi.channels}
                    onBlur={(event) => {
                      const value = Math.max(1, Number(event.target.value) || 1)
                      if (value !== multi.channels) update.mutate({ id: multi.id, data: { ...multi, channels: value } })
                    }}
                  />
                </FieldStack>
                <FieldStack label="Length m" width="count">
                  <Input
                    size="sm"
                    type="number"
                    min={0}
                    step={0.5}
                    defaultValue={multi.length_m || ''}
                    onBlur={(event) => {
                      const value = Math.max(0, Number(event.target.value) || 0)
                      if (value !== multi.length_m) update.mutate({ id: multi.id, data: { ...multi, length_m: value } })
                    }}
                  />
                </FieldStack>
                <FieldStack label="Connector" width="short">
                  <Select size="sm" value={multi.connector_type} onChange={(event) => update.mutate({ id: multi.id, data: { ...multi, connector_type: event.target.value } })}>
                    {CONNECTORS.map((connector) => (
                      <option key={connector} value={connector}>
                        {connector.toUpperCase()}
                      </option>
                    ))}
                  </Select>
                </FieldStack>
                <FormActions>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => {
                      if (window.confirm(`Delete ${multi.name || 'this stage multi'}? Every cable patched to it is removed with it (${used} ${used === 1 ? 'channel' : 'channels'} in use).`)) {
                        remove.mutate(multi.id)
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
            <Input size="sm" value={draft.name} placeholder="e.g. FOH snake" onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))} />
          </FieldStack>
          <FieldStack label="Catalog item" width="grow">
            <Select
              size="sm"
              value={draft.inventory_item_id}
              onChange={(event) => {
                const picked = multiItems.find((candidate) => String(candidate.id) === event.target.value)
                const channels = picked ? parseChannels(picked.description ?? '') : null
                setDraft((d) => ({
                  ...d,
                  inventory_item_id: event.target.value,
                  name: d.name || picked?.name || '',
                  channels: channels ? String(channels) : d.channels,
                }))
              }}
            >
              <option value="">Custom / none</option>
              {multiItems.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {itemLabel(candidate)}
                </option>
              ))}
            </Select>
          </FieldStack>
          <FieldStack label="Channels" width="count">
            <Input size="sm" type="number" min={1} value={draft.channels} onChange={(event) => setDraft((d) => ({ ...d, channels: event.target.value }))} />
          </FieldStack>
          <FieldStack label="Length m" width="count">
            <Input size="sm" type="number" min={0} step={0.5} value={draft.length_m} onChange={(event) => setDraft((d) => ({ ...d, length_m: event.target.value }))} />
          </FieldStack>
          <FieldStack label="Connector" width="short">
            <Select size="sm" value={draft.connector_type} onChange={(event) => setDraft((d) => ({ ...d, connector_type: event.target.value }))}>
              {CONNECTORS.map((connector) => (
                <option key={connector} value={connector}>
                  {connector.toUpperCase()}
                </option>
              ))}
            </Select>
          </FieldStack>
          <FormActions>
            <Button
              size="sm"
              className="h-8 px-4 text-xs"
              disabled={!draft.name.trim()}
              onClick={() =>
                create.mutate({
                  event_id: eventId,
                  name: draft.name.trim(),
                  channels: Number(draft.channels) || 24,
                  connector_type: draft.connector_type,
                  length_m: Number(draft.length_m) || 0,
                  inventory_item_id: draft.inventory_item_id ? Number(draft.inventory_item_id) : undefined,
                  // Offset past the stageboxes so a new multi doesn't open under one.
                  ...nextPosition(stageboxCount + stageMultis.length),
                })
              }
            >
              Add multi
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
