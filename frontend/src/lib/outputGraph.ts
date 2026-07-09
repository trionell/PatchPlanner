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

/** A stagebox's ports: output_count output-only ports, no input side in this graph (FR-004). */
export function stageboxPorts(stagebox: Stagebox): PortRef[] {
  return Array.from({ length: stagebox.output_count }, (_, i) => ({
    kind: 'stagebox' as const,
    id: stagebox.id,
    port: i,
    direction: 'out' as const,
    label: `Ch ${i + 1}`,
  }))
}

/** A stage multi's ports: `channels` on each side, independently connectable (FR-012). */
export function stageMultiPorts(stageMulti: StageMulti): { inputs: PortRef[]; outputs: PortRef[] } {
  const inputs = Array.from({ length: stageMulti.channels }, (_, i) => ({
    kind: 'stage_multi' as const,
    id: stageMulti.id,
    port: i,
    direction: 'in' as const,
    label: `Ch ${i + 1}`,
  }))
  const outputs = Array.from({ length: stageMulti.channels }, (_, i) => ({
    kind: 'stage_multi' as const,
    id: stageMulti.id,
    port: i,
    direction: 'out' as const,
    label: `Ch ${i + 1}`,
  }))
  return { inputs, outputs }
}

/** A device's ports on each side, per its declared port counts. */
export function devicePorts(device: OutputDevice): { inputs: PortRef[]; outputs: PortRef[] } {
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

/** Whether a specific port already carries a cable. */
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

/** The cable (if any) attached to a specific port. */
export function cableAtPort(
  kind: PortRef['kind'],
  id: number,
  port: number,
  direction: 'in' | 'out',
  cables: OutputCable[],
): OutputCable | undefined {
  return cables.find((cable) =>
    direction === 'out'
      ? cable.from_kind === kind && cable.from_id === id && cable.from_port === port
      : cable.to_kind === kind && cable.to_id === id && cable.to_port === port,
  )
}

/** A node kind's display name, for labels and the picker. */
export function nodeKindLabel(kind: PortRef['kind']): string {
  switch (kind) {
    case 'mixer': return 'Mixer'
    case 'stagebox': return 'Stagebox'
    case 'stage_multi': return 'Stage multi'
    case 'device': return 'Device'
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
      return context.devices.find((device) => device.id === id)?.name ?? `#${id}`
  }
}

/** Two ports are compatible ends of a cable: opposite directions, and the graph's kind rules (FR-004/FR-005). */
export function portsConnectable(a: PortRef, b: PortRef): boolean {
  if (a.direction === b.direction) return false
  const outPort = a.direction === 'out' ? a : b
  const inPort = a.direction === 'out' ? b : a
  const validFromKinds: PortRef['kind'][] = ['mixer', 'stagebox', 'stage_multi', 'device']
  const validToKinds: PortRef['kind'][] = ['stage_multi', 'device']
  return validFromKinds.includes(outPort.kind) && validToKinds.includes(inPort.kind)
}
