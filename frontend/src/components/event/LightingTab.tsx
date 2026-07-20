import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Link2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { listInventoryItems } from '../../api/inventory'
import {
  autoAssignDMX,
  bulkAddFixtures,
  createLightingFixture,
  deleteLightingFixture,
  getLightingRig,
  updateLightingFixture,
} from '../../api/lighting'
import { listFixtureModes } from '../../api/reference'
import { useDraftState } from '../../hooks/useDraftState'
import { useReferenceData } from '../../hooks/useReferenceData'
import { duplicateFixtureNumbers, nextFixtureNumber } from '../../lib/lightingRig'
import { cn, formatDMXRange, toOptionalNumber } from '../../lib/utils'
import type { BulkFixtureRequest, FixtureMode, LightingFixture } from '../../types'
import { LightingRigSheet } from '../print/LightingRigSheet'
import { PrintButton } from '../print/PrintButton'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'

const emptyFixtureDraft = { inventory_item_id: '', custom_name: '', dmx_channel_mode: 'Basic', dmx_channel_count: 8 }
const emptyBulkDraft = {
  inventory_item_id: '',
  quantity: 8,
  fixture_number_start: '',
  dmx_channel_mode: 'Basic',
  dmx_channel_count: 8,
  dmx_universe: 1,
  power_connection: 'grid' as BulkFixtureRequest['power_connection'],
  power_connector_in: 'schuko',
}

export function LightingTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const lightingQuery = useQuery({ queryKey: ['lighting-rig', eventId], queryFn: () => getLightingRig(eventId) })
  const lightingInventoryQuery = useQuery({ queryKey: ['inventory-lighting'], queryFn: () => listInventoryItems({ categoryType: 'lighting' }) })
  const { options } = useReferenceData()

  const [fixtures, setFixtures] = useDraftState(lightingQuery.data, (data) => data.fixtures, [] as LightingFixture[])
  const [fixtureDialogOpen, setFixtureDialogOpen] = useState(false)
  const [fixtureDraft, setFixtureDraft] = useState(emptyFixtureDraft)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkDraft, setBulkDraft] = useState(emptyBulkDraft)

  const rigId = lightingQuery.data?.rig.id

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
  const bulkAddMutation = useMutation({
    mutationFn: (payload: BulkFixtureRequest) => bulkAddFixtures(eventId, rigId!, payload),
    onSuccess: async () => {
      setBulkDialogOpen(false)
      setBulkDraft(emptyBulkDraft)
      await invalidate()
    },
  })
  const lightingOptions = useMemo(
    () => (lightingInventoryQuery.data ?? []).map((item) => ({ label: item.name, value: item.id })),
    [lightingInventoryQuery.data],
  )

  // Console fixture IDs used more than once — flagged, never blocking.
  const duplicateNumbers = useMemo(() => duplicateFixtureNumbers(fixtures), [fixtures])

  // Catalog modes for the model currently picked in the Add Fixture dialog
  // (same cache key the table's mode cell uses).
  const draftItemId = toOptionalNumber(fixtureDraft.inventory_item_id)
  const draftModesQuery = useQuery({
    queryKey: ['fixture-modes', draftItemId],
    queryFn: () => listFixtureModes(draftItemId!),
    enabled: fixtureDialogOpen && draftItemId !== undefined,
  })
  const draftModes = fixtureDialogOpen && draftItemId !== undefined ? draftModesQuery.data ?? [] : []

  // Same source for the bulk dialog's model.
  const bulkItemId = toOptionalNumber(bulkDraft.inventory_item_id)
  const bulkModesQuery = useQuery({
    queryKey: ['fixture-modes', bulkItemId],
    queryFn: () => listFixtureModes(bulkItemId!),
    enabled: bulkDialogOpen && bulkItemId !== undefined,
  })
  const bulkModes = bulkDialogOpen && bulkItemId !== undefined ? bulkModesQuery.data ?? [] : []

  function updateDraft<K extends keyof LightingFixture>(index: number, key: K, value: LightingFixture[K]) {
    setFixtures((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }

  async function persist(row: LightingFixture) {
    await saveFixtureMutation.mutateAsync({ id: row.id, payload: row })
  }

  return (
    <>
      <div className="print:hidden">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>{lightingQuery.data?.rig.name ?? 'Lighting rig'}</CardTitle>
              <p className="mt-1 text-sm text-zinc-400">Manage fixtures, power chains, and DMX allocation.</p>
            </div>
            <div className="flex gap-2">
              <PrintButton />
              {!readOnly && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => autoAssignMutation.mutate()} disabled={autoAssignMutation.isPending || !rigId}>
                    <Sparkles className="mr-2 h-4 w-4" />Auto-assign DMX
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setBulkDraft({ ...emptyBulkDraft, fixture_number_start: String(nextFixtureNumber(fixtures)) })
                      setBulkDialogOpen(true)
                    }}
                    disabled={!rigId}
                  >
                    <Copy className="mr-2 h-4 w-4" />Bulk Add
                  </Button>
                  <Button size="sm" onClick={() => setFixtureDialogOpen(true)} disabled={!rigId}><Plus className="mr-2 h-4 w-4" />Add Fixture</Button>
                </>
              )}
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
                    {['#','FID','Fixture Name','Truss','Position','Power','Power Connector','DMX Univ','DMX Addr','Mode','Channels','DMX Chain','Notes',''].map((label) => <TableHead key={label}>{label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fixtures.map((fixture, index) => (
                    <TableRow key={fixture.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={fixture.fixture_number ?? ''}
                          onChange={(e) => updateDraft(index, 'fixture_number', toOptionalNumber(e.target.value))}
                          onBlur={() => persist(fixtures[index])}
                          disabled={readOnly}
                          title={fixture.fixture_number != null && duplicateNumbers.has(fixture.fixture_number) ? 'Duplicate fixture ID — the console needs unique numbers' : 'Console (GrandMA) fixture ID'}
                          className={cn('min-w-20', fixture.fixture_number != null && duplicateNumbers.has(fixture.fixture_number) && 'border-amber-500 text-amber-300')}
                        />
                      </TableCell>
                      <TableCell className="min-w-48"><div className="space-y-2"><div className="font-medium">{fixture.inventory_item_name || fixture.custom_name || 'Unnamed fixture'}</div><Input value={fixture.custom_name ?? ''} onChange={(e) => updateDraft(index, 'custom_name', e.target.value)} onBlur={() => persist(fixtures[index])} disabled={readOnly} placeholder="Custom label" /></div></TableCell>
                      <TableCell className="min-w-32 whitespace-nowrap text-zinc-300" title="Assigned by placing the fixture on a truss in the Stage Plots tab">
                        {fixture.truss_name ? (
                          <>
                            {fixture.truss_name}
                            {fixture.truss_offset_cm != null && <span className="text-zinc-500"> · {fixture.truss_offset_cm} cm</span>}
                          </>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </TableCell>
                      <TableCell><Input type="number" value={fixture.position_index} onChange={(e) => updateDraft(index, 'position_index', Number(e.target.value))} onBlur={() => persist(fixtures[index])} disabled={readOnly} className="min-w-20" /></TableCell>
                      <TableCell><div className="flex items-center gap-2"><Select value={fixture.power_connection} onChange={(e) => updateDraft(index, 'power_connection', e.target.value as LightingFixture['power_connection'])} onBlur={() => persist(fixtures[index])} disabled={readOnly} className="min-w-24"><option value="grid">grid</option><option value="chain">chain</option></Select>{fixture.power_connection === 'chain' && <Link2 className="h-4 w-4 text-amber-400" />}</div></TableCell>
                      <TableCell><Select value={fixture.power_connector_in} onChange={(e) => updateDraft(index, 'power_connector_in', e.target.value)} onBlur={() => persist(fixtures[index])} disabled={readOnly} className="min-w-44">{options('power_connectors', fixture.power_connector_in).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></TableCell>
                      <TableCell><Input type="number" value={fixture.dmx_universe} onChange={(e) => updateDraft(index, 'dmx_universe', Number(e.target.value))} onBlur={() => persist(fixtures[index])} disabled={readOnly} className="min-w-20" /></TableCell>
                      <TableCell className="min-w-24">{formatDMXRange(fixture.dmx_start_address, fixture.dmx_channel_count)}</TableCell>
                      <TableCell>
                        <FixtureModeCell
                          fixture={fixture}
                          onApply={(mode) => {
                            updateDraft(index, 'dmx_channel_mode', mode.name)
                            updateDraft(index, 'dmx_channel_count', mode.channel_count)
                            void persist({ ...fixtures[index], dmx_channel_mode: mode.name, dmx_channel_count: mode.channel_count })
                          }}
                          onModeText={(value) => updateDraft(index, 'dmx_channel_mode', value)}
                          onPersist={() => persist(fixtures[index])}
                          readOnly={readOnly}
                        />
                      </TableCell>
                      <TableCell><Input type="number" value={fixture.dmx_channel_count} onChange={(e) => updateDraft(index, 'dmx_channel_count', Number(e.target.value))} onBlur={() => persist(fixtures[index])} disabled={readOnly} className="min-w-20" /></TableCell>
                      <TableCell>{fixture.dmx_chain_parent_id ?? '—'}</TableCell>
                      <TableCell><Input value={fixture.notes ?? ''} onChange={(e) => updateDraft(index, 'notes', e.target.value)} onBlur={() => persist(fixtures[index])} disabled={readOnly} className="min-w-36" /></TableCell>
                      <TableCell>{!readOnly && <Button size="sm" variant="ghost" onClick={() => deleteFixtureMutation.mutate(fixture.id)}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
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
              <Select
                value={fixtureDraft.inventory_item_id}
                onChange={(e) =>
                  // Switching models resets the mode fields so a pick from the
                  // previous model never leaks onto the new one.
                  setFixtureDraft((prev) => ({
                    ...prev,
                    inventory_item_id: e.target.value,
                    dmx_channel_mode: emptyFixtureDraft.dmx_channel_mode,
                    dmx_channel_count: emptyFixtureDraft.dmx_channel_count,
                  }))
                }
              >
                <option value="">Custom / none</option>
                {lightingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Custom name</label>
              <Input value={fixtureDraft.custom_name} onChange={(e) => setFixtureDraft((prev) => ({ ...prev, custom_name: e.target.value }))} />
            </div>
            {draftModes.length > 0 && (
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Defined modes</label>
                <Select
                  value={draftModes.find((m) => m.name === fixtureDraft.dmx_channel_mode && m.channel_count === fixtureDraft.dmx_channel_count)?.id ?? ''}
                  onChange={(e) => {
                    const mode = draftModes.find((m) => m.id === Number(e.target.value))
                    if (mode) setFixtureDraft((prev) => ({ ...prev, dmx_channel_mode: mode.name, dmx_channel_count: mode.channel_count }))
                  }}
                >
                  <option value="">Pick a mode…</option>
                  {draftModes.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.channel_count} ch)</option>)}
                </Select>
              </div>
            )}
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

        <Dialog open={bulkDialogOpen} onClose={() => setBulkDialogOpen(false)} title="Bulk add fixtures">
          <div className="space-y-4">
            {bulkAddMutation.isError && (
              <div className="rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
                {bulkAddMutation.error.message}
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Inventory fixture</label>
              <Select
                value={bulkDraft.inventory_item_id}
                onChange={(e) =>
                  setBulkDraft((prev) => ({
                    ...prev,
                    inventory_item_id: e.target.value,
                    dmx_channel_mode: emptyBulkDraft.dmx_channel_mode,
                    dmx_channel_count: emptyBulkDraft.dmx_channel_count,
                  }))
                }
              >
                <option value="">Pick a model…</option>
                {lightingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Quantity (1–100)</label>
                <Input type="number" min={1} max={100} value={bulkDraft.quantity} onChange={(e) => setBulkDraft((prev) => ({ ...prev, quantity: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Start fixture ID</label>
                <Input type="number" min={1} value={bulkDraft.fixture_number_start} onChange={(e) => setBulkDraft((prev) => ({ ...prev, fixture_number_start: e.target.value }))} placeholder="no IDs" />
              </div>
            </div>
            {bulkModes.length > 0 && (
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Defined modes</label>
                <Select
                  value={bulkModes.find((m) => m.name === bulkDraft.dmx_channel_mode && m.channel_count === bulkDraft.dmx_channel_count)?.id ?? ''}
                  onChange={(e) => {
                    const mode = bulkModes.find((m) => m.id === Number(e.target.value))
                    if (mode) setBulkDraft((prev) => ({ ...prev, dmx_channel_mode: mode.name, dmx_channel_count: mode.channel_count }))
                  }}
                >
                  <option value="">Pick a mode…</option>
                  {bulkModes.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.channel_count} ch)</option>)}
                </Select>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Mode</label>
                <Input value={bulkDraft.dmx_channel_mode} onChange={(e) => setBulkDraft((prev) => ({ ...prev, dmx_channel_mode: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Channels</label>
                <Input type="number" min={1} value={bulkDraft.dmx_channel_count} onChange={(e) => setBulkDraft((prev) => ({ ...prev, dmx_channel_count: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-zinc-300">DMX universe</label>
                <Input type="number" min={1} value={bulkDraft.dmx_universe} onChange={(e) => setBulkDraft((prev) => ({ ...prev, dmx_universe: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Power</label>
                <Select value={bulkDraft.power_connection} onChange={(e) => setBulkDraft((prev) => ({ ...prev, power_connection: e.target.value as BulkFixtureRequest['power_connection'] }))}>
                  <option value="grid">grid</option>
                  <option value="chain">chain</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Power connector</label>
                <Select value={bulkDraft.power_connector_in} onChange={(e) => setBulkDraft((prev) => ({ ...prev, power_connector_in: e.target.value }))}>
                  {options('power_connectors', bulkDraft.power_connector_in).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() =>
                  bulkAddMutation.mutate({
                    inventory_item_id: bulkItemId!,
                    quantity: bulkDraft.quantity,
                    fixture_number_start: toOptionalNumber(bulkDraft.fixture_number_start),
                    dmx_channel_mode: bulkDraft.dmx_channel_mode,
                    dmx_channel_count: bulkDraft.dmx_channel_count,
                    dmx_universe: bulkDraft.dmx_universe,
                    power_connection: bulkDraft.power_connection,
                    power_connector_in: bulkDraft.power_connector_in,
                  })
                }
                disabled={bulkItemId === undefined || bulkAddMutation.isPending}
              >
                {bulkAddMutation.isPending ? 'Adding…' : `Add ${bulkDraft.quantity || 0} fixtures`}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
      <LightingRigSheet eventId={eventId} fixtures={fixtures} />
    </>
  )
}

/**
 * Mode cell: when the fixture's catalog model has defined DMX modes, offer
 * them in a picker that copies name + channel count onto the fixture
 * (copy-on-pick — later mode edits never rewrite the rig). Manual mode text
 * stays available either way.
 */
function FixtureModeCell({
  fixture,
  onApply,
  onModeText,
  onPersist,
  readOnly = false,
}: {
  fixture: LightingFixture
  onApply: (mode: FixtureMode) => void
  onModeText: (value: string) => void
  onPersist: () => void
  readOnly?: boolean
}) {
  const itemId = fixture.inventory_item_id
  const modesQuery = useQuery({
    queryKey: ['fixture-modes', itemId],
    queryFn: () => listFixtureModes(itemId!),
    enabled: !!itemId,
  })
  const modes = modesQuery.data ?? []
  const selected = modes.find((m) => m.name === fixture.dmx_channel_mode && m.channel_count === fixture.dmx_channel_count)

  return (
    <div className="min-w-32 space-y-1">
      {modes.length > 0 && (
        <Select
          value={selected?.id ?? ''}
          disabled={readOnly}
          onChange={(e) => {
            const mode = modes.find((m) => m.id === Number(e.target.value))
            if (mode) onApply(mode)
          }}
        >
          <option value="">custom…</option>
          {modes.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.channel_count} ch)</option>)}
        </Select>
      )}
      <Input value={fixture.dmx_channel_mode ?? ''} onChange={(e) => onModeText(e.target.value)} onBlur={onPersist} disabled={readOnly} className="min-w-24" />
    </div>
  )
}
