import type { AudioPatchOutput, Console, OutputCable, OutputDevice, StageMulti, Stagebox } from '../types'

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
 * A stagebox's ports: one count sizes BOTH sides — it's a full pass-through
 * node, symmetric with a stage multi. On this graph that count is
 * `output_count`, the box's returns; the input graph passes `input_count`, its
 * mic jacks. A channel routes into a specific jack (input side, pure
 * console/network routing, never a physical cable) and a real cable carries on
 * from that same jack (output side).
 */
export function stageboxPorts(stagebox: Stagebox, count: number = stagebox.output_count): { inputs: PortRef[]; outputs: PortRef[] } {
  const inputs = Array.from({ length: count }, (_, i) => ({
    kind: 'stagebox' as const,
    id: stagebox.id,
    port: i,
    direction: 'in' as const,
    label: `In ${i + 1}`,
  }))
  const outputs = Array.from({ length: count }, (_, i) => ({
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
 * A desk's own jacks on the output graph (Slice 23): `local_output_count`
 * sockets, each a pass-through pair — an output routes into the in side (the
 * desk's own routing, never a cable) and a real cable leaves the out side.
 * The stagebox's shape on this graph, mirrored.
 */
export function consoleLocalPorts(desk: Console, count: number = desk.local_output_count): { inputs: PortRef[]; outputs: PortRef[] } {
  // Distinct labels per side (Slice 24) — the mirror of the input graph's. An
  // output arrives from the desk on the in side; the real cable leaves the out
  // side, which keeps the "local out" wording the sheets already use.
  const make = (direction: 'in' | 'out', prefix: string) =>
    Array.from({ length: count }, (_, i) => ({
      kind: 'console_local' as const,
      id: desk.id,
      port: i,
      direction,
      label: `${prefix} ${i + 1}`,
    }))
  return { inputs: make('in', 'From desk'), outputs: make('out', 'Local out') }
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

/**
 * Any node's zone, resolving a device's role when needed. A link port lives on
 * the same canvas node as its owning device's ordinary ports.
 *
 * `console_local` moved out of `sources` in Slice 24: the desk's jacks became
 * their own two-sided node, and what signal passes through belongs in the
 * processing lane — the same lane, and the same shape, as a stagebox.
 */
export function nodeZone(kind: PortRef['kind'], id: number, context: { devices: OutputDevice[] }): Zone {
  if (kind === 'mixer') return 'sources'
  if (kind === 'stagebox' || kind === 'stage_multi' || kind === 'console_local') return 'processing'
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
  context: { outputs: AudioPatchOutput[]; stageboxes: Stagebox[]; stageMultis: StageMulti[]; devices: OutputDevice[]; consoles?: Console[] },
): PortRef | undefined {
  if (kind === 'mixer') {
    return mixerPorts(context.outputs).find((p) => p.id === id && p.port === port)
  }
  if (kind === 'console_local') {
    const desk = context.consoles?.find((c) => c.id === id)
    if (!desk) return undefined
    const { inputs, outputs } = consoleLocalPorts(desk)
    return (direction === 'in' ? inputs : outputs).find((p) => p.port === port)
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
    case 'console_local': return 'Console jack'
  }
}

/** A node's display name, resolving against whichever collection it belongs to. */
export function nodeName(
  kind: PortRef['kind'],
  id: number,
  context: { outputs: AudioPatchOutput[]; stageboxes: Stagebox[]; stageMultis: StageMulti[]; devices: OutputDevice[]; consoles?: Console[] },
): string {
  switch (kind) {
    case 'mixer': {
      // Named after the desk the output belongs to, once the event has one —
      // the anonymous "Mixer" was only ever a placeholder for a missing entity.
      const output = context.outputs.find((row) => row.id === id)
      const desk = context.consoles?.find((c) => c.id === output?.console_id)
      return desk?.name || 'Mixer'
    }
    case 'console_local': {
      const desk = context.consoles?.find((c) => c.id === id)
      return desk ? desk.name || 'Console' : `#${id}`
    }
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
  const validFromKinds: PortRef['kind'][] = ['mixer', 'stagebox', 'stage_multi', 'device', 'device_link', 'console_local']
  const validToKinds: PortRef['kind'][] = ['stagebox', 'stage_multi', 'device', 'console_local']
  return validFromKinds.includes(outPort.kind) && validToKinds.includes(inPort.kind)
}

/**
 * The output-side port that carries a given input-side port's signal onward —
 * the mirror of the input graph's pairing rule: same index through a stagebox or
 * stage multi (they are physical pass-throughs), and for a device same index
 * only when its two sides match in count, else its sole output.
 */
function pairedForward(kind: PortRef['kind'], id: number, inPort: number, devices: OutputDevice[]): number {
  if (kind === 'device') {
    const device = devices.find((d) => d.id === id)
    if (device && device.input_port_count !== device.output_port_count) return 0
  }
  return inPort
}

export interface OutputColorContext {
  outputs: AudioPatchOutput[]
  cables: OutputCable[]
  devices: OutputDevice[]
}

/**
 * A port's derived colour on the output graph: the colour of the output row whose
 * run passes through it, found by walking backward to the mixer port. Colour
 * therefore answers the same question it does on the input side — which desk
 * channel this run belongs to — rather than decorating the canvas.
 *
 * Undefined when the run cannot be traced back to an output, or that output has
 * no colour set.
 *
 * Slice 23 wrote this walk for cables only, so the output graph's *cables* wore a
 * colour and every port they joined stayed grey — half a coloured run (Slice 25
 * research.md R4). This is the same walk, seeded from a port instead of from a
 * cable's origin, which is what makes a port and the cable attached to it unable
 * to disagree.
 *
 * There is deliberately no agree-or-neutral rule here, unlike the input graph's
 * `derivedPortColor`. That one exists because a source may fan out to several
 * channels which then have to agree; this walk goes *backward*, and a port has at
 * most one inbound cable, so there is exactly one origin. A mixer port fanning out
 * to several destinations gives each of them the same one colour, which is
 * correct — they are all carrying that output.
 */
export function derivedOutputPortColor(
  fromKind: PortRef['kind'],
  fromId: number,
  fromPort: number,
  context: OutputColorContext,
): string | undefined {
  let kind = fromKind
  let id = fromId
  let port = fromPort
  const seen = new Set<string>()

  for (let depth = 0; depth < 32; depth++) {
    if (kind === 'mixer') return context.outputs.find((output) => output.id === id)?.color
    const key = `${kind}:${id}:${port}`
    if (seen.has(key)) return undefined
    seen.add(key)
    // Which cable landed on this node's matching input-side port?
    const inbound = context.cables.find((candidate) => {
      if (candidate.to_kind !== kind || candidate.to_id !== id) return false
      return pairedForward(candidate.to_kind, candidate.to_id, candidate.to_port, context.devices) === port
    })
    if (!inbound) return undefined
    kind = inbound.from_kind
    id = inbound.from_id
    port = inbound.from_port
  }
  return undefined
}

/** A cable's derived colour: the colour of the port it leaves from (Slice 23). */
export function derivedCableColor(cable: OutputCable, context: OutputColorContext): string | undefined {
  return derivedOutputPortColor(cable.from_kind, cable.from_id, cable.from_port, context)
}

/** Whether a to_kind's input side is pure console/network routing rather than a real physical run (FR-013). */
export function isCablelessToKind(kind: PortRef['kind']): boolean {
  // console_local joins them (Slice 23): routing an output to one of the desk's
  // own jacks is desk routing; the real cable is the one leaving that jack.
  return kind === 'stagebox' || kind === 'stage_multi' || kind === 'console_local'
}

/**
 * Whether a stage multi belongs on the output flow graph. A stage multi is
 * normally input-only; showing it here is a secondary, connector-adapter use,
 * so it defaults to hidden — but a multi with a real output cable stays
 * visible regardless of the flag, so that cable's edge never goes missing.
 */
export function isStageMultiVisibleInOutputGraph(stageMulti: StageMulti, cables: OutputCable[]): boolean {
  if (stageMulti.show_in_output_graph) return true
  return cables.some(
    (cable) =>
      (cable.from_kind === 'stage_multi' && cable.from_id === stageMulti.id) ||
      (cable.to_kind === 'stage_multi' && cable.to_id === stageMulti.id),
  )
}

/**
 * How many jacks the desk's panel draws: its count, or more when a cable is
 * still on a jack a model switch took away (Slice 47 D9). Those are kept and
 * drawn flagged over; no new cable can reach one, the server refuses it.
 */
export function localJackCount(desk: Console, cables: { from_kind: string; from_id: number; from_port: number; to_kind: string; to_id: number; to_port: number }[]): number {
  let highest = -1
  for (const cable of cables) {
    if (cable.from_kind === 'console_local' && cable.from_id === desk.id) highest = Math.max(highest, cable.from_port)
    if (cable.to_kind === 'console_local' && cable.to_id === desk.id) highest = Math.max(highest, cable.to_port)
  }
  return Math.max(desk.local_output_count, highest + 1)
}
