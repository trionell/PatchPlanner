import { stageboxPorts, stageMultiPorts } from './outputGraph'
import type { InputCable, InputChannel, InputDevice, InputSource, StageMulti, Stagebox } from '../types'

/** A single port on an input-graph node — the addressable unit a cable connects to/from. */
export interface PortRef {
  kind: InputCable['from_kind'] | InputCable['to_kind']
  id: number
  port: number
  direction: 'in' | 'out'
  /** Short label shown next to the port dot, e.g. "Lead Vox", "In 1". */
  label: string
}

/** The canvas zone a node lives in — Sources/Processing/Channels. */
export type Zone = 'sources' | 'processing' | 'channels'

/** A Source's ports: 1, or 2 independent ports when width is 'stereo' (e.g. a laptop's single stereo jack). Output-only — a Source has no input side. */
export function sourcePorts(source: InputSource): PortRef[] {
  if (source.width === 'stereo') {
    return [
      { kind: 'source' as const, id: source.id, port: 0, direction: 'out' as const, label: `${source.name} L` },
      { kind: 'source' as const, id: source.id, port: 1, direction: 'out' as const, label: `${source.name} R` },
    ]
  }
  return [{ kind: 'source' as const, id: source.id, port: 0, direction: 'out' as const, label: source.name }]
}

/** A Channel's ports: 1, or 2 independent ports when width is 'stereo' (mirrors sourcePorts/mixerPorts) — input-only, a Channel has no output side. */
export function channelPorts(channel: InputChannel): PortRef[] {
  const name = channel.channel_name || `Ch ${channel.channel_number}`
  if (channel.width === 'stereo') {
    return [
      { kind: 'channel' as const, id: channel.id, port: 0, direction: 'in' as const, label: `${name} L` },
      { kind: 'channel' as const, id: channel.id, port: 1, direction: 'in' as const, label: `${name} R` },
    ]
  }
  return [{ kind: 'channel' as const, id: channel.id, port: 0, direction: 'in' as const, label: name }]
}

/** A Device's ports on each side, per its declared port counts (mirrors the Output graph's devicePorts, minus link ports — not needed on this graph). */
export function devicePorts(device: InputDevice): { inputs: PortRef[]; outputs: PortRef[] } {
  const inputs = Array.from({ length: device.input_port_count }, (_, i) => ({
    kind: 'device' as const,
    id: device.id,
    port: i,
    direction: 'in' as const,
    label: `In ${i + 1}`,
  }))
  const outputs = Array.from({ length: device.output_port_count }, (_, i) => ({
    kind: 'device' as const,
    id: device.id,
    port: i,
    direction: 'out' as const,
    label: `Out ${i + 1}`,
  }))
  return { inputs, outputs }
}

/** A node's zone: Source always source-role; Stagebox/StageMulti/Device always processing-role; Channel always destination-role. Never a stored flag. */
export function nodeZone(kind: PortRef['kind']): Zone {
  if (kind === 'source') return 'sources'
  if (kind === 'channel') return 'channels'
  return 'processing'
}

interface ResolveContext {
  sources: InputSource[]
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
}

/**
 * Resolves a bare (kind, id, port, direction) tuple — e.g. decoded from a
 * DOM element's data attribute during a drag-and-drop cable gesture —
 * back into a full PortRef with its label. Undefined if the node no
 * longer exists or the port index isn't currently valid for it.
 */
export function resolvePortRef(
  kind: PortRef['kind'],
  id: number,
  port: number,
  direction: 'in' | 'out',
  context: ResolveContext,
): PortRef | undefined {
  if (kind === 'source') {
    const source = context.sources.find((s) => s.id === id)
    if (!source) return undefined
    return sourcePorts(source).find((p) => p.port === port)
  }
  if (kind === 'channel') {
    const channel = context.channels.find((c) => c.id === id)
    if (!channel) return undefined
    return channelPorts(channel).find((p) => p.port === port)
  }
  if (kind === 'stagebox') {
    const stagebox = context.stageboxes.find((sb) => sb.id === id)
    if (!stagebox) return undefined
    const { inputs, outputs } = stageboxPorts(stagebox)
    const found = (direction === 'in' ? inputs : outputs).find((p) => p.port === port)
    return found ? { ...found, kind } : undefined
  }
  if (kind === 'stage_multi') {
    const stageMulti = context.stageMultis.find((sm) => sm.id === id)
    if (!stageMulti) return undefined
    const { inputs, outputs } = stageMultiPorts(stageMulti)
    const found = (direction === 'in' ? inputs : outputs).find((p) => p.port === port)
    return found ? { ...found, kind } : undefined
  }
  const device = context.devices.find((d) => d.id === id)
  if (!device) return undefined
  const { inputs, outputs } = devicePorts(device)
  return (direction === 'in' ? inputs : outputs).find((p) => p.port === port)
}

export function isPortConnected(
  kind: PortRef['kind'],
  id: number,
  port: number,
  direction: 'in' | 'out',
  cables: InputCable[],
): boolean {
  return cables.some((cable) =>
    direction === 'out'
      ? cable.from_kind === kind && cable.from_id === id && cable.from_port === port
      : cable.to_kind === kind && cable.to_id === id && cable.to_port === port,
  )
}

/** Every cable attached to a specific port — plural because a Source port can fan out to more than one destination. */
export function cablesAtPort(
  kind: PortRef['kind'],
  id: number,
  port: number,
  direction: 'in' | 'out',
  cables: InputCable[],
): InputCable[] {
  return cables.filter((cable) =>
    direction === 'out'
      ? cable.from_kind === kind && cable.from_id === id && cable.from_port === port
      : cable.to_kind === kind && cable.to_id === id && cable.to_port === port,
  )
}

/** The cable (if any) attached to a specific port — for kinds other than source, a port carries at most one. */
export function cableAtPort(
  kind: PortRef['kind'],
  id: number,
  port: number,
  direction: 'in' | 'out',
  cables: InputCable[],
): InputCable | undefined {
  return cablesAtPort(kind, id, port, direction, cables)[0]
}

/** A node kind's display name, for labels and the picker. */
export function nodeKindLabel(kind: PortRef['kind']): string {
  switch (kind) {
    case 'source': return 'Source'
    case 'stagebox': return 'Stagebox'
    case 'stage_multi': return 'Stage multi'
    case 'device': return 'Device'
    case 'channel': return 'Channel'
  }
}

/** A node's display name, resolving against whichever collection it belongs to. */
export function nodeName(kind: PortRef['kind'], id: number, context: ResolveContext): string {
  switch (kind) {
    case 'source':
      return context.sources.find((s) => s.id === id)?.name ?? `#${id}`
    case 'channel': {
      const channel = context.channels.find((c) => c.id === id)
      return channel ? channel.channel_name || `Ch ${channel.channel_number}` : `#${id}`
    }
    case 'stagebox':
      return context.stageboxes.find((sb) => sb.id === id)?.name ?? `#${id}`
    case 'stage_multi':
      return context.stageMultis.find((sm) => sm.id === id)?.name ?? `#${id}`
    case 'device':
      return context.devices.find((d) => d.id === id)?.name ?? `#${id}`
  }
}

/**
 * Whether an edge is never a separately rentable physical cable
 * (research.md R5, revised): a Stage Multi's own body IS the cable for
 * its entire run, so anything leaving its output side — to a Channel, a
 * Stagebox, another Stage Multi, or a Processing device — is always
 * built-in, regardless of destination. A Stagebox has no such integrated
 * run; only its console-side hop into a Channel is a logical slot
 * assignment rather than a physical cable — a hop to anything else (a
 * device, another Stagebox/Stage-Multi) is a real, separately billable
 * cable.
 */
export function isCablelessEdge(fromKind: PortRef['kind'], toKind: PortRef['kind']): boolean {
  if (fromKind === 'stage_multi') return true
  return fromKind === 'stagebox' && toKind === 'channel'
}

/**
 * Two ports are compatible ends of a cable: opposite directions, and the
 * graph's kind rules. A Source port may already carry a cable and still
 * accept another (fan-out to more than one Channel, FR-006) — every
 * other kind stays one-cable-per-port, checked by the caller via
 * isPortConnected.
 */
export function portsConnectable(a: PortRef, b: PortRef): boolean {
  if (a.direction === b.direction) return false
  const outPort = a.direction === 'out' ? a : b
  const inPort = a.direction === 'out' ? b : a
  const validFromKinds: PortRef['kind'][] = ['source', 'stagebox', 'stage_multi', 'device']
  const validToKinds: PortRef['kind'][] = ['stagebox', 'stage_multi', 'device', 'channel']
  return validFromKinds.includes(outPort.kind) && validToKinds.includes(inPort.kind)
}

interface ColorContext {
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
}

/**
 * A Stagebox/Stage-Multi/Device's output-side port index paired with a
 * given input-side port index, for continuing a forward color trace
 * through it: always same-index for Stagebox/Stage-Multi (data-model.md's
 * pass-through convention); for a Device, same-index when its two sides
 * match in count (e.g. a stereo DI, 2 in/2 out), otherwise its sole
 * output (a 1-out fan-in device) — mirrors inputSignalFlow.ts's
 * upstreamPort, just walked forward instead of backward.
 */
function pairedOutputPort(kind: PortRef['kind'], id: number, inPort: number, context: ColorContext): number {
  if (kind === 'device') {
    const device = context.devices.find((d) => d.id === id)
    if (device && device.input_port_count !== device.output_port_count) return 0
  }
  return inPort
}

/**
 * Every Channel reachable by tracing input_cables forward from a given
 * output-side port — a Source's port may fan out into more than one
 * Channel (double-patching); every other kind's port leads to at most
 * one, since a to-port always carries a single cable.
 */
function reachableChannels(kind: PortRef['kind'], id: number, port: number, context: ColorContext, guard = new Set<string>()): InputChannel[] {
  const key = `${kind}:${id}:${port}`
  if (guard.has(key)) return []
  guard.add(key)
  const outgoing = context.cables.filter((c) => c.from_kind === kind && c.from_id === id && c.from_port === port)
  return outgoing.flatMap((cable) => {
    if (cable.to_kind === 'channel') {
      const channel = context.channels.find((c) => c.id === cable.to_id)
      return channel ? [channel] : []
    }
    const nextPort = pairedOutputPort(cable.to_kind, cable.to_id, cable.to_port, context)
    return reachableChannels(cable.to_kind, cable.to_id, nextPort, context, guard)
  })
}

/**
 * A port's derived display color (research.md R9/FR-018): a Channel
 * always shows its own stored color directly; every other port traces
 * forward to whichever Channel(s) it reaches — a single color when every
 * reachable Channel agrees, undefined (neutral) when none is reachable
 * yet or reachable Channels disagree. An 'in'-direction port on a
 * pass-through node (Stagebox/Stage-Multi/Device) resolves via its
 * paired output port, so both dots of one physical port-pair always
 * match.
 */
export function derivedPortColor(port: PortRef, context: ColorContext): string | undefined {
  if (port.kind === 'channel') {
    return context.channels.find((c) => c.id === port.id)?.color
  }
  const outPort = port.direction === 'out' ? port.port : pairedOutputPort(port.kind, port.id, port.port, context)
  const channels = reachableChannels(port.kind, port.id, outPort, context)
  if (channels.length === 0) return undefined
  const colors = new Set(channels.map((c) => c.color ?? ''))
  return colors.size === 1 ? [...colors][0] || undefined : undefined
}

/**
 * A Source row's single derived color (for the Sources table's left-edge
 * accent/tint, research.md R9) — the same agree-or-neutral rule as
 * derivedPortColor, but merged across every one of the Source's ports
 * (both sides of a stereo pair), since the table shows one row per
 * Source, not per port.
 */
export function derivedSourceColor(source: InputSource, context: ColorContext): string | undefined {
  const colors = sourcePorts(source).map((port) => derivedPortColor(port, context))
  const distinct = new Set(colors.filter((c): c is string => !!c))
  return distinct.size === 1 ? [...distinct][0] : undefined
}
