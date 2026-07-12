import { channelPorts, isCablelessEdge, nodeName, type PortRef } from './inputGraph'
import type { InputCable, InputChannel, InputDevice, InputSource, StageMulti, Stagebox } from '../types'

/** One hop in a channel's signal chain, ordered Source → … → Channel. */
export interface FlowHop {
  label: string
  kind: 'source' | 'cable' | 'stagebox' | 'multi' | 'device'
  missing: boolean
}

/** One full backward-walked path from one Channel port to a Source (or a gap). */
export interface InputPathFlow {
  /** "L"/"R" when the channel is stereo (each side traced independently); undefined on mono. */
  sideLabel?: string
  hops: FlowHop[]
  /** The ultimate origin Source's own plain name (no cable label) — undefined when this path is a gap. */
  sourceName?: string
}

/** View-model for one input channel: every path reachable backward from its port(s). */
export interface InputChannelFlow {
  channelNumber: number
  channelName: string
  paths: InputPathFlow[]
  /** True when at least one port has nothing at all feeding it (research.md R8/FR-022). */
  hasGap: boolean
}

export interface InputFlowContext {
  sources: InputSource[]
  channels: InputChannel[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
  /** Catalog item labels (name — description), for resolving cable_item_id. */
  itemLabelById: Map<number, string>
}

/**
 * A processing node's input-side port paired with a given output-side
 * port index: Stagebox/Stage-Multi are always same-index pass-throughs
 * (data-model.md); a Device pairs same-index when its two sides match in
 * count (e.g. a stereo DI, 2 in/2 out — the shape this feature's own
 * migration creates), otherwise falls back to its sole input (a 1-in
 * fan-out device).
 */
function upstreamPort(kind: PortRef['kind'], id: number, outputPort: number, context: InputFlowContext): number {
  if (kind === 'device') {
    const device = context.devices.find((d) => d.id === id)
    if (device && device.input_port_count !== device.output_port_count) return 0
  }
  return outputPort
}

/**
 * Walks input_cables backward from one Channel port — to whichever edge
 * targets it, to that edge's origin, recursing until a Source (research.md
 * R8) — rather than the Output graph's forward walk from the Mixer. A
 * to-port always carries at most one cable, so this is always a single
 * linear chain, never a branch.
 */
function walkBackwardFromPort(port: PortRef, context: InputFlowContext): { hops: FlowHop[]; sourceName?: string } {
  const hops: FlowHop[] = []
  let cursorKind: PortRef['kind'] = port.kind
  let cursorId = port.id
  let cursorPort = port.port
  let sourceName: string | undefined

  for (let depth = 0; depth < 32; depth++) {
    const cable = context.cables.find((c) => c.to_kind === cursorKind && c.to_id === cursorId && c.to_port === cursorPort)
    if (!cable) break
    const originName = nodeName(cable.from_kind, cable.from_id, context)
    const cableLabel = cable.cable_item_id
      ? context.itemLabelById.get(cable.cable_item_id) ?? `Item #${cable.cable_item_id}`
      : isCablelessEdge(cable.from_kind, cable.to_kind)
        ? 'built-in'
        : undefined
    hops.unshift({
      label: `${originName}${cableLabel ? ` — ${cableLabel}` : ''}`,
      kind: cable.from_kind === 'source' ? 'source' : cable.from_kind === 'device' ? 'device' : cable.from_kind === 'stage_multi' ? 'multi' : 'stagebox',
      missing: false,
    })
    if (cable.from_kind === 'source') {
      sourceName = originName
      break
    }
    cursorPort = upstreamPort(cable.from_kind, cable.from_id, cable.from_port, context)
    cursorKind = cable.from_kind
    cursorId = cable.from_id
  }

  return { hops, sourceName }
}

/** Derives every path for one input channel — one per port (2 for stereo), mirroring buildOutputChannelFlow's presentation but walking backward instead of forward. */
export function buildInputChannelFlow(channel: InputChannel, context: InputFlowContext): InputChannelFlow {
  const ports = channelPorts(channel)
  const paths: InputPathFlow[] = ports.map((port) => {
    const { hops, sourceName } = walkBackwardFromPort(port, context)
    return { sideLabel: ports.length > 1 ? port.label : undefined, hops, sourceName }
  })
  return {
    channelNumber: channel.channel_number,
    channelName: channel.channel_name ?? '',
    paths,
    hasGap: paths.some((p) => p.hops.length === 0),
  }
}

/** All channels' flows, sorted by channel number (same order as the Channels table). */
export function buildInputChannelFlows(channels: InputChannel[], context: InputFlowContext): InputChannelFlow[] {
  return [...channels].sort((a, b) => a.channel_number - b.channel_number).map((channel) => buildInputChannelFlow(channel, context))
}
