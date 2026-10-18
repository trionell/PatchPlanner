import { describe, expect, it } from 'vitest'
import { GENERIC } from '../hooks/useDeskModels'
import { EVENT_TABS } from '../hooks/useEventTab'
import { MOBILE_SECTIONS } from '../types/mobile'
import type { DeskMix, DeskModel, DeskRoute, InputChannel } from '../types'
import { cellAllowed, channelRoutes, groupDepths, playsNowhere, poolFill } from './deskRouting'
import { fedByKey, fedByOptions } from './fedBy'

const rules = (forwardGroups: boolean, channelMatrix: boolean) => ({
  channel: { main: 'yes', subgroup: 'yes', monitor: 'yes', fx: 'yes', matrix: channelMatrix ? 'yes' : 'no', dca: 'yes', mute: 'yes' },
  subgroup: { main: 'yes', subgroup: forwardGroups ? 'forward' : 'no', matrix: 'yes', mute: 'yes', monitor: 'no', fx: 'no', dca: 'no' },
}) as DeskModel['route_rules']

const M32: DeskModel = { ...GENERIC, key: 'm32', label: 'M32', engine: 'x32', buses: 16, matrix: 6, dca: 8, mute: 6, route_rules: rules(false, false) }
const LV1: DeskModel = { ...GENERIC, key: 'lv1_64', label: 'LV1 64', engine: 'lv1', groups: 8, mon: 16, fx_aux: 8, matrix: 8, dca: 16, mute: 8, route_rules: rules(true, true) }

const mix = (id: number, kind: DeskMix['kind'], slot: number, extra: Partial<DeskMix> = {}): DeskMix => ({ id, event_id: 1, console_id: 1, kind, slot, width: 'mono', name: `${kind}${slot}`, ...extra })
const route = (src_kind: DeskRoute['src_kind'], src_id: number, dst_kind: DeskRoute['dst_kind'], dst_id: number): DeskRoute => ({ id: src_id * 100 + dst_id, console_id: 1, src_kind, src_id, src_port: 0, dst_kind, dst_id, dst_port: 0 })

describe('cells from the served rules', () => {
  it('hatches the LV1 group triangle on and below the diagonal', () => {
    const g5 = mix(5, 'subgroup', 5)
    expect(cellAllowed(LV1, { kind: 'subgroup', slot: 3, id: 3 }, g5)).toBe(true)
    expect(cellAllowed(LV1, { kind: 'subgroup', slot: 5, id: 5 }, g5)).toBe(false)
    expect(cellAllowed(LV1, { kind: 'subgroup', slot: 6, id: 6 }, g5)).toBe(false)
  })
  it('refuses channels into an X32 matrix and no bus → bus', () => {
    expect(cellAllowed(M32, { kind: 'channel' }, mix(1, 'matrix', 1))).toBe(false)
    expect(cellAllowed(M32, { kind: 'subgroup', slot: 1, id: 1 }, mix(2, 'subgroup', 2))).toBe(false)
    expect(cellAllowed(LV1, { kind: 'channel' }, mix(1, 'matrix', 1))).toBe(true)
  })
})

describe('pool fills', () => {
  it('shows X32 buses shared across subgroups, monitors and FX', () => {
    const mixes = [mix(1, 'subgroup', 1), mix(2, 'monitor', 2, { width: 'stereo' }), mix(3, 'fx', 4)]
    expect(poolFill(M32, mixes, 'subgroup')).toBe('Buses 4/16')
    expect(poolFill(M32, mixes, 'monitor')).toBe('Buses 4/16')
    expect(poolFill(LV1, [mix(1, 'subgroup', 1, { width: 'stereo' })], 'subgroup')).toBe('1/8')
  })
})

describe('reading routes', () => {
  const channel = { id: 7, console_id: 1 } as InputChannel
  const mixes = [mix(1, 'main', 1, { name: 'LR' }), mix(2, 'subgroup', 1, { name: 'Drums' }), mix(3, 'dca', 1, { name: 'Vox' }), mix(4, 'monitor', 1), mix(5, 'fx', 1)]
  const routes = [route('channel', 7, 'mix', 1), route('channel', 7, 'mix', 2), route('channel', 7, 'mix', 3), route('channel', 7, 'mix', 4), route('channel', 7, 'mix', 5)]

  it('summarises a channel as chips then counts', () => {
    const summary = channelRoutes(channel, mixes, routes)
    expect(summary.chips.map((m) => m.name)).toEqual(['LR', 'Drums', 'Vox'])
    expect(summary.rest).toBe('1 mon · 1 fx')
  })
  it('counts monitor and matrix mixes that play nowhere', () => {
    expect(playsNowhere(mixes, routes).map((m) => m.id)).toEqual([4])
    expect(playsNowhere(mixes, [...routes, route('mix', 4, 'output', 9)])).toEqual([])
  })
  it('lays LV1 groups out by feed-forward depth', () => {
    const groups = [mix(10, 'subgroup', 1), mix(11, 'subgroup', 2), mix(12, 'subgroup', 3)]
    const depth = groupDepths(groups, [route('mix', 10, 'mix', 11), route('mix', 11, 'mix', 12)])
    expect([depth.get(10), depth.get(11), depth.get(12)]).toEqual([0, 1, 2])
  })
})

describe('Fed by', () => {
  it('offers no FX, asks the side of a stereo mix on a mono output, and no direct out on X32', () => {
    const mixes = [mix(1, 'main', 1, { name: 'LR', width: 'stereo' }), mix(5, 'fx', 1), mix(6, 'matrix', 1, { name: 'Mtx 1' })]
    const channels = [{ id: 7, console_id: 1, channel_number: 1, width: 'mono', mixer_behavior: 'stereo_channel' } as InputChannel]
    const x32 = fedByOptions({ console: { id: 1 } as never, model: M32 }, mixes, channels, 'mono').map((option) => option.label)
    expect(x32).toEqual(['LR · L', 'LR · R', 'Mtx 1'])
    const lv1 = fedByOptions({ console: { id: 1 } as never, model: LV1 }, mixes, channels, 'stereo').map((option) => option.label)
    expect(lv1.at(-1)).toContain('direct out')
    expect(fedByKey([route('mix', 1, 'output', 3)], 3)).toBe('mix:1:0')
  })
})

describe('the tenth tab', () => {
  it('sits between the audio tabs, on both reaches', () => {
    expect(EVENT_TABS.indexOf('desk-routing')).toBe(EVENT_TABS.indexOf('audio-inputs') + 1)
    const sections = MOBILE_SECTIONS.map((section) => section.section)
    expect(sections.indexOf('desk-routing')).toBe(sections.indexOf('audio-inputs') + 1)
    expect(sections).toHaveLength(EVENT_TABS.length)
  })
})
