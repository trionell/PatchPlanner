import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import type { AudioPatchInput, AudioPatchOutput, LightingFixture, MixerDCA, MixerGroup, StageMulti, Stagebox, TrussSection } from '../../types'
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
const groups: MixerGroup[] = [
  { id: 1, event_id: 1, name: 'LR', is_builtin: true },
  { id: 7, event_id: 1, name: 'Trummor', is_builtin: false, color: '#ef4444' },
]
const dcas: MixerDCA[] = [{ id: 3, event_id: 1, name: 'Band', color: '#3b82f6' }]
const itemLabelById = new Map([
  [42, 'Shure SM58'],
  [201, 'Mikrofonkabel — 4m'],
  [301, 'Mikrofonstativ Med bom'],
])

function anInput(overrides: Partial<AudioPatchInput>): AudioPatchInput {
  return {
    id: 1, event_id: 1, channel_number: 1, channel_name: 'Vocal', signal_type: 'mic',
    preamp_connector: 'xlr', cable_type: 'xlr', cable_length_m: 10, phantom_power: true,
    width: 'mono', mixer_behavior: 'stereo_channel', source_cabling: 'two_cables',
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
          anInput({ id: 1, mic_item_id: 42, stagebox_id: 1, stagebox_channel: 12, cable_item_id: 201, cable_type: undefined, cable_length_m: undefined, stand_item_id: 301, group_ids: [1, 7], dca_ids: [3], color: '#22c55e' }),
          anInput({ id: 3, channel_number: 3, channel_name: 'Playback L', group_ids: [] }),
        ]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        groups={groups}
        dcas={dcas}
        itemLabelById={itemLabelById}
      />,
    )
    expect(html).toContain('Vocal')
    // Bus membership: names in the event's canonical order, LR first; the
    // colored group name is tinted and the channel swatch is printed.
    expect(html).toContain('LR')
    expect(html).toContain('Trummor')
    expect(html).toContain('Band')
    expect(html).toContain('background-color:#ef4444')
    expect(html).toContain('background-color:#22c55e')
    expect(html).toContain('data-testid="color-swatch"')
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
    const html = render(<InputPatchSheet eventId={1} inputs={[]} stageboxes={[]} stageMultis={[]} groups={[]} dcas={[]} itemLabelById={new Map()} />)
    expect(html).toContain('Nothing planned on this sheet.')
    expect(html).not.toContain('<table')
  })

  it('shows a linked-channels stereo row\'s pair number and both independently-patched sides', () => {
    const html = render(
      <InputPatchSheet
        eventId={1}
        inputs={[
          anInput({
            channel_number: 5, channel_name: 'Crowd L/R', mixer_behavior: 'linked_channels', width: 'stereo',
            stagebox_id: 1, stagebox_channel: 9, stage_multi_id_b: 5, stage_multi_channel_b: 3, mic_item_id: 42,
          }),
        ]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        groups={[]}
        dcas={[]}
        itemLabelById={itemLabelById}
      />,
    )
    // Pair number and both sides' independent routes (side B needn't share
    // side A's stagebox — the crowd-mic scenario).
    expect(html).toContain('5–6')
    expect(html).toContain('SB FOH Rack ch 9')
    expect(html).toContain('Multi Multi A ch 3')
  })

  it('shows a DI row\'s source cable alongside its DI→preamp cable', () => {
    const diLabelById = new Map([...itemLabelById, [502, 'Linekabel Tele-tele — 2m']])
    const html = render(
      <InputPatchSheet
        eventId={1}
        inputs={[anInput({ signal_type: 'di', mic_item_id: 42, cable_item_id: 201, cable_type: undefined, cable_length_m: undefined, source_cable_item_id: 502 })]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        groups={[]}
        dcas={[]}
        itemLabelById={diLabelById}
      />,
    )
    expect(html).toContain('Mikrofonkabel — 4m')
    expect(html).toContain('Src: Linekabel Tele-tele — 2m')
  })
})

describe('OutputPatchSheet', () => {
  it('renders destinations per destination_type and cable picks', () => {
    const base: Omit<AudioPatchOutput, 'id' | 'output_number' | 'destination_type'> = {
      event_id: 1, output_name: '', output_type: 'foh', cable_type: 'nl4', cable_length_m: 20, width: 'mono',
    }
    const outputLabels = new Map([...itemNameById, [401, 'Högtalarkabel Speakon 2x2,5 — 10m']])
    const html = render(
      <OutputPatchSheet
        eventId={1}
        outputs={[
          { id: 1, output_number: 1, destination_type: 'local', amplifier_item_id: 77, speaker_item_id: 78, color: '#a855f7', ...base },
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
    // Output channel color prints as a swatch; uncolored rows carry none.
    expect(html).toContain('background-color:#a855f7')
    expect((html.match(/data-testid="color-swatch"/g) ?? []).length).toBe(1)
    expect(html).not.toMatch(/<(input|select|button|textarea)\b/)
  })

  it('shows a stereo output\'s independently-patched second destination', () => {
    const html = render(
      <OutputPatchSheet
        eventId={1}
        outputs={[{
          id: 4, output_number: 1, output_name: 'Main L/R', output_type: 'foh', destination_type: 'stage_multi',
          stage_multi_id: 5, stage_multi_channel: 1, stage_multi_id_b: 5, stage_multi_channel_b: 2,
          width: 'stereo', event_id: 1,
        }]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        itemLabelById={new Map()}
      />,
    )
    expect(html).toContain('Multi Multi A ch 1')
    expect(html).toContain('Multi Multi A ch 2')
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
