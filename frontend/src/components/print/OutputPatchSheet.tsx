import { useReferenceData } from '../../hooks/useReferenceData'
import { hopCableLabel, hopCableLabelB, hopLabel, hopLabelB } from '../../lib/outputChain'
import type { AudioPatchOutput, OutputDevice, StageMulti, Stagebox } from '../../types'
import { ColorSwatch, PrintSheet, sheetTd, sheetTh } from './PrintSheet'

const columns = ['Out#', 'Name', 'Type', 'Chain', 'Notes']

/** Paper rendering of the output patch (hidden on screen, shown in print). */
export function OutputPatchSheet({
  eventId,
  outputs,
  stageboxes,
  stageMultis,
  outputDevices,
  itemLabelById,
  ownedItemLabelById,
}: {
  eventId: number
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  outputDevices: OutputDevice[]
  /** Catalog item labels (name — description) for device/cable picks. */
  itemLabelById: Map<number, string>
  /** Owned-gear item labels, for owned device picks. */
  ownedItemLabelById: Map<number, string>
}) {
  const { label } = useReferenceData()
  const rows = [...outputs].sort((a, b) => a.output_number - b.output_number)
  const hopContext = { stageboxes, stageMultis, outputDevices, itemLabelById, ownedItemLabelById, cableLabel: (value: string) => label('speaker_cable_types', value) }

  return (
    <PrintSheet eventId={eventId} title="Output Patch" empty={rows.length === 0}>
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map((column) => <th key={column} className={sheetTh}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={sheetTd}><ColorSwatch color={row.color} />{row.output_number}</td>
              <td className={sheetTd}>{row.output_name || ''}</td>
              <td className={sheetTd}>{label('output_types', row.output_type)}</td>
              <td className={sheetTd}>
                {row.chain.length === 0 ? (
                  <div>direct</div>
                ) : (
                  row.chain.map((hop, index) => {
                    const cable = hopCableLabel(hop, hopContext)
                    const cableB = hopCableLabelB(hop, hopContext)
                    const sideB = hopLabelB(hop, hopContext)
                    return (
                      <div key={index}>
                        {index + 1}. {hopLabel(hop, hopContext)}
                        {cable && ` — ${cable}`}
                        {cableB && ` / B: ${cableB}`}
                        {sideB && <div className="pl-3">↳ B: {sideB}</div>}
                      </div>
                    )
                  })
                )}
              </td>
              <td className={sheetTd}>{row.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSheet>
  )
}
