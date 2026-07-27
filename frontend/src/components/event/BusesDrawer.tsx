import type { InputChannel, MixerDCA, MixerGroup } from '../../types'
import { Drawer } from '../ui/Drawer'
import { BusSection } from './BusSection'

interface BusesDrawerProps {
  open: boolean
  onClose: () => void
  eventId: number
  groups: MixerGroup[]
  dcas: MixerDCA[]
  channels: InputChannel[]
  readOnly?: boolean
}

/**
 * Groups and DCAs (Slice 23 FR-004). The smallest of the drawers and the one
 * that changes least — `BusSection` already shows each bus's assigned-channel
 * count, which is what makes deleting one not a guess. Narrower than Rig, and
 * absent from the Outputs tab entirely, since an output has no group or DCA
 * membership.
 */
export function BusesDrawer({ open, onClose, eventId, groups, dcas, channels, readOnly = false }: BusesDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Buses"
      subtitle="Mix groups and DCAs for this event"
      width="narrow"
      footer={<>A bus colour tints its chip everywhere it appears — the sheet, the print sheets and the stage plot.</>}
    >
      <BusSection eventId={eventId} groups={groups} dcas={dcas} channels={channels} readOnly={readOnly} />
    </Drawer>
  )
}
