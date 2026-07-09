import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createAudioOutput, deleteAudioOutput, getAudioPatch, updateAudioOutput } from '../../api/audioPatch'
import { listInventoryItems } from '../../api/inventory'
import { useDraftState } from '../../hooks/useDraftState'
import { useReferenceData } from '../../hooks/useReferenceData'
import { destinationTypes } from '../../lib/constants'
import { itemLabel, legacyCableText, toOptionalNumber } from '../../lib/utils'
import type { AudioPatchOutput, InventoryItem } from '../../types'
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
  const ampItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase().includes('slutsteg')), [allAudioItems])
  const speakerItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase().includes('högtalare')), [allAudioItems])

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

  /** Flipping to stereo defaults side B to side A's route at the next channel — same one-time fill as inputs. */
  function handleWidthChange(index: number, width: AudioPatchOutput['width']) {
    const row = outputs[index]
    const patch: Partial<AudioPatchOutput> = { width }
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
    const lastNumber = outputs.at(-1)?.output_number ?? 0
    addMutation.mutate({
      event_id: eventId,
      output_number: lastNumber + 1,
      output_name: '',
      output_type: 'foh',
      destination_type: 'local',
      width: 'mono',
      notes: '',
    })
  }

  const itemLabelById = useMemo(
    () => new Map([...allAudioItems, ...cableItems].map((item) => [item.id, itemLabel(item)])),
    [allAudioItems, cableItems],
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
                    {['Out#','Name','Type','Destination','SB','SB Ch','Multi','Multi Ch','Amplifier','Speaker','Cable','Width','Side B','Color','Notes',''].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outputs.map((row, index) => {
                    const selSb = (audioQuery.data?.stageboxes ?? []).find((sb) => sb.id === row.stagebox_id)
                    const sbMax = selSb?.output_count ?? 0
                    const selSm = (audioQuery.data?.stage_multis ?? []).find((sm) => sm.id === row.stage_multi_id)
                    const smMax = selSm?.channels ?? 0
                    const selSbB = (audioQuery.data?.stageboxes ?? []).find((sb) => sb.id === row.stagebox_id_b)
                    const sbMaxB = selSbB?.output_count ?? 0
                    const selSmB = (audioQuery.data?.stage_multis ?? []).find((sm) => sm.id === row.stage_multi_id_b)
                    const smMaxB = selSmB?.channels ?? 0
                    return (
                      <TableRow key={row.id}>
                        <TableCell><Input type="number" value={row.output_number} onChange={(e) => updateDraft(index, 'output_number', Number(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-16" /></TableCell>
                        <TableCell><Input value={row.output_name ?? ''} onChange={(e) => updateDraft(index, 'output_name', e.target.value)} onBlur={() => persist(outputs[index])} className="min-w-36" /></TableCell>
                        <TableCell><div className="space-y-2 min-w-28"><Badge variant={row.output_type === 'aux' ? 'warning' : row.output_type}>{row.output_type}</Badge><Select value={row.output_type} onChange={(e) => updateDraft(index, 'output_type', e.target.value)} onBlur={() => persist(outputs[index])}>{options('output_types', row.output_type).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</Select></div></TableCell>
                        <TableCell><Select value={row.destination_type} onChange={(e) => updateDraft(index, 'destination_type', e.target.value as AudioPatchOutput['destination_type'])} onBlur={() => persist(outputs[index])} className="min-w-28">{destinationTypes.map((value) => <option key={value} value={value}>{value}</option>)}</Select></TableCell>
                        <TableCell><Select value={row.stagebox_id ?? ''} onChange={(e) => { updateDraft(index, 'stagebox_id', toOptionalNumber(e.target.value)); updateDraft(index, 'stagebox_channel', undefined) }} onBlur={() => persist(outputs[index])} className="min-w-36"><option value="">—</option>{(audioQuery.data?.stageboxes ?? []).map((sb) => <option key={sb.id} value={sb.id}>{sb.name}</option>)}</Select></TableCell>
                        <TableCell>
                          {sbMax > 0 ? (
                            <Select value={row.stagebox_channel ?? ''} onChange={(e) => updateDraft(index, 'stagebox_channel', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-20">
                              <option value="">—</option>
                              {Array.from({ length: sbMax }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                            </Select>
                          ) : (
                            <Input type="number" min={1} value={row.stagebox_channel ?? ''} onChange={(e) => updateDraft(index, 'stagebox_channel', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-20" disabled={!row.stagebox_id} />
                          )}
                        </TableCell>
                        <TableCell><Select value={row.stage_multi_id ?? ''} onChange={(e) => { updateDraft(index, 'stage_multi_id', toOptionalNumber(e.target.value)); updateDraft(index, 'stage_multi_channel', undefined) }} onBlur={() => persist(outputs[index])} className="min-w-36"><option value="">—</option>{(audioQuery.data?.stage_multis ?? []).map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}</Select></TableCell>
                        <TableCell>
                          {smMax > 0 ? (
                            <Select value={row.stage_multi_channel ?? ''} onChange={(e) => updateDraft(index, 'stage_multi_channel', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-20">
                              <option value="">—</option>
                              {Array.from({ length: smMax }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                            </Select>
                          ) : (
                            <Input type="number" min={1} value={row.stage_multi_channel ?? ''} onChange={(e) => updateDraft(index, 'stage_multi_channel', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-20" disabled={!row.stage_multi_id} />
                          )}
                        </TableCell>
                        <TableCell><Select value={row.amplifier_item_id ?? ''} onChange={(e) => updateDraft(index, 'amplifier_item_id', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-44"><option value="">—</option>{ampItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></TableCell>
                        <TableCell><Select value={row.speaker_item_id ?? ''} onChange={(e) => updateDraft(index, 'speaker_item_id', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-44"><option value="">—</option>{speakerItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></TableCell>
                        <TableCell>
                          <div className="min-w-48 space-y-1">
                            <Select value={row.cable_item_id ?? ''} onChange={(e) => updateDraft(index, 'cable_item_id', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])}>
                              <option value="">—</option>
                              {cableItems.map((item) => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
                            </Select>
                            {!row.cable_item_id && row.cable_type && (
                              <div className="flex items-center gap-1 text-xs text-zinc-500">
                                <span className="truncate">{legacyCableText(row.cable_type, row.cable_length_m, (value) => label('speaker_cable_types', value))}</span>
                                <Badge variant="warning">unlinked</Badge>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-24">
                            <Select value={row.width} onChange={(e) => handleWidthChange(index, e.target.value as AudioPatchOutput['width'])}>
                              <option value="mono">Mono</option>
                              <option value="stereo">Stereo</option>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.width === 'stereo' ? (
                            <div className="min-w-56 space-y-2 text-xs">
                              <div className="flex items-center gap-1">
                                <span className="w-10 text-zinc-500">SB</span>
                                <Select value={row.stagebox_id_b ?? ''} onChange={(e) => { updateDraft(index, 'stagebox_id_b', toOptionalNumber(e.target.value)); updateDraft(index, 'stagebox_channel_b', undefined) }} onBlur={() => persist(outputs[index])}>
                                  <option value="">—</option>
                                  {(audioQuery.data?.stageboxes ?? []).map((sb) => <option key={sb.id} value={sb.id}>{sb.name}</option>)}
                                </Select>
                                {sbMaxB > 0 ? (
                                  <Select value={row.stagebox_channel_b ?? ''} onChange={(e) => updateDraft(index, 'stagebox_channel_b', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-16">
                                    <option value="">—</option>
                                    {Array.from({ length: sbMaxB }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                                  </Select>
                                ) : (
                                  <Input type="number" min={1} value={row.stagebox_channel_b ?? ''} onChange={(e) => updateDraft(index, 'stagebox_channel_b', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-16" disabled={!row.stagebox_id_b} />
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="w-10 text-zinc-500">Multi</span>
                                <Select value={row.stage_multi_id_b ?? ''} onChange={(e) => { updateDraft(index, 'stage_multi_id_b', toOptionalNumber(e.target.value)); updateDraft(index, 'stage_multi_channel_b', undefined) }} onBlur={() => persist(outputs[index])}>
                                  <option value="">—</option>
                                  {(audioQuery.data?.stage_multis ?? []).map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
                                </Select>
                                {smMaxB > 0 ? (
                                  <Select value={row.stage_multi_channel_b ?? ''} onChange={(e) => updateDraft(index, 'stage_multi_channel_b', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-16">
                                    <option value="">—</option>
                                    {Array.from({ length: smMaxB }, (_, i) => i + 1).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                                  </Select>
                                ) : (
                                  <Input type="number" min={1} value={row.stage_multi_channel_b ?? ''} onChange={(e) => updateDraft(index, 'stage_multi_channel_b', toOptionalNumber(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-16" disabled={!row.stage_multi_id_b} />
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="px-2 text-xs text-zinc-500">—</span>
                          )}
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
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      <OutputPatchSheet
        eventId={eventId}
        outputs={outputs}
        stageboxes={audioQuery.data?.stageboxes ?? []}
        stageMultis={audioQuery.data?.stage_multis ?? []}
        itemLabelById={itemLabelById}
      />
    </>
  )
}
