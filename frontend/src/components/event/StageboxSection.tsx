import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { createStagebox, deleteStagebox, updateStagebox, type StageboxPatch } from '../../api/audioPatch'
import { usedPorts } from '../../lib/patchCapacity'
import { itemLabel, parseCount, parseInOut } from '../../lib/utils'
import type { InputCable, InventoryItem, OutputCable, Stagebox } from '../../types'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { DrawerSection, FieldStack, FormActions, GearCard, GearForm, GearSpecs, GearTop, Spec } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

const CONNECTION_TYPES = ['analog', 'aes', 'dante', 'madi', 'ethersound', 'avb']

interface StageboxSectionProps {
  eventId: number
  stageboxes: Stagebox[]
  audioItems: InventoryItem[]
  /** Each graph's cables, so `used` answers "is this box big enough?" per side (D8). */
  inputCables: InputCable[]
  outputCables: OutputCable[]
  readOnly?: boolean
}

/**
 * Stageboxes in the Rig drawer. Half of what `StageboxMultiManager` used to do —
 * that component's whole purpose was to put stageboxes and stage multis in two
 * columns, which is what left six live controls per row about 340 px to share
 * inside the drawer (Slice 24 US3, research.md R13).
 *
 * A box is one summary line until Edit is pressed. `used` is derived from the
 * patch across both graphs, never typed.
 */
export function StageboxSection({ eventId, stageboxes, audioItems, inputCables, outputCables, readOnly = false }: StageboxSectionProps) {
  const cables = [...inputCables, ...outputCables]
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  /* The box, never a boolean — the count in the sentence is this box's, and it is
     recomputed from `cables` at render so an open confirm cannot state a stale one. */
  const [pendingBox, setPendingBox] = useState<Stagebox | null>(null)
  const [draft, setDraft] = useState({ name: '', inventory_item_id: '', input_count: '', output_count: '', connection_type: 'analog' })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const create = useMutation({
    mutationFn: (data: Omit<Stagebox, 'id'>) => createStagebox(eventId, data),
    onSuccess: async () => {
      setAdding(false)
      setDraft({ name: '', inventory_item_id: '', input_count: '', output_count: '', connection_type: 'analog' })
      await invalidate()
    },
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: StageboxPatch }) => updateStagebox(eventId, id, data),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteStagebox(eventId, id),
    onSuccess: async () => {
      setEditingId(null)
      await invalidate()
    },
  })

  // Items that look like stageboxes — an "N/M" in the description, or the word.
  const boxItems = audioItems.filter(
    (item) => parseInOut(item.description ?? '') !== null || (item.description ?? '').toLowerCase().includes('stagebox'),
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
      label="Stageboxes"
      count={stageboxes.length}
      action={
        !readOnly && (
          <Button size="xs" variant="outline" onClick={() => setAdding((open) => !open)}>
            <Plus className="mr-1 h-3.5 w-3.5" />Stagebox
          </Button>
        )
      }
    >
      {stageboxes.length === 0 && <p className="text-xs text-zinc-500">No stagebox declared.</p>}

      {stageboxes.map((box) => {
        const editing = editingId === box.id && !readOnly
        // Each side against its own count: the input graph draws Inputs jacks, the output graph Outputs.
        const usedIn = usedPorts('stagebox', box.id, inputCables)
        const usedOut = usedPorts('stagebox', box.id, outputCables)
        const over = (box.input_count > 0 && usedIn > box.input_count) || (box.output_count > 0 && usedOut > box.output_count)
        const itemLabelFor = box.inventory_item_id
          ? audioItems.find((item) => item.id === box.inventory_item_id)
          : undefined
        return (
          <GearCard key={box.id}>
            <GearTop
              name={box.name || 'Stagebox'}
              item={itemLabelFor ? `${itemLabel(itemLabelFor)} · rental` : box.model || 'Custom'}
              actions={
                !readOnly && (
                  <Button size="xs" variant="ghost" onClick={() => setEditingId(editing ? null : box.id)}>
                    {editing ? 'Done' : 'Edit'}
                  </Button>
                )
              }
            />
            <GearSpecs>
              <Spec label="in" value={box.input_count || '—'} />
              <Spec label="out" value={box.output_count || '—'} />
              <Spec label="link" value={box.connection_type} />
              <Spec label="used" value={`${usedIn} in · ${usedOut} out`} tone={over ? 'warning' : undefined} />
            </GearSpecs>

            {editing && (
              <GearForm>
                <FieldStack label="Name" width="grow">
                  <Input
                    size="sm"
                    defaultValue={box.name}
                    placeholder="e.g. SB Stage L"
                    onBlur={(event) => {
                      const name = event.target.value.trim()
                      if (name && name !== box.name) update.mutate({ id: box.id, data: { name } })
                    }}
                  />
                </FieldStack>
                <FieldStack label="Catalog item" width="grow">
                  <Select
                    size="sm"
                    value={box.inventory_item_id ?? ''}
                    onChange={(event) => {
                      const item = boxItems.find((candidate) => String(candidate.id) === event.target.value)
                      const parsed = item ? parseInOut(item.description ?? '') : null
                      update.mutate({
                        id: box.id,
                        data: {
                          inventory_item_id: event.target.value ? Number(event.target.value) : null,
                          model: item?.name ?? box.model,
                          // Picking a model fills the counts it declares — the
                          // planner can still overwrite them, since a box's
                          // usable count depends on the licence it ships with.
                          input_count: parsed ? parsed.inputs : box.input_count,
                          output_count: parsed ? parsed.outputs : box.output_count,
                        },
                      })
                    }}
                  >
                    <option value="">Custom / none</option>
                    {boxItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {itemLabel(item)}
                      </option>
                    ))}
                  </Select>
                </FieldStack>
                <FieldStack label="Inputs" width="count">
                  <CountField value={box.input_count} onSave={(input_count) => update.mutate({ id: box.id, data: { input_count } })} />
                </FieldStack>
                <FieldStack label="Outputs" width="count">
                  <CountField value={box.output_count} onSave={(output_count) => update.mutate({ id: box.id, data: { output_count } })} />
                </FieldStack>
                <FieldStack label="Link" width="short">
                  <Select size="sm" value={box.connection_type} onChange={(event) => update.mutate({ id: box.id, data: { connection_type: event.target.value } })}>
                    {CONNECTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </FieldStack>
                <FormActions>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => setPendingBox(box)}
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
            <Input size="sm" value={draft.name} placeholder="e.g. SB Stage L" onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))} />
          </FieldStack>
          <FieldStack label="Catalog item" width="grow">
            <Select
              size="sm"
              value={draft.inventory_item_id}
              onChange={(event) => {
                const item = boxItems.find((candidate) => String(candidate.id) === event.target.value)
                const parsed = item ? parseInOut(item.description ?? '') : null
                setDraft((d) => ({
                  ...d,
                  inventory_item_id: event.target.value,
                  name: d.name || item?.name || '',
                  input_count: parsed ? String(parsed.inputs) : d.input_count,
                  output_count: parsed ? String(parsed.outputs) : d.output_count,
                }))
              }}
            >
              <option value="">Custom / none</option>
              {boxItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {itemLabel(item)}
                </option>
              ))}
            </Select>
          </FieldStack>
          <FieldStack label="Inputs" width="count">
            <Input size="sm" type="number" min={0} value={draft.input_count} onChange={(event) => setDraft((d) => ({ ...d, input_count: event.target.value }))} />
          </FieldStack>
          <FieldStack label="Outputs" width="count">
            <Input size="sm" type="number" min={0} value={draft.output_count} onChange={(event) => setDraft((d) => ({ ...d, output_count: event.target.value }))} />
          </FieldStack>
          <FieldStack label="Link" width="short">
            <Select size="sm" value={draft.connection_type} onChange={(event) => setDraft((d) => ({ ...d, connection_type: event.target.value }))}>
              {CONNECTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
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
                  input_count: Number(draft.input_count) || 0,
                  output_count: Number(draft.output_count) || 0,
                  connection_type: draft.connection_type,
                  inventory_item_id: draft.inventory_item_id ? Number(draft.inventory_item_id) : undefined,
                  ...nextPosition(stageboxes.length),
                })
              }
            >
              Add stagebox
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
      open={pendingBox != null}
      title="Delete stagebox"
      onCancel={() => setPendingBox(null)}
      onConfirm={() => {
        if (pendingBox) remove.mutate(pendingBox.id)
        setPendingBox(null)
      }}
    >
      {pendingBox &&
        (() => {
          const used = usedPorts('stagebox', pendingBox.id, cables)
          return (
            <>
              <span className="text-zinc-200">{pendingBox.name || 'This stagebox'}</span> is removed from the event, and every
              cable patched to it goes with it — {used} {used === 1 ? 'jack' : 'jacks'} in use.
            </>
          )
        })()}
    </ConfirmDialog>
    </>
  )
}

/**
 * A box's count, typed or stepped with the arrows. It holds its own text and
 * saves on blur, on Enter, and when it unmounts mid-edit — Done or closing the
 * drawer can remove it before any blur arrives. A blank or unreadable value
 * saves nothing and puts the count back: some browsers report a bad number as
 * '', and that used to be written as 0 (D8).
 */
function CountField({ value, onSave }: { value: number; onSave: (next: number) => void }) {
  const [text, setText] = useState(String(value))
  // The last count sent or stored: what a commit compares against, so 16 → 18 →
  // 16 before the refetch lands still saves the 16.
  const [sent, setSent] = useState(value)
  // A saved or refetched count replaces the text (React's derived-state pattern).
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setSent(value)
    setText(String(value))
  }
  const latest = useRef({ text, sent, onSave })
  useEffect(() => {
    latest.current = { text, sent, onSave }
  })
  useEffect(
    () => () => {
      const { text, sent, onSave } = latest.current
      const next = parseCount(text)
      if (next != null && next !== sent) onSave(next)
    },
    [],
  )

  const commit = () => {
    const next = parseCount(text)
    if (next == null) return setText(String(sent))
    if (next !== sent) {
      setSent(next)
      onSave(next)
    }
  }
  return (
    <Input
      size="sm"
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
      }}
    />
  )
}
