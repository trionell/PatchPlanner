import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { listInventoryItems } from '../../api/inventory'
import {
  autoAssignDMX,
  createLightingFixture,
  createTrussSection,
  deleteLightingFixture,
  deleteTrussSection,
  getLightingRig,
  updateLightingFixture,
} from '../../api/lighting'
import { useDraftState } from '../../hooks/useDraftState'
import { powerConnectors, trussTypes } from '../../lib/constants'
import { formatDMXRange, toOptionalNumber } from '../../lib/utils'
import type { LightingFixture, TrussSection } from '../../types'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'

const emptyTrussDraft = { name: '', length_m: '', truss_type: 'box' as TrussSection['truss_type'] }
const emptyFixtureDraft = { inventory_item_id: '', custom_name: '', dmx_channel_mode: 'Basic', dmx_channel_count: 8 }

export function LightingTab({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient()
  const lightingQuery = useQuery({ queryKey: ['lighting-rig', eventId], queryFn: () => getLightingRig(eventId) })
  const lightingInventoryQuery = useQuery({ queryKey: ['inventory-lighting'], queryFn: () => listInventoryItems({ categoryType: 'lighting' }) })

  const [fixtures, setFixtures] = useDraftState(lightingQuery.data, (data) => data.fixtures, [] as LightingFixture[])
  const [fixtureDialogOpen, setFixtureDialogOpen] = useState(false)
  const [fixtureDraft, setFixtureDraft] = useState(emptyFixtureDraft)
  const [trussDraft, setTrussDraft] = useState(emptyTrussDraft)

  const rigId = lightingQuery.data?.rig.id
  const sections = lightingQuery.data?.sections ?? []

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  const addFixtureMutation = useMutation({
    mutationFn: (payload: Omit<LightingFixture, 'id'>) => createLightingFixture(eventId, rigId!, payload),
    onSuccess: async () => {
      setFixtureDialogOpen(false)
      setFixtureDraft(emptyFixtureDraft)
      await invalidate()
    },
  })
  const saveFixtureMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Omit<LightingFixture, 'id'> }) => updateLightingFixture(eventId, rigId!, id, payload),
    onSuccess: invalidate,
  })
  const deleteFixtureMutation = useMutation({
    mutationFn: (id: number) => deleteLightingFixture(eventId, rigId!, id),
    onSuccess: invalidate,
  })
  const autoAssignMutation = useMutation({
    mutationFn: () => autoAssignDMX(eventId, rigId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] }),
  })
  const addTrussMutation = useMutation({
    mutationFn: () => createTrussSection(eventId, rigId!, {
      rig_id: rigId!,
      name: trussDraft.name,
      length_m: Number(trussDraft.length_m) || 0,
      truss_type: trussDraft.truss_type,
    }),
    onSuccess: async () => {
      setTrussDraft(emptyTrussDraft)
      await queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] })
    },
  })
  const deleteTrussMutation = useMutation({
    mutationFn: (sectionId: number) => deleteTrussSection(eventId, rigId!, sectionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] }),
  })

  const lightingOptions = useMemo(
    () => (lightingInventoryQuery.data ?? []).map((item) => ({ label: item.name, value: item.id })),
    [lightingInventoryQuery.data],
  )

  function updateDraft<K extends keyof LightingFixture>(index: number, key: K, value: LightingFixture[K]) {
    setFixtures((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }

  async function persist(row: LightingFixture) {
    await saveFixtureMutation.mutateAsync({ id: row.id, payload: row })
  }

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Truss sections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="min-w-48">
              <label className="mb-1 block text-sm text-zinc-300">Name</label>
              <Input value={trussDraft.name} onChange={(e) => setTrussDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Front Truss" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Length (m)</label>
              <Input type="number" step="0.5" value={trussDraft.length_m} onChange={(e) => setTrussDraft((prev) => ({ ...prev, length_m: e.target.value }))} className="w-24" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Type</label>
              <Select value={trussDraft.truss_type} onChange={(e) => setTrussDraft((prev) => ({ ...prev, truss_type: e.target.value as TrussSection['truss_type'] }))}>
                {trussTypes.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
            </div>
            <Button size="sm" disabled={!trussDraft.name.trim() || !rigId || addTrussMutation.isPending} onClick={() => addTrussMutation.mutate()}>
              <Plus className="mr-2 h-4 w-4" />Add Section
            </Button>
          </div>
          {sections.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sections.map((section) => (
                <span key={section.id} className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200">
                  {section.name}
                  <span className="text-xs text-zinc-500">{section.truss_type}{section.length_m ? ` · ${section.length_m} m` : ''}</span>
                  <button className="text-zinc-500 hover:text-red-400" title="Delete section" onClick={() => deleteTrussMutation.mutate(section.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No truss sections yet — add one to assign fixtures to positions.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{lightingQuery.data?.rig.name ?? 'Lighting rig'}</CardTitle>
            <p className="mt-1 text-sm text-zinc-400">Manage fixtures, power chains, and DMX allocation.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => autoAssignMutation.mutate()} disabled={autoAssignMutation.isPending || !rigId}>
              <Sparkles className="mr-2 h-4 w-4" />Auto-assign DMX
            </Button>
            <Button size="sm" onClick={() => setFixtureDialogOpen(true)} disabled={!rigId}><Plus className="mr-2 h-4 w-4" />Add Fixture</Button>
          </div>
        </CardHeader>
        <CardContent>
          {autoAssignMutation.isError && (
            <div className="mb-4 rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {autoAssignMutation.error.message}
            </div>
          )}
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
                    <TableCell className="min-w-48"><div className="space-y-2"><div className="font-medium">{fixture.inventory_item_name || fixture.custom_name || 'Unnamed fixture'}</div><Input value={fixture.custom_name ?? ''} onChange={(e) => updateDraft(index, 'custom_name', e.target.value)} onBlur={() => persist(fixtures[index])} placeholder="Custom label" /></div></TableCell>
                    <TableCell>
                      <Select value={fixture.truss_section_id ?? ''} onChange={(e) => updateDraft(index, 'truss_section_id', toOptionalNumber(e.target.value))} onBlur={() => persist(fixtures[index])} className="min-w-32">
                        <option value="">—</option>
                        {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                      </Select>
                    </TableCell>
                    <TableCell><Input type="number" value={fixture.position_index} onChange={(e) => updateDraft(index, 'position_index', Number(e.target.value))} onBlur={() => persist(fixtures[index])} className="min-w-20" /></TableCell>
                    <TableCell><div className="flex items-center gap-2"><Select value={fixture.power_connection} onChange={(e) => updateDraft(index, 'power_connection', e.target.value as LightingFixture['power_connection'])} onBlur={() => persist(fixtures[index])} className="min-w-24"><option value="grid">grid</option><option value="chain">chain</option></Select>{fixture.power_connection === 'chain' && <Link2 className="h-4 w-4 text-amber-400" />}</div></TableCell>
                    <TableCell><Select value={fixture.power_connector_in} onChange={(e) => updateDraft(index, 'power_connector_in', e.target.value)} onBlur={() => persist(fixtures[index])} className="min-w-44">{powerConnectors.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></TableCell>
                    <TableCell><Input type="number" value={fixture.dmx_universe} onChange={(e) => updateDraft(index, 'dmx_universe', Number(e.target.value))} onBlur={() => persist(fixtures[index])} className="min-w-20" /></TableCell>
                    <TableCell className="min-w-24">{formatDMXRange(fixture.dmx_start_address, fixture.dmx_channel_count)}</TableCell>
                    <TableCell><Input value={fixture.dmx_channel_mode ?? ''} onChange={(e) => updateDraft(index, 'dmx_channel_mode', e.target.value)} onBlur={() => persist(fixtures[index])} className="min-w-24" /></TableCell>
                    <TableCell><Input type="number" value={fixture.dmx_channel_count} onChange={(e) => updateDraft(index, 'dmx_channel_count', Number(e.target.value))} onBlur={() => persist(fixtures[index])} className="min-w-20" /></TableCell>
                    <TableCell>{fixture.dmx_chain_parent_id ?? '—'}</TableCell>
                    <TableCell><Input value={fixture.notes ?? ''} onChange={(e) => updateDraft(index, 'notes', e.target.value)} onBlur={() => persist(fixtures[index])} className="min-w-36" /></TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => deleteFixtureMutation.mutate(fixture.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
                  rig_id: rigId!,
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
    </>
  )
}
