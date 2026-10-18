import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { createConsole, deleteConsole, setRecorder, switchConsoleModel, updateConsole } from '../../api/audioPatch'
import { useDeskModels } from '../../hooks/useDeskModels'
import { poolCapacity, poolUsage, profileLine, suggestedModel } from '../../lib/deskStrips'
import { itemLabel } from '../../lib/utils'
import type { AudioPatchOutput, Console, DeskMapping, DeskModel, InputChannel, InventoryItem, OwnedItem } from '../../types'
import { previewHasLines } from '../../lib/deskPreview'
import { DeskMappingDialog } from './DeskMappingDialog'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
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
  // A real model has no output count (the sockets cap outputs), so its fuller
  // side is the fuller strip pool, chosen by the caller.
  const asIn = { used: inputsUsed, capacity: desk.input_count }
  const asOut = { used: outputsUsed, capacity: desk.output_count }
  if (desk.input_count <= 0) return asOut
  if (desk.output_count <= 0) return asIn
  return inputsUsed / desk.input_count >= outputsUsed / desk.output_count ? asIn : asOut
}

function ModelSelect({ value, models, onChange, size = 'sm' }: { value: string; models: DeskModel[]; onChange: (key: string) => void; size?: 'sm' }) {
  const families = [...new Set(models.map((model) => model.family))]
  return (
    <Select size={size} value={value} onChange={(event) => onChange(event.target.value)}>
      {value === '' && <option value="">Pick a model…</option>}
      {families.map((family) => (
        <optgroup key={family} label={family}>
          {models
            .filter((model) => model.family === family)
            .map((model) => (
              <option key={model.key} value={model.key}>
                {model.label}
                {model.sub ? ` · ${model.sub}` : ''}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  )
}

function BusModeSelect({ value, onChange }: { value: string; onChange: (mode: Console['bus_mode']) => void }) {
  return (
    <Select size="sm" value={value || 'groups'} onChange={(event) => onChange(event.target.value as Console['bus_mode'])}>
      <option value="groups">Groups mode · 16 groups, 16 Mon</option>
      <option value="monitors">Monitors mode · 8 groups, 24 Mon</option>
    </Select>
  )
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
  /* The desk, never a boolean — one confirm serves the whole list. */
  const [pendingDesk, setPendingDesk] = useState<Console | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftRole, setDraftRole] = useState<Console['role']>('foh')
  const [draftItem, setDraftItem] = useState('')
  const [draftModel, setDraftModel] = useState('')
  const [draftBusMode, setDraftBusMode] = useState<Console['bus_mode']>('')
  const [addError, setAddError] = useState('')
  /* A switch being previewed: the desk, the target and what the server says it will do. */
  const [pendingSwitch, setPendingSwitch] = useState<{ desk: Console; model: string; mapping: DeskMapping | null } | null>(null)
  const { models, modelOf } = useDeskModels()

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
      setDraftModel('')
      setDraftBusMode('')
      setAddError('')
      await invalidate()
    },
  })
  const recorder = useMutation({
    mutationFn: ({ desk, on, tracks }: { desk: Console; on: boolean; tracks?: number }) => setRecorder(eventId, desk.id, { recorder: on, recorder_tracks: tracks }),
    onSuccess: invalidate,
  })
  const previewSwitch = useMutation({
    mutationFn: ({ desk, model }: { desk: Console; model: string }) => switchConsoleModel(eventId, desk.id, { desk_model: model, apply: false }),
  })
  const applySwitch = useMutation({
    mutationFn: ({ desk, model }: { desk: Console; model: string }) => switchConsoleModel(eventId, desk.id, { desk_model: model, apply: true }),
    onSuccess: async () => {
      setPendingSwitch(null)
      await invalidate()
    },
  })

  /* A switch is previewed whenever it has anything to say, and made at once when it has
     nothing (an empty desk); the preview and the switch run the same server mapping. */
  const startSwitch = async (desk: Console, model: string) => {
    if (model === desk.desk_model) return
    setPendingSwitch({ desk, model, mapping: null })
    const preview = await previewSwitch.mutateAsync({ desk, model }).catch(() => null)
    if (!preview) return
    if (!previewHasLines(preview.mapping)) {
      applySwitch.mutate({ desk, model })
      return
    }
    setPendingSwitch({ desk, model, mapping: preview.mapping })
  }
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
    <>
    <DrawerSection
      label="Consoles"
      count={consoles.length}
      action={
        !readOnly && (
          <Button size="xs" variant="outline" onClick={() => setAdding((open) => !open)}>
            <Plus className="mr-1 h-3.5 w-3.5" />Console
          </Button>
        )
      }
    >
      {consoles.length === 0 && (
        <p className="text-xs text-zinc-500">No console declared — the graph shows an unnamed desk and nothing is checked against capacity.</p>
      )}

      {consoles.map((desk) => {
        const model = modelOf(desk)
        const modelled = model.engine !== 'generic'
        const deskChannels = channels.filter((channel) => channel.console_id === desk.id)
        // Strips, not rows (Slice 47): an X32 stereo channel is two.
        const inputsUsed = poolUsage(model, deskChannels, 'channel')
        const auxUsed = poolUsage(model, deskChannels, 'aux')
        const outputsUsed = outputs.filter((output) => output.console_id === desk.id).length
        const overIn = desk.input_count > 0 && inputsUsed > desk.input_count
        const overAux = model.aux_in > 0 && auxUsed > model.aux_in
        const overOut = !modelled && desk.output_count > 0 && outputsUsed > desk.output_count
        const editing = editingId === desk.id && !readOnly
        const item = desk.inventory_item_id
          ? audioItems.find((candidate) => candidate.id === desk.inventory_item_id)?.name
          : ownedItems.find((candidate) => candidate.id === desk.owned_item_id)?.name
        const suggestion = item ? suggestedModel(item, models) : { lv1: false }
        const meter = modelled
          ? model.aux_in > 0 && auxUsed / model.aux_in > inputsUsed / poolCapacity(model, desk, 'channel')
            ? { used: auxUsed, capacity: model.aux_in }
            : { used: inputsUsed, capacity: poolCapacity(model, desk, 'channel') }
          : fullerSide(desk, deskChannels.length, outputsUsed)
        return (
          <GearCard key={desk.id} accent>
            <GearTop
              badge={<Badge variant={desk.role === 'monitor' ? 'monitor' : desk.role === 'broadcast' ? 'matrix' : 'foh'}>{desk.role}</Badge>}
              name={desk.name || 'Console'}
              item={itemName(desk)}
              actions={
                !readOnly && (
                  <Button size="xs" variant="ghost" onClick={() => setEditingId(editing ? null : desk.id)}>
                    {editing ? 'Done' : 'Edit'}
                  </Button>
                )
              }
            />
            {modelled ? (
              <>
                <GearSpecs>
                  <Spec label="model" value={model.label} />
                  <Spec label="ch" value={`${inputsUsed} / ${model.strips}`} tone={overIn ? 'warning' : undefined} />
                  {model.aux_in > 0 && <Spec label="aux" value={`${auxUsed} / ${model.aux_in}`} tone={overAux ? 'warning' : undefined} />}
                  <Spec label="out" value={`${outputsUsed} · by sockets`} />
                  <Spec label="local" value={`${desk.local_input_count} in / ${desk.local_output_count} out`} />
                  {desk.recorder && <Spec label="rec" value={`${model.engine === 'x32' ? 32 : 64} / ${model.engine === 'x32' ? 32 : 64} · ${model.engine === 'x32' ? 'card' : 'SoundGrid'}`} />}
                </GearSpecs>
                <GearSpecs>
                  <span className="text-[11px] text-zinc-500">
                    {model.has_bus_modes ? `${desk.bus_mode === 'monitors' ? 'Monitors' : 'Groups'} mode · ` : ''}
                    {profileLine(model)}
                  </span>
                </GearSpecs>
              </>
            ) : (
              <GearSpecs>
                <Spec label="model" value="Generic" />
                <Spec label="in" value={desk.input_count || '—'} />
                <Spec label="out" value={desk.output_count || '—'} />
                <Spec label="local" value={`${desk.local_input_count} in / ${desk.local_output_count} out`} />
                <Spec label="used" value={`${deskChannels.length} in · ${outputsUsed} out`} tone={overIn || overOut ? 'warning' : undefined} />
                {desk.recorder && <Spec label="rec" value={`${desk.recorder_tracks ?? 0} tracks`} />}
              </GearSpecs>
            )}
            {/* One meter, on the side that is fuller — two bars on one card read
                as a chart rather than as an answer, and the fuller side is the
                one that decides whether the desk is big enough. */}
            <Meter {...meter} />

            {editing && (
              <GearForm>
                <FieldStack label="Model" width="default">
                  <ModelSelect value={desk.desk_model} models={models} onChange={(key) => void startSwitch(desk, key)} />
                </FieldStack>
                {model.has_bus_modes && (
                  <FieldStack label="Bus mode" width="default">
                    <BusModeSelect value={desk.bus_mode} onChange={(mode) => update.mutate({ id: desk.id, data: { bus_mode: mode } })} />
                  </FieldStack>
                )}
                {suggestion.model && suggestion.model.key !== desk.desk_model && (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/[0.05] px-3 py-2 text-xs text-amber-200">
                    The catalog item is a {item}.
                    <Button size="xs" variant="outline" onClick={() => void startSwitch(desk, suggestion.model!.key)}>
                      Use {suggestion.model.label}
                    </Button>
                  </div>
                )}
                {!suggestion.model && suggestion.lv1 && model.engine !== 'lv1' && (
                  <p className="w-full rounded-md border border-amber-500/40 bg-amber-500/[0.05] px-3 py-2 text-xs text-amber-200">
                    The catalog item is an LV1. It does not say which licence; pick it from LV1 16, 32, 64 or 80.
                  </p>
                )}
                {/* Slice 48: one recorder per desk — the card on X32 · M32, SoundGrid on LV1, typed on Generic. */}
                <FieldStack label="Recorder" width="short">
                  <Select
                    size="sm"
                    value={desk.recorder ? 'yes' : 'no'}
                    onChange={(event) => recorder.mutate({ desk, on: event.target.value === 'yes', tracks: desk.recorder_tracks })}
                  >
                    <option value="no">None</option>
                    <option value="yes">{model.engine === 'x32' ? 'Card · 32' : model.engine === 'lv1' ? 'SoundGrid · 64' : 'Recorder'}</option>
                  </Select>
                </FieldStack>
                {desk.recorder && !modelled && (
                  <FieldStack label="Tracks" width="count">
                    <Input
                      size="sm"
                      type="number"
                      min={0}
                      defaultValue={desk.recorder_tracks ?? 0}
                      onBlur={(event) => recorder.mutate({ desk, on: true, tracks: Math.max(0, Number(event.target.value) || 0) })}
                    />
                  </FieldStack>
                )}
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

                {modelled && (
                  /* B3: a count the model declares is read, never typed. */
                  <div className="flex w-full flex-wrap gap-x-4 gap-y-1 rounded-md bg-zinc-950/40 px-3 py-2 font-mono text-xs tabular-nums text-zinc-400">
                    <span>{model.strips} strips</span>
                    {model.aux_in > 0 && <span>{model.aux_in} aux in</span>}
                    <span>
                      {model.local_in} / {model.local_out} local
                    </span>
                    <span className="font-sans text-zinc-500">from {model.label}</span>
                  </div>
                )}
                {!modelled && (
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
                    onClick={() => setPendingDesk(desk)}
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
          {/* First and with no default: a desk added without a model would become
              Generic by accident, which is the state this field exists to end. */}
          <FieldStack label="Model" width="default">
            <ModelSelect
              value={draftModel}
              models={models}
              onChange={(key) => {
                setDraftModel(key)
                setAddError('')
                const picked = models.find((model) => model.key === key)
                setDraftBusMode(picked?.has_bus_modes ? (draftRole === 'monitor' ? 'monitors' : 'groups') : '')
              }}
            />
          </FieldStack>
          {models.find((model) => model.key === draftModel)?.has_bus_modes && (
            <FieldStack label="Bus mode" width="default">
              <BusModeSelect value={draftBusMode} onChange={setDraftBusMode} />
            </FieldStack>
          )}
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
              onClick={() => {
                if (!draftModel) {
                  setAddError("Pick the desk's model, or Generic.")
                  return
                }
                create.mutate({
                  name: draftName.trim(),
                  role: draftRole,
                  desk_model: draftModel,
                  bus_mode: draftBusMode,
                  inventory_item_id: draftItem ? Number(draftItem) : undefined,
                })
              }}
            >
              Add console
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </FormActions>
        </GearForm>
      )}

      {(addError || create.error || update.error || remove.error || previewSwitch.error || recorder.error) && (
        <p className="text-xs text-red-400">{addError || (create.error ?? update.error ?? remove.error ?? previewSwitch.error ?? recorder.error)?.message}</p>
      )}
    </DrawerSection>

    <DeskMappingDialog
      open={pendingSwitch?.mapping != null}
      title={`Change ${pendingSwitch?.desk.name || 'console'}'s model`}
      confirmLabel={`Switch to ${models.find((model) => model.key === pendingSwitch?.model)?.label ?? ''}`}
      mapping={pendingSwitch?.mapping ?? null}
      pending={applySwitch.isPending}
      error={applySwitch.error?.message}
      onCancel={() => setPendingSwitch(null)}
      onConfirm={() => pendingSwitch && applySwitch.mutate({ desk: pendingSwitch.desk, model: pendingSwitch.model })}
    />

    {/* Sibling, after the section: this renders inside a Drawer, and both are z-50. */}
    <ConfirmDialog
      open={pendingDesk != null}
      title="Delete console"
      onCancel={() => setPendingDesk(null)}
      onConfirm={() => {
        if (pendingDesk) remove.mutate(pendingDesk.id)
        setPendingDesk(null)
      }}
    >
      {pendingDesk && (
        <>
          <span className="text-zinc-200">{pendingDesk.name || 'This console'}</span> is removed from the event. Cables patched
          to its local jacks are cleared; its channels and outputs are kept, on No desk, until they are put on another desk.
        </>
      )}
    </ConfirmDialog>
    </>
  )
}
