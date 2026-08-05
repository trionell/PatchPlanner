import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers, Plus, Printer, Search } from 'lucide-react'
import { getEvent } from '../../api/events'
import { listEventInventoryItems } from '../../api/inventory'
import { getLightingRig, updateFixtureAddresses } from '../../api/lighting'
import { useEventTab } from '../../hooks/useEventTab'
import { useIsMobile } from '../../hooks/useIsMobile'
import { UNIVERSE_SIZE, dmxMap } from '../../lib/dmxMap'
import { type Plan, planAutoAssign, planOptimise } from '../../lib/dmxPlan'
import { formatDMXRange } from '../../lib/utils'
import type { AddressChange } from '../../types'
import { MobileEntityList } from '../mobile/MobileEntityList'
import { MobileFixtureEditSheet } from '../mobile/MobileFixtureEditSheet'
import { type LightingFilter, LightingStatusRail } from './LightingStatusRail'
import { LightingRigSheet } from '../print/LightingRigSheet'
import { PrintButton } from '../print/PrintButton'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Input } from '../ui/Input'
import { PatchPanel } from '../ui/PatchPanel'
import { LightingSheet } from './LightingSheet'
import { UniversesDrawer } from './UniversesDrawer'

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


export function LightingTab({ eventId, readOnly = false }: { eventId: number; readOnly?: boolean }) {
  const queryClient = useQueryClient()
  const lightingQuery = useQuery({ queryKey: ['lighting-rig', eventId], queryFn: () => getLightingRig(eventId) })
  const eventQuery = useQuery({ queryKey: ['event', eventId], queryFn: () => getEvent(eventId) })
  const inventoryId = eventQuery.data?.inventoryId
  const lightingInventoryQuery = useQuery({
    queryKey: ['inventory-lighting', eventId],
    queryFn: () => listEventInventoryItems(eventId, { categoryType: 'lighting' }),
  })
  const isMobile = useIsMobile()
  const { openTab } = useEventTab()
  const [search, setSearch] = useState('')
  const [editingFixtureId, setEditingFixtureId] = useState<number | 'new' | null>(null)
  const [adding, setAdding] = useState(false)
  const [universesOpen, setUniversesOpen] = useState(false)
  const [pendingPlan, setPendingPlan] = useState<{ plan: Plan; verb: string; confirmLabel: string } | null>(null)
  // The phone's strip filter — the desktop's lives in `LightingSheet` (data-model.md §3).
  const [mobileFilter, setMobileFilter] = useState<LightingFilter>(null)

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

  const modelOptions = useMemo(
    () => (lightingInventoryQuery.data ?? []).map((item) => ({ label: item.name, value: item.id })),
    [lightingInventoryQuery.data],
  )


  /**
   * The two bulk operations (US4). Both move **groups** rather than fixtures —
   * what shared before still shares, what did not still does not, and nothing
   * leaves the universe it is in — and both leave an over-full universe exactly
   * as it was rather than failing the whole rig.
   *
   * The packing is `lib/dmxPlan`; this confirms and applies. It confirms because
   * one press can move thirty fixtures and none of it can be undone (FR-041).
   */
  function run(plan: Plan, verb: string, confirmLabel: string, nothingToDo: string) {
    if (plan.changes.length === 0 && plan.skippedUniverses.length === 0) {
      window.alert(nothingToDo)
      return
    }
    setPendingPlan({ plan, verb, confirmLabel })
  }

  function apply(plan: Plan) {
    applyAddresses.mutate(plan.changes, {
      onSuccess: () => {
        if (plan.skippedUniverses.length) {
          window.alert(`Done. Universe ${plan.skippedUniverses.join(', ')} was left untouched — it needs more than ${UNIVERSE_SIZE} channels.`)
        }
      },
    })
  }

  /*
    Rendered in both branches below, which is why it is built once here.

    The pending state is the **plan**, not a flag: the fixture list under it can
    change while the confirm is open, and a plan re-derived on confirm would move a
    different set than the sentence counted. This is the same rule the row deletes
    follow — the record, never a boolean (ROADMAP D6).
  */
  const confirmPlan = (
    <ConfirmDialog
      open={pendingPlan != null}
      title="Re-address fixtures"
      confirmLabel={pendingPlan?.confirmLabel ?? 'Apply'}
      onCancel={() => setPendingPlan(null)}
      onConfirm={() => {
        if (pendingPlan) apply(pendingPlan.plan)
        setPendingPlan(null)
      }}
    >
      {pendingPlan && (
        <>
          {pendingPlan.verb}{' '}
          <span className="text-zinc-200">
            {pendingPlan.plan.movedFixtureCount} {pendingPlan.plan.movedFixtureCount === 1 ? 'fixture' : 'fixtures'}
          </span>
          . This cannot be undone.
          {pendingPlan.plan.skippedUniverses.length > 0 && (
            <span className="mt-2 block">
              Universe {pendingPlan.plan.skippedUniverses.join(', ')} needs more than {UNIVERSE_SIZE} channels, and will be left
              exactly as it is.
            </span>
          )}
        </>
      )}
    </ConfirmDialog>
  )

  if (isMobile) {
    /* The strip reports either errors or unaddressed fixtures, and the filter shows
       exactly the ones it named — the same sets `LightingStatusRail` counts. */
    const reported = new Set(
      mobileFilter === 'errors'
        ? map.problems.flatMap((problem) =>
            problem.kind === 'out-of-bounds' ? problem.group.fixtureIds : [...problem.a.fixtureIds, ...problem.b.fixtureIds],
          )
        : mobileFilter === 'unaddressed'
          ? map.unaddressed
          : [],
    )
    const items = fixtures
      .filter((fixture) => mobileFilter == null || reported.has(fixture.id))
      .map((fixture) => ({
        id: fixture.id,
        number: fixture.fixture_number ?? `#${fixture.id}`,
        name: fixture.inventory_item_name || fixture.custom_name || 'Unnamed fixture',
        subtitle: `Univ ${fixture.dmx_universe} · Addr ${formatDMXRange(fixture.dmx_start_address, fixture.dmx_channel_count)} · ${fixture.dmx_channel_mode ?? 'Basic'}`,
      }))
    const editingFixture = typeof editingFixtureId === 'number' ? fixtures.find((f) => f.id === editingFixtureId) : undefined
    return (
      <>
      {/* A column, because it is a flex item of the shell's column and the panel
          inside it fills what this gives it (Wave 6c). */}
      <div className="flex min-h-0 flex-1 flex-col print:hidden">
        <MobileEntityList
          title="Lighting"
          /* Universes, in the hand (audit.md M5), and the sheet the phone could not
             print (M11). `UniversesDrawer` is `ui/Drawer`, so it needed no edit. */
          overflow={[
            ...(readOnly
              ? []
              : [
                  {
                    label: 'Universes',
                    hint: String(map.universes.length),
                    icon: <Layers className="h-4 w-4" />,
                    onClick: () => setUniversesOpen(true),
                  },
                ]),
            { label: 'Print rig sheet', icon: <Printer className="h-4 w-4" />, onClick: () => window.print() },
          ]}
          strip={
            <LightingStatusRail
              map={map}
              fixtures={fixtures}
              filter={mobileFilter}
              onFilterChange={readOnly ? undefined : setMobileFilter}
            />
          }
          items={items}
          filtered={mobileFilter != null}
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
            readOnly={readOnly}
            rigId={rigId}
            inventoryId={inventoryId}
            fixture={editingFixture}
            fixtures={fixtures}
            onClose={() => setEditingFixtureId(null)}
            onSaved={invalidate}
          />
        )}

        <UniversesDrawer
          busy={applyAddresses.isPending}
          fixtures={fixtures}
          map={map}
          onAutoAssign={
            readOnly
              ? undefined
              : () =>
                  run(
                    planAutoAssign(fixtures),
                    'Re-address',
                    'Re-address',
                    'Every fixture is already packed from address 1 in rig order.',
                  )
          }
          onClose={() => setUniversesOpen(false)}
          onOptimise={
            readOnly ? undefined : () => run(planOptimise(fixtures), 'Close the gaps around', 'Close the gaps', 'There are no gaps to close.')
          }
          open={universesOpen}
        />
      </div>

      {/* A sibling of the wrapper, not inside it — the desktop return's shape (M11). */}
      <LightingRigSheet eventId={eventId} fixtures={fixtures} />
      {confirmPlan}
      </>
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

              <Button size="xs" variant="outline" onClick={() => setUniversesOpen(true)}>
                Universes
              </Button>

              <span className="flex-1" />

              <PrintButton />
              {!readOnly && (
                <Button size="xs" onClick={() => setAdding(true)} disabled={!rigId}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Fixtures
                </Button>
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
            adding={adding}
            onAddingChange={setAdding}
            applyAddresses={applyAddresses.mutateAsync}
            onOpenPlot={() => openTab('stage-plots')}
            readOnly={readOnly}
          />
        </PatchPanel>

        <UniversesDrawer
          open={universesOpen}
          onClose={() => setUniversesOpen(false)}
          map={map}
          fixtures={fixtures}
          busy={applyAddresses.isPending}
          onAutoAssign={
            readOnly
              ? undefined
              : () =>
                  run(
                    planAutoAssign(fixtures),
                    'Re-address',
                    'Re-address',
                    'Every fixture is already packed from address 1 in rig order.',
                  )
          }
          onOptimise={
            readOnly
              ? undefined
              : () => run(planOptimise(fixtures), 'Close the gaps around', 'Close the gaps', 'There are no gaps to close.')
          }
        />
      </div>
      <LightingRigSheet eventId={eventId} fixtures={fixtures} />
      {confirmPlan}
    </>
  )
}
