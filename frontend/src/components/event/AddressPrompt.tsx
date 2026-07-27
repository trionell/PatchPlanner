import { type AddressGroup, UNIVERSE_SIZE, formatSpan } from '../../lib/dmxMap'
import type { MakeRoomPlan } from '../../lib/dmxPlan'
import { Button } from '../ui/Button'

/**
 * What happens when the address you asked for is already taken (Slice 27 US5).
 *
 * Not a dialog: the tab went from two dialogs to none in US3, and reintroducing
 * one here would be the same mistake in a different place — an overlay for a
 * decision that belongs to the row being edited. It renders in `RowEditor`'s
 * `notice` slot, inside the editor's own amber body, and participates in the same
 * flex flow as the fields so it cannot land on top of one at any width.
 *
 * Amber rather than red: `design/tokens.md` §5 gives red to *over capacity* and
 * amber to a state needing a decision, and this is a question, not a verdict.
 *
 * **The availability of each answer is itself information.** Place anyway is
 * always there, which is what keeps "nothing is ever blocked" true. Share address
 * appears only on an exact match of address *and* channel count, so its presence
 * says the two fixtures really are interchangeable. Make room is absent only when
 * it cannot fit — and then the sentence says why, because a disabled control that
 * does not explain itself is what P7 exists to prevent.
 */

interface AddressPromptProps {
  /** The groups the proposed span would touch, ascending. */
  inTheWay: AddressGroup[]
  /** Names a fixture the way the sheet does. */
  labelOf: (fixtureId: number) => string
  makeRoom: MakeRoomPlan
  /** True when the proposed span exactly matches an existing group. */
  canShare: boolean
  pending?: boolean
  onMakeRoom: () => void
  onShare: () => void
  onPlaceAnyway: () => void
  onBack: () => void
}

export function AddressPrompt({
  inTheWay,
  labelOf,
  makeRoom,
  canShare,
  pending = false,
  onMakeRoom,
  onShare,
  onPlaceAnyway,
  onBack,
}: AddressPromptProps) {
  const first = inTheWay[0]
  const firstLabel = first ? labelOf(first.fixtureIds[0]) : 'Another fixture'
  const followers = makeRoom.movedFixtureCount - (first?.fixtureIds.length ?? 0)

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-2.5 py-2 text-xs text-amber-200">
      <span>
        <b className="font-semibold text-amber-100">{formatSpan(first?.start, first?.count)} is taken.</b>{' '}
        {firstLabel} sits at {formatSpan(first?.start, first?.count)}
        {first?.shared && ` with ${first.fixtureIds.length - 1} other${first.fixtureIds.length > 2 ? 's' : ''}`}
        {followers > 0 && `, and ${followers} fixture${followers === 1 ? '' : 's'} follow${followers === 1 ? 's' : ''} it`}.
        {canShare && <span className="ml-1 text-zinc-400">Same address, same mode — this one can join them.</span>}
        {!makeRoom.possible && (
          <span className="ml-1 text-zinc-400">Making room would push a fixture past {UNIVERSE_SIZE}.</span>
        )}
      </span>

      <span className="ml-auto flex flex-wrap items-center gap-1.5">
        {canShare && (
          <Button size="xs" variant="outline" disabled={pending} onClick={onShare}>
            Share address
          </Button>
        )}
        {makeRoom.possible && (
          <Button size="xs" variant="outline" disabled={pending} onClick={onMakeRoom}>
            Make room · moves {makeRoom.movedFixtureCount}
          </Button>
        )}
        <Button size="xs" variant="ghost" disabled={pending} onClick={onPlaceAnyway}>
          Place anyway
        </Button>
        <Button size="xs" variant="ghost" disabled={pending} onClick={onBack}>
          Back
        </Button>
      </span>
    </div>
  )
}
