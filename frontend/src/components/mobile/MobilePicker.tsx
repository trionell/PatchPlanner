import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Sheet } from '../ui/Sheet'

export interface PickerOption {
  id: string | number
  label: string
  /** One value the desktop's own rail already shows beside the name: a count. */
  hint?: string
}

/**
 * Choose one of N, on a phone (Wave 6c).
 *
 * A column is the one thing a 375px screen does not have (patterns.md §7), so every
 * *choose one of N* on the desktop — a rail, a tab strip, a list down the left — becomes
 * a control naming the current choice and opening a sheet. `SectionSwitcher` is the
 * shape this copies, down to the 52px row and the sidebar's 2px amber left edge, because
 * the phone should have exactly one of these and it already had one.
 *
 * It goes in `MobilePanel`'s **`actions`**, not its overflow: choosing a plot or a
 * vocabulary changes *what you are looking at*, which is the visible half of the rule
 * (contracts/phone-surfaces.md §1).
 *
 * Extracted at its second caller, not before — the rule Wave 5's `ui/PanelRail` was
 * made to follow. `pages/Inventories` has a third instance of this idea written inline
 * and is deliberately left alone: it is not a surface this slice touches, and rewriting
 * a working phone control to prove a point is how a refactor becomes a regression.
 */
export function MobilePicker({
  label,
  options,
  value,
  onChange,
  title,
}: {
  /** Fallback when nothing is selected yet. */
  label: string
  options: PickerOption[]
  value: string | number | null
  onChange: (id: string | number) => void
  /** The sheet's heading — what this is a list of. */
  title: string
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((option) => option.id === value)

  return (
    <>
      <button
        aria-label={title}
        /* Capped and truncating. The bar has 317px, and after a title and two 44px
           targets this is what is left (contracts/phone-surfaces.md §1). */
        className="flex h-11 max-w-[7rem] flex-none items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-sm text-zinc-100"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="truncate">{current?.label ?? label}</span>
        <ChevronDown className="h-4 w-4 flex-none text-zinc-400" />
      </button>

      <Sheet flush onClose={() => setOpen(false)} open={open} title={title}>
        {options.map((option) => {
          const active = option.id === value
          return (
            <button
              className={cn(
                'flex min-h-[52px] w-full items-center gap-3 border-b border-l-2 border-zinc-800/60 px-3 text-left',
                active ? 'border-l-amber-500 bg-amber-500/[0.06]' : 'border-l-transparent',
              )}
              key={option.id}
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
              type="button"
            >
              <span className={cn('min-w-0 flex-1 truncate text-sm', active ? 'font-semibold text-amber-300' : 'text-zinc-300')}>
                {option.label}
              </span>
              {option.hint && <span className="flex-none font-mono text-xs tabular-nums text-zinc-500">{option.hint}</span>}
            </button>
          )
        })}
      </Sheet>
    </>
  )
}
