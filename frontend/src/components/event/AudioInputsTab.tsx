import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createAudioInput, deleteAudioInput, getAudioPatch, updateAudioInput } from '../../api/audioPatch'
import { listInventoryItems } from '../../api/inventory'
import { useDraftState } from '../../hooks/useDraftState'
import { useReferenceData } from '../../hooks/useReferenceData'
import { toOptionalNumber } from '../../lib/utils'
import type { AudioPatchInput, InventoryItem } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { StageboxMultiSection } from './StageboxMultiSection'

export function AudioInputsTab({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient()
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: () => getAudioPatch(eventId) })
  const inventoryQuery = useQuery({ queryKey: ['inventory-audio-items'], queryFn: () => listInventoryItems({ categoryType: 'audio' }) })
  const { options } = useReferenceData()

  const [inputs, setInputs] = useDraftState(audioQuery.data, (data) => data.inputs, [] as AudioPatchInput[])

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const addMutation = useMutation({ mutationFn: (payload: Omit<AudioPatchInput, 'id'>) => createAudioInput(eventId, payload), onSuccess: invalidate })
  const saveMutation = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Omit<AudioPatchInput, 'id'> }) => updateAudioInput(eventId, id, payload), onSuccess: invalidate })
  const deleteMutation = useMutation({ mutationFn: (id: number) => deleteAudioInput(eventId, id), onSuccess: invalidate })

  const allAudioItems: InventoryItem[] = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data])
  const micItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase().startsWith('mikrofon')), [allAudioItems])
  const diItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase().includes('linebox')), [allAudioItems])
  const iemItems = useMemo(() => allAudioItems.filter((i) => i.category_name?.toLowerCase() === 'iem'), [allAudioItems])

  function updateDraft<K extends keyof AudioPatchInput>(index: number, key: K, value: AudioPatchInput[K]) {
    setInputs((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }

  async function persist(row: AudioPatchInput) {
    await saveMutation.mutateAsync({ id: row.id, payload: row })
  }

  const addRow = () => {
    const lastNumber = inputs.at(-1)?.channel_number ?? 0
    addMutation.mutate({
      event_id: eventId,
      channel_number: lastNumber + 1,
      channel_name: '',
      signal_type: 'mic',
      preamp_connector: 'xlr',
      cable_type: 'xlr',
      cable_length_m: 0,
      mic_stand: '',
      phantom_power: false,
      dca_groups: '',
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
          <CardTitle>Audio inputs</CardTitle>
          <Button size="sm" onClick={addRow}><Plus className="mr-2 h-4 w-4" />Add Row</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {['Ch#','Name','Type','Connector','Stagebox','SB Ch','Multi','Multi Ch','Mic Model','Cable','Length','Stand','48V','DCA','Notes',''].map((label) => <TableHead key={label}>{label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {inputs.map((row, index) => {
                  const selSb = (audioQuery.data?.stageboxes ?? []).find((sb) => sb.id === row.stagebox_id)
                  const sbMax = selSb?.input_count ?? 0
                  const selSm = (audioQuery.data?.stage_multis ?? []).find((sm) => sm.id === row.stage_multi_id)
                  const smMax = selSm?.channels ?? 0
                  const micOptions = micItemsForSignalType(row.signal_type, micItems, diItems, iemItems)
                  return (
                    <TableRow key={row.id}>
                      <TableCell><Input type="number" value={row.channel_number} onChange={(e) => updateDraft(index, 'channel_number', Number(e.target.value))} onBlur={() => persist(inputs[index])} className="min-w-16" /></TableCell>
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
                      <TableCell><Select value={row.cable_type} onChange={(e) => updateDraft(index, 'cable_type', e.target.value)} onBlur={() => persist(inputs[index])} className="min-w-28">{options('signal_cable_types', row.cable_type).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></TableCell>
                      <TableCell><Input type="number" step="0.5" value={row.cable_length_m} onChange={(e) => updateDraft(index, 'cable_length_m', Number(e.target.value))} onBlur={() => persist(inputs[index])} className="min-w-20" /></TableCell>
                      <TableCell><Select value={row.mic_stand ?? ''} onChange={(e) => updateDraft(index, 'mic_stand', e.target.value)} onBlur={() => persist(inputs[index])} className="min-w-28"><option value="">—</option>{options('mic_stands', row.mic_stand || undefined).map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</Select></TableCell>
                      <TableCell><input type="checkbox" checked={row.phantom_power} onChange={(e) => { updateDraft(index, 'phantom_power', e.target.checked); void persist({ ...inputs[index], phantom_power: e.target.checked }) }} className="h-4 w-4 accent-amber-500" /></TableCell>
                      <TableCell><Input value={row.dca_groups ?? ''} onChange={(e) => updateDraft(index, 'dca_groups', e.target.value)} onBlur={() => persist(inputs[index])} className="min-w-24" /></TableCell>
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
