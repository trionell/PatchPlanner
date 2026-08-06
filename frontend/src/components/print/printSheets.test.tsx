import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import type { LightingFixture } from '../../types'
import { LightingRigSheet } from './LightingRigSheet'

/**
 * Static server-render of the sheets that still print through the browser:
 * verifies the printed table content (queries stay unresolved, so vocabulary
 * labels fall back to raw values — exactly the legacy-display behavior).
 *
 * The audio input and output sheets were here until Slice 40, and the stage
 * plot until Slice 41. None of them is React any more: each is a document the
 * server writes, and the cases that covered them moved to Go tests against the
 * generated PDF rather than being dropped. What is left is Lighting, the one
 * surface still on browser print — see design/patterns.md §8 for which uses
 * which and why.
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
