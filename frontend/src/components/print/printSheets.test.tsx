import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import type { StagePlotResponse, LightingFixture } from '../../types'
import { LightingRigSheet } from './LightingRigSheet'
import { StagePlotSheet } from './StagePlotSheet'

/**
 * Static server-render of the sheets that still print through the browser:
 * verifies the printed table content (queries stay unresolved, so vocabulary
 * labels fall back to raw values — exactly the legacy-display behavior).
 *
 * The audio input and output sheets were here until Slice 40. They are no
 * longer React at all: the audio plan is a document the server writes, and the
 * cases that covered these two moved to Go table tests against the generated
 * PDF rather than being dropped. What is left is the two surfaces that still
 * use browser print — see design/patterns.md §8 for which uses which and why.
 */
function render(ui: ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

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

describe('StagePlotSheet', () => {
  it('renders the active view to scale with the grid caption and fixture labels', () => {
    const response: StagePlotResponse = {
      plot: {
        id: 1, event_id: 1, name: 'Main stage', sort_order: 0,
        grid_visible: true, grid_size_cm: 25, snap_grid: true, snap_objects: true,
        show_fixture_name: true, show_fixture_fid: true, show_fixture_dmx: true,
        active_view: 'top', zoom: 1, pan_x_cm: 0, pan_y_cm: 0,
      },
      layers: [
        { id: 1, plot_id: 1, name: 'Stage', sort_order: 0, visible: true, locked: false },
        { id: 2, plot_id: 1, name: 'Hidden', sort_order: 1, visible: false, locked: false },
      ],
      elements: [
        { id: 10, plot_id: 1, layer_id: 1, kind: 'shape', shape_kind: 'rect', name: 'Stage 600×400', x_cm: 300, y_cm: 200, z_cm: 0, width_cm: 600, depth_cm: 400, height_cm: 0, rotation_deg: 0, tilt_deg: 0, links: [] },
        { id: 11, plot_id: 1, layer_id: 1, kind: 'resource', icon: 'drums', name: 'Anna — Drums', x_cm: 300, y_cm: 120, z_cm: 0, width_cm: 200, depth_cm: 150, height_cm: 120, rotation_deg: 0, tilt_deg: 0, links: [] },
        { id: 12, plot_id: 1, layer_id: 1, kind: 'truss', truss_id: 7, name: '', x_cm: 300, y_cm: 30, z_cm: 0, width_cm: 0, depth_cm: 30, height_cm: 30, rotation_deg: 0, tilt_deg: 0, links: [] },
        { id: 13, plot_id: 1, layer_id: 2, kind: 'resource', icon: 'person', name: 'Hidden person', x_cm: 0, y_cm: 0, z_cm: 0, width_cm: 60, depth_cm: 40, height_cm: 180, rotation_deg: 0, tilt_deg: 0, links: [] },
      ],
      trusses: [
        {
          id: 7, event_id: 1, name: 'Front truss', height_cm: 400, total_length_cm: 600,
          pieces: [{ id: 1, truss_id: 7, inventory_item_id: 42, item_name: 'Tross F34 2m', length_cm: 200, sort_order: 0 }],
          fixtures: [{ id: 1, truss_id: 7, fixture_id: 5, offset_cm: 100, side: 'middle' as const, fixture_number: 11, fixture_name: 'Spot 1', dmx_universe: 1, dmx_start_address: 1 }],
        },
      ],
    }
    const html = render(<StagePlotSheet eventId={1} response={response} />)
    expect(html).toContain('Stage Plot — Main stage (Top view)')
    expect(html).toContain('Grid square = 25 cm')
    expect(html).toContain('Anna — Drums')
    expect(html).toContain('Front truss')
    // All three labels composed for the truss fixture.
    expect(html).toContain('Spot 1 · FID 11 · 1.001')
    // Hidden layers stay off the paper.
    expect(html).not.toContain('Hidden person')
    expect(html).not.toMatch(/<(input|select|button|textarea)\b/)
  })
})
