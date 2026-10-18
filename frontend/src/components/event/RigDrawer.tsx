import type { ReactNode } from 'react'
import type { InputCable, InventoryItem, OutputCable, StageMulti, Stagebox } from '../../types'
import { Drawer } from '../ui/Drawer'
import { StageboxSection } from './StageboxSection'
import { StageMultiSection } from './StageMultiSection'

interface RigDrawerProps {
  open: boolean
  onClose: () => void
  eventId: number
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  audioItems: InventoryItem[]
  /**
   * Both graphs' cables, kept apart. A stagebox is used on the input side and the
   * output side, and each is sized by its own count — Inputs on one graph, Outputs
   * on the other — so its card answers "is this box big enough?" per side (D8).
   */
  inputCables: InputCable[]
  outputCables: OutputCable[]
  /** The consoles section, rendered first — signal order starts at the desk. */
  consoleSection?: ReactNode
  /**
   * The tab's own device sections — processing devices on Inputs, processing
   * plus destinations on Outputs. Passed in rather than branched on here,
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
 * Sections read in signal order, starting at the desk, and every one of them is
 * full width — the stagebox/multi pair used to sit in two columns here, which is
 * what left their fields too narrow to type into (Slice 24 FR-018).
 */
export function RigDrawer({
  open,
  onClose,
  eventId,
  stageboxes,
  stageMultis,
  audioItems,
  inputCables,
  outputCables,
  consoleSection,
  deviceSections,
  itemCount,
  readOnly = false,
}: RigDrawerProps) {
  const cables = [...inputCables, ...outputCables]
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
      <StageboxSection eventId={eventId} stageboxes={stageboxes} audioItems={audioItems} inputCables={inputCables} outputCables={outputCables} readOnly={readOnly} />
      <StageMultiSection
        eventId={eventId}
        stageMultis={stageMultis}
        stageboxCount={stageboxes.length}
        audioItems={audioItems}
        cables={cables}
        readOnly={readOnly}
      />
      {deviceSections}
    </Drawer>
  )
}
