import type { ReactNode } from 'react'
import { ChevronRight, Pencil } from 'lucide-react'
import { type EventSummary, readinessLines, type ReadinessTone } from '../../lib/eventSummary'
import { DmxMeter, RigRibbon } from '../event/OverviewBands'
import { StatusStrip } from '../event/StatusStrip'
import { MicroLabel } from '../ui/Label'
import { MobilePanel } from '../ui/MobilePanel'
import { Pill } from '../ui/SheetTable'
import { CondensedListRow } from './CondensedListRow'

/**
 * *How is this show doing*, in one hand (Wave 6c, audit.md M9).
 *
 * Overview is Wave 4's best desktop surface and the composition it uses is the exact one
 * a 375px screen cannot have: five 26px figures side by side, a rig drawn as the flow
 * canvas one row high, five verdicts on one line. Every part of that is a **read
 * across**, and a phone has no across. Until this slice it rendered the desktop `Card` at
 * 375px, where the band wrapped into a ragged stack and the ribbon ran off the right edge
 * with nothing to scroll it.
 *
 * So the three bands are decided **separately**, by what each one *is*:
 *
 * - **A figure stays a figure.** `tokens.md` §7 is explicit — *density on a phone comes
 *   from stacking, never from shrinking* — so 26px mono stays 26px mono and the band
 *   becomes a two-column grid.
 * - **A ribbon stays a drawing, and it pans.** §7f already settled what a drawing does
 *   here: nothing on it is re-sized, because nothing on it is a target. So the nodes keep
 *   their geometry and the window moves.
 * - **A verdict becomes a row.** This is the part worth arguing for. On a desk
 *   `ReadinessRow` is a secondary convenience, because the tab strip is right there; on a
 *   phone the tab strip is behind a tap, and five 44px rows that **both state the verdict
 *   and route to it** are the most useful object on the device.
 *
 * It derives nothing. `lib/eventSummary` computes every number and every verdict for the
 * desktop already, so this composition only stops drawing them in two places.
 */

const TONE_PILL: Record<ReadinessTone, string> = {
  ok: 'bg-emerald-500/15 text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-300',
  error: 'bg-red-500/15 text-red-300',
  neutral: 'bg-zinc-800 text-zinc-400',
}

/** The leading edge, in the verdict's own tone — a run of green with one red edge reads
 *  from the corner of the eye before a word of it does. */
const TONE_EDGE: Record<ReadinessTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-red-500',
  neutral: 'bg-zinc-700',
}

const AREA_LABEL: Record<string, string> = {
  audio: 'Audio',
  lighting: 'Lighting',
  rental: 'Rental',
  equipment: 'Equipment',
  plots: 'Plots',
}

/**
 * One figure.
 *
 * **No border, no radius, no ground of its own** — only the same hairlines the rows
 * below use. Five bordered tiles inside a frame is `M1` all over again, applied to
 * something that is not a row.
 */
function Figure({
  label,
  value,
  unit,
  span,
  leftColumn,
}: {
  label: string
  value?: ReactNode
  unit?: string
  span?: boolean
  /** No divider on the left column — it would draw a line down the panel's own edge. */
  leftColumn?: boolean
}) {
  return (
    <div
      className={
        span
          ? 'col-span-2 px-3 pb-3 pt-3'
          : `border-t border-zinc-800/60 px-3 pb-2.5 pt-2.5 ${leftColumn ? '' : 'border-l'}`
      }
    >
      <div className={`font-mono tabular-nums leading-none text-zinc-100 ${span ? 'text-[34px]' : 'text-[26px]'}`}>
        {value ?? <span className="text-zinc-600">—</span>}
        {unit && value != null && <span className="ml-1 text-[0.5em] text-zinc-500">{unit}</span>}
      </div>
      <MicroLabel className="mt-1.5 block">{label}</MicroLabel>
    </div>
  )
}

export function MobileOverviewPanel({
  summary,
  subtitle,
  notes,
  inventoryName,
  inventoryNote,
  onOpenInventory,
  onOpenAccess,
  accessTitle,
  accessSubtitle,
  onOpenTab,
  onEdit,
  meta,
}: {
  summary: EventSummary
  /** Venue and dates, as one line. Not the event's name — that is in the shell's header. */
  subtitle: string
  notes?: string
  inventoryName?: string
  inventoryNote: string
  onOpenInventory: () => void
  /** "4 people have access" — `lib/eventAccess`, so both widths say it once. */
  accessTitle: string
  /** "You are the owner · 2 contributors, 1 viewer". */
  accessSubtitle: string
  /** Present at every role. A viewer opens the same drawer and finds no controls
   *  in it — the door is not what withholds them (Slice 38). */
  onOpenAccess: () => void
  onOpenTab: (tab: string) => void
  /** Absent for a role that cannot act (P7). */
  onEdit?: () => void
  meta: string[]
}) {
  const lines = readinessLines(summary)
  const needAttention = lines.filter((line) => line.tone === 'warn' || line.tone === 'error')
  const worst: ReadinessTone = lines.some((line) => line.tone === 'error')
    ? 'error'
    : lines.some((line) => line.tone === 'warn')
      ? 'warn'
      : 'ok'

  return (
    <MobilePanel
      /* No search: a search box that filters nothing is absent, as on the desktop. */
      primaryAction={
        onEdit ? (
          <button
            aria-label="Edit details"
            className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500 text-zinc-950"
            onClick={onEdit}
            type="button"
          >
            <Pencil className="h-5 w-5" />
          </button>
        ) : undefined
      }
      strip={
        /*
          The first strip in the application that is a **sentence** rather than a control.
          §7b has always allowed it — *"a strip with nothing to filter to draws no chevron
          and is not a control"* — and nothing had demonstrated it, because every strip so
          far has had something to filter to. Filtering five rows down to two, on a list
          whose whole job is to be complete, would hide three destinations to save 132px.
        */
        <StatusStrip
          tint={
            worst === 'error'
              ? 'border-red-500/40 bg-red-500/[0.06]'
              : worst === 'warn'
                ? 'border-amber-500/40 bg-amber-500/[0.05]'
                : 'border-zinc-800 bg-zinc-950/60'
          }
        >
          {needAttention.length > 0 ? (
            <>
              <Pill className={TONE_PILL[worst]}>
                {needAttention.length} need{needAttention.length === 1 ? 's' : ''} attention
              </Pill>
              <span className="text-zinc-300">{needAttention.map((line) => AREA_LABEL[line.area]).join(' · ')}</span>
            </>
          ) : (
            <Pill className={TONE_PILL.ok}>everything clear</Pill>
          )}
        </StatusStrip>
      }
      title="Overview"
    >
      {/* The venue and the dates — where and when, which is half of what this section is
          for. The name is not repeated: it is in the shell's header on every section, so
          printing it again would cost 48px to say something that cannot scroll away. */}
      <div className="border-b border-zinc-800/60 px-3 py-2.5 text-xs text-zinc-400">{subtitle}</div>

      {notes && (
        <div className="border-b border-zinc-800/60 px-3 py-2.5">
          <p className="whitespace-pre-wrap border-l-2 border-zinc-800 pl-3 text-xs text-zinc-400">{notes}</p>
        </div>
      )}

      {/*
        The figures. The countdown spans both columns, and it is the one place this
        composition takes a position rather than following a rule: four of the five are
        quantities of things in the plan, and *days to load-in* is the only one about
        **now** — the only one whose tab is this section itself, and the headline on the
        surface someone opens standing in the venue. Spanning is how a grid says *this one
        is a different kind of fact* without inventing a colour to say it with. It also
        disposes of the arithmetic honestly: five things do not fit a two-column grid, and
        the choice is between one empty cell and one spanning cell.
      */}
      <div className="grid grid-cols-2 border-b border-zinc-800/60">
        <Figure
          label={summary.daysToLoadIn != null && summary.daysToLoadIn < 0 ? 'since load-in' : 'to load-in'}
          span
          unit={summary.dayLabel === 'today' || summary.dayLabel === 'tomorrow' ? undefined : 'days'}
          value={
            summary.dayLabel === 'today' || summary.dayLabel === 'tomorrow'
              ? summary.dayLabel
              : summary.daysToLoadIn != null
                ? Math.abs(summary.daysToLoadIn)
                : undefined
          }
        />
        <Figure
          label="channels in / out"
          leftColumn
          unit={summary.outputChannels != null ? `/ ${summary.outputChannels}` : undefined}
          value={summary.inputChannels}
        />
        <Figure label="fixtures" value={summary.fixtures} />
        <Figure label="cables picked" leftColumn value={summary.cablesPicked} />
        <Figure
          label="rental, ex vat"
          unit="kr"
          value={summary.rentalTotalExVAT != null ? Math.round(summary.rentalTotalExVAT).toLocaleString('sv-SE') : undefined}
        />
      </div>

      {/*
        The ribbons, panning. The scroll container is the track and not the row, so the
        page never scrolls sideways; the nodes keep the desktop's own geometry, because a
        drawing is not a target (§7f). The DMX meter comes out of the ribbon's trailing
        slot to a line beneath it — a meter beside a scrolling track is a meter that
        scrolls away, and the headroom is the one number on that ribbon anybody looks for
        on purpose.
      */}
      <Ribbon
        label="Audio"
        nodes={[
          { label: 'sources', value: summary.sources ?? 0, count: summary.sources },
          { label: 'stageboxes', value: summary.stageboxes ?? 0, count: summary.stageboxes },
          { label: 'multis', value: summary.stageMultis ?? 0, count: summary.stageMultis },
          { label: 'console', value: summary.consoleName ?? '—', count: summary.consoleName ? 1 : 0, desk: true },
          { label: 'devices', value: summary.outputDevices ?? 0, count: summary.outputDevices },
          { label: 'outputs', value: summary.outputChannels ?? 0, count: summary.outputChannels },
        ]}
      />
      <Ribbon
        label="Lighting"
        nodes={[
          { label: 'fixtures', value: summary.fixtures ?? 0, count: summary.fixtures },
          { label: 'universes', value: summary.universes ?? 0, count: summary.universes },
          { label: 'trusses', value: summary.trusses ?? 0, count: summary.trusses },
        ]}
        under={
          summary.dmxUsed && summary.dmxCapacity ? (
            <div className="flex items-center gap-2 px-3 pb-2.5">
              <DmxMeter capacity={summary.dmxCapacity} used={summary.dmxUsed} />
            </div>
          ) : undefined
        }
      />

      {/* Every work panel's own verdict, as the phone's index of the show. */}
      <div className="flex items-center gap-2 bg-zinc-950/35 px-3 pb-1.5 pt-2.5">
        <MicroLabel>Readiness</MicroLabel>
        <span className="h-px flex-1 bg-zinc-800" />
      </div>
      {lines.map((line) => (
        <button
          className="flex min-h-[44px] w-full items-stretch border-b border-zinc-800/60 text-left"
          key={line.area}
          onClick={() => onOpenTab(line.tab)}
          type="button"
        >
          <span aria-hidden className={`w-[3px] shrink-0 ${TONE_EDGE[line.tone]}`} />
          <span className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
            <MicroLabel className="w-[5.5rem] shrink-0 text-zinc-300">{AREA_LABEL[line.area]}</MicroLabel>
            <span className="min-w-0 flex-1 truncate font-mono text-xs tabular-nums text-zinc-500">
              {line.figure ?? '—'}
            </span>
            <Pill className={`${TONE_PILL[line.tone]} shrink-0`}>{line.label}</Pill>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
          </span>
        </button>
      ))}

      <CondensedListRow
        onClick={onOpenInventory}
        subtitle={inventoryNote}
        title={inventoryName ?? '—'}
        trailing={<ChevronRight className="h-4 w-4 text-zinc-600" />}
      />

      {/*
        Who can see this event — the phone's first access surface, and the reported
        defect (Slice 38). It is the catalog row's own shape because it is the same
        kind of fact: what this event is attached to, and to whom.

        No `accentColor`: the tape bar is an entity's derived colour, and access is
        a relation rather than a thing on the plot. Present at every role — the
        drawer withholds the controls, not the door.
      */}
      <CondensedListRow
        onClick={onOpenAccess}
        subtitle={accessSubtitle}
        title={accessTitle}
        trailing={<ChevronRight className="h-4 w-4 text-zinc-600" />}
      />

      {/* The card's own last line, at the card's own tier. */}
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 px-3 py-2.5 text-xs text-zinc-500">
        {meta.map((entry) => (
          <span key={entry}>{entry}</span>
        ))}
      </div>
    </MobilePanel>
  )
}

/** A rig ribbon as a phone row: the desktop drawing, in a track that pans. */
function Ribbon({
  label,
  nodes,
  under,
}: {
  label: string
  nodes: Parameters<typeof RigRibbon>[0]['nodes']
  under?: ReactNode
}) {
  if (nodes.every((node) => node.count === 0 || node.count == null)) return null
  return (
    <div className="border-b border-zinc-800/60 pt-2.5">
      <MicroLabel className="block px-3 pb-2">{label}</MicroLabel>
      {/* The track scrolls, not the row — wide content scrolls inside its own container
          so the page never does. */}
      <div className="overflow-x-auto px-3 pb-2.5">
        <div className="w-max">
          <RigRibbon nodes={nodes} />
        </div>
      </div>
      {under}
    </div>
  )
}
