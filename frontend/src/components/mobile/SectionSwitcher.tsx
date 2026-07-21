import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { MOBILE_SECTION_CAPABILITIES, type MobileCapability, type MobileSectionCapability } from '../../types/mobile'
import { cn } from '../../lib/utils'
import { Dialog } from '../ui/Dialog'

const CAPABILITY_LABEL: Record<MobileCapability, string> = {
  editable: 'Editable',
  'read-only': 'View only',
  viewer: 'Viewer',
}
const CAPABILITY_CLASS: Record<MobileCapability, string> = {
  editable: 'bg-amber-500/15 text-amber-400',
  'read-only': 'bg-sky-500/15 text-sky-400',
  viewer: 'bg-sky-500/15 text-sky-400',
}

function CapabilityBadge({ capability }: { capability: MobileCapability }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', CAPABILITY_CLASS[capability])}>
      {CAPABILITY_LABEL[capability]}
    </span>
  )
}

/**
 * Replaces the desktop `TabList`/`Tab` strip on phone-width viewports
 * (FR-003): a single pill showing the current section, which opens a
 * sheet listing all 9 sections labeled by mobile capability before the
 * user taps into one (contracts/mobile-ui-contract.md).
 */
export function SectionSwitcher({
  current,
  onSelect,
}: {
  current: MobileSectionCapability['section']
  onSelect: (section: MobileSectionCapability['section']) => void
}) {
  const [open, setOpen] = useState(false)
  const currentEntry = MOBILE_SECTION_CAPABILITIES.find((s) => s.section === current) ?? MOBILE_SECTION_CAPABILITIES[0]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-500/60 bg-zinc-900 px-3 py-2.5"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          {currentEntry.label}
          <CapabilityBadge capability={currentEntry.capability} />
        </span>
        <ChevronDown className="h-4 w-4 text-zinc-400" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Jump to section">
        <div className="space-y-1">
          {MOBILE_SECTION_CAPABILITIES.map((entry) => (
            <button
              key={entry.section}
              type="button"
              onClick={() => {
                onSelect(entry.section)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm',
                entry.section === current ? 'bg-amber-500/10 text-amber-300' : 'text-zinc-200 hover:bg-zinc-850',
              )}
            >
              {entry.label}
              <CapabilityBadge capability={entry.capability} />
            </button>
          ))}
        </div>
      </Dialog>
    </>
  )
}
