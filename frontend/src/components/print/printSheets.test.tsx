import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import type { AudioPatchInput, AudioPatchOutput, LightingFixture, StageMulti, Stagebox, TrussSection } from '../../types'
import { InputPatchSheet } from './InputPatchSheet'
import { LightingRigSheet } from './LightingRigSheet'
import { OutputPatchSheet } from './OutputPatchSheet'

/**
 * Static server-render of the sheets: verifies the printed table content
 * (queries stay unresolved, so vocabulary labels fall back to raw values —
 * exactly the legacy-display behavior). The browser print preview itself is
 * checked manually per quickstart.md.
 */
function render(ui: ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const stageboxes: Stagebox[] = [
  { id: 1, event_id: 1, name: 'FOH Rack', model: '', input_count: 16, output_count: 8, connection_type: 'analog' },
]
const stageMultis: StageMulti[] = [
  { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 12, connector_type: 'harting' },
]
const itemNameById = new Map([[42, 'Shure SM58'], [77, 'Amp X'], [78, 'Speaker Y']])
const itemLabelById = new Map([
  [42, 'Shure SM58'],
  [201, 'Mikrofonkabel — 4m'],
  [301, 'Mikrofonstativ Med bom'],
])

function anInput(overrides: Partial<AudioPatchInput>): AudioPatchInput {
  return {
    id: 1, event_id: 1, channel_number: 1, channel_name: 'Vocal', signal_type: 'mic',
    preamp_connector: 'xlr', cable_type: 'xlr', cable_length_m: 10, phantom_power: true,
    ...overrides,
  }
}

describe('InputPatchSheet', () => {
  it('renders every channel with routing and no form controls', () => {
    const html = render(
      <InputPatchSheet
        eventId={1}
        inputs={[
          anInput({ id: 2, channel_number: 2, channel_name: 'Guitar', mic_label: 'Old DI', stage_multi_id: 5, stage_multi_channel: 4, phantom_power: false, mic_stand: 'boom' }),
          anInput({ id: 1, mic_item_id: 42, stagebox_id: 1, stagebox_channel: 12, cable_item_id: 201, cable_type: undefined, cable_length_m: undefined, stand_item_id: 301 }),
          anInput({ id: 3, channel_number: 3, channel_name: 'Playback L' }),
        ]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        itemLabelById={itemLabelById}
      />,
    )
    expect(html).toContain('Vocal')
    expect(html).toContain('Shure SM58')
    expect(html).toContain('SB FOH Rack ch 12')
    expect(html).toContain('Old DI')
    expect(html).toContain('Multi Multi A ch 4')
    expect(html).toContain('direct')
    // Picked cable/stand show catalog labels; legacy rows show old values.
    expect(html).toContain('Mikrofonkabel — 4m')
    expect(html).toContain('xlr 10 m')
    expect(html).toContain('Mikrofonstativ Med bom')
    expect(html).toContain('boom')
    expect(html).toContain('✓')
    // Rows sorted by channel number: Vocal (1) before Guitar (2).
    expect(html.indexOf('Vocal')).toBeLessThan(html.indexOf('Guitar'))
    expect(html).not.toMatch(/<(input|select|button|textarea)\b/)
  })

  it('renders the empty-state line instead of a table', () => {
    const html = render(<InputPatchSheet eventId={1} inputs={[]} stageboxes={[]} stageMultis={[]} itemLabelById={new Map()} />)
    expect(html).toContain('Nothing planned on this sheet.')
    expect(html).not.toContain('<table')
  })
})

describe('OutputPatchSheet', () => {
  it('renders destinations per destination_type and cable picks', () => {
    const base: Omit<AudioPatchOutput, 'id' | 'output_number' | 'destination_type'> = {
      event_id: 1, output_name: '', output_type: 'foh', cable_type: 'nl4', cable_length_m: 20,
    }
    const outputLabels = new Map([...itemNameById, [401, 'Högtalarkabel Speakon 2x2,5 — 10m']])
    const html = render(
      <OutputPatchSheet
        eventId={1}
        outputs={[
          { id: 1, output_number: 1, destination_type: 'local', amplifier_item_id: 77, speaker_item_id: 78, ...base },
          { id: 2, output_number: 2, destination_type: 'stagebox', stagebox_id: 1, stagebox_channel: 3, ...base, cable_item_id: 401, cable_type: undefined, cable_length_m: undefined },
          { id: 3, output_number: 3, destination_type: 'stage_multi', stage_multi_id: 5, stage_multi_channel: 8, ...base },
        ]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        itemLabelById={outputLabels}
      />,
    )
    expect(html).toContain('local')
    expect(html).toContain('SB FOH Rack ch 3')
    expect(html).toContain('Multi Multi A ch 8')
    expect(html).toContain('Amp X')
    expect(html).toContain('Speaker Y')
    // Picked cable shows the catalog label; legacy rows show type + typed length.
    expect(html).toContain('Högtalarkabel Speakon 2x2,5 — 10m')
    expect(html).toContain('nl4 20 m')
    expect(html).not.toMatch(/<(input|select|button|textarea)\b/)
  })
})

describe('LightingRigSheet', () => {
  it('renders fixtures with DMX range and power chains', () => {
    const sections: TrussSection[] = [{ id: 9, rig_id: 1, name: 'Front Truss', length_m: 6, truss_type: 'box' }]
    const base: Omit<LightingFixture, 'id' | 'position_index'> = {
      rig_id: 1, power_connection: 'grid', power_connector_in: 'schuko',
      dmx_universe: 1, dmx_channel_count: 16, dmx_channel_mode: 'Extended',
    }
    const html = render(
      <LightingRigSheet
        eventId={1}
        fixtures={[
          { ...base, id: 11, position_index: 1, inventory_item_name: 'ADJ Encore', truss_section_id: 9, dmx_start_address: 1, fixture_number: 101 },
          { ...base, id: 12, position_index: 2, custom_name: 'House blinder', power_connection: 'chain', power_chain_parent_id: 11, dmx_start_address: 17 },
        ]}
        sections={sections}
      />,
    )
    expect(html).toContain('ADJ Encore')
    expect(html).toContain('House blinder')
    expect(html).toContain('Front Truss')
    // FID column: printed when set, empty cell when not.
    expect(html).toContain('FID')
    expect(html).toContain('101')
    expect(html).toContain('1–16')
    expect(html).toContain('grid schuko')
    expect(html).toContain('chain ← #1')
    expect(html).not.toMatch(/<(input|select|button|textarea)\b/)
  })
})
