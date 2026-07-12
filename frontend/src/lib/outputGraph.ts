import type { AudioPatchOutput, OutputCable, OutputDevice, StageMulti, Stagebox } from '../types'

/** A single port on a graph node — the addressable unit a cable connects to/from. */
export interface PortRef {
  kind: OutputCable['from_kind'] | OutputCable['to_kind']
  id: number
  port: number
  direction: 'in' | 'out'
  /** Short label shown next to the port dot, e.g. "Ch 2 L", "SB FOH ch 3". */
  label: string
}

/** The canvas zone a node lives in — Sources/Processing/Destinations. */
export type Zone = 'sources' | 'processing' | 'destinations'

/** Mixer ports: one per output channel, two independent ones when stereo (data-model.md). */
export function mixerPorts(outputs: AudioPatchOutput[]): PortRef[] {
  return outputs.flatMap((output) => {
    const name = output.output_name || `Ch ${output.output_number}`
    if (output.width === 'stereo') {
      return [
        { kind: 'mixer' as const, id: output.id, port: 0, direction: 'out' as const, label: `${name} L` },
        { kind: 'mixer' as const, id: output.id, port: 1, direction: 'out' as const, label: `${name} R` },
      ]
    }
    return [{ kind: 'mixer' as const, id: output.id, port: 0, direction: 'out' as const, label: name }]
  })
}

/**
 * A stagebox's ports: output_count sizes BOTH sides — it's a full
 * pass-through node, symmetric with a stage multi. A channel routes into
 * a specific jack (input side, pure console/network routing, never a
 * physical cable) and a real cable carries on from that same jack
 * (output side, unchanged from before).
 */
export function stageboxPorts(stagebox: Stagebox): { inputs: PortRef[]; outputs: PortRef[] } {
  const inputs = Array.from({ length: stagebox.output_count }, (_, i) => ({
    kind: 'stagebox' as const,
    id: stagebox.id,
    port: i,
    direction: 'in' as const,
    label: `In ${i + 1}`,
  }))
  const outputs = Array.from({ length: stagebox.output_count }, (_, i) => ({
    kind: 'stagebox' as const,
    id: stagebox.id,
    port: i,
    direction: 'out' as const,
    label: `Out ${i + 1}`,
  }))
  return { inputs, outputs }
}

/** A stage multi's ports: `channels` on each side, independently connectable (FR-012). */
export function stageMultiPorts(stageMulti: StageMulti): { inputs: PortRef[]; outputs: PortRef[] } {
  const inputs = Array.from({ length: stageMulti.channels }, (_, i) => ({
    kind: 'stage_multi' as const,
    id: stageMulti.id,
    port: i,
    direction: 'in' as const,
    label: `In ${i + 1}`,
  }))
  const outputs = Array.from({ length: stageMulti.channels }, (_, i) => ({
    kind: 'stage_multi' as const,
    id: stageMulti.id,
    port: i,
    direction: 'out' as const,
    label: `Out ${i + 1}`,
  }))
  return { inputs, outputs }
}

/**
 * A device's ports on each side, per its declared port counts. links are
 * a destination device's link-out ports (daisy-chaining to another
 * device's ordinary input, e.g. sub -> sub -> top) — a distinct
 * from_kind ("device_link"), never counted toward input/output_port_count
 * so a device with link ports doesn't shift zones.
 */
export function devicePorts(device: OutputDevice): { inputs: PortRef[]; outputs: PortRef[]; links: PortRef[] } {
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
  const links = Array.from({ length: device.link_port_count }, (_, i) => ({
    kind: 'device_link' as const,
    id: device.id,
    port: i,
    direction: 'out' as const,
    label: `Link ${i + 1}`,
  }))
  return { inputs, outputs, links }
}

/**
 * A device's role on the canvas, derived from its port counts, never
 * stored (data-model.md): no inputs = source, no outputs = destination,
 * both present = freely-positioned processing node.
 */
export function nodeRole(device: OutputDevice): 'source' | 'processing' | 'destination' {
  if (device.input_port_count === 0) return 'source'
  if (device.output_port_count === 0) return 'destination'
  return 'processing'
}

/**
 * A device's zone, derived from its role. The mixer is always Sources
 * (its only ever an output-side node); stageboxes and stage multis are
 * always Processing (both structurally have an input and output side).
 */
export function deviceZone(device: OutputDevice): Zone {
  const role = nodeRole(device)
  if (role === 'source') return 'sources'
  if (role === 'destination') return 'destinations'
  return 'processing'
}

/** Any node's zone, resolving a device's role when needed. A link port lives on the same canvas node as its owning device's ordinary ports. */
export function nodeZone(kind: PortRef['kind'], id: number, context: { devices: OutputDevice[] }): Zone {
  if (kind === 'mixer') return 'sources'
  if (kind === 'stagebox' || kind === 'stage_multi') return 'processing'
  const device = context.devices.find((d) => d.id === id)
  return device ? deviceZone(device) : 'processing'
}

/** Whether a specific port already carries a cable. */
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
  context: { outputs: AudioPatchOutput[]; stageboxes: Stagebox[]; stageMultis: StageMulti[]; devices: OutputDevice[] },
): PortRef | undefined {
  if (kind === 'mixer') {
    return mixerPorts(context.outputs).find((p) => p.id === id && p.port === port)
  }
  if (kind === 'stagebox') {
    const stagebox = context.stageboxes.find((sb) => sb.id === id)
    if (!stagebox) return undefined
    const { inputs, outputs } = stageboxPorts(stagebox)
    return (direction === 'in' ? inputs : outputs).find((p) => p.port === port)
  }
  if (kind === 'stage_multi') {
    const stageMulti = context.stageMultis.find((sm) => sm.id === id)
    if (!stageMulti) return undefined
    const { inputs, outputs } = stageMultiPorts(stageMulti)
    return (direction === 'in' ? inputs : outputs).find((p) => p.port === port)
  }
  const device = context.devices.find((d) => d.id === id)
  if (!device) return undefined
  const { inputs, outputs, links } = devicePorts(device)
  if (kind === 'device_link') return links.find((p) => p.port === port)
  return (direction === 'in' ? inputs : outputs).find((p) => p.port === port)
}

export function isPortConnected(
  kind: PortRef['kind'],
  id: number,
  port: number,
  direction: 'in' | 'out',
  cables: OutputCable[],
): boolean {
  return cables.some((cable) =>
    direction === 'out'
      ? cable.from_kind === kind && cable.from_id === id && cable.from_port === port
      : cable.to_kind === kind && cable.to_id === id && cable.to_port === port,
  )
}

/** Every cable attached to a specific port — plural because a mixer port can fan out to more than one destination. */
export function cablesAtPort(
  kind: PortRef['kind'],
  id: number,
  port: number,
  direction: 'in' | 'out',
  cables: OutputCable[],
): OutputCable[] {
  return cables.filter((cable) =>
    direction === 'out'
      ? cable.from_kind === kind && cable.from_id === id && cable.from_port === port
      : cable.to_kind === kind && cable.to_id === id && cable.to_port === port,
  )
}

/** The cable (if any) attached to a specific port — for kinds other than mixer, a port carries at most one. */
export function cableAtPort(
  kind: PortRef['kind'],
  id: number,
  port: number,
  direction: 'in' | 'out',
  cables: OutputCable[],
): OutputCable | undefined {
  return cablesAtPort(kind, id, port, direction, cables)[0]
}

/** A node kind's display name, for labels and the picker. */
export function nodeKindLabel(kind: PortRef['kind']): string {
  switch (kind) {
    case 'mixer': return 'Mixer'
    case 'stagebox': return 'Stagebox'
    case 'stage_multi': return 'Stage multi'
    case 'device': return 'Device'
    case 'device_link': return 'Device'
  }
}

/** A node's display name, resolving against whichever collection it belongs to. */
export function nodeName(
  kind: PortRef['kind'],
  id: number,
  context: { outputs: AudioPatchOutput[]; stageboxes: Stagebox[]; stageMultis: StageMulti[]; devices: OutputDevice[] },
): string {
  switch (kind) {
    case 'mixer':
      return 'Mixer'
    case 'stagebox':
      return context.stageboxes.find((sb) => sb.id === id)?.name ?? `#${id}`
    case 'stage_multi':
      return context.stageMultis.find((sm) => sm.id === id)?.name ?? `#${id}`
    case 'device':
    case 'device_link':
      return context.devices.find((device) => device.id === id)?.name ?? `#${id}`
  }
}

/**
 * Two ports are compatible ends of a cable: opposite directions, and the
 * graph's kind rules (FR-004/FR-005/stagebox pass-through follow-up). A
 * mixer port may already carry a cable and still accept another (fan-out
 * to more than one physical destination) — every other kind stays
 * one-cable-per-port, checked by the caller via isPortConnected.
 */
export function portsConnectable(a: PortRef, b: PortRef): boolean {
  if (a.direction === b.direction) return false
  const outPort = a.direction === 'out' ? a : b
  const inPort = a.direction === 'out' ? b : a
  const validFromKinds: PortRef['kind'][] = ['mixer', 'stagebox', 'stage_multi', 'device', 'device_link']
  const validToKinds: PortRef['kind'][] = ['stagebox', 'stage_multi', 'device']
  return validFromKinds.includes(outPort.kind) && validToKinds.includes(inPort.kind)
}

/** Whether a to_kind's input side is pure console/network routing rather than a real physical run (FR-013). */
export function isCablelessToKind(kind: PortRef['kind']): boolean {
  return kind === 'stagebox' || kind === 'stage_multi'
}
