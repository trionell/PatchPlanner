import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import type { AudioPatchOutput, InputCable, InputChannel, InputDevice, InputSource, LightingFixture, MixerDCA, MixerGroup, OutputCable, OutputDevice, StageMulti, Stagebox } from '../../types'
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
  { id: 1, event_id: 1, name: 'FOH Rack', model: '', input_count: 16, output_count: 8, connection_type: 'analog', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 },
]
const stageMultis: StageMulti[] = [
  { id: 5, event_id: 1, name: 'Multi A', length_m: 30, channels: 12, connector_type: 'harting', position_x: 0, position_y: 0, input_position_x: 0, input_position_y: 0 },
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

function aChannel(overrides: Partial<InputChannel>): InputChannel {
  return { id: 1, event_id: 1, channel_number: 1, channel_name: 'Vocal', width: 'mono', mixer_behavior: 'stereo_channel', ...overrides }
}
function aSource(overrides: Partial<InputSource>): InputSource {
  return { id: 1, event_id: 1, name: 'Lead Vox', kind: 'mic', connector_type: 'xlr', phantom_power: true, width: 'mono', position_x: 0, position_y: 0, ...overrides }
}
function aDevice(overrides: Partial<InputDevice>): InputDevice {
  return { id: 1, event_id: 1, name: 'DI', input_port_count: 1, output_port_count: 1, position_x: 0, position_y: 0, ...overrides }
}
function anInputCable(overrides: Partial<InputCable>): InputCable {
  return { id: 1, event_id: 1, from_kind: 'source', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1, to_port: 0, ...overrides }
}

describe('InputPatchSheet', () => {
  it('renders every channel with its signal path and no form controls', () => {
    const html = render(
      <InputPatchSheet
        eventId={1}
        channels={[
          aChannel({ id: 2, channel_number: 2, channel_name: 'Guitar', group_ids: [], color: undefined }),
          aChannel({ id: 1, channel_number: 1, channel_name: 'Vocal', group_ids: [1, 7], dca_ids: [3], color: '#22c55e' }),
          aChannel({ id: 3, channel_number: 3, channel_name: 'Playback L', group_ids: [] }),
        ]}
        sources={[aSource({ id: 1, name: 'Shure SM58' }), aSource({ id: 2, name: 'Guitar DI', kind: 'line', phantom_power: false })]}
        devices={[]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        cables={[
          anInputCable({ id: 1, from_id: 1, to_id: 1, cable_item_id: 201 }),
          anInputCable({ id: 2, from_id: 2, to_kind: 'stagebox', to_id: 1, to_port: 11 }),
          anInputCable({ id: 3, from_kind: 'stagebox', from_id: 1, from_port: 11, to_kind: 'channel', to_id: 2 }),
        ]}
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
    expect(html).toContain('Mikrofonkabel — 4m')
    expect(html).toContain('Guitar DI')
    expect(html).toContain('FOH Rack')
    expect(html).toContain('built-in')
    // A channel with nothing feeding it (Playback L) is flagged as a gap.
    expect(html).toContain('no source connected')
    // Rows sorted by channel number: Vocal (1) before Guitar (2).
    expect(html.indexOf('Vocal')).toBeLessThan(html.indexOf('Guitar'))
    expect(html).not.toMatch(/<(input|select|button|textarea)\b/)
  })

  it('renders the empty-state line instead of a table', () => {
    const html = render(<InputPatchSheet eventId={1} channels={[]} sources={[]} devices={[]} stageboxes={[]} stageMultis={[]} cables={[]} groups={[]} dcas={[]} itemLabelById={new Map()} />)
    expect(html).toContain('Nothing planned on this sheet.')
    expect(html).not.toContain('<table')
  })

  it('shows a double-patched source feeding two channels independently', () => {
    const html = render(
      <InputPatchSheet
        eventId={1}
        channels={[aChannel({ id: 5, channel_number: 32, channel_name: 'Talkback FOH' }), aChannel({ id: 6, channel_number: 33, channel_name: 'Talkback Mon' })]}
        sources={[aSource({ id: 9, name: 'Talkback Mic' })]}
        devices={[]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        cables={[
          anInputCable({ id: 1, from_id: 9, to_id: 5 }),
          anInputCable({ id: 2, from_id: 9, to_id: 6 }),
        ]}
        groups={[]}
        dcas={[]}
        itemLabelById={itemLabelById}
      />,
    )
    expect((html.match(/Talkback Mic/g) ?? []).length).toBe(2)
  })

  it('shows a DI channel\'s full path through its Device', () => {
    const html = render(
      <InputPatchSheet
        eventId={1}
        channels={[aChannel({ id: 1, channel_number: 4, channel_name: 'Bass' })]}
        sources={[aSource({ id: 1, name: 'Bass Direct Out', kind: 'line', phantom_power: false })]}
        devices={[aDevice({ id: 1, name: 'DI (Bass)' })]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        cables={[
          anInputCable({ id: 1, from_kind: 'source', from_id: 1, to_kind: 'device', to_id: 1, to_port: 0, cable_item_id: 301 }),
          anInputCable({ id: 2, from_kind: 'device', from_id: 1, from_port: 0, to_kind: 'channel', to_id: 1 }),
        ]}
        groups={[]}
        dcas={[]}
        itemLabelById={itemLabelById}
      />,
    )
    expect(html).toContain('Bass Direct Out')
    expect(html).toContain('DI (Bass)')
    expect(html).toContain('Mikrofonstativ Med bom')
  })
})

function outputDevice(overrides: Partial<OutputDevice>): OutputDevice {
  return { id: 1, event_id: 1, name: 'Device', input_port_count: 0, output_port_count: 0, link_port_count: 0, position_x: 0, position_y: 0, ...overrides }
}

function outputCable(overrides: Partial<OutputCable>): OutputCable {
  return { id: 1, event_id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 1, to_port: 0, ...overrides }
}

describe('OutputPatchSheet', () => {
  it('renders each output\'s graph-derived path with device, stage-multi, and cable labels', () => {
    const base: Omit<AudioPatchOutput, 'id' | 'output_number'> = {
      event_id: 1, output_name: '', output_type: 'foh', width: 'mono',
    }
    const amp = outputDevice({ id: 77, name: 'Amp X', input_port_count: 1, output_port_count: 1 })
    const speaker = outputDevice({ id: 78, name: 'Speaker Y', input_port_count: 1 })
    const outputLabels = new Map([[401, 'Högtalarkabel Speakon 2x2,5 — 10m']])
    const html = render(
      <OutputPatchSheet
        eventId={1}
        outputs={[
          { id: 1, output_number: 1, color: '#a855f7', ...base },
          { id: 2, output_number: 2, ...base },
        ]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        outputDevices={[amp, speaker]}
        outputCables={[
          outputCable({ id: 1, from_kind: 'mixer', from_id: 1, from_port: 0, to_kind: 'device', to_id: 77, to_port: 0 }),
          outputCable({ id: 2, from_kind: 'device', from_id: 77, from_port: 0, to_kind: 'device', to_id: 78, to_port: 0, cable_item_id: 401 }),
          outputCable({ id: 3, from_kind: 'mixer', from_id: 2, from_port: 0, to_kind: 'stage_multi', to_id: 5, to_port: 2 }),
        ]}
        itemLabelById={outputLabels}
      />,
    )
    expect(html).toContain('Amp X')
    expect(html).toContain('Speaker Y')
    expect(html).toContain('Högtalarkabel Speakon 2x2,5 — 10m')
    expect(html).toContain('Multi A')
    // Output channel color prints as a swatch; uncolored rows carry none.
    expect(html).toContain('background-color:#a855f7')
    expect((html.match(/data-testid="color-swatch"/g) ?? []).length).toBe(1)
    expect(html).not.toMatch(/<(input|select|button|textarea)\b/)
  })

  it('shows a stereo channel\'s two independent paths', () => {
    const speakerL = outputDevice({ id: 10, name: 'Speaker L', input_port_count: 1 })
    const speakerR = outputDevice({ id: 11, name: 'Speaker R', input_port_count: 1 })
    const html = render(
      <OutputPatchSheet
        eventId={1}
        outputs={[{ id: 4, output_number: 1, output_name: 'Main', output_type: 'foh', width: 'stereo', event_id: 1 }]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        outputDevices={[speakerL, speakerR]}
        outputCables={[
          outputCable({ id: 1, from_kind: 'mixer', from_id: 4, from_port: 0, to_kind: 'device', to_id: 10, to_port: 0 }),
          outputCable({ id: 2, from_kind: 'mixer', from_id: 4, from_port: 1, to_kind: 'device', to_id: 11, to_port: 0 }),
        ]}
        itemLabelById={new Map()}
      />,
    )
    expect(html).toContain('Main L')
    expect(html).toContain('Main R')
    expect(html).toContain('Speaker L')
    expect(html).toContain('Speaker R')
  })

  it('resolves a shared device via its declared name, not the underlying item id', () => {
    const html = render(
      <OutputPatchSheet
        eventId={1}
        outputs={[{ id: 5, output_number: 1, output_name: 'IEM 1', output_type: 'iem', width: 'mono', event_id: 1 }]}
        stageboxes={stageboxes}
        stageMultis={stageMultis}
        outputDevices={[outputDevice({ id: 9, name: 'IEM headphone amp', input_port_count: 1, inventory_item_id: 77 })]}
        outputCables={[outputCable({ id: 1, from_kind: 'mixer', from_id: 5, from_port: 0, to_kind: 'device', to_id: 9, to_port: 0 })]}
        itemLabelById={itemNameById}
      />,
    )
    expect(html).toContain('IEM headphone amp')
    expect(html).not.toContain('Amp X')
  })
})

describe('LightingRigSheet', () => {
  it('renders fixtures with DMX range and power chains', () => {
    const base: Omit<LightingFixture, 'id' | 'position_index'> = {
      rig_id: 1, power_connection: 'grid', power_connector_in: 'schuko',
      dmx_universe: 1, dmx_channel_count: 16, dmx_channel_mode: 'Extended',
    }
    const html = render(
      <LightingRigSheet
        eventId={1}
        fixtures={[
          { ...base, id: 11, position_index: 1, inventory_item_name: 'ADJ Encore', truss_name: 'Front Truss', truss_offset_cm: 150, dmx_start_address: 1, fixture_number: 101 },
          { ...base, id: 12, position_index: 2, custom_name: 'House blinder', power_connection: 'chain', power_chain_parent_id: 11, dmx_start_address: 17 },
        ]}
      />,
    )
    expect(html).toContain('ADJ Encore')
    expect(html).toContain('House blinder')
    // Truss column is read-only, derived from the stage plot attachment.
    expect(html).toContain('Front Truss · 150 cm')
    // FID column: printed when set, empty cell when not.
    expect(html).toContain('FID')
    expect(html).toContain('101')
    expect(html).toContain('1–16')
    expect(html).toContain('grid schuko')
    expect(html).toContain('chain ← #1')
    expect(html).not.toMatch(/<(input|select|button|textarea)\b/)
  })
})
