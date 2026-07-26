import type { ReactNode } from 'react'
import type { InventoryItem, StageMulti, Stagebox } from '../../types'
import { Drawer } from '../ui/Drawer'
import { StageboxMultiSection } from './StageboxMultiSection'

interface RigDrawerProps {
  open: boolean
  onClose: () => void
  eventId: number
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  audioItems: InventoryItem[]
  /** The consoles section, rendered first — signal order starts at the desk. */
  consoleSection?: ReactNode
  /**
   * The tab's own device sections — processing devices on Inputs, processing
   * plus output devices on Outputs. Passed in rather than branched on here,
   * so this component stays identical on both tabs.
   */
  deviceSections?: ReactNode
  /** How many rows in here become rental lines, for the footer. */
  itemCount: number
  readOnly?: boolean
}

/**
 * Every box the signal passes through, declared once (Slice 23 FR-003). This
 * is where four of the old cards went: stageboxes, stage multis, and the two
 * device sections. It is the same drawer on both audio tabs against the same
 * event-scoped data, so a stagebox declared on Inputs needs no re-declaring
 * on Outputs.
 *
 * Sections read in signal order, starting at the desk.
 */
export function RigDrawer({
  open,
  onClose,
  eventId,
  stageboxes,
  stageMultis,
  audioItems,
  consoleSection,
  deviceSections,
  itemCount,
  readOnly = false,
}: RigDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Rig"
      subtitle="Shared by Audio Inputs and Audio Outputs"
      width="wide"
      footer={<>Every row here is one line on the rental order · {itemCount} {itemCount === 1 ? 'item' : 'items'}</>}
    >
      {consoleSection}
      <StageboxMultiSection
        eventId={eventId}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        audioItems={audioItems}
        readOnly={readOnly}
      />
      {deviceSections}
    </Drawer>
  )
}
