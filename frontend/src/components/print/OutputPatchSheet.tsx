import { useReferenceData } from '../../hooks/useReferenceData'
import { legacyCableText } from '../../lib/utils'
import type { AudioPatchOutput, StageMulti, Stagebox } from '../../types'
import { PrintSheet, sheetTd, sheetTh } from './PrintSheet'

const columns = ['Out#', 'Name', 'Type', 'Destination', 'Amp', 'Speaker', 'Cable', 'Notes']

/** Paper rendering of the output patch (hidden on screen, shown in print). */
export function OutputPatchSheet({
  eventId,
  outputs,
  stageboxes,
  stageMultis,
  itemLabelById,
}: {
  eventId: number
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  /** Catalog item labels (name — description) for amp/speaker/cable picks. */
  itemLabelById: Map<number, string>
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
              <td className={sheetTd}>{row.amplifier_item_id ? itemLabelById.get(row.amplifier_item_id) ?? `#${row.amplifier_item_id}` : ''}</td>
              <td className={sheetTd}>{row.speaker_item_id ? itemLabelById.get(row.speaker_item_id) ?? `#${row.speaker_item_id}` : ''}</td>
              <td className={sheetTd}>{cableText(row, itemLabelById, label)}</td>
              <td className={sheetTd}>{row.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSheet>
  )
}

function cableText(row: AudioPatchOutput, itemLabelById: Map<number, string>, label: (vocabulary: string, value?: string) => string): string {
  if (row.cable_item_id) return itemLabelById.get(row.cable_item_id) ?? `#${row.cable_item_id}`
  if (row.cable_type) return legacyCableText(row.cable_type, row.cable_length_m, (value) => label('speaker_cable_types', value))
  return ''
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
