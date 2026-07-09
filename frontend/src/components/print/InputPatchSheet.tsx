import { useReferenceData } from '../../hooks/useReferenceData'
import { legacyCableText } from '../../lib/utils'
import type { AudioPatchInput, MixerDCA, MixerGroup, StageMulti, Stagebox } from '../../types'
import { ColorSwatch, PrintSheet, sheetTd, sheetTh } from './PrintSheet'

const columns = ['Ch#', 'Name', 'Type', 'Connector', 'Source', 'Stand', 'Cable', '48V', 'Routing', 'Groups', 'DCA', 'Notes']

/** Paper rendering of the input patch (hidden on screen, shown in print). */
export function InputPatchSheet({
  eventId,
  inputs,
  stageboxes,
  stageMultis,
  groups,
  dcas,
  itemLabelById,
}: {
  eventId: number
  inputs: AudioPatchInput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  groups: MixerGroup[]
  dcas: MixerDCA[]
  /** Catalog item labels (name — description) for mic/cable/stand picks. */
  itemLabelById: Map<number, string>
}) {
  const { label } = useReferenceData()
  const rows = [...inputs].sort((a, b) => a.channel_number - b.channel_number)

  return (
    <PrintSheet eventId={eventId} title="Input Patch" empty={rows.length === 0}>
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map((column) => <th key={column} className={sheetTh}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={sheetTd}><ColorSwatch color={row.color} />{row.channel_number}</td>
              <td className={sheetTd}>{row.channel_name || ''}</td>
              <td className={sheetTd}>{label('signal_types', row.signal_type)}</td>
              <td className={sheetTd}>{label('preamp_connectors', row.preamp_connector)}</td>
              <td className={sheetTd}>{sourceName(row, itemLabelById)}</td>
              <td className={sheetTd}>{standText(row, itemLabelById, label)}</td>
              <td className={sheetTd}>{cableText(row, itemLabelById, label)}</td>
              <td className={sheetTd}>{row.phantom_power ? '✓' : ''}</td>
              <td className={sheetTd}>{routingText(row, stageboxes, stageMultis)}</td>
              <td className={sheetTd}><BusNames ids={row.group_ids} buses={groups} /></td>
              <td className={sheetTd}><BusNames ids={row.dca_ids} buses={dcas} /></td>
              <td className={sheetTd}>{row.notes || ''}</td>
            </tr>
          ))}
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

function sourceName(row: AudioPatchInput, itemLabelById: Map<number, string>): string {
  if (row.mic_item_id) return itemLabelById.get(row.mic_item_id) ?? row.mic_label ?? `#${row.mic_item_id}`
  return row.mic_label || '—'
}

function cableText(row: AudioPatchInput, itemLabelById: Map<number, string>, label: (vocabulary: string, value?: string) => string): string {
  if (row.cable_item_id) return itemLabelById.get(row.cable_item_id) ?? `#${row.cable_item_id}`
  if (row.cable_type) return legacyCableText(row.cable_type, row.cable_length_m, (value) => label('signal_cable_types', value))
  return ''
}

function standText(row: AudioPatchInput, itemLabelById: Map<number, string>, label: (vocabulary: string, value?: string) => string): string {
  if (row.stand_item_id) return itemLabelById.get(row.stand_item_id) ?? `#${row.stand_item_id}`
  return label('mic_stands', row.mic_stand)
}

function routingText(row: AudioPatchInput, stageboxes: Stagebox[], stageMultis: StageMulti[]): string {
  if (row.stagebox_id) {
    const name = stageboxes.find((sb) => sb.id === row.stagebox_id)?.name ?? `#${row.stagebox_id}`
    return `SB ${name} ch ${row.stagebox_channel ?? '—'}`
  }
  if (row.stage_multi_id) {
    const name = stageMultis.find((sm) => sm.id === row.stage_multi_id)?.name ?? `#${row.stage_multi_id}`
    return `Multi ${name} ch ${row.stage_multi_channel ?? '—'}`
  }
  return 'direct'
}
