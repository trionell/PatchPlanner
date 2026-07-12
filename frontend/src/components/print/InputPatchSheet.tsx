import { buildInputChannelFlows, type InputFlowContext } from '../../lib/inputSignalFlow'
import type { InputCable, InputChannel, InputDevice, InputSource, MixerDCA, MixerGroup, StageMulti, Stagebox } from '../../types'
import { ColorSwatch, PrintSheet, sheetTd, sheetTh } from './PrintSheet'

const columns = ['Ch#', 'Name', 'Signal path', 'Groups', 'DCA', 'Notes']

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
  /** Catalog item labels (name — description) for source/cable picks. */
  itemLabelById: Map<number, string>
}) {
  const context: InputFlowContext = { sources, channels, devices, stageboxes, stageMultis, cables, itemLabelById }
  const flows = buildInputChannelFlows(channels, context)
  const channelById = new Map(channels.map((c) => [c.channel_number, c]))

  return (
    <PrintSheet eventId={eventId} title="Input Patch" empty={flows.length === 0}>
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map((column) => <th key={column} className={sheetTh}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {flows.map((flow) => {
            const channel = channelById.get(flow.channelNumber)
            return (
              <tr key={flow.channelNumber}>
                <td className={sheetTd}><ColorSwatch color={channel?.color} />{flow.channelNumber}</td>
                <td className={sheetTd}>{flow.channelName}</td>
                <td className={sheetTd}>
                  {flow.paths.map((path, pathIndex) => (
                    <div key={pathIndex} className={flow.paths.length > 1 ? 'mb-1' : undefined}>
                      {path.sideLabel && <span className="text-zinc-500">{path.sideLabel}: </span>}
                      {path.hops.length === 0 ? (
                        <span className="text-red-400">no source connected</span>
                      ) : (
                        path.hops.map((hop, i) => (
                          <div key={i} style={{ paddingLeft: i * 12 }}>
                            {i > 0 && '↳ '}{hop.label}
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </td>
                <td className={sheetTd}><BusNames ids={channel?.group_ids} buses={groups} /></td>
                <td className={sheetTd}><BusNames ids={channel?.dca_ids} buses={dcas} /></td>
                <td className={sheetTd}>{channel?.notes || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </PrintSheet>
  )
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
