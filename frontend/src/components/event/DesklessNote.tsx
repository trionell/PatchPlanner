import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { placeOnConsole } from '../../api/audioPatch'
import { previewHasLines } from '../../lib/deskPreview'
import type { Console, DeskMapping } from '../../types'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'
import { DeskMappingDialog } from './DeskMappingDialog'

interface DesklessNoteProps {
  eventId: number
  kind: 'channels' | 'outputs'
  /** The rows on no desk; outputs are placed by id, channels all at once. */
  ids: number[]
  consoles: Console[]
  readOnly: boolean
  onOpenRig?: () => void
  onPlaced: () => Promise<void>
  /** 44 px targets in the hand. */
  hand?: boolean
}

/**
 * The No desk list's note (Slice 47, B4): amber in the gaps tint — a fact about the
 * plan, not an error in it — with one "Put on <desk>" per desk. Placing channels is
 * previewed when anything would move or land over; otherwise it is done at once.
 */
export function DesklessNote({ eventId, kind, ids, consoles, readOnly, onOpenRig, onPlaced, hand = false }: DesklessNoteProps) {
  const [placing, setPlacing] = useState<{ deskId: number; mapping: DeskMapping | null } | null>(null)
  const place = useMutation({
    mutationFn: ({ deskId, apply }: { deskId: number; apply: boolean }) =>
      placeOnConsole(eventId, deskId, kind === 'outputs' ? { output_ids: ids, apply } : { channel_ids: ids, apply }),
  })
  const apply = async (deskId: number) => {
    await place.mutateAsync({ deskId, apply: true })
    setPlacing(null)
    await onPlaced()
  }
  const putOn = async (deskId: number) => {
    if (kind === 'outputs') return apply(deskId)
    setPlacing({ deskId, mapping: null })
    const preview = await place.mutateAsync({ deskId, apply: false }).catch(() => null)
    if (!preview) return setPlacing(null)
    if (!previewHasLines(preview.mapping)) return apply(deskId)
    setPlacing({ deskId, mapping: preview.mapping })
  }
  if (ids.length === 0) return null
  const noun = kind === 'channels' ? 'channel' : 'output'
  const what = ids.length === 1 ? `This ${noun} is` : `These ${ids.length} ${noun}s are`
  const target = consoles.find((desk) => desk.id === placing?.deskId)?.name || 'desk'
  const buttonClass = hand ? 'h-11 px-3 text-sm' : undefined

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/[0.05] px-3 py-2 text-amber-200', hand ? 'text-sm' : 'text-xs')}>
        {consoles.length === 0 ? `${what} on no desk. Add the desk in Rig first.` : `${what} on no desk, and nothing checks ${ids.length === 1 ? 'it' : 'them'} until put on one.`}
        {!readOnly &&
          consoles.map((desk) => (
            <Button key={desk.id} size="xs" variant="outline" className={buttonClass} disabled={place.isPending} onClick={() => void putOn(desk.id)}>
              Put on {desk.name || 'Console'}
            </Button>
          ))}
        {!readOnly && consoles.length === 0 && onOpenRig && (
          <Button size="xs" variant="outline" className={buttonClass} onClick={onOpenRig}>
            Open Rig
          </Button>
        )}
        {place.error && <span className="w-full text-red-300">{place.error.message}</span>}
      </div>
      <DeskMappingDialog
        open={placing?.mapping != null}
        title={`Put on ${target}`}
        confirmLabel={`Put ${ids.length} on ${target}`}
        mapping={placing?.mapping ?? null}
        pending={place.isPending}
        error={place.error?.message}
        onCancel={() => setPlacing(null)}
        onConfirm={() => placing && void apply(placing.deskId)}
      />
    </>
  )
}
