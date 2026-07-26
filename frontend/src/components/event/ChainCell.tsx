import { useState } from 'react'
import { ArrowRight, Unplug } from 'lucide-react'
import type { ChainCellModel, ChainSegment, SegmentNode } from '../../lib/patchSheet'
import { truncateSegments } from '../../lib/patchSheet'
import { itemLabel } from '../../lib/utils'
import type { InventoryItem } from '../../types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'

/** What the sheet knows about the cable behind one hop. */
export interface HopCable {
  id: number
  cableItemId?: number
  /**
   * The edge is pure console/network routing, never a physical cable (a stage
   * multi's own body, a stagebox's console-side hop into a channel). The
   * backend refuses an item on these, so the picker doesn't offer one.
   */
  cableless: boolean
}

interface ChainCellProps {
  model: ChainCellModel
  /** How many hops fit before the chain truncates from the middle. */
  maxSegments?: number
  cableItems: InventoryItem[]
  /** Resolves a segment's `cableId` to what the picker needs. */
  hopCable: (cableId: number) => HopCable | undefined
  onChangeCableItem: (cableId: number, itemId: number | undefined) => void
  onUnpatch: (cableId: number) => void
  /** Switches to Flow with this node selected — where cabling is decided. */
  onEditInFlow?: (node: SegmentNode) => void
  readOnly?: boolean
}

/**
 * A row's whole signal path on one line (Slice 23 FR-009 to FR-012). Every hop
 * is its own click target, opening a picker scoped to that hop alone.
 *
 * What the picker offers is deliberately narrower than "repatch anything": the
 * cable pick (the part that reaches the rental order), unpatching, and a jump
 * into Flow with the node selected. Moving a signal to a *different jack* stays
 * in Flow, because a stagebox jack is one physical pass-through pair — index N
 * in is index N out — so moving it means moving two cables, and this project's
 * convention for moving a cable is delete-then-create
 * (contracts/input-graph-api.md). Four sequential mutations behind one click
 * can leave a channel unpatched halfway through; dragging it in Flow cannot.
 */
export function ChainCell({
  model,
  maxSegments = 5,
  cableItems,
  hopCable,
  onChangeCableItem,
  onUnpatch,
  onEditInFlow,
  readOnly = false,
}: ChainCellProps) {
  const [openHop, setOpenHop] = useState<{ segment: ChainSegment; cable?: HopCable } | null>(null)

  return (
    <div className="space-y-0.5">
      {model.lines.map((line, lineIndex) => {
        const { segments, hidden } = truncateSegments(line.segments, maxSegments)
        return (
          <div key={lineIndex} className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm">
            {line.sideLabel && <span className="mr-0.5 font-mono text-[11px] text-zinc-500">{line.sideLabel}</span>}
            {segments.map((segment, index) => (
              <span key={`${segment.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <ArrowRight className="h-3 w-3 shrink-0 text-zinc-600" aria-hidden />}
                {index === 1 && hidden > 0 && (
                  <span title={`${hidden} more hops`} className="font-mono text-[11px] text-zinc-500">
                    ⋯{hidden}
                    <ArrowRight className="ml-1 inline h-3 w-3 text-zinc-600" aria-hidden />
                  </span>
                )}
                <HopChip
                  segment={segment}
                  onClick={
                    segment.cableId != null && !readOnly
                      ? () => setOpenHop({ segment, cable: hopCable(segment.cableId!) })
                      : undefined
                  }
                />
              </span>
            ))}
          </div>
        )
      })}

      {openHop && (
        <HopDialog
          segment={openHop.segment}
          cable={openHop.cable}
          cableItems={cableItems}
          onClose={() => setOpenHop(null)}
          onChangeCableItem={(itemId) => {
            if (openHop.segment.cableId != null) onChangeCableItem(openHop.segment.cableId, itemId)
            setOpenHop(null)
          }}
          onUnpatch={() => {
            if (openHop.segment.cableId != null) onUnpatch(openHop.segment.cableId)
            setOpenHop(null)
          }}
          onEditInFlow={
            openHop.segment.node && onEditInFlow
              ? () => {
                  onEditInFlow(openHop.segment.node!)
                  setOpenHop(null)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function HopChip({ segment, onClick }: { segment: ChainSegment; onClick?: () => void }) {
  const tone = segment.missing
    ? 'text-red-400'
    : segment.kind === 'channel'
      ? 'text-zinc-300'
      : segment.kind === 'source'
        ? 'text-zinc-200'
        : 'text-zinc-400'
  if (!onClick) return <span className={`whitespace-nowrap ${tone}`}>{segment.label}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded px-1 -mx-1 hover:bg-zinc-800 hover:text-zinc-100 ${tone}`}
    >
      {segment.label}
    </button>
  )
}

function HopDialog({
  segment,
  cable,
  cableItems,
  onClose,
  onChangeCableItem,
  onUnpatch,
  onEditInFlow,
}: {
  segment: ChainSegment
  cable?: HopCable
  cableItems: InventoryItem[]
  onClose: () => void
  onChangeCableItem: (itemId: number | undefined) => void
  onUnpatch: () => void
  onEditInFlow?: () => void
}) {
  const [itemId, setItemId] = useState<number | undefined>(cable?.cableItemId)

  return (
    <Dialog open onClose={onClose} title={segment.label} className="max-w-md">
      <div className="space-y-4">
        {cable?.cableless ? (
          <p className="text-sm text-zinc-400">
            Network routing, not a physical cable — nothing to pick, and nothing on the rental order.
          </p>
        ) : (
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Cable</span>
            <Select value={itemId ?? ''} onChange={(event) => setItemId(event.target.value ? Number(event.target.value) : undefined)}>
              <option value="">No cable picked</option>
              {cableItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {itemLabel(item)}
                </option>
              ))}
            </Select>
          </label>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={onUnpatch}>
              <Unplug className="mr-2 h-4 w-4" />Unpatch
            </Button>
            {onEditInFlow && (
              <Button size="sm" variant="outline" onClick={onEditInFlow}>
                Edit in Flow
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {!cable?.cableless && (
              <Button size="sm" onClick={() => onChangeCableItem(itemId)}>
                Save
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
