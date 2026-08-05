import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useReferenceData } from '../../hooks/useReferenceData'
import { itemLabel, toOptionalNumber } from '../../lib/utils'
import type { InventoryItem, OwnedItem } from '../../types'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { DrawerSection, FieldStack, FormActions, GearCard, GearForm, GearSpecs, GearTop, Spec } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

/** The fields every device list edits, whichever table the row came from. */
export interface DeviceRow {
  id: number
  name: string
  inventory_item_id?: number
  owned_item_id?: number
  input_port_count: number
  input_connector_type?: string
  output_port_count: number
  output_connector_type?: string
  link_port_count?: number
  link_connector_type?: string
  position_x: number
  position_y: number
}

export type DeviceDraftData = Omit<DeviceRow, 'id'>

interface DeviceSectionProps<T extends DeviceRow> {
  eventId: number
  /** Section heading, e.g. "Processing & destinations". */
  label: string
  /** Noun on the add button, e.g. "Device". */
  addNoun: string
  /** Which graph this list belongs to, shown on every card — the mockup's tag. */
  tag: 'on inputs' | 'on outputs'
  devices: T[]
  audioItems: InventoryItem[]
  ownedItems: OwnedItem[]
  /** Reference vocabulary for the in/out connector pickers. */
  connectorVocabulary: string
  /** Destination gear can daisy-chain, so it declares link-out ports too. */
  linkVocabulary?: string
  /** Output-side sources legitimately have no inputs; a DI box must have one. */
  minInputs: 0 | 1
  /** Whether an output side is asked for at all — a pure destination has none. */
  withOutputs: boolean
  onCreate: (data: DeviceDraftData) => void
  onUpdate: (id: number, data: DeviceDraftData) => void
  /**
   * Called once the user has confirmed. The confirm itself lives here, not in the
   * three callers: they had one identical `window.confirm` each, and this is the
   * component that owns the list the row belongs to (ROADMAP D6).
   */
  onDelete: (device: T) => void
  error?: Error | null
  readOnly?: boolean
}

/**
 * One device list, shared by all three device sections (Slice 24 US3).
 *
 * The three used to be near-identical 230-line copies of each other, differing in
 * a table name, a minimum input count, and whether link ports exist — which is
 * exactly how they drifted into three different arrangements of the same idea.
 * The differences that are real are props; everything else is here once.
 *
 * Each caller keeps its own mutations and its own doc comment, because *which*
 * table a device belongs to is a domain distinction (research.md R3) and worth
 * keeping visible.
 */
export function DeviceSection<T extends DeviceRow>({
  eventId,
  label,
  addNoun,
  tag,
  devices,
  audioItems,
  ownedItems,
  connectorVocabulary,
  linkVocabulary,
  minInputs,
  withOutputs,
  onCreate,
  onUpdate,
  onDelete,
  error,
  readOnly = false,
}: DeviceSectionProps<T>) {
  const { options } = useReferenceData(eventId)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  /* The device, never a boolean: these rows are near-identical gear and the open
     confirm must keep naming the one it was raised for. */
  const [pendingDevice, setPendingDevice] = useState<T | null>(null)
  const [draft, setDraft] = useState({
    name: '',
    source: 'inventory' as 'inventory' | 'owned',
    itemId: undefined as number | undefined,
    inputs: String(minInputs),
    inputConnector: '',
    outputs: withOutputs ? '1' : '0',
    outputConnector: '',
    links: '0',
    linkConnector: '',
  })

  const resetDraft = () =>
    setDraft({
      name: '',
      source: 'inventory',
      itemId: undefined,
      inputs: String(minInputs),
      inputConnector: '',
      outputs: withOutputs ? '1' : '0',
      outputConnector: '',
      links: '0',
      linkConnector: '',
    })

  const canAdd = Boolean(
    draft.name.trim() &&
      draft.itemId &&
      (Number(draft.inputs) === 0 || draft.inputConnector) &&
      (!withOutputs || (Number(draft.outputs) > 0 && draft.outputConnector)) &&
      Number(draft.inputs) >= minInputs,
  )

  const itemName = (device: T) => {
    if (device.inventory_item_id) {
      const item = audioItems.find((candidate) => candidate.id === device.inventory_item_id)
      return item ? `${itemLabel(item)} · rental` : `#${device.inventory_item_id}`
    }
    if (device.owned_item_id) {
      const owned = ownedItems.find((candidate) => candidate.id === device.owned_item_id)
      return owned ? `${owned.name} · owned` : `#${device.owned_item_id}`
    }
    return 'No item picked'
  }

  /** A whole-row update, since the API replaces the row's full state. */
  const saveField = (device: T, patch: Partial<DeviceRow>) => {
    const merged = { ...device, ...patch }
    onUpdate(device.id, {
      name: merged.name,
      inventory_item_id: merged.inventory_item_id,
      owned_item_id: merged.owned_item_id,
      input_port_count: merged.input_port_count,
      input_connector_type: merged.input_connector_type,
      output_port_count: merged.output_port_count,
      output_connector_type: merged.output_connector_type,
      link_port_count: merged.link_port_count,
      link_connector_type: merged.link_connector_type,
      position_x: merged.position_x,
      position_y: merged.position_y,
    })
  }

  const connectorOptions = (current?: string) => options(connectorVocabulary, current)
  const linkOptions = (current?: string) => (linkVocabulary ? options(linkVocabulary, current) : [])

  return (
    <>
    <DrawerSection
      label={label}
      count={devices.length}
      action={
        !readOnly && (
          <Button size="xs" variant="outline" onClick={() => setAdding((open) => !open)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {addNoun}
          </Button>
        )
      }
    >
      {devices.length === 0 && <p className="text-xs text-zinc-500">Nothing declared here.</p>}

      {devices.map((device) => {
        const editing = editingId === device.id && !readOnly
        return (
          <GearCard key={device.id}>
            <GearTop
              name={device.name}
              item={itemName(device)}
              actions={
                !readOnly && (
                  <Button size="xs" variant="ghost" onClick={() => setEditingId(editing ? null : device.id)}>
                    {editing ? 'Done' : 'Edit'}
                  </Button>
                )
              }
            />
            <GearSpecs>
              <Spec label="in" value={`${device.input_port_count}${device.input_connector_type ? ` ${device.input_connector_type.toUpperCase()}` : ''}`} />
              {withOutputs && (
                <Spec label="out" value={`${device.output_port_count}${device.output_connector_type ? ` ${device.output_connector_type.toUpperCase()}` : ''}`} />
              )}
              {linkVocabulary && (device.link_port_count ?? 0) > 0 && (
                <Spec label="link" value={`${device.link_port_count}${device.link_connector_type ? ` ${device.link_connector_type.toUpperCase()}` : ''}`} />
              )}
              <Spec label="on" value={tag.replace('on ', '')} />
            </GearSpecs>

            {editing && (
              <GearForm>
                <FieldStack label="Name" width="grow">
                  <Input
                    size="sm"
                    defaultValue={device.name}
                    onBlur={(event) => {
                      const name = event.target.value.trim()
                      if (name && name !== device.name) saveField(device, { name })
                    }}
                  />
                </FieldStack>
                <FieldStack label="Catalog item" width="grow">
                  <Select
                    size="sm"
                    value={device.inventory_item_id ?? ''}
                    onChange={(event) =>
                      saveField(device, {
                        inventory_item_id: toOptionalNumber(event.target.value),
                        owned_item_id: event.target.value ? undefined : device.owned_item_id,
                      })
                    }
                  >
                    <option value="">—</option>
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
                    value={device.owned_item_id ?? ''}
                    onChange={(event) =>
                      saveField(device, {
                        owned_item_id: toOptionalNumber(event.target.value),
                        inventory_item_id: event.target.value ? undefined : device.inventory_item_id,
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
                <FieldStack label="Inputs" width="count">
                  <Input
                    size="sm"
                    type="number"
                    min={minInputs}
                    defaultValue={device.input_port_count}
                    onBlur={(event) => saveField(device, { input_port_count: Math.max(minInputs, Number(event.target.value) || 0) })}
                  />
                </FieldStack>
                <FieldStack label="In conn" width="short">
                  <Select size="sm" value={device.input_connector_type ?? ''} onChange={(event) => saveField(device, { input_connector_type: event.target.value || undefined })}>
                    <option value="">—</option>
                    {connectorOptions(device.input_connector_type).map((value) => (
                      <option key={value.value} value={value.value}>
                        {value.label}
                      </option>
                    ))}
                  </Select>
                </FieldStack>
                {withOutputs && (
                  <>
                    <FieldStack label="Outputs" width="count">
                      <Input
                        size="sm"
                        type="number"
                        min={0}
                        defaultValue={device.output_port_count}
                        onBlur={(event) => saveField(device, { output_port_count: Math.max(0, Number(event.target.value) || 0) })}
                      />
                    </FieldStack>
                    <FieldStack label="Out conn" width="short">
                      <Select size="sm" value={device.output_connector_type ?? ''} onChange={(event) => saveField(device, { output_connector_type: event.target.value || undefined })}>
                        <option value="">—</option>
                        {connectorOptions(device.output_connector_type).map((value) => (
                          <option key={value.value} value={value.value}>
                            {value.label}
                          </option>
                        ))}
                      </Select>
                    </FieldStack>
                  </>
                )}
                {linkVocabulary && (
                  <>
                    <FieldStack label="Links" width="count">
                      <Input
                        size="sm"
                        type="number"
                        min={0}
                        defaultValue={device.link_port_count ?? 0}
                        onBlur={(event) => saveField(device, { link_port_count: Math.max(0, Number(event.target.value) || 0) })}
                      />
                    </FieldStack>
                    <FieldStack label="Link conn" width="short">
                      <Select size="sm" value={device.link_connector_type ?? ''} onChange={(event) => saveField(device, { link_connector_type: event.target.value || undefined })}>
                        <option value="">—</option>
                        {linkOptions(device.link_connector_type).map((value) => (
                          <option key={value.value} value={value.value}>
                            {value.label}
                          </option>
                        ))}
                      </Select>
                    </FieldStack>
                  </>
                )}
                <FormActions>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => setPendingDevice(device)}
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
            <Input size="sm" value={draft.name} placeholder={`New ${addNoun.toLowerCase()}`} onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))} />
          </FieldStack>
          <FieldStack label="Source" width="short">
            <Select size="sm" value={draft.source} onChange={(event) => setDraft((d) => ({ ...d, source: event.target.value as 'inventory' | 'owned', itemId: undefined }))}>
              <option value="inventory">Rental</option>
              <option value="owned">Owned</option>
            </Select>
          </FieldStack>
          <FieldStack label="Item" width="grow">
            <Select size="sm" value={draft.itemId ?? ''} onChange={(event) => setDraft((d) => ({ ...d, itemId: toOptionalNumber(event.target.value) }))}>
              <option value="">—</option>
              {(draft.source === 'inventory' ? audioItems : ownedItems).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FieldStack>
          <FieldStack label="Inputs" width="count">
            <Input size="sm" type="number" min={minInputs} value={draft.inputs} onChange={(event) => setDraft((d) => ({ ...d, inputs: event.target.value }))} />
          </FieldStack>
          <FieldStack label="In conn" width="short">
            <Select size="sm" value={draft.inputConnector} onChange={(event) => setDraft((d) => ({ ...d, inputConnector: event.target.value }))}>
              <option value="">—</option>
              {connectorOptions(draft.inputConnector).map((value) => (
                <option key={value.value} value={value.value}>
                  {value.label}
                </option>
              ))}
            </Select>
          </FieldStack>
          {withOutputs && (
            <>
              <FieldStack label="Outputs" width="count">
                <Input size="sm" type="number" min={0} value={draft.outputs} onChange={(event) => setDraft((d) => ({ ...d, outputs: event.target.value }))} />
              </FieldStack>
              <FieldStack label="Out conn" width="short">
                <Select size="sm" value={draft.outputConnector} onChange={(event) => setDraft((d) => ({ ...d, outputConnector: event.target.value }))}>
                  <option value="">—</option>
                  {connectorOptions(draft.outputConnector).map((value) => (
                    <option key={value.value} value={value.value}>
                      {value.label}
                    </option>
                  ))}
                </Select>
              </FieldStack>
            </>
          )}
          {linkVocabulary && (
            <>
              <FieldStack label="Links" width="count">
                <Input size="sm" type="number" min={0} value={draft.links} onChange={(event) => setDraft((d) => ({ ...d, links: event.target.value }))} />
              </FieldStack>
              <FieldStack label="Link conn" width="short">
                <Select size="sm" value={draft.linkConnector} onChange={(event) => setDraft((d) => ({ ...d, linkConnector: event.target.value }))}>
                  <option value="">—</option>
                  {linkOptions(draft.linkConnector).map((value) => (
                    <option key={value.value} value={value.value}>
                      {value.label}
                    </option>
                  ))}
                </Select>
              </FieldStack>
            </>
          )}
          <FormActions>
            <Button
              size="sm"
              className="h-8 px-4 text-xs"
              disabled={!canAdd}
              onClick={() => {
                // New nodes land staggered, never stacked on the canvas origin —
                // the planner drags them into place afterwards.
                onCreate({
                  name: draft.name.trim(),
                  inventory_item_id: draft.source === 'inventory' ? draft.itemId : undefined,
                  owned_item_id: draft.source === 'owned' ? draft.itemId : undefined,
                  input_port_count: Number(draft.inputs) || 0,
                  input_connector_type: Number(draft.inputs) > 0 ? draft.inputConnector : undefined,
                  output_port_count: withOutputs ? Number(draft.outputs) || 0 : 0,
                  output_connector_type: withOutputs && Number(draft.outputs) > 0 ? draft.outputConnector : undefined,
                  link_port_count: linkVocabulary ? Number(draft.links) || 0 : 0,
                  link_connector_type: linkVocabulary && Number(draft.links) > 0 ? draft.linkConnector : undefined,
                  position_x: 420 + (devices.length % 3) * 220,
                  position_y: 60 + Math.floor(devices.length / 3) * 160,
                })
                setAdding(false)
                resetDraft()
              }}
            >
              Add {addNoun.toLowerCase()}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </FormActions>
        </GearForm>
      )}

      {error && <p className="text-xs text-red-400">{error.message}</p>}
    </DrawerSection>

    {/* Sibling, after the section — this renders inside a Drawer, and Drawer and
        Dialog are both z-50, so a confirm nested in the section would sit under it. */}
    <ConfirmDialog
      open={pendingDevice != null}
      title={`Delete ${addNoun.toLowerCase()}`}
      onCancel={() => setPendingDevice(null)}
      onConfirm={() => {
        if (pendingDevice) onDelete(pendingDevice)
        setPendingDevice(null)
      }}
    >
      {pendingDevice && (
        <>
          <span className="text-zinc-200">{pendingDevice.name}</span> is removed from this event. Any cable connected to it is
          removed with it.
        </>
      )}
    </ConfirmDialog>
    </>
  )
}
