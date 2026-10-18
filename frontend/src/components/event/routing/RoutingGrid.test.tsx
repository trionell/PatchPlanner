import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GENERIC } from '../../../hooks/useDeskModels'
import type { DeskMix, DeskModel, InputChannel } from '../../../types'
import { RoutingGrid } from './RoutingGrid'

beforeEach(() => {
  ;(globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null, setItem: () => {} } }
})
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

const rules = (x32: boolean) =>
  ({
    channel: { main: 'yes', subgroup: 'yes', monitor: 'yes', fx: 'yes', matrix: x32 ? 'no' : 'yes', dca: 'yes', mute: 'yes' },
    subgroup: { main: 'yes', subgroup: x32 ? 'no' : 'forward', matrix: 'yes', mute: 'yes' },
    main: { matrix: 'yes', mute: 'yes' },
  }) as DeskModel['route_rules']

const M32: DeskModel = { ...GENERIC, key: 'm32', label: 'M32', engine: 'x32', stereo: 'linked', strips: 32, buses: 16, matrix: 6, route_rules: rules(true) }
const LV1: DeskModel = { ...GENERIC, key: 'lv1_64', label: 'LV1 64', engine: 'lv1', stereo: 'strip', strips: 64, groups: 8, matrix: 8, route_rules: rules(false) }

const mix = (id: number, kind: DeskMix['kind'], slot: number, name = `${kind} ${slot}`): DeskMix => ({ id, event_id: 1, console_id: 1, kind, slot, width: 'mono', name })
const channel = (id: number, name: string) => ({ id, event_id: 1, channel_number: id, channel_name: name, width: 'mono', mixer_behavior: 'stereo_channel', console_id: 1, strip_pool: 'channel' }) as InputChannel
const render = (node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>)
const base = { eventId: 1, search: '', onSave: () => {}, onDelete: () => {} }

describe('RoutingGrid', () => {
  it('hatches the LV1 Groups triangle', () => {
    const mixes = [mix(1, 'subgroup', 1, 'Drums'), mix(2, 'subgroup', 2, 'Band')]
    const html = render(<RoutingGrid {...base} model={LV1} kind="subgroup" channels={[channel(9, 'Kick')]} mixes={mixes} routes={[]} readOnly={false} />)
    // Drums → Band is open; Drums → Drums, Band → Drums and Band → Band are hatched.
    expect(html.match(/aria-label="cannot route"/g)).toHaveLength(3)
    expect(html).toContain('Groups')
  })

  it('has no channel rows in an X32 Matrices table', () => {
    const mixes = [mix(1, 'matrix', 1, 'Mtx 1'), mix(2, 'main', 1, 'LR'), mix(3, 'subgroup', 1, 'Drums')]
    const html = render(<RoutingGrid {...base} model={M32} kind="matrix" channels={[channel(9, 'Kick')]} mixes={mixes} routes={[]} readOnly={false} />)
    expect(html).not.toContain('Kick')
    expect(html).toContain('LR')
    expect(html).toContain('Drums')
  })

  it('gives a viewer column heads as labels, not buttons', () => {
    const html = render(<RoutingGrid {...base} model={M32} kind="monitor" channels={[channel(9, 'Kick')]} mixes={[mix(4, 'monitor', 3, 'Wedge 1')]} routes={[]} readOnly />)
    expect(html).toContain('Wedge 1')
    expect(html).not.toMatch(/<button[^>]*>.*Wedge 1/)
  })

  it('flags a mix past its pool as over', () => {
    const html = render(<RoutingGrid {...base} model={M32} kind="matrix" channels={[]} mixes={[mix(1, 'matrix', 7, 'Mtx 7'), mix(2, 'main', 1, 'LR')]} routes={[]} readOnly />)
    expect(html).toMatch(/Mtx 7[\s\S]*over/)
  })
})
