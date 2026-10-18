import type { DeskMix, DeskModel, DeskRoute, InputChannel, MixKind } from '../types'

/** The eight tables of Desk Routing (Slice 48), in index order. */
export type RoutingTable = 'mains' | 'subgroups' | 'monitors' | 'fx' | 'matrices' | 'dcas' | 'mutes' | 'recorder'

export const ROUTING_TABLES: RoutingTable[] = ['mains', 'subgroups', 'monitors', 'fx', 'matrices', 'dcas', 'mutes', 'recorder']

/** The mix kind each table's columns are; the recorder's are tracks. */
export const TABLE_KIND: Record<Exclude<RoutingTable, 'recorder'>, MixKind> = {
  mains: 'main',
  subgroups: 'subgroup',
  monitors: 'monitor',
  fx: 'fx',
  matrices: 'matrix',
  dcas: 'dca',
  mutes: 'mute',
}

/** A table's name on this desk: LV1 calls a subgroup a group. */
export function tableLabel(table: RoutingTable, model: DeskModel): string {
  switch (table) {
    case 'mains':
      return 'Mains'
    case 'subgroups':
      return model.engine === 'lv1' ? 'Groups' : 'Subgroups'
    case 'monitors':
      return 'Monitors'
    case 'fx':
      return 'FX'
    case 'matrices':
      return 'Matrices'
    case 'dcas':
      return 'DCAs'
    case 'mutes':
      return 'Mute groups'
    default:
      return 'Recorder'
  }
}

export type CellRule = 'yes' | 'no' | 'forward'

/**
 * Whether a source can feed a destination on this desk, from the rules the server
 * serves with the profile (Slice 48 D4) — the same RouteAllowed a save is checked
 * against, so a cell is never offered that the save would refuse.
 */
export function ruleOf(model: DeskModel, srcKind: 'channel' | MixKind, dstKind: MixKind): CellRule {
  return model.route_rules?.[srcKind]?.[dstKind] ?? 'no'
}

/** Whether a cell can hold a route: the rule, with a group's feed-forward applied. */
export function cellAllowed(model: DeskModel, src: { kind: 'channel' | MixKind; slot?: number; id?: number }, dst: DeskMix): boolean {
  if (src.kind !== 'channel' && src.id === dst.id) return false
  const rule = ruleOf(model, src.kind, dst.kind)
  if (rule === 'no') return false
  if (rule === 'forward') return (src.slot ?? 0) < dst.slot
  return true
}

export const deskMixes = (mixes: DeskMix[], deskId: number) =>
  mixes.filter((mix) => mix.console_id === deskId).sort((a, b) => a.kind.localeCompare(b.kind) || a.slot - b.slot)

export const mixesOfKind = (mixes: DeskMix[], kind: MixKind) => mixes.filter((mix) => mix.kind === kind).sort((a, b) => a.slot - b.slot)

/** A mix as a column head and a chip read it: its name, else its kind and slot. */
export function mixLabel(mix: DeskMix): string {
  return mix.name || `${mix.kind} ${mix.slot}`
}

/** Pool name and capacity for a kind on this desk; X32 · M32 spends one pool of buses three ways. */
export function poolOf(model: DeskModel, kind: MixKind): { name: string; capacity: number; unbounded: boolean } {
  if (model.engine === 'generic') return { name: kind, capacity: 0, unbounded: true }
  if (kind === 'subgroup' || kind === 'monitor' || kind === 'fx') {
    if (model.engine === 'x32') return { name: 'bus', capacity: model.buses, unbounded: false }
    return { name: kind, capacity: kind === 'subgroup' ? model.groups : kind === 'monitor' ? model.mon : model.fx_aux, unbounded: false }
  }
  if (kind === 'matrix') return { name: kind, capacity: model.matrix, unbounded: false }
  if (kind === 'dca') return { name: kind, capacity: model.dca, unbounded: false }
  if (kind === 'mute') return { name: kind, capacity: model.mute, unbounded: false }
  return { name: kind, capacity: 0, unbounded: true }
}

/** Slots a mix takes: X32 stereo is a pair, an LV1 group is one, DCAs and mutes one, Generic one. */
export function slotWidth(model: DeskModel, mix: Pick<DeskMix, 'kind' | 'width'>): number {
  if (mix.width !== 'stereo' || mix.kind === 'dca' || mix.kind === 'mute' || mix.kind === 'main' || model.engine === 'generic') return 1
  if (model.engine === 'lv1' && mix.kind === 'subgroup') return 1
  return 2
}

/** The index row's fill for a table: "Buses 15/16" on X32's three bus tables, "6/16" elsewhere. */
export function poolFill(model: DeskModel, mixes: DeskMix[], kind: MixKind): string {
  const pool = poolOf(model, kind)
  const used = mixes.filter((mix) => mix.kind !== 'main' && poolOf(model, mix.kind).name === pool.name).reduce((sum, mix) => sum + slotWidth(model, mix), 0)
  if (pool.unbounded) return String(mixes.filter((mix) => mix.kind === kind).length)
  return pool.name === 'bus' ? `Buses ${used}/${pool.capacity}` : `${used}/${pool.capacity}`
}

/** Past its pool's end, kept from a model switch (B2). */
export function mixOver(model: DeskModel, mix: DeskMix): boolean {
  if (mix.kind === 'main') return !(model.main_slots ?? []).some((main) => main.slot === mix.slot) && model.engine !== 'generic'
  const pool = poolOf(model, mix.kind)
  return !pool.unbounded && mix.slot + slotWidth(model, mix) - 1 > pool.capacity
}

export const isMembership = (route: DeskRoute) => route.dst_kind === 'mix'

/** The set of sources feeding a mix, as `kind:id` keys. */
export function sourcesOf(routes: DeskRoute[], mixId: number): Set<string> {
  return new Set(routes.filter((route) => route.dst_kind === 'mix' && route.dst_id === mixId).map((route) => `${route.src_kind}:${route.src_id}`))
}

/**
 * A channel's Routes cell (Slice 48 §08): the mains and groups it is on, its DCAs,
 * then a count for the rest ("1 mon · 2 fx").
 */
export function channelRoutes(channel: InputChannel, mixes: DeskMix[], routes: DeskRoute[]) {
  const feeds = routes.filter((route) => route.src_kind === 'channel' && route.src_id === channel.id && route.dst_kind === 'mix')
  const byId = new Map(mixes.map((mix) => [mix.id, mix]))
  const reached = feeds.map((route) => byId.get(route.dst_id)).filter((mix): mix is DeskMix => !!mix)
  const chips = reached.filter((mix) => mix.kind === 'main' || mix.kind === 'subgroup' || mix.kind === 'dca')
  const count = (kind: MixKind) => reached.filter((mix) => mix.kind === kind).length
  const rest = [
    count('monitor') ? `${count('monitor')} mon` : '',
    count('fx') ? `${count('fx')} fx` : '',
    count('matrix') ? `${count('matrix')} mtx` : '',
    count('mute') ? `${count('mute')} mute` : '',
  ].filter(Boolean)
  return { chips, rest: rest.join(' · ') }
}

/** Monitor and matrix mixes that reach no output — "N mixes play nowhere". */
export function playsNowhere(mixes: DeskMix[], routes: DeskRoute[]): DeskMix[] {
  const fed = new Set(routes.filter((route) => route.dst_kind === 'output' && route.src_kind === 'mix').map((route) => route.src_id))
  return mixes.filter((mix) => (mix.kind === 'monitor' || mix.kind === 'matrix') && !fed.has(mix.id))
}

/** The kinds an output can be fed by on this engine (never FX); a direct out only off X32. */
export function fedByKinds(): MixKind[] {
  return ['main', 'subgroup', 'monitor', 'matrix']
}


/** The recorder's track count each way: the card's 32, LV1's 64, or Generic's typed count. */
export function recorderTracks(model: DeskModel, desk: { recorder_tracks?: number }): number {
  if (model.engine === 'x32') return 32
  if (model.engine === 'lv1') return 64
  return desk.recorder_tracks ?? 0
}

/** Feed-forward depth of each LV1 group, for laying the canvas out left to right. */
export function groupDepths(groups: DeskMix[], routes: DeskRoute[]): Map<number, number> {
  const depth = new Map<number, number>()
  const ordered = [...groups].sort((a, b) => a.slot - b.slot)
  for (const group of ordered) {
    const feeders = routes.filter((route) => route.dst_kind === 'mix' && route.dst_id === group.id && route.src_kind === 'mix')
    let d = 0
    for (const feeder of feeders) {
      if (depth.has(feeder.src_id)) d = Math.max(d, (depth.get(feeder.src_id) ?? 0) + 1)
    }
    depth.set(group.id, d)
  }
  return depth
}
