import type { InputFlowContext } from '../../lib/inputSignalFlow'
import { inputChainSegments, type ChainCellModel } from '../../lib/patchSheet'
import type { Console, InputCable, InputChannel, InputDevice, InputSource, MixerDCA, MixerGroup, StageMulti, Stagebox } from '../../types'
import { ChainText } from './ChainText'
import { ColorSwatch, PrintSheet, sheetTd, sheetTh } from './PrintSheet'

// Same columns as the on-screen sheet, in the same order (Slice 23 FR-017).
const columns = ['Ch', 'Name', 'W', 'Chain', '48 V', 'Groups', 'DCA', 'Notes']

/** Paper rendering of the input patch (hidden on screen, shown in print) — walks input_cables backward from each channel (research.md R8), same convention as the output patch sheet's forward walk. */
export function InputPatchSheet({
  eventId,
  channels,
  sources,
  devices,
  stageboxes,
  stageMultis,
  cables,
  groups,
  dcas,
  consoles,
  itemLabelById,
}: {
  eventId: number
  channels: InputChannel[]
  sources: InputSource[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
  groups: MixerGroup[]
  dcas: MixerDCA[]
  /** The event's desks, so a hop through a local jack names the console. */
  consoles?: Console[]
  /** Catalog item labels (name — description) for source/cable picks. */
  itemLabelById: Map<number, string>
}) {
  const context: InputFlowContext = { sources, channels, devices, stageboxes, stageMultis, cables, itemLabelById, consoles }
  const rows = [...channels]
    .sort((a, b) => a.channel_number - b.channel_number)
    .map((channel) => ({ channel, chain: inputChainSegments(channel, context) }))

  return (
    <PrintSheet eventId={eventId} title="Input Patch" empty={rows.length === 0}>
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map((column) => <th key={column} className={sheetTh}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(({ channel, chain }) => (
            <tr key={channel.id}>
              <td className={sheetTd}><ColorSwatch color={channel.color} />{channel.channel_number}</td>
              <td className={sheetTd}>{channel.channel_name ?? ''}</td>
              <td className={sheetTd}>{channel.width === 'stereo' ? 'S' : 'M'}</td>
              <td className={sheetTd}><ChainText model={chain} /></td>
              <td className={sheetTd}>{phantomFor(chain, sources) ? '48 V' : ''}</td>
              <td className={sheetTd}><BusNames ids={channel.group_ids} buses={groups} /></td>
              <td className={sheetTd}><BusNames ids={channel.dca_ids} buses={dcas} /></td>
              <td className={sheetTd}>{channel.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSheet>
  )
}

/** Whether any Source feeding this channel has phantom power switched on. */
function phantomFor(chain: ChainCellModel, sources: InputSource[]): boolean {
  const ids = chain.lines.flatMap((line) =>
    line.segments.filter((segment) => segment.node?.kind === 'source').map((segment) => segment.node!.id),
  )
  return sources.some((source) => ids.includes(source.id) && source.phantom_power)
}

/**
 * Comma-separated bus names in the event's canonical order, each tinted by
 * its bus color (kept in print via print-color-adjust). Empty membership
 * renders an empty cell.
 */
function BusNames({ ids, buses }: { ids?: number[]; buses: { id: number; name: string; color?: string }[] }) {
  const members = buses.filter((bus) => ids?.includes(bus.id))
  return (
    <>
      {members.map((bus, index) => (
        <span key={bus.id}>
          <span
            style={bus.color ? { backgroundColor: bus.color, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', padding: '0 2px', borderRadius: 2 } : undefined}
          >
            {bus.name}
          </span>
          {index < members.length - 1 ? ', ' : ''}
        </span>
      ))}
    </>
  )
}
