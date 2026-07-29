import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { MobilePanel, type PanelAction } from '../ui/MobilePanel'
import { CondensedListRow } from './CondensedListRow'

export interface MobileEntityRow {
  id: number
  /** Channel/output/fixture number or ID, shown as a small mono prefix. */
  number: number | string
  name: string
  subtitle: string
  color?: string
}

/**
 * Search, rows and the add control for the phone's Audio Inputs, Audio Outputs and
 * Lighting Rig — one component, since all three are the same shape and differ only in
 * what `number`, `subtitle` and `color` mean.
 *
 * **It is a `MobilePanel`** (Wave 6b). It used to be a `space-y-1.5` stack: an `h-9`
 * search field beside an `h-9 w-9` add button, then rows as free-standing cards on the
 * page ground, and nothing at the foot — so the surface a technician opens while
 * standing in the room could not say whether the patch was finished (audit.md M1, M2,
 * M3). The frame, the 44px targets and the search behaviour are all the panel's; what
 * stays here is the one thing this component knows, which is what a row means.
 *
 * `strip` is the surface's own status rail, passed through untouched. This component
 * does not derive a verdict and does not filter — the caller owns both, exactly as its
 * desktop sheet does (data-model.md §3).
 */
export function MobileEntityList({
  title,
  items,
  onSelect,
  onAdd,
  readOnly,
  searchPlaceholder,
  addLabel,
  emptyLabel,
  strip,
  overflow,
  filtered = false,
  actions,
  titleAdornment,
  search,
  onSearch,
  children,
}: {
  /** The surface's name, repeated in the bar (patterns.md §1). */
  title: string
  items: MobileEntityRow[]
  onSelect: (id: number) => void
  onAdd?: () => void
  readOnly: boolean
  searchPlaceholder: string
  addLabel: string
  emptyLabel: string
  /** The surface's status rail. */
  strip?: ReactNode
  /**
   * The bar's overflow, passed straight through: Open Rig, Buses, Universes, Print.
   * This component decides nothing about them, exactly as it decides nothing about the
   * strip — three surfaces share it and each has a different set.
   */
  overflow?: PanelAction[]
  /**
   * Whether the caller has already narrowed `items` with the strip's filter. Without
   * it an emptied filter reads as an empty surface — *"No input channels yet."* on an
   * event with sixteen channels — because this component only ever sees what survived.
   */
  filtered?: boolean
  /**
   * Bar controls that change **what you are looking at**, passed straight through: the
   * audio tabs' `Sheet │ Flow` toggle, and the zoom while Flow is showing.
   */
  actions?: ReactNode
  /** One thing belonging to the *title* — Flow's withheld-gesture `i`. */
  titleAdornment?: ReactNode
  /**
   * The search query, when the surface owns it.
   *
   * Both audio tabs already held one for their desktop branch while this component held
   * a second, so one surface had two queries for one search — and the canvas has to read
   * the term the bar is showing. Omit both and the component keeps its own, which is
   * what Lighting does (Slice 36 R10).
   */
  search?: string
  onSearch?: (value: string) => void
  /**
   * Drawn instead of listed: when present, this **replaces the rows**.
   *
   * It is the same set of things either way — the Flow canvas is another view of the
   * channels this component otherwise lists — so it is one `MobilePanel` and not two.
   * Two would remount the bar on every toggle, closing the search row and losing the
   * overflow sheet's state, on a control whose whole job is *what you are looking at*.
   */
  children?: ReactNode
}) {
  const [ownQuery, setOwnQuery] = useState('')
  const query = search ?? ownQuery
  const setQuery = onSearch ?? setOwnQuery
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) => item.name.toLowerCase().includes(q) || String(item.number).toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q),
    )
  }, [items, query])

  return (
    <MobilePanel
      title={title}
      titleAdornment={titleAdornment}
      search={query}
      onSearch={setQuery}
      searchPlaceholder={searchPlaceholder}
      actions={actions}
      /* Hidden, not disabled, for a viewer-role user (FR-015) — there is nothing to tap
         into that does nothing. */
      primaryAction={
        !readOnly && onAdd ? (
          <button
            aria-label={addLabel}
            className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500 text-zinc-950"
            onClick={onAdd}
            type="button"
          >
            <Plus className="h-5 w-5" />
          </button>
        ) : undefined
      }
      strip={strip}
      overflow={overflow}
    >
      {children ?? (
        <>
      {visible.map((item) => (
        <CondensedListRow
          key={item.id}
          title={
            <>
              <span className="mr-1.5 font-mono text-xs tabular-nums text-amber-400">{item.number}</span>
              {item.name}
            </>
          }
          subtitle={item.subtitle}
          accentColor={item.color}
          /*
            Always tappable, whatever the role (Wave 6c, audit.md M4).

            This read `onClick={readOnly ? undefined : …}`, which is the same expression
            six desktop sheets use and is correct on all six — a desktop row already
            shows every column, and the click only opens an editor. **On a phone the row
            is a truncation**: the source, the routing and the notes are behind the tap,
            so withholding it meant a viewer could not read the patch at all. The
            identical expression, right in one place and wrong in the other, is why P9
            states the reading rule separately from P7.

            What the role decides is what the sheet does, not whether it opens.
          */
          onClick={() => onSelect(item.id)}
          /* Drawn, not pressed — the row is the target. Two targets 8px apart inside a
             44px row is how a list starts mis-firing (patterns.md §7c). */
          trailing={!readOnly && <Pencil className="h-4 w-4 text-zinc-500" />}
        />
      ))}
      {visible.length === 0 && (
        <p className="px-3 py-3 text-sm text-zinc-500">
          {items.length > 0 ? 'No matches.' : filtered ? 'Nothing left to fix — tap the strip to show everything.' : emptyLabel}
        </p>
      )}
        </>
      )}
    </MobilePanel>
  )
}
