import type { KeyboardEvent, ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '../ui/Button'
import { FieldStack } from '../ui/GearList'
import { MicroLabel } from '../ui/Label'

interface RowEditorProps {
  /** The tab's own fields, each a `FieldStack`. */
  children: ReactNode
  /** Label on the primary control, e.g. "Save channel". */
  saveLabel: string
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  /** Opens Flow with what this row is about already selected. Omitted when there is nothing to select. */
  onEditInFlow?: () => void
  /**
   * The label above that button — what the Flow view will have selected. The inputs
   * sheet says `Source`, because a channel's row editor sends you there to change
   * what feeds it; the outputs sheet says `Routing`, because since Slice 26 the
   * button selects the output row itself.
   */
  editInFlowLabel?: string
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
export function RowEditor({ children, saveLabel, onSave, onCancel, onDelete, onEditInFlow, editInFlowLabel = 'Source', onKeyDown }: RowEditorProps) {
  return (
    <div className="-mx-1 flex flex-col gap-2" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-end gap-3 rounded-r-md border-l-2 border-amber-500 bg-amber-500/[0.05] px-3 py-2.5">
        {children}

        {onEditInFlow && (
          <FieldStack label={editInFlowLabel} width="short">
            {/* Routing is decided in Flow, so the way to change what feeds this
                row is to go there — with the row's own subject already selected
                (FR-030). */}
            <Button size="sm" variant="outline" className="h-8 justify-between px-3 text-xs" onClick={onEditInFlow}>
              Edit in Flow
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
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      </div>
      <p className="px-3 text-[11px] text-zinc-500">
        <MicroLabel className="mr-2">Keys</MicroLabel>
        <kbd>Esc</kbd> discards · <kbd>⌘↵</kbd> saves and opens the next row
      </p>
    </div>
  )
}
