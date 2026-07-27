import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Plus, Search, Sparkles } from 'lucide-react'
import { getEvent } from '../../api/events'
import { listEventInventoryItems } from '../../api/inventory'
import { listFixtureModes } from '../../api/inventories'
import { bulkAddFixtures, createLightingFixture, getLightingRig, updateFixtureAddresses } from '../../api/lighting'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useReferenceData } from '../../hooks/useReferenceData'
import { dmxMap } from '../../lib/dmxMap'
import { planAutoAssign } from '../../lib/dmxPlan'
import { nextFixtureNumber } from '../../lib/lightingRig'
import { formatDMXRange, toOptionalNumber } from '../../lib/utils'
import type { AddressChange, BulkFixtureRequest, LightingFixture } from '../../types'
import { MobileEntityList } from '../mobile/MobileEntityList'
import { MobileFixtureEditSheet } from '../mobile/MobileFixtureEditSheet'
import { LightingRigSheet } from '../print/LightingRigSheet'
import { PrintButton } from '../print/PrintButton'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { FieldLabel } from '../ui/Label'
import { PatchPanel } from '../ui/PatchPanel'
import { Select } from '../ui/Select'
import { LightingSheet } from './LightingSheet'

/**
 * The Lighting tab (Slice 27 US1).
 *
 * The last surface in the application that was a form pretending to be a list:
 * thirteen columns, twenty-four live controls, no read state, and a rig of forty
 * fixtures showing seven of them. It is now the work panel the audio tabs and
 * Stage Plots already use — a bar, and a sheet that is read until a row is
 * clicked.
 *
 * The tab owns the queries, the DMX map derived from them, and the gestures that
 * rewrite addresses. The sheet owns rows and their editor, which is the split
 * `AudioInputsTab` and `InputSheet` already use.
 */

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
  const eventQuery = useQuery({ queryKey: ['event', eventId], queryFn: () => getEvent(eventId) })
  const inventoryId = eventQuery.data?.inventoryId
  const lightingInventoryQuery = useQuery({
    queryKey: ['inventory-lighting', eventId],
    queryFn: () => listEventInventoryItems(eventId, { categoryType: 'lighting' }),
  })
  const { options } = useReferenceData(eventId)

  const isMobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [editingFixtureId, setEditingFixtureId] = useState<number | 'new' | null>(null)
  const [fixtureDialogOpen, setFixtureDialogOpen] = useState(false)
  const [fixtureDraft, setFixtureDraft] = useState(emptyFixtureDraft)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkDraft, setBulkDraft] = useState(emptyBulkDraft)

  const rigId = lightingQuery.data?.rig.id
  const fixtures = useMemo(() => lightingQuery.data?.fixtures ?? [], [lightingQuery.data])

  /** One derivation per fixture-list change, read by the sheet and every gesture. */
  const map = useMemo(() => dmxMap(fixtures), [fixtures])

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['lighting-rig', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }

  const applyAddresses = useMutation({
    mutationFn: (changes: AddressChange[]) => updateFixtureAddresses(eventId, rigId!, changes),
    onSuccess: invalidate,
  })
  const addFixtureMutation = useMutation({
    mutationFn: (payload: Omit<LightingFixture, 'id'>) => createLightingFixture(eventId, rigId!, payload),
    onSuccess: async () => {
      setFixtureDialogOpen(false)
      setFixtureDraft(emptyFixtureDraft)
      await invalidate()
    },
  })
  const bulkAddMutation = useMutation({
    mutationFn: (payload: BulkFixtureRequest) => bulkAddFixtures(eventId, rigId!, payload),
    onSuccess: async () => {
      setBulkDialogOpen(false)
      setBulkDraft(emptyBulkDraft)
      await invalidate()
    },
  })

  const modelOptions = useMemo(
    () => (lightingInventoryQuery.data ?? []).map((item) => ({ label: item.name, value: item.id })),
    [lightingInventoryQuery.data],
  )

  // Catalog modes for the model picked in each dialog — same cache key the row
  // editor's mode field uses, so opening a row after adding one costs nothing.
  const draftItemId = toOptionalNumber(fixtureDraft.inventory_item_id)
  const draftModesQuery = useQuery({
    queryKey: ['fixture-modes', draftItemId],
    queryFn: () => listFixtureModes(inventoryId!, draftItemId!),
    enabled: fixtureDialogOpen && draftItemId !== undefined && inventoryId !== undefined,
  })
  const draftModes = fixtureDialogOpen && draftItemId !== undefined ? (draftModesQuery.data ?? []) : []

  const bulkItemId = toOptionalNumber(bulkDraft.inventory_item_id)
  const bulkModesQuery = useQuery({
    queryKey: ['fixture-modes', bulkItemId],
    queryFn: () => listFixtureModes(inventoryId!, bulkItemId!),
    enabled: bulkDialogOpen && bulkItemId !== undefined && inventoryId !== undefined,
  })
  const bulkModes = bulkDialogOpen && bulkItemId !== undefined ? (bulkModesQuery.data ?? []) : []

  /**
   * Renumber every universe from address 1 in rig order, moving **groups**
   * rather than fixtures (US4): what shared before still shares, and nothing
   * leaves the universe it is in.
   *
   * The packing is `lib/dmxPlan`; this only confirms and applies. It confirms
   * because one press can move thirty fixtures and cannot be undone.
   */
  function runAutoAssign() {
    const plan = planAutoAssign(fixtures)
    if (plan.changes.length === 0 && plan.skippedUniverses.length === 0) {
      window.alert('Every fixture is already packed from address 1 in rig order.')
      return
    }
    const skipped = plan.skippedUniverses.length
      ? `\n\nUniverse ${plan.skippedUniverses.join(', ')} needs more than 512 channels, and will be left exactly as it is.`
      : ''
    if (!window.confirm(`Re-address ${plan.movedFixtureCount} fixtures from 1 in rig order?${skipped}`)) return
    applyAddresses.mutate(plan.changes)
  }

  if (isMobile) {
    const items = fixtures.map((fixture) => ({
      id: fixture.id,
      number: fixture.fixture_number ?? `#${fixture.id}`,
      name: fixture.inventory_item_name || fixture.custom_name || 'Unnamed fixture',
      subtitle: `Univ ${fixture.dmx_universe} · Addr ${formatDMXRange(fixture.dmx_start_address, fixture.dmx_channel_count)} · ${fixture.dmx_channel_mode ?? 'Basic'}`,
    }))
    const editingFixture = typeof editingFixtureId === 'number' ? fixtures.find((f) => f.id === editingFixtureId) : undefined
    return (
      <div className="print:hidden">
        <MobileEntityList
          items={items}
          onSelect={setEditingFixtureId}
          onAdd={() => rigId != null && setEditingFixtureId('new')}
          readOnly={readOnly}
          searchPlaceholder="Find a fixture…"
          addLabel="Add fixture"
          emptyLabel="No fixtures yet."
        />
        {editingFixtureId != null && rigId != null && (
          <MobileFixtureEditSheet
            eventId={eventId}
            rigId={rigId}
            inventoryId={inventoryId}
            fixture={editingFixture}
            fixtures={fixtures}
            onClose={() => setEditingFixtureId(null)}
            onSaved={invalidate}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <div className="print:hidden">
        <PatchPanel
          bar={
            <>
              <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">Lighting</span>

              <div className="relative min-w-[10rem] max-w-xs flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <Input
                  size="sm"
                  className="pl-7"
                  placeholder="Find a fixture…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <span className="flex-1" />

              {/* Auto-assign is here until US6 gives it a drawer to live in,
                  beside the universes it acts on. */}
              {!readOnly && (
                <Button size="xs" variant="outline" onClick={runAutoAssign} disabled={applyAddresses.isPending || !rigId}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Auto-assign DMX
                </Button>
              )}
              <PrintButton />
              {!readOnly && (
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setBulkDraft({ ...emptyBulkDraft, fixture_number_start: String(nextFixtureNumber(fixtures)) })
                      setBulkDialogOpen(true)
                    }}
                    disabled={!rigId}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Bulk add
                  </Button>
                  <Button size="xs" onClick={() => setFixtureDialogOpen(true)} disabled={!rigId}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Fixture
                  </Button>
                </>
              )}
            </>
          }
        >
          {applyAddresses.error && (
            <p className="border-b border-zinc-800 px-3 py-2 text-xs text-red-400">{applyAddresses.error.message}</p>
          )}
          <LightingSheet
            eventId={eventId}
            rigId={rigId}
            inventoryId={inventoryId}
            fixtures={fixtures}
            map={map}
            modelOptions={modelOptions}
            search={search}
            readOnly={readOnly}
          />
        </PatchPanel>

        <Dialog open={fixtureDialogOpen} onClose={() => setFixtureDialogOpen(false)} title="Add fixture">
          <div className="space-y-4">
            <div>
              <FieldLabel>Inventory fixture</FieldLabel>
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
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel>Custom name</FieldLabel>
              <Input value={fixtureDraft.custom_name} onChange={(e) => setFixtureDraft((prev) => ({ ...prev, custom_name: e.target.value }))} />
            </div>
            {draftModes.length > 0 && (
              <div>
                <FieldLabel>Defined modes</FieldLabel>
                <Select
                  value={
                    draftModes.find((m) => m.name === fixtureDraft.dmx_channel_mode && m.channel_count === fixtureDraft.dmx_channel_count)?.id ?? ''
                  }
                  onChange={(e) => {
                    const mode = draftModes.find((m) => m.id === Number(e.target.value))
                    if (mode) setFixtureDraft((prev) => ({ ...prev, dmx_channel_mode: mode.name, dmx_channel_count: mode.channel_count }))
                  }}
                >
                  <option value="">Pick a mode…</option>
                  {draftModes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.channel_count} ch)
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>Mode</FieldLabel>
                <Input value={fixtureDraft.dmx_channel_mode} onChange={(e) => setFixtureDraft((prev) => ({ ...prev, dmx_channel_mode: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Channels</FieldLabel>
                <Input
                  type="number"
                  value={fixtureDraft.dmx_channel_count}
                  onChange={(e) => setFixtureDraft((prev) => ({ ...prev, dmx_channel_count: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setFixtureDialogOpen(false)}>
                Cancel
              </Button>
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
              <div className="rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">{bulkAddMutation.error.message}</div>
            )}
            <div>
              <FieldLabel>Inventory fixture</FieldLabel>
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
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>Quantity (1–100)</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={bulkDraft.quantity}
                  onChange={(e) => setBulkDraft((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                />
              </div>
              <div>
                <FieldLabel>Start fixture ID</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={bulkDraft.fixture_number_start}
                  onChange={(e) => setBulkDraft((prev) => ({ ...prev, fixture_number_start: e.target.value }))}
                  placeholder="no IDs"
                />
              </div>
            </div>
            {bulkModes.length > 0 && (
              <div>
                <FieldLabel>Defined modes</FieldLabel>
                <Select
                  value={bulkModes.find((m) => m.name === bulkDraft.dmx_channel_mode && m.channel_count === bulkDraft.dmx_channel_count)?.id ?? ''}
                  onChange={(e) => {
                    const mode = bulkModes.find((m) => m.id === Number(e.target.value))
                    if (mode) setBulkDraft((prev) => ({ ...prev, dmx_channel_mode: mode.name, dmx_channel_count: mode.channel_count }))
                  }}
                >
                  <option value="">Pick a mode…</option>
                  {bulkModes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.channel_count} ch)
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>Mode</FieldLabel>
                <Input value={bulkDraft.dmx_channel_mode} onChange={(e) => setBulkDraft((prev) => ({ ...prev, dmx_channel_mode: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Channels</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={bulkDraft.dmx_channel_count}
                  onChange={(e) => setBulkDraft((prev) => ({ ...prev, dmx_channel_count: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>DMX universe</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={bulkDraft.dmx_universe}
                  onChange={(e) => setBulkDraft((prev) => ({ ...prev, dmx_universe: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>Power</FieldLabel>
                <Select
                  value={bulkDraft.power_connection}
                  onChange={(e) => setBulkDraft((prev) => ({ ...prev, power_connection: e.target.value as BulkFixtureRequest['power_connection'] }))}
                >
                  <option value="grid">grid</option>
                  <option value="chain">chain</option>
                </Select>
              </div>
              <div>
                <FieldLabel>Power connector</FieldLabel>
                <Select value={bulkDraft.power_connector_in} onChange={(e) => setBulkDraft((prev) => ({ ...prev, power_connector_in: e.target.value }))}>
                  {options('power_connectors', bulkDraft.power_connector_in).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setBulkDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  bulkAddMutation.mutate({
                    inventory_item_id: bulkItemId,
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
