import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { MICRO_LABEL, PHANTOM_BAR } from './tokens'

/**
 * The flow inspector, as both graphs draw it (Slice 26 FR-014).
 *
 * Slice 25 built this rail for the inputs canvas because that was the only canvas
 * the mockup drew one for. There are two now, and the two flow canvases are the
 * cautionary tale: each held its own `NodeShell`, `PortDot` and `PortRow`, they
 * drifted, the field test could tell them apart, and Slice 25 was spent undoing it.
 * So the second rail is not a second rail — the frame, the header, the field row,
 * the note box and the legend's strokes live here, once, and each inspector supplies
 * only what is actually specific to it.
 *
 * Values are Slice 25's, moved rather than changed. See
 * specs/026-output-flow-inspector/contracts/inspector-rail.md §1, which supersedes
 * the table in specs/025-patch-visual-language/contracts/visual-language.md §7.
 */

/**
 * The frame: a bordered column beside the canvas, not a card floating on it.
 *
 * `className` exists for one reason: the flow canvases lay their row out with
 * `items-start`, so the rail is its own height and the row grows to fit it, while
 * the stage plot canvas is a fixed fraction of the viewport and stretches the rail
 * to match — which needs `overflow-y-auto`. Both are right for their canvas; the
 * rail should not have to pick one.
 */
export function InspectorRail({ className, children }: { className?: string; children: ReactNode }) {
  return <aside className={cn('flex w-60 shrink-0 flex-col gap-2.5 border-l border-zinc-800 p-2.5', className)}>{children}</aside>
}

/**
 * What the rail is showing, and the way out of it. `pill` is a slot rather than a
 * string because each side puts something different in it — a source's kind, an
 * output's type — and both are tinted by vocabulary the rail knows nothing about.
 */
export function InspectorHeader({ label, pill, onClose }: { label: string; pill?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={MICRO_LABEL}>{label}</span>
      {pill}
      <button aria-label="Close inspector" className="ml-auto text-zinc-500 hover:text-zinc-200" onClick={onClose} type="button">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/**
 * One field, its label beside it in a fixed narrow column (Slice 25 FR-022). Labels
 * above fields is what made the rail twice as tall as it needed to be; 44px fits
 * every label either inspector uses and keeps the controls on one axis.
 *
 * A label that doesn't fit is a label to shorten. Widening this column moves every
 * control on both rails.
 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2">
      <span className={MICRO_LABEL}>{label}</span>
      {children}
    </label>
  )
}

/** A bordered note within the rail — for things that are read, not edited. */
export function Note({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[5px] border border-zinc-800 bg-zinc-950/60 p-1.5">
      <span className={MICRO_LABEL}>{label}</span>
      {children}
    </div>
  )
}

/** One legend row: the sample is fixed by `kind`, the sentence is the caller's. */
export interface LegendRow {
  kind: 'cable' | 'network' | 'unpatched' | 'phantom'
  meaning: string
}

/**
 * A stroke sample's colour. Not a run's real colour — a legend row stands for every
 * colour a run might wear, so it needs one that reads as "a colour" without claiming
 * to be a particular channel's.
 */
const SAMPLE = '#38bdf8'
const SAMPLE_NEUTRAL = '#71717a'

const STROKES: Record<LegendRow['kind'], { stroke: string; dash?: string }> = {
  cable: { stroke: SAMPLE },
  network: { stroke: SAMPLE, dash: '6 3' },
  unpatched: { stroke: SAMPLE_NEUTRAL, dash: '4 3' },
  phantom: { stroke: '' },
}

/**
 * The encodings a run carries, drawn rather than described (Slice 25 FR-024).
 *
 * The **samples** are shared and the **wording** is not, on purpose. A sample's
 * whole claim is "this is a line the canvas draws", which a second copy of the dash
 * arrays falsifies the moment one of them is edited. The wording can't be shared:
 * the input graph's colour says which channel a run *reaches*, the output graph's
 * says which output it *carries*, and phantom power exists only on the input side —
 * so a shared noun would make one of the two rails wrong in order to make it
 * shared (research.md R5).
 */
export function Legend({ rows }: { rows: LegendRow[] }) {
  return (
    <Note label="Legend">
      {rows.map((row) => (
        <span key={row.meaning} className="flex items-center gap-2 text-[10px] text-zinc-400">
          {row.kind === 'phantom' ? (
            <span className="flex w-[22px] shrink-0 justify-center">
              <span className={PHANTOM_BAR} />
            </span>
          ) : (
            <svg width="22" height="4" aria-hidden className="shrink-0">
              <line x1="0" y1="2" x2="22" y2="2" stroke={STROKES[row.kind].stroke} strokeWidth="1.5" strokeDasharray={STROKES[row.kind].dash} />
            </svg>
          )}
          {row.meaning}
        </span>
      ))}
    </Note>
  )
}
