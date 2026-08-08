import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { createStageMulti, deleteStageMulti, updateStageMulti } from '../../api/audioPatch'
import { usedPorts } from '../../lib/patchCapacity'
import { itemLabel, parseChannels } from '../../lib/utils'
import type { InputCable, InventoryItem, OutputCable, StageMulti } from '../../types'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
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
  /* The multi, never a boolean — the count in the sentence is this multi's, and it is
     recomputed from `cables` at render so an open confirm cannot state a stale one. */
  const [pendingMulti, setPendingMulti] = useState<StageMulti | null>(null)
  const [draft, setDraft] = useState({ name: '', inventory_item_id: '', channels: '24', connector_type: 'xlr', length_m: '', show_in_output_graph: false })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const create = useMutation({
    mutationFn: (data: Omit<StageMulti, 'id'>) => createStageMulti(eventId, data),
    onSuccess: async () => {
      setAdding(false)
      setDraft({ name: '', inventory_item_id: '', channels: '24', connector_type: 'xlr', length_m: '', show_in_output_graph: false })
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
    <>
    <DrawerSection
      label="Stage multis"
      count={stageMultis.length}
      action={
        !readOnly && (
          <Button size="xs" variant="outline" onClick={() => setAdding((open) => !open)}>
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
                  <Button size="xs" variant="ghost" onClick={() => setEditingId(editing ? null : multi.id)}>
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
                <FieldStack label="Output graph" width="short">
                  <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={multi.show_in_output_graph}
                      onChange={(event) => update.mutate({ id: multi.id, data: { ...multi, show_in_output_graph: event.target.checked } })}
                      className="h-3.5 w-3.5 accent-red-500"
                    />
                    {multi.show_in_output_graph ? 'shown' : 'hidden'}
                  </label>
                </FieldStack>
                <FormActions>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => setPendingMulti(multi)}
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
          <FieldStack label="Output graph" width="short">
            <label className="flex items-center gap-2 text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={draft.show_in_output_graph}
                onChange={(event) => setDraft((d) => ({ ...d, show_in_output_graph: event.target.checked }))}
                className="h-3.5 w-3.5 accent-red-500"
              />
              {draft.show_in_output_graph ? 'shown' : 'hidden'}
            </label>
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
                  show_in_output_graph: draft.show_in_output_graph,
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

    {/* Sibling, after the section: this renders inside a Drawer, and both are z-50. */}
    <ConfirmDialog
      open={pendingMulti != null}
      title="Delete stage multi"
      onCancel={() => setPendingMulti(null)}
      onConfirm={() => {
        if (pendingMulti) remove.mutate(pendingMulti.id)
        setPendingMulti(null)
      }}
    >
      {pendingMulti &&
        (() => {
          const used = usedPorts('stage_multi', pendingMulti.id, cables)
          return (
            <>
              <span className="text-zinc-200">{pendingMulti.name || 'This stage multi'}</span> is removed from the event, and
              every cable patched to it goes with it — {used} {used === 1 ? 'channel' : 'channels'} in use.
            </>
          )
        })()}
    </ConfirmDialog>
    </>
  )
}
