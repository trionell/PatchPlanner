import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { MicroLabel } from './Label'

/**
 * The drawer design language (Slice 24 US3), as a handful of primitives.
 *
 * The Rig and Buses drawers had five sections in four different arrangements of
 * the same idea, one of which put stageboxes and stage multis in two columns
 * narrow enough that their always-visible fields could not be typed into. The
 * reason they drifted is that there was nothing shared for them to drift *from*.
 *
 * Nothing here knows about audio: each section supplies its own content, and gets
 * consistency for free rather than by repeated care. Deliberately primitives
 * rather than one configurable `<EntityList fields={…}>` — the sections' fields
 * genuinely differ (four counts and an owned-or-rented item on a desk, a length
 * in metres on a multi, a connector per side on a device), and a component
 * general enough for all of that would be harder to read than the sections it
 * replaced (Principle V, research.md R11).
 *
 * Sizes come from the approved mockup's proportions, not its pixel values: that
 * page renders the whole app scaled down, so its 20px fields and 8.5px labels are
 * a thumbnail. Taken literally they would be smaller than the controls being
 * complained about (research.md R12).
 */

/**
 * One kind of equipment: a heading with a count, an add control on the same line,
 * and the list. Full width, always — no section is ever placed beside another
 * (FR-018).
 */
export function DrawerSection({
  label,
  count,
  action,
  children,
}: {
  label: string
  /** Shown beside the heading. Omit for a section where a count says nothing. */
  count?: number
  /** The add control. Omitted entirely for a read-only role, never disabled (FR-025). */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <MicroLabel>{label}</MicroLabel>
        {count != null && <span className="font-mono text-[10px] text-zinc-600">{count}</span>}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * One declared piece of equipment. `accent` tints it, which the Consoles section
 * uses so the desks read as the thing the rest of the rig hangs off.
 */
export function GearCard({
  accent,
  className,
  children,
}: {
  accent?: boolean
  /**
   * For the phone's own padding tier, and nothing else. `px-2.5 py-2` is the
   * work surface's density and stays the default at both widths — ten drawers
   * have shipped on it — but a card a thumb operates is `px-3 py-2.5`
   * ([tokens.md](../../../design/tokens.md) §7 amendment 2), and before Slice 38
   * there was no way to say so. `cn` is `tailwind-merge`, so the caller's padding
   * replaces the default rather than racing it.
   */
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-md border px-2.5 py-2',
        accent ? 'border-amber-500/35 bg-amber-500/[0.045]' : 'border-zinc-800 bg-zinc-900',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * The summary line: what this is, what it stands for, and the actions. No form
 * control appears here — fields exist only once Edit is pressed (FR-019).
 */
export function GearTop({
  badge,
  name,
  item,
  actions,
}: {
  badge?: ReactNode
  name: ReactNode
  /** The catalog or owned item this row stands for, e.g. "DiGiCo SD10 · rental". */
  item?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {badge}
      <span className="text-sm font-medium text-zinc-100">{name}</span>
      {item && <span className="truncate text-xs text-zinc-400">{item}</span>}
      <span className="flex-1" />
      {actions}
    </div>
  )
}

/** The capacity line — what makes "is this box big enough?" answerable at a glance (FR-019, SC-009). */
export function GearSpecs({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-500">{children}</div>
}

export function Spec({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warning' }) {
  return (
    <span className={tone === 'warning' ? 'text-amber-300' : undefined}>
      {label} <span className={tone === 'warning' ? 'text-amber-200' : 'text-zinc-300'}>{value}</span>
    </span>
  )
}

/**
 * How full a desk is. Only drawn when a capacity has been declared: a count left
 * at 0 means nobody has said yet, and must never warn (FR-022).
 */
export function Meter({ used, capacity }: { used: number; capacity: number }) {
  if (capacity <= 0) return null
  const ratio = used / capacity
  return (
    <div className="h-[3px] overflow-hidden rounded-sm bg-zinc-800" role="presentation">
      <div
        className={cn('h-full', ratio > 1 ? 'bg-red-400' : 'bg-amber-500')}
        style={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%` }}
      />
    </div>
  )
}

/**
 * The edit and add forms — one construction for both, which is what makes adding
 * and editing look like the same operation (FR-020, and the mockup's `.rowed`).
 * Fields flow and wrap; they are never laid out on a fixed column track, which is
 * what compressed them into unusability in the first place.
 */
export function GearForm({ children, onKeyDown }: { children: ReactNode; onKeyDown?: (e: React.KeyboardEvent) => void }) {
  return (
    <div
      className="flex flex-wrap items-end gap-2 rounded-r-md border-l-2 border-amber-500 bg-amber-500/[0.04] px-2.5 py-2"
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  )
}

/**
 * One field: its label above its control. `grow` gives a name or an item picker
 * the leftover width; the default 10rem is wide enough to read a full equipment
 * name back without scrolling inside it (FR-021).
 */
export function FieldStack({
  label,
  width = 'default',
  children,
}: {
  label: string
  width?: 'default' | 'grow' | 'count' | 'short' | 'full'
  children: ReactNode
}) {
  const widths = {
    default: 'w-40',
    grow: 'min-w-40 flex-1',
    count: 'w-20',
    short: 'w-28',
    // The phone's. `grow` could not be reused: its `flex-1` grows the *height*
    // inside the `flex-col` a bottom sheet stacks its fields in, and its
    // `min-w-40` is a floor a 375px screen does not want (research.md R4).
    full: 'w-full',
  }
  return (
    <label className={cn('flex flex-col gap-1', widths[width])}>
      <MicroLabel>{label}</MicroLabel>
      {children}
    </label>
  )
}

/** The right-hand end of a form: confirm, and a labelled delete kept apart from it (FR-023, FR-029). */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="ml-auto flex items-end gap-2 pb-px">{children}</div>
}
