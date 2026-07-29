import type { ReactNode } from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { Sheet } from '../../ui/Sheet'
import { InspectorHeader, InspectorRail } from './InspectorRail'
import { MICRO_LABEL } from './tokens'

/**
 * What holds a flow inspector: the rail on a desk, the un-scrimmed bottom sheet in a
 * hand (Slice 36, `patterns.md` §7f).
 *
 * **It renders `InspectorRail` and `InspectorHeader` rather than reimplementing them**,
 * so the desktop return is identical *by construction* — the same two components in the
 * same order, with the same props the inspectors passed before. That is a stronger
 * guarantee than any diff, and it is why this is a new component instead of a branch
 * inside the rail: the rail has a third caller, `StagePlotTab`, which passes a
 * `className` and supplies no header at all. Making the header part of the rail would
 * have made it optional there and turned one component into two shapes.
 *
 * The header moves from a child to a prop because on a phone those three things — what
 * the rail is showing, its vocabulary chip, the way out — are exactly what `ui/Sheet`'s
 * own header carries. `components.md` §5 wrote that down before this slice existed:
 * *"`title` (a node: the inspector puts a `MicroLabel` and a `Pill` there)"*.
 *
 * **No footer and no confirm**, at either width. The rail holds no draft and commits per
 * field (`components.md` §3), so a **Save** would imply a draft that does not exist.
 *
 * **And no scrim.** This is the one sheet read *against* what is behind it — you tapped
 * the node to find out about the node, and dimming it answers the wrong question.
 * `scrim={false}` renders no backdrop element at all, so the canvas stays pannable with
 * the inspector open; a transparent layer would satisfy the sentence and lose its point.
 */
export function InspectorFrame({
  heading,
  pill,
  onClose,
  children,
}: {
  /** What the frame is showing: "Source", "Stagebox", "Desk". */
  heading: string
  /** The vocabulary chip each canvas tints for itself. */
  pill?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Sheet
        onClose={onClose}
        open
        scrim={false}
        title={
          <>
            <span className={MICRO_LABEL}>{heading}</span>
            {pill}
          </>
        }
      >
        {children}
      </Sheet>
    )
  }

  return (
    <InspectorRail>
      <InspectorHeader label={heading} onClose={onClose} pill={pill} />
      {children}
    </InspectorRail>
  )
}
