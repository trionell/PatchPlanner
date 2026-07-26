import type { ReactNode } from 'react'
import { LayoutGrid, Plus, Search, Table2 } from 'lucide-react'
import type { PatchTab, PatchView } from '../../hooks/usePatchView'
import { PrintButton } from '../print/PrintButton'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

interface AudioPatchShellProps {
  tab: PatchTab
  view: PatchView
  onViewChange: (view: PatchView) => void
  search: string
  onSearchChange: (search: string) => void
  /** Opens the Rig drawer. Omitted for restricted roles; absent on no tab. */
  onOpenRig?: () => void
  /** Opens the Buses drawer. Inputs tab only — outputs have no bus membership. */
  onOpenBuses?: () => void
  /** Adds one row. Omitted for restricted roles. */
  onAdd?: () => void
  /** Extra toolbar controls, right of the search box — the canvas zoom in Flow. */
  toolbarExtras?: ReactNode
  /** The Sheet or the Flow canvas. */
  children: ReactNode
  /** The drawer components themselves, rendered as overlays outside the flow. */
  drawers?: ReactNode
}

const NOUNS: Record<PatchTab, { search: string; add: string }> = {
  inputs: { search: 'Find a channel…', add: 'Channel' },
  outputs: { search: 'Find an output…', add: 'Output' },
}

/**
 * The one surface both audio tabs render (Slice 23 FR-001/FR-002). Replaces
 * the five-or-six stacked cards each tab used to be with a single toolbar and
 * a single content area: which view you're in, what you're searching for, the
 * drawers, print, add. Everything else on the tab is content.
 *
 * The two tabs differ only in their columns, their canvas and the nouns above
 * — never in the shell itself, which is why the Rig drawer can be the same
 * component against the same data on both.
 *
 * A restricted role's controls are *omitted*, not disabled (the standing rule
 * from Slice 15): the caller simply passes no `onAdd`/`onOpenRig`.
 */
export function AudioPatchShell({
  tab,
  view,
  onViewChange,
  search,
  onSearchChange,
  onOpenRig,
  onOpenBuses,
  onAdd,
  toolbarExtras,
  children,
  drawers,
}: AudioPatchShellProps) {
  const nouns = NOUNS[tab]

  return (
    <div className="print:hidden">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 p-1">
          <Button size="sm" variant={view === 'sheet' ? 'default' : 'ghost'} onClick={() => onViewChange('sheet')} className="h-8">
            <Table2 className="mr-2 h-4 w-4" />Sheet
          </Button>
          <Button size="sm" variant={view === 'flow' ? 'default' : 'ghost'} onClick={() => onViewChange('flow')} className="h-8">
            <LayoutGrid className="mr-2 h-4 w-4" />Flow
          </Button>
        </div>

        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            className="h-9 pl-9"
            placeholder={nouns.search}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        {toolbarExtras}

        {onOpenRig && (
          <Button size="sm" variant="outline" onClick={onOpenRig}>
            Rig
          </Button>
        )}
        {onOpenBuses && (
          <Button size="sm" variant="outline" onClick={onOpenBuses}>
            Buses
          </Button>
        )}
        <PrintButton />
        {onAdd && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />{nouns.add}
          </Button>
        )}
      </div>

      {children}
      {drawers}
    </div>
  )
}
