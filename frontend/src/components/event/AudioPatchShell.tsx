import type { ReactNode } from 'react'
import { LayoutGrid, Plus, Search, Table2 } from 'lucide-react'
import type { PatchTab, PatchView } from '../../hooks/usePatchView'
import { audioExportPdfUrl } from '../../api/audio'
import { ExportPdfButton } from '../print/ExportPdfButton'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { PatchPanel } from '../ui/PatchPanel'

interface AudioPatchShellProps {
  tab: PatchTab
  /** The event whose audio documentation the export downloads. */
  eventId: number
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

const NOUNS: Record<PatchTab, { title: string; search: string; add: string }> = {
  inputs: { title: 'Audio inputs', search: 'Find a channel…', add: 'Channel' },
  outputs: { title: 'Audio outputs', search: 'Find an output…', add: 'Output' },
}

/**
 * The one surface both audio tabs render (Slice 23 FR-001/FR-002), now as a single
 * framed panel (Slice 25 FR-010/FR-011): the bar, the content, the status strip.
 *
 * The two tabs differ only in their columns, their canvas and the nouns above —
 * never in the shell itself, which is why the Rig drawer can be the same component
 * against the same data on both.
 *
 * The bar carries the tab's own name, as the mockup does. It duplicates the tab
 * strip above it, and that is deliberate: the name is what anchors a panel that now
 * has a top edge of its own.
 *
 * A restricted role's controls are *omitted*, not disabled (the standing rule from
 * Slice 15): the caller simply passes no `onAdd`/`onOpenRig`.
 */
export function AudioPatchShell({
  tab,
  eventId,
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
      <PatchPanel
        bar={
          <>
            <span className="mr-1 shrink-0 text-sm font-semibold text-zinc-100">{nouns.title}</span>

            <div className="inline-flex shrink-0 rounded-md border border-zinc-700 bg-zinc-900 p-0.5">
              <Button size="sm" variant={view === 'sheet' ? 'default' : 'ghost'} onClick={() => onViewChange('sheet')} className="h-6 px-2 text-xs">
                <Table2 className="mr-1.5 h-3.5 w-3.5" />Sheet
              </Button>
              <Button size="sm" variant={view === 'flow' ? 'default' : 'ghost'} onClick={() => onViewChange('flow')} className="h-6 px-2 text-xs">
                <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />Flow
              </Button>
            </div>

            <div className="relative min-w-[10rem] max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                size="sm"
                className="pl-7"
                placeholder={nouns.search}
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </div>

            {onOpenRig && (
              <Button size="xs" variant="outline" onClick={onOpenRig}>
                Rig
              </Button>
            )}
            {onOpenBuses && (
              <Button size="xs" variant="outline" onClick={onOpenBuses}>
                Buses
              </Button>
            )}

            {/* The zoom control, in Flow. It used to sit in a strip between the
                toolbar and the canvas, which is the thing that broke the panel's
                one-frame reading (Slice 25 FR-020). */}
            {toolbarExtras}

            <span className="flex-1" />

            <ExportPdfButton href={audioExportPdfUrl(eventId)} />
            {onAdd && (
              <Button size="xs" onClick={onAdd}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />{nouns.add}
              </Button>
            )}
          </>
        }
      >
        {children}
      </PatchPanel>
      {drawers}
    </div>
  )
}
