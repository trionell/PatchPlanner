import { useReferenceData } from '../../hooks/useReferenceData'
import { outputChainSegments } from '../../lib/patchSheet'
import type { OutputFlowContext } from '../../lib/signalFlow'
import type { AudioPatchOutput, Console, OutputCable, OutputDevice, StageMulti, Stagebox } from '../../types'
import { ChainText } from './ChainText'
import { ColorSwatch, PrintSheet, sheetTd, sheetTh } from './PrintSheet'

// Same columns as the on-screen sheet, in the same order (Slice 23 FR-017).
const columns = ['Out', 'Name', 'Type', 'W', 'Chain', 'Notes']

/** Paper rendering of the output patch (hidden on screen, shown in print). */
export function OutputPatchSheet({
  eventId,
  outputs,
  stageboxes,
  stageMultis,
  outputDevices,
  outputCables,
  itemLabelById,
  consoles,
}: {
  eventId: number
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  outputDevices: OutputDevice[]
  outputCables: OutputCable[]
  /** Catalog item labels (name — description) for device/cable picks. */
  itemLabelById: Map<number, string>
  /** The event's desks — each output's chain is headed by the one it comes off. */
  consoles?: Console[]
}) {
  const { label } = useReferenceData(eventId)
  const context: OutputFlowContext = { stageboxes, stageMultis, devices: outputDevices, cables: outputCables, itemLabelById }
  const rows = [...outputs]
    .sort((a, b) => a.output_number - b.output_number)
    .map((output) => ({
      output,
      chain: outputChainSegments(output, context, {
        consoleLabel: consoles?.find((console) => console.id === output.console_id)?.name || undefined,
        consoles,
      }),
    }))

  return (
    <PrintSheet eventId={eventId} title="Output Patch" empty={rows.length === 0}>
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map((column) => <th key={column} className={sheetTh}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(({ output, chain }) => (
            <tr key={output.id}>
              <td className={sheetTd}><ColorSwatch color={output.color} />{output.output_number}</td>
              <td className={sheetTd}>{output.output_name || ''}</td>
              <td className={sheetTd}>{label('output_types', output.output_type)}</td>
              <td className={sheetTd}>{output.width === 'stereo' ? 'S' : 'M'}</td>
              <td className={sheetTd}><ChainText model={chain} /></td>
              <td className={sheetTd}>{output.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSheet>
  )
}
