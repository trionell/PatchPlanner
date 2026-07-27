import type { KeyboardEvent, ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '../ui/Button'
import { FieldStack } from '../ui/GearList'
import { MicroLabel } from '../ui/Label'

/**
 * Where a row's deeper structure is actually decided, and the way to get there.
 *
 * `label` is what the destination will have selected — the inputs sheet says
 * `Source`, the outputs sheet says `Routing`, Lighting says `Truss`. `text` is
 * the button, and it is a prop rather than a constant because Lighting hands off
 * to the **stage plot**, not to Flow: a button reading "Edit in Flow" that opens
 * Stage Plots would be a lie, and a prop named `onEditInFlow` that did it would
 * be a lie in the type.
 */
interface RowEditorHandoff {
  label: string
  text: string
  onSelect: () => void
}

interface RowEditorProps {
  /** The tab's own fields, each a `FieldStack`. */
  children: ReactNode
  /** Label on the primary control, e.g. "Save channel". */
  saveLabel: string
  onSave: () => void
  onCancel: () => void
  /** Omitted by the add editor, which has nothing to delete yet. */
  onDelete?: () => void
  /** Omitted when there is nothing to hand off to. */
  handoff?: RowEditorHandoff
  /**
   * A full-width block below the fields — Lighting's collision prompt, which
   * has to be answered before the save can go through (Slice 27 FR-043).
   *
   * It participates in the same flex flow as the fields rather than being
   * positioned over them, so it cannot land on top of a field at some window
   * width. That is the same reasoning that took the actions out of the field
   * flow in the first place.
   */
  notice?: ReactNode
  onKeyDown?: (event: KeyboardEvent) => void
}

/**
 * The sheet's row editor, shared by both audio tabs (Slice 24 US4).
 *
 * A flowing strip, not a column track. Both sheets used to lay this out on a
 * fixed `md:grid-cols-[…]`, and because Notes spanned all but one column the
 * actions landed in the last 9rem cell — where three buttons shrank to fit,
 * compressing "Save channel" against its own padding and squeezing the delete
 * button's icon into a tall thin sliver. All three of the reported symptoms were
 * that one layout (research.md R14), so the fix is to take the actions out of the
 * field flow entirely and let the fields wrap.
 *
 * The amber left rail and matching ground are what make the strip read as hanging
 * off the row above it rather than floating in the table.
 */
export function RowEditor({ children, saveLabel, onSave, onCancel, onDelete, handoff, notice, onKeyDown }: RowEditorProps) {
  return (
    <div className="-mx-1 flex flex-col gap-2" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-end gap-3 rounded-r-md border-l-2 border-amber-500 bg-amber-500/[0.05] px-3 py-2.5">
        {children}

        {handoff && (
          <FieldStack label={handoff.label} width="short">
            {/* Some of a row's structure is decided elsewhere — routing in Flow,
                a fixture's truss on the stage plot — so the way to change it is
                to go there with this row's subject already selected (FR-030). */}
            <Button size="sm" variant="outline" className="h-8 justify-between px-3 text-xs" onClick={handoff.onSelect}>
              {handoff.text}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </FieldStack>
        )}

        {/* Pushed out of the field flow: labelled, never icons, and padded so no
            label meets its own edge (FR-029). */}
        <div className="ml-auto flex items-end gap-2">
          <Button size="sm" className="h-8 px-4 text-xs" onClick={onSave}>
            {saveLabel}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
        </div>

        {notice && <div className="w-full">{notice}</div>}
      </div>
      <p className="px-3 text-[11px] text-zinc-500">
        <MicroLabel className="mr-2">Keys</MicroLabel>
        <kbd>Esc</kbd> discards · <kbd>⌘↵</kbd> saves and opens the next row
      </p>
    </div>
  )
}
