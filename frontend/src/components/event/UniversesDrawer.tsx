import { useMemo } from 'react'
import { type DmxMap, UNIVERSE_SIZE } from '../../lib/dmxMap'
import type { LightingFixture } from '../../types'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Drawer'
import { DrawerSection, GearCard, GearSpecs, GearTop, Meter, Spec } from '../ui/GearList'
import { Pill } from '../ui/SheetTable'

/**
 * Where the universes are, and where the two bulk operations live (Slice 27 US6).
 *
 * A universe is declared once and referenced by every fixture in it, which is the
 * definition of a drawer rather than a card stacked above the table
 * (design/patterns.md §3). It is also the only place the 512-channel ceiling can
 * be *explained* rather than merely reported after the fact — which is why both
 * operations moved in here, and why the bar is left carrying one primary action.
 */

interface UniversesDrawerProps {
  open: boolean
  onClose: () => void
  map: DmxMap
  fixtures: LightingFixture[]
  /** Omitted entirely for a read-only role, never disabled (P7). */
  onAutoAssign?: () => void
  onOptimise?: () => void
  busy?: boolean
}

export function UniversesDrawer({ open, onClose, map, fixtures, onAutoAssign, onOptimise, busy }: UniversesDrawerProps) {
  /** Each catalog model in the rig, once, with what it costs the map. */
  const models = useMemo(() => {
    const byName = new Map<string, { name: string; quantity: number; mode: string; channels: number }>()
    for (const fixture of fixtures) {
      const name = fixture.inventory_item_name || fixture.custom_name || 'Custom fixture'
      const existing = byName.get(name)
      if (existing) existing.quantity += 1
      else
        byName.set(name, {
          name,
          quantity: 1,
          mode: fixture.dmx_channel_mode ?? '',
          channels: fixture.dmx_channel_count,
        })
    }
    return [...byName.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
  }, [fixtures])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Universes"
      subtitle="DMX allocation across the rig"
      width="narrow"
      info={
        <>
          <b className="font-medium text-zinc-300">Auto-assign</b> repacks each universe from address 1 in rig order.{' '}
          <b className="font-medium text-zinc-300">Optimise</b> keeps the order you set and closes the gaps. Both keep
          every fixture in its own universe, and fixtures that share an address stay sharing.
        </>
      }
    >
      <DrawerSection
        label="Universes"
        count={map.universes.length}
        action={
          (onAutoAssign || onOptimise) && (
            <div className="flex gap-1.5">
              {onOptimise && (
                <Button size="xs" variant="outline" onClick={onOptimise} disabled={busy}>
                  Optimise channels
                </Button>
              )}
              {onAutoAssign && (
                <Button size="xs" variant="outline" onClick={onAutoAssign} disabled={busy}>
                  Auto-assign DMX
                </Button>
              )}
            </div>
          )
        }
      >
        {map.universes.length === 0 && <p className="text-xs text-zinc-500">No fixtures yet, so no universes in use.</p>}

        {map.universes.map((universe) => {
          const clashes = universe.problems.filter((problem) => problem.kind === 'clash').length
          const overruns = universe.problems.filter((problem) => problem.kind === 'out-of-bounds').length
          return (
            <GearCard key={universe.universe} accent={universe.problems.length > 0}>
              <GearTop
                name={`Universe ${universe.universe}`}
                badge={
                  <>
                    {clashes > 0 && (
                      <Pill className="bg-red-500/15 text-red-300">
                        {clashes} {clashes === 1 ? 'overlap' : 'overlaps'}
                      </Pill>
                    )}
                    {overruns > 0 && <Pill className="bg-red-500/15 text-red-300">{overruns} past {UNIVERSE_SIZE}</Pill>}
                  </>
                }
                actions={
                  <span className="font-mono text-[10px] tabular-nums text-zinc-400">
                    {String(universe.occupied).padStart(3, '0')} / {UNIVERSE_SIZE} ch
                  </span>
                }
              />

              {/*
                A universe nobody has addressed anything in draws no bar at all
                (FR-070). `Meter` withholds itself for an undeclared *capacity*,
                which is a different condition — a universe's capacity is always
                512 — so the caller withholds it for an unused one.
              */}
              {universe.occupied > 0 && <Meter used={universe.occupied} capacity={UNIVERSE_SIZE} />}

              <GearSpecs>
                <Spec label="fixtures" value={universe.fixtureCount} />
                <Spec label="free" value={universe.free} />
                {universe.largestRun ? (
                  <Spec label="largest run" value={`${universe.largestRun.length} from ${universe.largestRun.start}`} />
                ) : (
                  <Spec label="largest run" value="none" tone="warning" />
                )}
                {universe.sharedGroupCount > 0 && (
                  <Spec label="shared" value={`${universe.sharedGroupCount} ${universe.sharedGroupCount === 1 ? 'group' : 'groups'}`} />
                )}
              </GearSpecs>
            </GearCard>
          )
        })}
      </DrawerSection>

      <DrawerSection label="Models in the rig" count={models.length}>
        {models.length === 0 && <p className="text-xs text-zinc-500">Nothing in the rig yet.</p>}
        {models.map((model) => (
          <GearCard key={model.name}>
            <GearTop
              name={model.name}
              actions={<span className="font-mono text-[10px] tabular-nums text-zinc-400">× {model.quantity}</span>}
            />
            <GearSpecs>
              <Spec label={model.mode || 'mode'} value={`${model.channels} ch`} />
              <Spec label="total" value={`${model.quantity * model.channels} ch`} />
            </GearSpecs>
          </GearCard>
        ))}
      </DrawerSection>
    </Drawer>
  )
}
