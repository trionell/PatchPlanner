import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Cable, Link2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { getAudioPatch, createAudioInput, createAudioOutput, deleteAudioInput, deleteAudioOutput, updateAudioInput, updateAudioOutput } from '../api/audioPatch'
import { getEvent, updateEvent } from '../api/events'
import { listInventoryItems } from '../api/inventory'
import { autoAssignDMX, createLightingFixture, deleteLightingFixture, getLightingRig, updateLightingFixture } from '../api/lighting'
import { getRentalSummary } from '../api/rentals'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Dialog } from '../components/ui/Dialog'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table'
import { Tab, TabList, TabPanel, Tabs } from '../components/ui/Tabs'
import type { AudioPatchInput, AudioPatchOutput, InventoryItem, LightingFixture } from '../types'

const signalTypes = ['mic', 'line', 'di', 'return', 'aux'] as const
const stands = ['', 'straight', 'boom', 'low', 'desk', 'clip', 'none'] as const
const outputTypes = ['foh', 'monitor', 'sub', 'aux', 'matrix', 'stereo', 'iem'] as const
const destinationTypes = ['local', 'stagebox', 'stage_multi'] as const

const preampConnectors = [
  { value: 'xlr', label: 'XLR' },
  { value: 'jack_ts', label: 'Jack TS' },
  { value: 'jack_trs', label: 'Jack TRS' },
  { value: 'rca', label: 'RCA' },
  { value: 'combo', label: 'Combo' },
  { value: 'usb', label: 'USB' },
]

const signalCableTypes = [
  { value: 'xlr', label: 'XLR' },
  { value: 'jack_ts', label: 'Jack TS' },
  { value: 'jack_trs', label: 'Jack TRS' },
  { value: 'rca', label: 'RCA' },
  { value: 'combo', label: 'Combo' },
]

const speakerCableTypes = [
  { value: 'xlr', label: 'XLR' },
  { value: 'nl4', label: 'NL4 (Speakon)' },
  { value: 'nl8', label: 'NL8 (Speakon)' },
  { value: 'jack_ts', label: 'Jack TS' },
]

const powerConnectors = [
  { value: 'schuko', label: 'Schuko' },
  { value: 'cee16', label: 'CEE 16A (1-fas)' },
  { value: 'cee32', label: 'CEE 32A (1-fas)' },
  { value: 'cee16_3ph', label: 'CEE 16A (3-fas)' },
  { value: 'cee32_3ph', label: 'CEE 32A (3-fas)' },
  { value: 'powercon', label: 'PowerCon' },
  { value: 'powercon_true1', label: 'PowerCon TRUE1' },
  { value: 'iec', label: 'IEC C13' },
]

export function EventDetailPage() {
  const params = useParams()
  const eventId = Number(params.id)
  const queryClient = useQueryClient()

  const eventQuery = useQuery({ queryKey: ['event', eventId], queryFn: () => getEvent(eventId), enabled: Number.isFinite(eventId) })
  const audioQuery = useQuery({ queryKey: ['audio-patch', eventId], queryFn: () => getAudioPatch(eventId), enabled: Number.isFinite(eventId) })
  const lightingQuery = useQuery({ queryKey: ['lighting-rig', eventId], queryFn: () => getLightingRig(eventId), enabled: Number.isFinite(eventId) })
  const rentalQuery = useQuery({ queryKey: ['rental-summary', eventId], queryFn: () => getRentalSummary(eventId), enabled: Number.isFinite(eventId) })
  const inventoryQuery = useQuery({ queryKey: ['inventory-audio-items'], queryFn: () => listInventoryItems({ categoryType: 'audio' }) })
  const lightingInventoryQuery = useQuery({ queryKey: ['inventory-lighting'], queryFn: () => listInventoryItems({ categoryType: 'lighting' }) })

  const [overview, setOverview] = useState({ name: '', date: '', venue: '', notes: '' })
  const [inputs, setInputs] = useState<AudioPatchInput[]>([])
  const [outputs, setOutputs] = useState<AudioPatchOutput[]>([])
  const [fixtures, setFixtures] = useState<LightingFixture[]>([])
  const [fixtureDialogOpen, setFixtureDialogOpen] = useState(false)
  const [fixtureDraft, setFixtureDraft] = useState({ inventory_item_id: '', custom_name: '', dmx_channel_mode: 'Basic', dmx_channel_count: 8 })
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (eventQuery.data) {
      setOverview({
        name: eventQuery.data.name,
        date: eventQuery.data.date ?? '',
        venue: eventQuery.data.venue ?? '',
        notes: eventQuery.data.notes ?? '',
      })
    }
  }, [eventQuery.data])

  useEffect(() => {
    setInputs(audioQuery.data?.inputs ?? [])
    setOutputs(audioQuery.data?.outputs ?? [])
  }, [audioQuery.data])

  useEffect(() => {
    setFixtures(lightingQuery.data?.fixtures ?? [])
  }, [lightingQuery.data])

  const eventMutation = useMutation({
    mutationFn: (payload: typeof overview) => updateEvent(eventId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    },
  })

  const addInputMutation = useMutation({
    mutationFn: (payload: Omit<AudioPatchInput, 'id'>) => createAudioInput(eventId, payload),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] }),
  })
  const saveInputMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Omit<AudioPatchInput, 'id'> }) => updateAudioInput(eventId, id, payload),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] }),
  })
  const deleteInputMutation = useMutation({
    mutationFn: (id: number) => deleteAudioInput(eventId, id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] }),
  })

  const addOutputMutation = useMutation({
    mutationFn: (payload: Omit<AudioPatchOutput, 'id'>) => createAudioOutput(eventId, payload),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] }),
  })
  const saveOutputMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Omit<AudioPatchOutput, 'id'> }) => updateAudioOutput(eventId, id, payload),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] }),
  })
  const deleteOutputMutation = useMutation({
    mutationFn: (id: number) => deleteAudioOutput(eventId, id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] }),
  })

  const addFixtureMutation = useMutation({
    mutationFn: (payload: Omit<LightingFixture, 'id'>) => createLightingFixture(eventId, lightingQuery.data!.rig.id, payload),
    onSuccess: async () => {
      setFixtureDialogOpen(false)
      setFixtureDraft({ inventory_item_id: '', custom_name: '', dmx_channel_mode: 'Basic', dmx_channel_count: 8 })
      await queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
    },
  })
  const saveFixtureMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Omit<LightingFixture, 'id'> }) =>
      updateLightingFixture(eventId, lightingQuery.data!.rig.id, id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
    },
  })
  const deleteFixtureMutation = useMutation({
    mutationFn: (id: number) => deleteLightingFixture(eventId, lightingQuery.data!.rig.id, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
    },
  })
  const autoAssignMutation = useMutation({
    mutationFn: () => autoAssignDMX(eventId, lightingQuery.data!.rig.id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] }),
  })

  const lightingOptions = useMemo(() => (lightingInventoryQuery.data ?? []).map((item) => ({ label: item.name, value: item.id })), [lightingInventoryQuery.data])

  const allAudioItems: InventoryItem[] = inventoryQuery.data ?? []
  const micItems = useMemo(() => allAudioItems.filter(i => i.category_name?.toLowerCase().startsWith('mikrofon')), [allAudioItems])
  const diItems = useMemo(() => allAudioItems.filter(i => i.category_name?.toLowerCase().includes('linebox')), [allAudioItems])
  const iemItems = useMemo(() => allAudioItems.filter(i => i.category_name?.toLowerCase() === 'iem'), [allAudioItems])
  const ampItems = useMemo(() => allAudioItems.filter(i => i.category_name?.toLowerCase().includes('slutsteg')), [allAudioItems])
  const speakerItems = useMemo(() => allAudioItems.filter(i => i.category_name?.toLowerCase().includes('högtalare')), [allAudioItems])

  if (!Number.isFinite(eventId)) return <p className="text-sm text-red-400">Invalid event id.</p>
  if (eventQuery.isLoading) return <p className="text-sm text-zinc-400">Loading event...</p>
  if (eventQuery.isError) return <p className="text-sm text-red-400">Failed to load event.</p>

  const addInputRow = async () => {
    const lastNumber = inputs.at(-1)?.channel_number ?? 0
    await addInputMutation.mutateAsync({
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
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  const addOutputRow = async () => {
    const lastNumber = outputs.at(-1)?.output_number ?? 0
    await addOutputMutation.mutateAsync({
      event_id: eventId,
      output_number: lastNumber + 1,
      output_name: '',
      output_type: 'foh',
      destination_type: 'local',
      cable_type: 'xlr',
      cable_length_m: 0,
      notes: '',
    })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{eventQuery.data.name}</h2>
          <p className="text-sm text-zinc-400">{eventQuery.data.venue || 'Venue TBD'} · {eventQuery.data.date || 'Date TBD'}</p>
        </div>
        <Link className="text-sm text-amber-400 hover:text-amber-300" to="/events">← Back to events</Link>
      </div>

      <Tabs defaultValue="overview">
        <TabList>
          <Tab value="overview">Overview</Tab>
          <Tab value="audio-inputs">Audio Inputs</Tab>
          <Tab value="audio-outputs">Audio Outputs</Tab>
          <Tab value="lighting-rig">Lighting Rig</Tab>
          <Tab value="rentals">Rental Order</Tab>
        </TabList>

        <TabPanel value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Event overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">Name</label>
                  <Input value={overview.name} onChange={(e) => setOverview((prev) => ({ ...prev, name: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">Venue</label>
                  <Input value={overview.venue} onChange={(e) => setOverview((prev) => ({ ...prev, venue: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">Date</label>
                  <Input type="date" value={overview.date} onChange={(e) => setOverview((prev) => ({ ...prev, date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Notes</label>
                <textarea
                  className="min-h-32 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
                  value={overview.notes}
                  onChange={(e) => setOverview((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <MiniStat label="Rental items" value={String(rentalQuery.data?.total_items ?? 0)} />
                <MiniStat label="Rental quantity" value={String(rentalQuery.data?.total_quantity ?? 0)} />
                <MiniStat label="Ex VAT total" value={`${(rentalQuery.data?.total_ex_vat ?? 0).toFixed(2)} kr`} />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => eventMutation.mutate(overview)} disabled={eventMutation.isPending || !overview.name.trim()}>
                  {eventMutation.isPending ? 'Saving...' : 'Save event'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="audio-inputs">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Audio inputs</CardTitle>
              <Button size="sm" onClick={addInputRow}><Plus className="mr-2 h-4 w-4" />Add Row</Button>
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
                    {inputs.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell><Input type="number" value={row.channel_number} onChange={(e) => updateInputDraft(index, 'channel_number', Number(e.target.value))} onBlur={() => persistInput(inputs[index])} className="min-w-16" /></TableCell>
                        <TableCell><Input value={row.channel_name ?? ''} onChange={(e) => updateInputDraft(index, 'channel_name', e.target.value)} onBlur={() => persistInput(inputs[index])} className="min-w-36" /></TableCell>
                        <TableCell>
                          <div className="space-y-2 min-w-28">
                            <Badge variant={row.signal_type}>{row.signal_type}</Badge>
                            <Select value={row.signal_type} onChange={(e) => updateInputDraft(index, 'signal_type', e.target.value as AudioPatchInput['signal_type'])} onBlur={() => persistInput(inputs[index])}>
                              {signalTypes.map((value) => <option key={value} value={value}>{value}</option>)}
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell><Select value={row.preamp_connector} onChange={(e) => updateInputDraft(index, 'preamp_connector', e.target.value)} onBlur={() => persistInput(inputs[index])} className="min-w-28">{preampConnectors.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></TableCell>
                        <TableCell><Select value={row.stagebox_id ?? ''} onChange={(e) => updateInputDraft(index, 'stagebox_id', toOptionalNumber(e.target.value))} onBlur={() => persistInput(inputs[index])} className="min-w-36"><option value="">—</option>{(audioQuery.data?.stageboxes ?? []).map((sb) => <option key={sb.id} value={sb.id}>{sb.name}</option>)}</Select></TableCell>
                        <TableCell><Input type="number" value={row.stagebox_channel ?? ''} onChange={(e) => updateInputDraft(index, 'stagebox_channel', toOptionalNumber(e.target.value))} onBlur={() => persistInput(inputs[index])} className="min-w-20" /></TableCell>
                        <TableCell><Select value={row.stage_multi_id ?? ''} onChange={(e) => updateInputDraft(index, 'stage_multi_id', toOptionalNumber(e.target.value))} onBlur={() => persistInput(inputs[index])} className="min-w-36"><option value="">—</option>{(audioQuery.data?.stage_multis ?? []).map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}</Select></TableCell>
                        <TableCell><Input type="number" value={row.stage_multi_channel ?? ''} onChange={(e) => updateInputDraft(index, 'stage_multi_channel', toOptionalNumber(e.target.value))} onBlur={() => persistInput(inputs[index])} className="min-w-20" /></TableCell>
                        <TableCell>
                          {getMicItemsForSignalType(row.signal_type, micItems, diItems, iemItems).length > 0 ? (
                            <Select value={row.mic_model ?? ''} onChange={(e) => updateInputDraft(index, 'mic_model', e.target.value)} onBlur={() => persistInput(inputs[index])} className="min-w-48">
                              <option value="">—</option>
                              {getMicItemsForSignalType(row.signal_type, micItems, diItems, iemItems).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                            </Select>
                          ) : (
                            <span className="px-2 text-xs text-zinc-500">—</span>
                          )}
                        </TableCell>
                        <TableCell><Select value={row.cable_type} onChange={(e) => updateInputDraft(index, 'cable_type', e.target.value)} onBlur={() => persistInput(inputs[index])} className="min-w-28">{signalCableTypes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></TableCell>
                        <TableCell><Input type="number" step="0.5" value={row.cable_length_m} onChange={(e) => updateInputDraft(index, 'cable_length_m', Number(e.target.value))} onBlur={() => persistInput(inputs[index])} className="min-w-20" /></TableCell>
                        <TableCell><Select value={row.mic_stand ?? ''} onChange={(e) => updateInputDraft(index, 'mic_stand', e.target.value as AudioPatchInput['mic_stand'])} onBlur={() => persistInput(inputs[index])} className="min-w-28">{stands.map((value) => <option key={value} value={value}>{value || '—'}</option>)}</Select></TableCell>
                        <TableCell><input type="checkbox" checked={row.phantom_power} onChange={(e) => { updateInputDraft(index, 'phantom_power', e.target.checked); void persistInput({ ...inputs[index], phantom_power: e.target.checked }) }} className="h-4 w-4 accent-amber-500" /></TableCell>
                        <TableCell><Input value={row.dca_groups ?? ''} onChange={(e) => updateInputDraft(index, 'dca_groups', e.target.value)} onBlur={() => persistInput(inputs[index])} className="min-w-24" /></TableCell>
                        <TableCell><Input value={row.notes ?? ''} onChange={(e) => updateInputDraft(index, 'notes', e.target.value)} onBlur={() => persistInput(inputs[index])} className="min-w-36" /></TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => deleteInputMutation.mutate(row.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="audio-outputs">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Audio outputs</CardTitle>
              <Button size="sm" onClick={addOutputRow}><Plus className="mr-2 h-4 w-4" />Add Row</Button>
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
                    {outputs.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell><Input type="number" value={row.output_number} onChange={(e) => updateOutputDraft(index, 'output_number', Number(e.target.value))} onBlur={() => persistOutput(outputs[index])} className="min-w-16" /></TableCell>
                        <TableCell><Input value={row.output_name ?? ''} onChange={(e) => updateOutputDraft(index, 'output_name', e.target.value)} onBlur={() => persistOutput(outputs[index])} className="min-w-36" /></TableCell>
                        <TableCell><div className="space-y-2 min-w-28"><Badge variant={row.output_type === 'aux' ? 'warning' : row.output_type}>{row.output_type}</Badge><Select value={row.output_type} onChange={(e) => updateOutputDraft(index, 'output_type', e.target.value as AudioPatchOutput['output_type'])} onBlur={() => persistOutput(outputs[index])}>{outputTypes.map((value) => <option key={value} value={value}>{value}</option>)}</Select></div></TableCell>
                        <TableCell><Select value={row.destination_type} onChange={(e) => updateOutputDraft(index, 'destination_type', e.target.value as AudioPatchOutput['destination_type'])} onBlur={() => persistOutput(outputs[index])} className="min-w-28">{destinationTypes.map((value) => <option key={value} value={value}>{value}</option>)}</Select></TableCell>
                        <TableCell><Select value={row.stagebox_id ?? ''} onChange={(e) => updateOutputDraft(index, 'stagebox_id', toOptionalNumber(e.target.value))} onBlur={() => persistOutput(outputs[index])} className="min-w-36"><option value="">—</option>{(audioQuery.data?.stageboxes ?? []).map((sb) => <option key={sb.id} value={sb.id}>{sb.name}</option>)}</Select></TableCell>
                        <TableCell><Input type="number" value={row.stagebox_channel ?? ''} onChange={(e) => updateOutputDraft(index, 'stagebox_channel', toOptionalNumber(e.target.value))} onBlur={() => persistOutput(outputs[index])} className="min-w-20" /></TableCell>
                        <TableCell><Select value={row.stage_multi_id ?? ''} onChange={(e) => updateOutputDraft(index, 'stage_multi_id', toOptionalNumber(e.target.value))} onBlur={() => persistOutput(outputs[index])} className="min-w-36"><option value="">—</option>{(audioQuery.data?.stage_multis ?? []).map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}</Select></TableCell>
                        <TableCell><Input type="number" value={row.stage_multi_channel ?? ''} onChange={(e) => updateOutputDraft(index, 'stage_multi_channel', toOptionalNumber(e.target.value))} onBlur={() => persistOutput(outputs[index])} className="min-w-20" /></TableCell>
                        <TableCell><Select value={row.amplifier_item_id ?? ''} onChange={(e) => updateOutputDraft(index, 'amplifier_item_id', toOptionalNumber(e.target.value))} onBlur={() => persistOutput(outputs[index])} className="min-w-44"><option value="">—</option>{ampItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></TableCell>
                        <TableCell><Select value={row.speaker_item_id ?? ''} onChange={(e) => updateOutputDraft(index, 'speaker_item_id', toOptionalNumber(e.target.value))} onBlur={() => persistOutput(outputs[index])} className="min-w-44"><option value="">—</option>{speakerItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></TableCell>
                        <TableCell><Select value={row.cable_type} onChange={(e) => updateOutputDraft(index, 'cable_type', e.target.value)} onBlur={() => persistOutput(outputs[index])} className="min-w-32">{speakerCableTypes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></TableCell>
                        <TableCell><Input type="number" step="0.5" value={row.cable_length_m} onChange={(e) => updateOutputDraft(index, 'cable_length_m', Number(e.target.value))} onBlur={() => persistOutput(outputs[index])} className="min-w-20" /></TableCell>
                        <TableCell><Input value={row.notes ?? ''} onChange={(e) => updateOutputDraft(index, 'notes', e.target.value)} onBlur={() => persistOutput(outputs[index])} className="min-w-36" /></TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => deleteOutputMutation.mutate(row.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="lighting-rig">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>{lightingQuery.data?.rig.name ?? 'Lighting rig'}</CardTitle>
                <p className="mt-1 text-sm text-zinc-400">Manage fixtures, power chains, and DMX allocation.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => autoAssignMutation.mutate()} disabled={autoAssignMutation.isPending}>
                  <Sparkles className="mr-2 h-4 w-4" />Auto-assign DMX
                </Button>
                <Button size="sm" onClick={() => setFixtureDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Fixture</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {['#','Fixture Name','Truss','Position','Power','Power Connector','DMX Univ','DMX Addr','Mode','Channels','DMX Chain','Notes',''].map((label) => <TableHead key={label}>{label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fixtures.map((fixture, index) => (
                      <TableRow key={fixture.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="min-w-48"><div className="space-y-2"><div className="font-medium">{fixture.inventory_item_name || fixture.custom_name || 'Unnamed fixture'}</div><Input value={fixture.custom_name ?? ''} onChange={(e) => updateFixtureDraft(index, 'custom_name', e.target.value)} onBlur={() => persistFixture(fixtures[index])} placeholder="Custom label" /></div></TableCell>
                        <TableCell><Input value={fixture.truss_section_name ?? ''} disabled className="min-w-24 opacity-70" /></TableCell>
                        <TableCell><Input type="number" value={fixture.position_index} onChange={(e) => updateFixtureDraft(index, 'position_index', Number(e.target.value))} onBlur={() => persistFixture(fixtures[index])} className="min-w-20" /></TableCell>
                        <TableCell><div className="flex items-center gap-2"><Select value={fixture.power_connection} onChange={(e) => updateFixtureDraft(index, 'power_connection', e.target.value as LightingFixture['power_connection'])} onBlur={() => persistFixture(fixtures[index])} className="min-w-24"><option value="grid">grid</option><option value="chain">chain</option></Select>{fixture.power_connection === 'chain' && <Link2 className="h-4 w-4 text-amber-400" />}</div></TableCell>
                        <TableCell><Select value={fixture.power_connector_in} onChange={(e) => updateFixtureDraft(index, 'power_connector_in', e.target.value)} onBlur={() => persistFixture(fixtures[index])} className="min-w-44">{powerConnectors.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></TableCell>
                        <TableCell><Input type="number" value={fixture.dmx_universe} onChange={(e) => updateFixtureDraft(index, 'dmx_universe', Number(e.target.value))} onBlur={() => persistFixture(fixtures[index])} className="min-w-20" /></TableCell>
                        <TableCell className="min-w-24">{formatDMXRange(fixture.dmx_start_address, fixture.dmx_channel_count)}</TableCell>
                        <TableCell><Input value={fixture.dmx_channel_mode ?? ''} onChange={(e) => updateFixtureDraft(index, 'dmx_channel_mode', e.target.value)} onBlur={() => persistFixture(fixtures[index])} className="min-w-24" /></TableCell>
                        <TableCell><Input type="number" value={fixture.dmx_channel_count} onChange={(e) => updateFixtureDraft(index, 'dmx_channel_count', Number(e.target.value))} onBlur={() => persistFixture(fixtures[index])} className="min-w-20" /></TableCell>
                        <TableCell>{fixture.dmx_chain_parent_id ?? '—'}</TableCell>
                        <TableCell><Input value={fixture.notes ?? ''} onChange={(e) => updateFixtureDraft(index, 'notes', e.target.value)} onBlur={() => persistFixture(fixtures[index])} className="min-w-36" /></TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => deleteFixtureMutation.mutate(fixture.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="rentals">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Rental order</CardTitle>
              <Button variant="secondary" size="sm" onClick={() => { setToast('Export coming soon'); window.setTimeout(() => setToast(''), 2200) }}>
                <Cable className="mr-2 h-4 w-4" />Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {['Item','Description','Qty Audio','Qty Lighting','Total','Price (ex VAT)','Subtotal'].map((label) => <TableHead key={label}>{label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rentalQuery.data?.items ?? []).map((item) => (
                      <TableRow key={item.inventory_item_id}>
                        <TableCell className="font-medium">{item.inventory_item_name}</TableCell>
                        <TableCell className="text-zinc-400">{item.description || '—'}</TableCell>
                        <TableCell>{item.quantity_audio}</TableCell>
                        <TableCell>{item.quantity_lighting}</TableCell>
                        <TableCell>{item.total_quantity}</TableCell>
                        <TableCell>{item.price_ex_vat.toFixed(2)}</TableCell>
                        <TableCell>{item.subtotal_ex_vat.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-semibold">Totals</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell className="font-semibold">{rentalQuery.data?.total_quantity ?? 0}</TableCell>
                      <TableCell />
                      <TableCell className="font-semibold">{(rentalQuery.data?.total_ex_vat ?? 0).toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>

      <Dialog open={fixtureDialogOpen} onClose={() => setFixtureDialogOpen(false)} title="Add fixture">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Inventory fixture</label>
            <Select value={fixtureDraft.inventory_item_id} onChange={(e) => setFixtureDraft((prev) => ({ ...prev, inventory_item_id: e.target.value }))}>
              <option value="">Custom / none</option>
              {lightingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Custom name</label>
            <Input value={fixtureDraft.custom_name} onChange={(e) => setFixtureDraft((prev) => ({ ...prev, custom_name: e.target.value }))} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Mode</label>
              <Input value={fixtureDraft.dmx_channel_mode} onChange={(e) => setFixtureDraft((prev) => ({ ...prev, dmx_channel_mode: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Channels</label>
              <Input type="number" value={fixtureDraft.dmx_channel_count} onChange={(e) => setFixtureDraft((prev) => ({ ...prev, dmx_channel_count: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setFixtureDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() =>
                addFixtureMutation.mutate({
                  rig_id: lightingQuery.data!.rig.id,
                  inventory_item_id: toOptionalNumber(fixtureDraft.inventory_item_id),
                  custom_name: fixtureDraft.custom_name,
                  position_index: (fixtures.at(-1)?.position_index ?? 0) + 1,
                  power_connection: 'grid',
                  power_connector_in: 'schuko',
                  dmx_universe: 1,
                  dmx_channel_mode: fixtureDraft.dmx_channel_mode,
                  dmx_channel_count: fixtureDraft.dmx_channel_count,
                  notes: '',
                })
              }
              disabled={addFixtureMutation.isPending}
            >
              {addFixtureMutation.isPending ? 'Adding...' : 'Add fixture'}
            </Button>
          </div>
        </div>
      </Dialog>

      {toast && <div className="fixed bottom-6 right-6 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-xl">{toast}</div>}
    </div>
  )

  function updateInputDraft<K extends keyof AudioPatchInput>(index: number, key: K, value: AudioPatchInput[K]) {
    setInputs((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }

  function updateOutputDraft<K extends keyof AudioPatchOutput>(index: number, key: K, value: AudioPatchOutput[K]) {
    setOutputs((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }

  function updateFixtureDraft<K extends keyof LightingFixture>(index: number, key: K, value: LightingFixture[K]) {
    setFixtures((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }

  async function persistInput(row: AudioPatchInput) {
    await saveInputMutation.mutateAsync({ id: row.id, payload: sanitizeInput(row) })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  async function persistOutput(row: AudioPatchOutput) {
    await saveOutputMutation.mutateAsync({ id: row.id, payload: sanitizeOutput(row) })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  async function persistFixture(row: LightingFixture) {
    await saveFixtureMutation.mutateAsync({ id: row.id, payload: sanitizeFixture(row) })
  }
}

function sanitizeInput(row: AudioPatchInput): Omit<AudioPatchInput, 'id'> {
  return { ...row }
}

function sanitizeOutput(row: AudioPatchOutput): Omit<AudioPatchOutput, 'id'> {
  return { ...row }
}

function sanitizeFixture(row: LightingFixture): Omit<LightingFixture, 'id'> {
  return { ...row }
}

function getMicItemsForSignalType(
  signalType: AudioPatchInput['signal_type'],
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-zinc-100">{value}</div>
    </div>
  )
}

function formatDMXRange(start?: number, count?: number) {
  if (!start) return '—'
  const safeCount = count && count > 0 ? count : 1
  const end = start + safeCount - 1
  return safeCount > 1 ? `${start}–${end}` : `${start}`
}

function toOptionalNumber(value: string) {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
