import { useReferenceData } from '../../hooks/useReferenceData'
import type { AudioPatchOutput, StageMulti, Stagebox } from '../../types'
import { PrintSheet, sheetTd, sheetTh } from './PrintSheet'

const columns = ['Out#', 'Name', 'Type', 'Destination', 'Amp', 'Speaker', 'Cable', 'Length', 'Notes']

/** Paper rendering of the output patch (hidden on screen, shown in print). */
export function OutputPatchSheet({
  eventId,
  outputs,
  stageboxes,
  stageMultis,
  itemNameById,
}: {
  eventId: number
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  itemNameById: Map<number, string>
}) {
  const { label } = useReferenceData()
  const rows = [...outputs].sort((a, b) => a.output_number - b.output_number)

  return (
    <PrintSheet eventId={eventId} title="Output Patch" empty={rows.length === 0}>
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map((column) => <th key={column} className={sheetTh}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={sheetTd}>{row.output_number}</td>
              <td className={sheetTd}>{row.output_name || ''}</td>
              <td className={sheetTd}>{label('output_types', row.output_type)}</td>
              <td className={sheetTd}>{destinationText(row, stageboxes, stageMultis)}</td>
              <td className={sheetTd}>{row.amplifier_item_id ? itemNameById.get(row.amplifier_item_id) ?? `#${row.amplifier_item_id}` : ''}</td>
              <td className={sheetTd}>{row.speaker_item_id ? itemNameById.get(row.speaker_item_id) ?? `#${row.speaker_item_id}` : ''}</td>
              <td className={sheetTd}>{label('speaker_cable_types', row.cable_type)}</td>
              <td className={sheetTd}>{row.cable_length_m > 0 ? `${row.cable_length_m} m` : ''}</td>
              <td className={sheetTd}>{row.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSheet>
  )
}

function destinationText(row: AudioPatchOutput, stageboxes: Stagebox[], stageMultis: StageMulti[]): string {
  if (row.destination_type === 'stagebox') {
    const name = stageboxes.find((sb) => sb.id === row.stagebox_id)?.name ?? (row.stagebox_id ? `#${row.stagebox_id}` : '—')
    return `SB ${name} ch ${row.stagebox_channel ?? '—'}`
  }
  if (row.destination_type === 'stage_multi') {
    const name = stageMultis.find((sm) => sm.id === row.stage_multi_id)?.name ?? (row.stage_multi_id ? `#${row.stage_multi_id}` : '—')
    return `Multi ${name} ch ${row.stage_multi_channel ?? '—'}`
  }
  return 'local'
}
