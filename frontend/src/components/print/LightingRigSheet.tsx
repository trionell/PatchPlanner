import { useReferenceData } from '../../hooks/useReferenceData'
import { formatDMXRange } from '../../lib/utils'
import type { LightingFixture } from '../../types'
import { PrintSheet, sheetTd, sheetTh } from './PrintSheet'

const columns = ['FID', '#', 'Fixture', 'Truss', 'Universe', 'Address', 'Mode', 'Ch', 'Power', 'Notes']

/** Paper rendering of the lighting rig (hidden on screen, shown in print). */
export function LightingRigSheet({
  eventId,
  fixtures,
}: {
  eventId: number
  fixtures: LightingFixture[]
}) {
  const { label } = useReferenceData(eventId)
  const rows = [...fixtures].sort((a, b) => a.position_index - b.position_index)

  const powerText = (fixture: LightingFixture): string => {
    const out = fixture.power_connector_out ? ` → ${label('power_connectors', fixture.power_connector_out)}` : ''
    if (fixture.power_connection === 'chain') {
      const parent = rows.find((row) => row.id === fixture.power_chain_parent_id)
      const parentRef = parent ? `#${rows.indexOf(parent) + 1}` : '?'
      return `chain ← ${parentRef}${out}`
    }
    return `grid ${label('power_connectors', fixture.power_connector_in)}${out}`
  }

  return (
    <PrintSheet eventId={eventId} title="Lighting Rig" empty={rows.length === 0}>
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map((column) => <th key={column} className={sheetTh}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((fixture, index) => (
            <tr key={fixture.id}>
              <td className={sheetTd}>{fixture.fixture_number ?? ''}</td>
              <td className={sheetTd}>{index + 1}</td>
              <td className={sheetTd}>{fixture.inventory_item_name || fixture.custom_name || 'Unnamed fixture'}</td>
              <td className={sheetTd}>{fixture.truss_name ? `${fixture.truss_name}${fixture.truss_offset_cm != null ? ` · ${fixture.truss_offset_cm} cm` : ''}` : ''}</td>
              <td className={sheetTd}>{fixture.dmx_universe}</td>
              <td className={sheetTd}>{formatDMXRange(fixture.dmx_start_address, fixture.dmx_channel_count)}</td>
              <td className={sheetTd}>{fixture.dmx_channel_mode || ''}</td>
              <td className={sheetTd}>{fixture.dmx_channel_count}</td>
              <td className={sheetTd}>{powerText(fixture)}</td>
              <td className={sheetTd}>{fixture.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSheet>
  )
}
