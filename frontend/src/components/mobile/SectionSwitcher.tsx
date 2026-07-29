import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { MOBILE_SECTIONS, type MobileSection } from '../../types/mobile'
import { cn } from '../../lib/utils'
import { Sheet } from '../ui/Sheet'

/**
 * Replaces the desktop `TabList`/`Tab` strip on phone-width viewports: one
 * control naming the current section, opening the list of nine.
 *
 * It is `ui/Tabs`'s job in a different shape — *what you are looking at* — so it
 * takes no trough, and the accent marks the current section **in the open list**
 * rather than on the closed control: a control that is amber whether or not
 * anything is selected has spent the accent on furniture (P4).
 *
 * It lists sections and nothing else. It used to grade all nine
 * `editable` / `read-only` / `viewer` from a fixed table — three words the
 * application does not otherwise use, describing the state of the *build*
 * rather than the state of the *show*, in a hue tokens.md §5 reserves for the
 * legend's sample stroke, telling a viewer-role user that Audio Inputs was
 * "Editable". Its own type comment admitted the badge could not be believed.
 * audit.md M7; deleted in Slice 33.
 */
export function SectionSwitcher({
  current,
  onSelect,
}: {
  current: MobileSection['section']
  onSelect: (section: MobileSection['section']) => void
}) {
  const [open, setOpen] = useState(false)
  const currentEntry = MOBILE_SECTIONS.find((s) => s.section === current) ?? MOBILE_SECTIONS[0]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full shrink-0 items-center justify-between gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3"
      >
        <span className="text-sm font-semibold text-zinc-100">{currentEntry.label}</span>
        <ChevronDown className="h-4 w-4 text-zinc-400" />
      </button>

      <Sheet flush open={open} onClose={() => setOpen(false)} title="Sections">
        {MOBILE_SECTIONS.map((entry, index) => {
          const active = entry.section === current
          return (
            <button
              key={entry.section}
              type="button"
              onClick={() => {
                onSelect(entry.section)
                setOpen(false)
              }}
              className={cn(
                // The sidebar's own marker: a 2px left edge, not a filled pill.
                // It is the quietest mark that survives peripheral vision, and
                // it is the one thing the desktop and the phone can share here.
                'flex min-h-[52px] w-full items-center gap-3 border-b border-zinc-800/60 border-l-2 px-3 text-left',
                active ? 'border-l-amber-500 bg-amber-500/[0.06]' : 'border-l-transparent',
              )}
            >
              <span
                className={cn(
                  'w-4 shrink-0 font-mono text-[10px] tabular-nums tracking-[0.14em]',
                  active ? 'text-amber-500' : 'text-zinc-600',
                )}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className={cn('text-sm', active ? 'font-semibold text-amber-300' : 'text-zinc-300')}>
                {entry.label}
              </span>
            </button>
          )
        })}
      </Sheet>
    </>
  )
}
