import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createAudioOutput, deleteAudioOutput, getAudioPatch, updateAudioOutput } from '../../api/audioPatch'
import { listInventoryItems } from '../../api/inventory'
import { useDraftState } from '../../hooks/useDraftState'
import { destinationTypes, outputTypes, speakerCableTypes } from '../../lib/constants'
import { toOptionalNumber } from '../../lib/utils'
import type { AudioPatchOutput, InventoryItem } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { StageboxMultiSection } from './StageboxMultiSection'

export function AudioOutputsTab({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient()
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: () => getAudioPatch(eventId) })
  const inventoryQuery = useQuery({ queryKey: ['inventory-audio-items'], queryFn: () => listInventoryItems({ categoryType: 'audio' }) })

  const [outputs, setOutputs] = useDraftState(audioQuery.data, (data) => data.outputs, [] as AudioPatchOutput[])

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const addMutation = useMutation({ mutationFn: (payload: Omit<AudioPatchOutput, 'id'>) => createAudioOutput(eventId, payload), onSuccess: invalidate })
  const saveMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Omit<AudioPatchOutput, 'id'> }) => updateAudioOutput(eventId, id, payload), onSuccess: invalidate })
  const deleteMutation = useMutation({ mutationFn: (id: number) => deleteAudioOutput(eventId, id), onSuccess: invalidate })

  const allAudioItems: InventoryItem[] = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data])
  const ampItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase().includes('slutsteg')), [allAudioItems])
  const speakerItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase().includes('högtalare')), [allAudioItems])

  function updateDraft<K extends keyof AudioPatchOutput>(index: number, key: K, value: AudioPatchOutput[K]) {
    setOutputs((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }

  async function persist(row: AudioPatchOutput) {
    await saveMutation.mutateAsync({ id: row.id, payload: row })
  }

  const addRow = () => {
    const lastNumber = outputs.at(-1)?.output_number ?? 0
    addMutation.mutate({
      event_id: eventId,
      output_number: lastNumber + 1,
      output_name: '',
      output_type: 'foh',
      destination_type: 'local',
      cable_type: 'xlr',
      cable_length_m: 0,
      notes: '',
    })
  }

  return (
    <>
      <StageboxMultiSection
        eventId={eventId}
        stageboxes={audioQuery.data?.stageboxes ?? []}
        stageMultis={audioQuery.data?.stage_multis ?? []}
        audioItems={allAudioItems}
      />
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Audio outputs</CardTitle>
          <Button size="sm" onClick={addRow}><Plus className="mr-2 h-4 w-4" />Add Row</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {['Out#','Name','Type','Destination','SB','SB Ch','Multi','Multi Ch','Amplifier','Speaker','Cable','Length','Notes',''].map((label) => <TableHead key={label}>{label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {outputs.map((row, index) => {
                  const selSb = (audioQuery.data?.stageboxes ?? []).find((sb) => sb.id === row.stagebox_id)
                  const sbMax = selSb?.output_count ?? 0
                  const selSm = (audioQuery.data?.stage_multis ?? []).find((sm) => sm.id === row.stage_multi_id)
                  const smMax = selSm?.channels ?? 0
                  return (
                    <TableRow key={row.id}>
                      <TableCell><Input type="number" value={row.output_number} onChange={(e) => updateDraft(index, 'output_number', Number(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-16" /></TableCell>
                      <TableCell><Input value={row.output_name ?? ''} onChange={(e) => updateDraft(index, 'output_name', e.target.value)} onBlur={() => persist(outputs[index])} className="min-w-36" /></TableCell>
                      <TableCell><div className="space-y-2 min-w-28"><Badge variant={row.output_type === 'aux' ? 'warning' : row.output_type}>{row.output_type}</Badge><Select value={row.output_type} onChange={(e) => updateDraft(index, 'output_type', e.target.value as AudioPatchOutput['output_type'])} onBlur={() => persist(outputs[index])}>{outputTypes.map((value) => <option key={value} value={value}>{value}</option>)}</Select></div></TableCell>
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
                      <TableCell><Select value={row.cable_type} onChange={(e) => updateDraft(index, 'cable_type', e.target.value)} onBlur={() => persist(outputs[index])} className="min-w-32">{speakerCableTypes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></TableCell>
                      <TableCell><Input type="number" step="0.5" value={row.cable_length_m} onChange={(e) => updateDraft(index, 'cable_length_m', Number(e.target.value))} onBlur={() => persist(outputs[index])} className="min-w-20" /></TableCell>
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
    </>
  )
}
