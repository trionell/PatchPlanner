import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createAudioInput, deleteAudioInput, getAudioPatch, updateAudioInput } from '../../api/audioPatch'
import { listInventoryItems } from '../../api/inventory'
import { useDraftState } from '../../hooks/useDraftState'
import { useReferenceData } from '../../hooks/useReferenceData'
import { channelNumberLabel, suggestNextChannelNumber } from '../../lib/channelWidth'
import { itemLabel, legacyCableText, toOptionalNumber } from '../../lib/utils'
import type { AudioPatchInput, InventoryItem } from '../../types'
import { InputPatchSheet } from '../print/InputPatchSheet'
import { PrintButton } from '../print/PrintButton'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { BusMultiSelect } from './BusMultiSelect'
import { BusSection } from './BusSection'
import { ColorSelect } from './ColorSelect'
import { StageboxMultiSection } from './StageboxMultiSection'

export function AudioInputsTab({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient()
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: ({ signal }) => getAudioPatch(eventId, signal) })
  const inventoryQuery = useQuery({ queryKey: ['inventory-audio-items'], queryFn: () => listInventoryItems({ categoryType: 'audio' }) })
  const cableQuery = useQuery({ queryKey: ['inventory-items', 'role', 'cable'], queryFn: () => listInventoryItems({ role: 'cable' }) })
  const standQuery = useQuery({ queryKey: ['inventory-items', 'role', 'stand'], queryFn: () => listInventoryItems({ role: 'stand' }) })
  const { options, label } = useReferenceData()

  const [inputs, setInputs] = useDraftState(audioQuery.data, (data) => data.inputs, [] as AudioPatchInput[])

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const addMutation = useMutation({ mutationFn: (payload: Omit<AudioPatchInput, 'id'>) => createAudioInput(eventId, payload), onSuccess: invalidate })
  const saveMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Omit<AudioPatchInput, 'id'> }) => updateAudioInput(eventId, id, payload), onSuccess: invalidate })
  const deleteMutation = useMutation({ mutationFn: (id: number) => deleteAudioInput(eventId, id), onSuccess: invalidate })

  const allAudioItems: InventoryItem[] = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data])
  const cableItems: InventoryItem[] = useMemo(() => cableQuery.data ?? [], [cableQuery.data])
  const standItems: InventoryItem[] = useMemo(() => standQuery.data ?? [], [standQuery.data])
  const micItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase().startsWith('mikrofon')), [allAudioItems])
  const diItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase().includes('linebox')), [allAudioItems])
  const iemItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase() === 'iem'), [allAudioItems])

  function updateDraft<K extends keyof AudioPatchInput>(index: number, key: K, value: AudioPatchInput[K]) {
    setInputs((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }

  async function persist(row: AudioPatchInput) {
    await saveMutation.mutateAsync({ id: row.id, payload: row })
  }

  /** Merges a partial patch into one row and persists it immediately (the ColorSelect/BusMultiSelect pattern — no onBlur wait). */
  function updateAndPersist(index: number, patch: Partial<AudioPatchInput>) {
    const updated = { ...inputs[index], ...patch }
    setInputs((current) => current.map((row, rowIndex) => (rowIndex === index ? updated : row)))
    void persist(updated)
  }

  /**
   * Flipping to stereo defaults side B to side A's route at the next
   * channel — a one-time convenience fill (FR-002a): it never re-applies
   * if the row already carries an explicit side-B route (including one
   * left over from a prior stereo→mono→stereo round trip).
   */
  function handleWidthChange(index: number, width: AudioPatchInput['width']) {
    const row = inputs[index]
    const patch: Partial<AudioPatchInput> = { width }
    const hasSideB = row.stagebox_id_b != null || row.stage_multi_id_b != null
    if (width === 'stereo' && !hasSideB) {
      if (row.stagebox_id) {
        patch.stagebox_id_b = row.stagebox_id
        patch.stagebox_channel_b = (row.stagebox_channel ?? 0) + 1
      } else if (row.stage_multi_id) {
        patch.stage_multi_id_b = row.stage_multi_id
        patch.stage_multi_channel_b = (row.stage_multi_channel ?? 0) + 1
      }
    }
    updateAndPersist(index, patch)
  }

  const addRow = () => {
    // group_ids intentionally omitted: the server routes new channels to LR.
    addMutation.mutate({
      event_id: eventId,
      channel_number: suggestNextChannelNumber(inputs),
      channel_name: '',
      signal_type: 'mic',
      preamp_connector: 'xlr',
      phantom_power: false,
      width: 'mono',
      mixer_behavior: 'stereo_channel',
      source_cabling: 'two_cables',
      notes: '',
    })
  }

  const groups = audioQuery.data?.groups ?? []
  const dcas = audioQuery.data?.dcas ?? []

  const itemLabelById = useMemo(
    () => new Map([...allAudioItems, ...cableItems, ...standItems].map((item) => [item.id, itemLabel(item)])),
    [allAudioItems, cableItems, standItems],
  )

  return (
    <>
      <div className="print:hidden">
        <StageboxMultiSection
          eventId={eventId}
          stageboxes={audioQuery.data?.stageboxes ?? []}
          stageMultis={audioQuery.data?.stage_multis ?? []}
          audioItems={allAudioItems}
        />
        <BusSection eventId={eventId} groups={groups} dcas={dcas} inputs={inputs} />
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Audio inputs</CardTitle>
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
                    {['Ch#','Name','Type','Connector','Stagebox','SB Ch','Multi','Multi Ch','Mic Model','Cable','Source Cable','Stand','48V','Width','Side B','Groups','DCA','Color','Notes',''].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inputs.map((row, index) => {
                    const selSb = (audioQuery.data?.stageboxes ?? []).find((sb) => sb.id === row.stagebox_id)
                    const sbMax = selSb?.input_count ?? 0
                    const selSm = (audioQuery.data?.stage_multis ?? []).find((sm) => sm.id === row.stage_multi_id)
                    const smMax = selSm?.channels ?? 0
                    const selSbB = (audioQuery.data?.stageboxes ?? []).find((sb) => sb.id === row.stagebox_id_b)
                    const sbMaxB = selSbB?.input_count ?? 0
                    const selSmB = (audioQuery.data?.stage_multis ?? []).find((sm) => sm.id === row.stage_multi_id_b)
                    const smMaxB = selSmB?.channels ?? 0
                    const micOptions = micItemsForSignalType(row.signal_type, micItems, diItems, iemItems)
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="min-w-16 space-y-1">
                            <Input type="number" value={row.channel_number} onChange={(e) => updateDraft(index, 'channel_number', Number(e.target.value))} onBlur={() => persist(inputs[index])} />
                            {row.mixer_behavior === 'linked_channels' && (
                              <div className="text-xs text-zinc-500">{channelNumberLabel(row.channel_number, row.mixer_behavior)}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell><Input value={row.channel_name ?? ''} onChange={(e) => updateDraft(index, 'channel_name', e.target.value)} onBlur={() => persist(inputs[index])} className="min-w-36" /></TableCell>
                        <TableCell>
                          <div className="space-y-2 min-w-28">
                            <Badge variant={row.signal_type}>{row.signal_type}</Badge>
                            <Select value={row.signal_type} onChange={(e) => updateDraft(index, 'signal_type', e.target.value)} onBlur={() => persist(inputs[index])}>
                              {options('signal_types', row.signal_type).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell><Select value={row.preamp_connector} onChange={(e) => updateDraft(index, 'preamp_connector', e.target.value)} onBlur={() => persist(inputs[index])} className="min-w-28">{options('preamp_connectors', row.preamp_connector).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></TableCell>
                        <TableCell><Select value={row.stagebox_id ?? ''} onChange={(e) => { updateDraft(index, 'stagebox_id', toOptionalNumber(e.target.value)); updateDraft(index, 'stagebox_channel', undefined) }} onBlur={() => persist(inputs[index])} className="min-w-36"><option value="">—</option>{(audioQuery.data?.stageboxes ?? []).map((sb) => <option key={sb.id} value={sb.id}>{sb.name}</option>)}</Select></TableCell>
                        <TableCell>
                          {sbMax > 0 ? (
                            <Select value={row.stagebox_channel ?? ''} onChange={(e) => updateDraft(index, 'stagebox_channel', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])} className="min-w-20">
                              <option value="">—</option>
                              {Array.from({ length: sbMax }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                            </Select>
                          ) : (
                            <Input type="number" min={1} value={row.stagebox_channel ?? ''} onChange={(e) => updateDraft(index, 'stagebox_channel', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])} className="min-w-20" disabled={!row.stagebox_id} />
                          )}
                        </TableCell>
                        <TableCell><Select value={row.stage_multi_id ?? ''} onChange={(e) => { updateDraft(index, 'stage_multi_id', toOptionalNumber(e.target.value)); updateDraft(index, 'stage_multi_channel', undefined) }} onBlur={() => persist(inputs[index])} className="min-w-36"><option value="">—</option>{(audioQuery.data?.stage_multis ?? []).map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}</Select></TableCell>
                        <TableCell>
                          {smMax > 0 ? (
                            <Select value={row.stage_multi_channel ?? ''} onChange={(e) => updateDraft(index, 'stage_multi_channel', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])} className="min-w-20">
                              <option value="">—</option>
                              {Array.from({ length: smMax }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                            </Select>
                          ) : (
                            <Input type="number" min={1} value={row.stage_multi_channel ?? ''} onChange={(e) => updateDraft(index, 'stage_multi_channel', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])} className="min-w-20" disabled={!row.stage_multi_id} />
                          )}
                        </TableCell>
                        <TableCell>
                          {micOptions.length > 0 ? (
                            <div className="min-w-48 space-y-1">
                              <Select value={row.mic_item_id ?? ''} onChange={(e) => updateDraft(index, 'mic_item_id', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])}>
                                <option value="">—</option>
                                {micOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                              </Select>
                              {!row.mic_item_id && row.mic_label && (
                                <div className="flex items-center gap-1 text-xs text-zinc-500">
                                  <span className="truncate" title={row.mic_label}>{row.mic_label}</span>
                                  <Badge variant="warning">unlinked</Badge>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 text-xs text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-48 space-y-1">
                            <Select value={row.cable_item_id ?? ''} onChange={(e) => updateDraft(index, 'cable_item_id', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])}>
                              <option value="">—</option>
                              {cableItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
                            </Select>
                            {!row.cable_item_id && row.cable_type && (
                              <div className="flex items-center gap-1 text-xs text-zinc-500">
                                <span className="truncate">{legacyCableText(row.cable_type, row.cable_length_m, (value) => label('signal_cable_types', value))}</span>
                                <Badge variant="warning">unlinked</Badge>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.signal_type === 'di' ? (
                            <div className="min-w-48 space-y-1">
                              <Select value={row.source_cable_item_id ?? ''} onChange={(e) => updateDraft(index, 'source_cable_item_id', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])}>
                                <option value="">—</option>
                                {cableItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
                              </Select>
                              {row.width === 'stereo' && (
                                <Select value={row.source_cabling} onChange={(e) => updateAndPersist(index, { source_cabling: e.target.value as AudioPatchInput['source_cabling'] })}>
                                  <option value="two_cables">Two cables</option>
                                  <option value="splitter">Splitter</option>
                                </Select>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 text-xs text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-44 space-y-1">
                            <Select value={row.stand_item_id ?? ''} onChange={(e) => updateDraft(index, 'stand_item_id', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])}>
                              <option value="">—</option>
                              {standItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
                            </Select>
                            {!row.stand_item_id && row.mic_stand && (
                              <div className="flex items-center gap-1 text-xs text-zinc-500">
                                <span className="truncate">{label('mic_stands', row.mic_stand)}</span>
                                <Badge variant="warning">unlinked</Badge>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell><input type="checkbox" checked={row.phantom_power} onChange={(e) => { updateDraft(index, 'phantom_power', e.target.checked); void persist({ ...inputs[index], phantom_power: e.target.checked }) }} className="h-4 w-4 accent-amber-500" /></TableCell>
                        <TableCell>
                          <div className="min-w-32 space-y-1">
                            <Select value={row.width} onChange={(e) => handleWidthChange(index, e.target.value as AudioPatchInput['width'])}>
                              <option value="mono">Mono</option>
                              <option value="stereo">Stereo</option>
                            </Select>
                            {row.width === 'stereo' && (
                              <Select value={row.mixer_behavior} onChange={(e) => updateAndPersist(index, { mixer_behavior: e.target.value as AudioPatchInput['mixer_behavior'] })}>
                                <option value="stereo_channel">Stereo channel</option>
                                <option value="linked_channels">Linked channels</option>
                              </Select>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.width === 'stereo' ? (
                            <div className="min-w-56 space-y-2 text-xs">
                              <div className="flex items-center gap-1">
                                <span className="w-10 text-zinc-500">SB</span>
                                <Select value={row.stagebox_id_b ?? ''} onChange={(e) => { updateDraft(index, 'stagebox_id_b', toOptionalNumber(e.target.value)); updateDraft(index, 'stagebox_channel_b', undefined) }} onBlur={() => persist(inputs[index])}>
                                  <option value="">—</option>
                                  {(audioQuery.data?.stageboxes ?? []).map((sb) => <option key={sb.id} value={sb.id}>{sb.name}</option>)}
                                </Select>
                                {sbMaxB > 0 ? (
                                  <Select value={row.stagebox_channel_b ?? ''} onChange={(e) => updateDraft(index, 'stagebox_channel_b', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])} className="min-w-16">
                                    <option value="">—</option>
                                    {Array.from({ length: sbMaxB }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                                  </Select>
                                ) : (
                                  <Input type="number" min={1} value={row.stagebox_channel_b ?? ''} onChange={(e) => updateDraft(index, 'stagebox_channel_b', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])} className="min-w-16" disabled={!row.stagebox_id_b} />
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="w-10 text-zinc-500">Multi</span>
                                <Select value={row.stage_multi_id_b ?? ''} onChange={(e) => { updateDraft(index, 'stage_multi_id_b', toOptionalNumber(e.target.value)); updateDraft(index, 'stage_multi_channel_b', undefined) }} onBlur={() => persist(inputs[index])}>
                                  <option value="">—</option>
                                  {(audioQuery.data?.stage_multis ?? []).map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
                                </Select>
                                {smMaxB > 0 ? (
                                  <Select value={row.stage_multi_channel_b ?? ''} onChange={(e) => updateDraft(index, 'stage_multi_channel_b', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])} className="min-w-16">
                                    <option value="">—</option>
                                    {Array.from({ length: smMaxB }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                                  </Select>
                                ) : (
                                  <Input type="number" min={1} value={row.stage_multi_channel_b ?? ''} onChange={(e) => updateDraft(index, 'stage_multi_channel_b', toOptionalNumber(e.target.value))} onBlur={() => persist(inputs[index])} className="min-w-16" disabled={!row.stage_multi_id_b} />
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="px-2 text-xs text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <BusMultiSelect
                            selected={row.group_ids ?? []}
                            options={groups}
                            onChange={(ids) => { updateDraft(index, 'group_ids', ids); void persist({ ...inputs[index], group_ids: ids }) }}
                          />
                        </TableCell>
                        <TableCell>
                          <BusMultiSelect
                            selected={row.dca_ids ?? []}
                            options={dcas}
                            onChange={(ids) => { updateDraft(index, 'dca_ids', ids); void persist({ ...inputs[index], dca_ids: ids }) }}
                          />
                        </TableCell>
                        <TableCell>
                          <ColorSelect
                            value={row.color}
                            onChange={(color) => { updateDraft(index, 'color', color); void persist({ ...inputs[index], color }) }}
                          />
                        </TableCell>
                        <TableCell><Input value={row.notes ?? ''} onChange={(e) => updateDraft(index, 'notes', e.target.value)} onBlur={() => persist(inputs[index])} className="min-w-36" /></TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(row.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      <InputPatchSheet
        eventId={eventId}
        inputs={inputs}
        stageboxes={audioQuery.data?.stageboxes ?? []}
        stageMultis={audioQuery.data?.stage_multis ?? []}
        groups={groups}
        dcas={dcas}
        itemLabelById={itemLabelById}
      />
    </>
  )
}

function micItemsForSignalType(
  signalType: string,
  micItems: InventoryItem[],
  diItems: InventoryItem[],
  iemItems: InventoryItem[],
): InventoryItem[] {
  switch (signalType) {
    case 'mic': return micItems
    case 'di': return diItems
    case 'return': return iemItems
    default: return []
  }
}
