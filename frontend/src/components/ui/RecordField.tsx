import { ChevronDown } from 'lucide-react'
import { buttonClasses } from './buttonVariants'
import { cn } from '../../lib/utils'

/**
 * A field that names **what it holds** rather than holding a value.
 *
 * `ui/Select` can only offer a list of labels, and a label is one string. That
 * is the whole defect this exists to fix: the equipment item picker was a
 * `<select>` whose options read `category — name`, over a catalog holding
 * fifteen items called `Mikrofonkabel` that differ only by their description.
 * Fifteen identical options is not a choice.
 *
 * So the control stops being a chooser and becomes a **statement of the current
 * choice**, with the choosing done in whatever overlay the caller opens. Three
 * states, and they are the component's entire contract:
 *
 * - **empty** — it invites, in the placeholder's muted ink;
 * - **one record** — it names the record and the qualifier that tells it from a
 *   same-named one, `name · qualifier`, in ink then muted;
 * - **several** — it counts them. The names are not repeated here: the caller
 *   states them in full below, and truncating five names into 160 px would be
 *   the original disease with extra steps.
 *
 * Its geometry is `ui/Button variant="outline"` at `sm`/`md`, so it sits in a
 * `FieldStack` beside `Input` and `Select` and matches them at both tiers
 * (`design/components.md` §4). It is **not** a `Select` with a custom popup:
 * the overlay belongs to the caller, and this never opens one itself.
 *
 * There is deliberately no clear control. A field that names a record cannot be
 * emptied, only replaced — and the editor it sits in already has a Cancel.
 */
export function RecordField({
  placeholder,
  record,
  count,
  onOpen,
  size = 'md',
  disabled = false,
  'aria-label': ariaLabel,
}: {
  /** What it says while it holds nothing. */
  placeholder: string
  /** The single record it holds. `qualifier` is what tells it from a same-named one. */
  record?: { name: string; qualifier?: string }
  /**
   * How many records it holds, when that is more than one. Takes precedence
   * over `record` — a caller holding a batch has no single record to name.
   */
  count?: number
  onOpen: () => void
  size?: 'sm' | 'md'
  disabled?: boolean
  'aria-label'?: string
}) {
  const many = count != null && count > 1

  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        buttonClasses({ variant: 'outline', size }),
        // `justify-between` rather than the button's own centring: this is a
        // field, and a field's value starts at its left edge.
        'w-full min-w-0 justify-between gap-2 font-normal',
        size === 'sm' ? 'text-xs' : 'text-sm',
      )}
      disabled={disabled}
      onClick={onOpen}
      type="button"
    >
      <span className="min-w-0 flex-1 truncate text-left">
        {many ? (
          <span className="text-zinc-100">{count} items</span>
        ) : record ? (
          <>
            <span className="text-zinc-100">{record.name}</span>
            {/* Absent, not an em-dash. The dash stands in for a missing value
                *in a column*, where the column still has to occupy its width;
                a field with nothing to add says nothing. */}
            {record.qualifier && <span className="text-zinc-500"> · {record.qualifier}</span>}
          </>
        ) : (
          <span className="text-zinc-500">{placeholder}</span>
        )}
      </span>
      <ChevronDown className={cn('flex-none text-zinc-400', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
    </button>
  )
}
