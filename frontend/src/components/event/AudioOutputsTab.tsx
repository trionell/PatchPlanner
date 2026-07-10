import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { createAudioOutput, deleteAudioOutput, getAudioPatch, updateAudioOutput } from '../../api/audioPatch'
import { listInventoryItems } from '../../api/inventory'
import { listOwnedItems } from '../../api/owned'
import { useDraftState } from '../../hooks/useDraftState'
import { useReferenceData } from '../../hooks/useReferenceData'
import { itemLabel, legacyCableText, toOptionalNumber } from '../../lib/utils'
import type { AudioPatchOutput, InventoryItem, OutputChainHop, OutputDevice, OwnedItem, StageMulti, Stagebox } from '../../types'
import { OutputDeviceSection } from './OutputDeviceSection'
import { OutputPatchSheet } from '../print/OutputPatchSheet'
import { PrintButton } from '../print/PrintButton'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { ColorSelect } from './ColorSelect'
import { StageboxMultiSection } from './StageboxMultiSection'

export function AudioOutputsTab({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient()
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: () => getAudioPatch(eventId) })
  const inventoryQuery = useQuery({ queryKey: ['inventory-audio-items'], queryFn: () => listInventoryItems({ categoryType: 'audio' }) })
  const cableQuery = useQuery({ queryKey: ['inventory-items', 'role', 'cable'], queryFn: () => listInventoryItems({ role: 'cable' }) })
  const ownedQuery = useQuery({ queryKey: ['owned-items'], queryFn: listOwnedItems })
  const { options, label } = useReferenceData()

  const [outputs, setOutputs] = useDraftState(audioQuery.data, (data) => data.outputs, [] as AudioPatchOutput[])

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const addMutation = useMutation({ mutationFn: (payload: Omit<AudioPatchOutput, 'id'>) => createAudioOutput(eventId, payload), onSuccess: invalidate })
  const saveMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Omit<AudioPatchOutput, 'id'> }) => updateAudioOutput(eventId, id, payload), onSuccess: invalidate })
  const deleteMutation = useMutation({ mutationFn: (id: number) => deleteAudioOutput(eventId, id), onSuccess: invalidate })

  const allAudioItems: InventoryItem[] = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data])
  const cableItems: InventoryItem[] = useMemo(() => cableQuery.data ?? [], [cableQuery.data])
  const ownedItems: OwnedItem[] = useMemo(() => ownedQuery.data ?? [], [ownedQuery.data])
  const stageboxes = audioQuery.data?.stageboxes ?? []
  const stageMultis = audioQuery.data?.stage_multis ?? []
  const outputDevices = audioQuery.data?.output_devices ?? []

  function updateDraft<K extends keyof AudioPatchOutput>(index: number, key: K, value: AudioPatchOutput[K]) {
    setOutputs((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }

  async function persist(row: AudioPatchOutput) {
    await saveMutation.mutateAsync({ id: row.id, payload: row })
  }

  /** Merges a partial patch into one row and persists it immediately (the ColorSelect pattern — no onBlur wait). */
  function updateAndPersist(index: number, patch: Partial<AudioPatchOutput>) {
    const updated = { ...outputs[index], ...patch }
    setOutputs((current) => current.map((row, rowIndex) => (rowIndex === index ? updated : row)))
    void persist(updated)
  }

  function updateChain(index: number, chain: OutputChainHop[]) {
    updateAndPersist(index, { chain })
  }

  function updateHop(index: number, hopIndex: number, patch: Partial<OutputChainHop>) {
    updateChain(index, outputs[index].chain.map((hop, i) => (i === hopIndex ? { ...hop, ...patch } : hop)))
  }

  function removeHop(index: number, hopIndex: number) {
    updateChain(index, outputs[index].chain.filter((_, i) => i !== hopIndex))
  }

  function moveHop(index: number, hopIndex: number, direction: -1 | 1) {
    const chain = [...outputs[index].chain]
    const target = hopIndex + direction
    if (target < 0 || target >= chain.length) return
    ;[chain[hopIndex], chain[target]] = [chain[target], chain[hopIndex]]
    updateChain(index, chain)
  }

  function addHop(index: number) {
    updateChain(index, [...outputs[index].chain, { position: outputs[index].chain.length, hop_kind: 'device' }])
  }

  /**
   * Flipping to stereo defaults the chain's first route hop's side B to
   * its side A route at the next channel — same one-time convenience fill
   * as inputs (Slice 9), now scoped to whichever hop is the route hop
   * instead of the row itself.
   */
  function handleWidthChange(index: number, width: AudioPatchOutput['width']) {
    const row = outputs[index]
    if (width !== 'stereo') {
      updateAndPersist(index, { width })
      return
    }
    const routeHopIndex = row.chain.findIndex((hop) => hop.hop_kind === 'route')
    if (routeHopIndex === -1) {
      updateAndPersist(index, { width })
      return
    }
    const hop = row.chain[routeHopIndex]
    const hasSideB = hop.stagebox_id_b != null || hop.stage_multi_id_b != null
    if (hasSideB) {
      updateAndPersist(index, { width })
      return
    }
    const patch: Partial<OutputChainHop> = {}
    if (hop.stagebox_id) {
      patch.stagebox_id_b = hop.stagebox_id
      patch.stagebox_channel_b = (hop.stagebox_channel ?? 0) + 1
    } else if (hop.stage_multi_id) {
      patch.stage_multi_id_b = hop.stage_multi_id
      patch.stage_multi_channel_b = (hop.stage_multi_channel ?? 0) + 1
    }
    const chain = row.chain.map((h, i) => (i === routeHopIndex ? { ...h, ...patch } : h))
    updateAndPersist(index, { width, chain })
  }

  const addRow = () => {
    const lastNumber = outputs.at(-1)?.output_number ?? 0
    addMutation.mutate({
      event_id: eventId,
      output_number: lastNumber + 1,
      output_name: '',
      output_type: 'foh',
      width: 'mono',
      notes: '',
      chain: [],
    })
  }

  const itemLabelById = useMemo(
    () => new Map([...allAudioItems, ...cableItems].map((item) => [item.id, itemLabel(item)])),
    [allAudioItems, cableItems],
  )
  const ownedItemLabelById = useMemo(() => new Map(ownedItems.map((item) => [item.id, item.name])), [ownedItems])
  const cableLabel = (value: string) => label('speaker_cable_types', value)

  return (
    <>
      <div className="print:hidden">
        <StageboxMultiSection
          eventId={eventId}
          stageboxes={stageboxes}
          stageMultis={stageMultis}
          audioItems={allAudioItems}
        />
        <OutputDeviceSection eventId={eventId} devices={outputDevices} audioItems={allAudioItems} ownedItems={ownedItems} />
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Audio outputs</CardTitle>
            <div className="flex gap-2">
              <PrintButton />
              <Button size="sm" onClick={addRow}><Plus className="mr-2 h-4 w-4" />Add Row</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {['Out#','Name','Type','Width','Chain','Color','Notes',''].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outputs.map((row, index) => (
                    <TableRow key={row.id}>
                      <TableCell><Input type="number" value={row.output_number} onChange={(e) => updateDraft(index, 'output_number', Number(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-16" /></TableCell>
                      <TableCell><Input value={row.output_name ?? ''} onChange={(e) => updateDraft(index, 'output_name', e.target.value)} onBlur={() => persist(outputs[index])} className="min-w-36" /></TableCell>
                      <TableCell><div className="space-y-2 min-w-28"><Badge variant={row.output_type === 'aux' ? 'warning' : row.output_type}>{row.output_type}</Badge><Select value={row.output_type} onChange={(e) => updateDraft(index, 'output_type', e.target.value)} onBlur={() => persist(outputs[index])}>{options('output_types', row.output_type).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</Select></div></TableCell>
                      <TableCell>
                        <div className="min-w-24">
                          <Select value={row.width} onChange={(e) => handleWidthChange(index, e.target.value as AudioPatchOutput['width'])}>
                            <option value="mono">Mono</option>
                            <option value="stereo">Stereo</option>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-[420px] space-y-2">
                          {row.chain.map((hop, hopIndex) => (
                            <HopEditor
                              key={hopIndex}
                              hop={hop}
                              isStereo={row.width === 'stereo'}
                              stageboxes={stageboxes}
                              stageMultis={stageMultis}
                              inventoryItems={allAudioItems}
                              ownedItems={ownedItems}
                              outputDevices={outputDevices}
                              cableItems={cableItems}
                              cableLabel={cableLabel}
                              onChange={(patch) => updateHop(index, hopIndex, patch)}
                              onRemove={() => removeHop(index, hopIndex)}
                              onMoveUp={hopIndex > 0 ? () => moveHop(index, hopIndex, -1) : undefined}
                              onMoveDown={hopIndex < row.chain.length - 1 ? () => moveHop(index, hopIndex, 1) : undefined}
                            />
                          ))}
                          <Button size="sm" variant="ghost" onClick={() => addHop(index)}><Plus className="mr-1 h-3 w-3" />Add hop</Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ColorSelect
                          value={row.color}
                          onChange={(color) => { updateDraft(index, 'color', color); void persist({ ...outputs[index], color }) }}
                        />
                      </TableCell>
                      <TableCell><Input value={row.notes ?? ''} onChange={(e) => updateDraft(index, 'notes', e.target.value)} onBlur={() => persist(outputs[index])} className="min-w-36" /></TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(row.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      <OutputPatchSheet
        eventId={eventId}
        outputs={outputs}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        outputDevices={outputDevices}
        itemLabelById={itemLabelById}
        ownedItemLabelById={ownedItemLabelById}
      />
    </>
  )
}

/**
 * One hop's editor card: a kind toggle (device/route), the kind-specific
 * pickers (route: stagebox/multi + channel, with an independent side B
 * when the channel is stereo; device: a source toggle — inventory/owned/
 * shared, the last referencing a device declared once in
 * OutputDeviceSection above — plus the matching item picker), a cable
 * picker shared by either kind (with an independent Cable B pick on a
 * stereo channel, for when the two physical runs need different
 * lengths — left empty, Cable doubles for both sides as before), and
 * reorder/remove controls.
 */
function HopEditor({
  hop,
  isStereo,
  stageboxes,
  stageMultis,
  inventoryItems,
  ownedItems,
  outputDevices,
  cableItems,
  cableLabel,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  hop: OutputChainHop
  isStereo: boolean
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  inventoryItems: InventoryItem[]
  ownedItems: OwnedItem[]
  outputDevices: OutputDevice[]
  cableItems: InventoryItem[]
  cableLabel: (value: string) => string
  onChange: (patch: Partial<OutputChainHop>) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const sbMax = stageboxes.find((sb) => sb.id === hop.stagebox_id)?.output_count ?? 0
  const smMax = stageMultis.find((sm) => sm.id === hop.stage_multi_id)?.channels ?? 0
  const sbMaxB = stageboxes.find((sb) => sb.id === hop.stagebox_id_b)?.output_count ?? 0
  const smMaxB = stageMultis.find((sm) => sm.id === hop.stage_multi_id_b)?.channels ?? 0

  return (
    <div className="space-y-1 rounded border border-zinc-700 p-2 text-xs">
      <div className="flex items-center gap-1">
        <Select
          value={hop.hop_kind}
          onChange={(e) => {
            const kind = e.target.value as OutputChainHop['hop_kind']
            onChange(kind === 'route'
              ? { hop_kind: kind, device_source: undefined, inventory_item_id: undefined, owned_item_id: undefined, output_device_id: undefined }
              : { hop_kind: kind, stagebox_id: undefined, stagebox_channel: undefined, stagebox_id_b: undefined, stagebox_channel_b: undefined, stage_multi_id: undefined, stage_multi_channel: undefined, stage_multi_id_b: undefined, stage_multi_channel_b: undefined })
          }}
          className="min-w-24"
        >
          <option value="device">Device</option>
          <option value="route">Route</option>
        </Select>
        <div className="ml-auto flex gap-1">
          {onMoveUp && <Button size="sm" variant="ghost" onClick={onMoveUp}><ArrowUp className="h-3 w-3" /></Button>}
          {onMoveDown && <Button size="sm" variant="ghost" onClick={onMoveDown}><ArrowDown className="h-3 w-3" /></Button>}
          <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
      {hop.hop_kind === 'route' ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="w-10 text-zinc-500">SB</span>
            <Select value={hop.stagebox_id ?? ''} onChange={(e) => onChange({ stagebox_id: toOptionalNumber(e.target.value), stagebox_channel: undefined, stage_multi_id: undefined, stage_multi_channel: undefined })}>
              <option value="">—</option>
              {stageboxes.map((sb) => <option key={sb.id} value={sb.id}>{sb.name}</option>)}
            </Select>
            {sbMax > 0 ? (
              <Select value={hop.stagebox_channel ?? ''} onChange={(e) => onChange({ stagebox_channel: toOptionalNumber(e.target.value) })} className="min-w-16">
                <option value="">—</option>
                {Array.from({ length: sbMax }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
              </Select>
            ) : (
              <Input type="number" min={1} value={hop.stagebox_channel ?? ''} onChange={(e) => onChange({ stagebox_channel: toOptionalNumber(e.target.value) })} className="min-w-16" disabled={!hop.stagebox_id} />
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="w-10 text-zinc-500">Multi</span>
            <Select value={hop.stage_multi_id ?? ''} onChange={(e) => onChange({ stage_multi_id: toOptionalNumber(e.target.value), stage_multi_channel: undefined, stagebox_id: undefined, stagebox_channel: undefined })}>
              <option value="">—</option>
              {stageMultis.map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
            </Select>
            {smMax > 0 ? (
              <Select value={hop.stage_multi_channel ?? ''} onChange={(e) => onChange({ stage_multi_channel: toOptionalNumber(e.target.value) })} className="min-w-16">
                <option value="">—</option>
                {Array.from({ length: smMax }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
              </Select>
            ) : (
              <Input type="number" min={1} value={hop.stage_multi_channel ?? ''} onChange={(e) => onChange({ stage_multi_channel: toOptionalNumber(e.target.value) })} className="min-w-16" disabled={!hop.stage_multi_id} />
            )}
          </div>
          {isStereo && (
            <>
              <div className="flex items-center gap-1 border-t border-zinc-800 pt-1">
                <span className="w-10 text-zinc-500">SB B</span>
                <Select value={hop.stagebox_id_b ?? ''} onChange={(e) => onChange({ stagebox_id_b: toOptionalNumber(e.target.value), stagebox_channel_b: undefined, stage_multi_id_b: undefined, stage_multi_channel_b: undefined })}>
                  <option value="">—</option>
                  {stageboxes.map((sb) => <option key={sb.id} value={sb.id}>{sb.name}</option>)}
                </Select>
                {sbMaxB > 0 ? (
                  <Select value={hop.stagebox_channel_b ?? ''} onChange={(e) => onChange({ stagebox_channel_b: toOptionalNumber(e.target.value) })} className="min-w-16">
                    <option value="">—</option>
                    {Array.from({ length: sbMaxB }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                  </Select>
                ) : (
                  <Input type="number" min={1} value={hop.stagebox_channel_b ?? ''} onChange={(e) => onChange({ stagebox_channel_b: toOptionalNumber(e.target.value) })} className="min-w-16" disabled={!hop.stagebox_id_b} />
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="w-10 text-zinc-500">Multi B</span>
                <Select value={hop.stage_multi_id_b ?? ''} onChange={(e) => onChange({ stage_multi_id_b: toOptionalNumber(e.target.value), stage_multi_channel_b: undefined, stagebox_id_b: undefined, stagebox_channel_b: undefined })}>
                  <option value="">—</option>
                  {stageMultis.map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
                </Select>
                {smMaxB > 0 ? (
                  <Select value={hop.stage_multi_channel_b ?? ''} onChange={(e) => onChange({ stage_multi_channel_b: toOptionalNumber(e.target.value) })} className="min-w-16">
                    <option value="">—</option>
                    {Array.from({ length: smMaxB }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                  </Select>
                ) : (
                  <Input type="number" min={1} value={hop.stage_multi_channel_b ?? ''} onChange={(e) => onChange({ stage_multi_channel_b: toOptionalNumber(e.target.value) })} className="min-w-16" disabled={!hop.stage_multi_id_b} />
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Select
            value={hop.device_source ?? ''}
            onChange={(e) => {
              const source = (e.target.value || undefined) as OutputChainHop['device_source']
              onChange({ device_source: source, inventory_item_id: undefined, owned_item_id: undefined, output_device_id: undefined })
            }}
            className="min-w-20"
          >
            <option value="">—</option>
            <option value="inventory">Rental</option>
            <option value="owned">Owned</option>
            <option value="shared">Shared</option>
          </Select>
          {hop.device_source === 'inventory' && (
            <Select value={hop.inventory_item_id ?? ''} onChange={(e) => onChange({ inventory_item_id: toOptionalNumber(e.target.value) })} className="min-w-40">
              <option value="">—</option>
              {inventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          )}
          {hop.device_source === 'owned' && (
            <Select value={hop.owned_item_id ?? ''} onChange={(e) => onChange({ owned_item_id: toOptionalNumber(e.target.value) })} className="min-w-40">
              <option value="">—</option>
              {ownedItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          )}
          {hop.device_source === 'shared' && (
            <Select value={hop.output_device_id ?? ''} onChange={(e) => onChange({ output_device_id: toOptionalNumber(e.target.value) })} className="min-w-40">
              <option value="">—</option>
              {outputDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
            </Select>
          )}
        </div>
      )}
      <div className="flex items-center gap-1">
        <span className="w-10 text-zinc-500">Cable</span>
        <Select value={hop.cable_item_id ?? ''} onChange={(e) => onChange({ cable_item_id: toOptionalNumber(e.target.value) })} className="min-w-40">
          <option value="">—</option>
          {cableItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
        </Select>
      </div>
      {!hop.cable_item_id && hop.cable_type && (
        <div className="flex items-center gap-1 text-zinc-500">
          <span className="truncate">{legacyCableText(hop.cable_type, hop.cable_length_m, cableLabel)}</span>
          <Badge variant="warning">unlinked</Badge>
        </div>
      )}
      {isStereo && (
        <div className="flex items-center gap-1">
          <span className="w-10 text-zinc-500">Cable B</span>
          <Select value={hop.cable_item_id_b ?? ''} onChange={(e) => onChange({ cable_item_id_b: toOptionalNumber(e.target.value) })} className="min-w-40">
            <option value="">— (same as Cable)</option>
            {cableItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
          </Select>
        </div>
      )}
    </div>
  )
}
