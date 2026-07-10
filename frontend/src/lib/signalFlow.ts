import type { AudioPatchInput, AudioPatchOutput, OutputCable, OutputDevice, StageMulti, Stagebox } from '../types'
import { devicePorts, isPortConnected, mixerPorts, nodeName, stageboxPorts, stageMultiPorts, type PortRef } from './outputGraph'

/** One hop in an input channel's signal chain. */
export interface FlowHop {
  label: string
  kind: 'source' | 'cable' | 'stagebox' | 'multi' | 'direct' | 'device' | 'route'
  /** True → rendered as a flagged gap, never silently omitted. */
  missing: boolean
  /** Secondary line, e.g. cable length. */
  detail?: string
}

/** View-model for one input channel's chain: source → cable → path → console. */
export interface ChannelFlow {
  channelNumber: number
  channelName: string
  source: FlowHop
  cable: FlowHop
  path: FlowHop
  /** Side B's own, independently-patched route — present only when width is 'stereo'. */
  pathB?: FlowHop
  /** The DI's source→DI cable — present only when signal_type is 'di'. */
  sourceCable?: FlowHop
  hasGap: boolean
}

export interface FlowContext {
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  /** Inventory item names, for resolving mic_item_id. */
  micNameById: Map<number, string>
  /** Catalog cable item labels (name — description), for resolving cable_item_id. */
  cableLabelById?: Map<number, string>
  /** Display label for a legacy cable type value (defaults to the raw value). */
  cableLabel?: (value: string) => string
  /** Catalog cable item labels, for resolving a DI channel's source_cable_item_id. */
  sourceCableLabelById?: Map<number, string>
}

/**
 * Derives the signal chain for one input channel. Pure: renders stored data
 * as-is (legacy values included) and never guesses intent — a channel with
 * no stagebox/multi routing is a legitimate "direct to console" run, not a
 * gap, while a half-assigned routing (box without channel, or channel
 * without box) is flagged. A stereo channel's side B and a DI channel's
 * source cable are additional, independently-flagged hops.
 */
export function buildChannelFlow(input: AudioPatchInput, context: FlowContext): ChannelFlow {
  const source = sourceHop(input, context.micNameById)
  const cable = cableHop(input, context)
  const path = pathHop(input.stagebox_id, input.stagebox_channel, input.stage_multi_id, input.stage_multi_channel, context)
  const pathB = input.width === 'stereo'
    ? pathHop(input.stagebox_id_b, input.stagebox_channel_b, input.stage_multi_id_b, input.stage_multi_channel_b, context)
    : undefined
  const sourceCable = input.signal_type === 'di' ? sourceCableHop(input, context) : undefined
  return {
    channelNumber: input.channel_number,
    channelName: input.channel_name ?? '',
    source,
    cable,
    path,
    pathB,
    sourceCable,
    hasGap: source.missing || cable.missing || path.missing || (pathB?.missing ?? false) || (sourceCable?.missing ?? false),
  }
}

/** All channels' flows, sorted by channel number (same order as the inputs tab). */
export function buildChannelFlows(inputs: AudioPatchInput[], context: FlowContext): ChannelFlow[] {
  return [...inputs]
    .sort((a, b) => a.channel_number - b.channel_number)
    .map((input) => buildChannelFlow(input, context))
}

function sourceHop(input: AudioPatchInput, micNameById: Map<number, string>): FlowHop {
  if (input.mic_item_id) {
    const name = micNameById.get(input.mic_item_id) ?? input.mic_label ?? `Item #${input.mic_item_id}`
    return { label: name, kind: 'source', missing: false }
  }
  if (input.mic_label) {
    return { label: input.mic_label, kind: 'source', missing: false }
  }
  return { label: 'No source picked', kind: 'source', missing: true }
}

// A channel without a cable (no pick, no legacy value) renders as an empty
// hop, not a gap — a cable is optional (wireless receivers, local patches).
function cableHop(input: AudioPatchInput, context: FlowContext): FlowHop {
  if (input.cable_item_id) {
    const name = context.cableLabelById?.get(input.cable_item_id) ?? `Item #${input.cable_item_id}`
    return { label: name, kind: 'cable', missing: false }
  }
  const cableLabel = context.cableLabel ?? ((value) => value)
  return {
    label: input.cable_type ? cableLabel(input.cable_type) : '—',
    kind: 'cable',
    missing: false,
    detail: (input.cable_length_m ?? 0) > 0 ? `${input.cable_length_m} m` : undefined,
  }
}

/**
 * Physical routing hop shared by side A and side B (an independently
 * patched stereo channel reuses the exact same missing/present rules for
 * its own route — see research.md R5).
 */
function pathHop(
  stageboxId: number | undefined,
  stageboxChannel: number | undefined,
  stageMultiId: number | undefined,
  stageMultiChannel: number | undefined,
  context: FlowContext,
): FlowHop {
  if (stageboxId) {
    const name = context.stageboxes.find((sb) => sb.id === stageboxId)?.name ?? `Stagebox #${stageboxId}`
    if (!stageboxChannel) {
      return { label: `SB ${name} — no channel`, kind: 'stagebox', missing: true }
    }
    return { label: `SB ${name} · ch ${stageboxChannel}`, kind: 'stagebox', missing: false }
  }
  if (stageMultiId) {
    const name = context.stageMultis.find((sm) => sm.id === stageMultiId)?.name ?? `Multi #${stageMultiId}`
    if (!stageMultiChannel) {
      return { label: `Multi ${name} — no channel`, kind: 'multi', missing: true }
    }
    return { label: `Multi ${name} · ch ${stageMultiChannel}`, kind: 'multi', missing: false }
  }
  if (stageboxChannel) {
    return { label: `ch ${stageboxChannel} — no stagebox picked`, kind: 'stagebox', missing: true }
  }
  if (stageMultiChannel) {
    return { label: `ch ${stageMultiChannel} — no multi picked`, kind: 'multi', missing: true }
  }
  return { label: 'Direct to console', kind: 'direct', missing: false }
}

// A DI channel with no source cable picked is a real gap (unlike the
// optional console-side cable above) — FR-010 requires it be flagged.
function sourceCableHop(input: AudioPatchInput, context: FlowContext): FlowHop {
  if (input.source_cable_item_id) {
    const name = context.sourceCableLabelById?.get(input.source_cable_item_id) ?? `Item #${input.source_cable_item_id}`
    return { label: name, kind: 'cable', missing: false }
  }
  return { label: 'No source cable picked', kind: 'cable', missing: true }
}

export interface OutputFlowContext {
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  /** Catalog item labels (name — description), for resolving cable_item_id. */
  itemLabelById: Map<number, string>
}

/** One full trace from a mixer port to a dead end (a destination device, a stage-multi hand-off with nothing further wired, or simply nothing connected yet). */
export interface OutputPathFlow {
  /** "L"/"R" when the channel is stereo (each side traced independently); undefined on mono. */
  sideLabel?: string
  hops: FlowHop[]
}

/** View-model for one output channel: every path reachable from its mixer port(s) — more than one per side when a device fans out to several destinations. */
export interface OutputChannelFlow {
  outputNumber: number
  outputName: string
  paths: OutputPathFlow[]
  hasGap: boolean
}

/**
 * A device's input side is a gap when it has declared input ports that
 * aren't all wired (data-model.md's derived gap rule — "a processing/
 * destination device with an unfilled input"): the tech explicitly
 * declared that many inputs, so an unwired one signals something was
 * forgotten. A stage multi's or stagebox's channel count is fixed
 * hardware capacity (e.g. a 12-channel snake, an 8-out stagebox) — using
 * only some of its channels is normal, not a gap, so both are exempt
 * entirely (matches FR-012: a multi's channels don't have to share a
 * source or destination, and most events won't use every one). A
 * missing cable_item_id is never itself a gap (the cable pick is always
 * optional, same precedent as the input side's non-DI cable — and this
 * uniformly covers a stage multi's/stagebox's forced-null pick without a
 * special case).
 */
function hasUnfilledInput(kind: PortRef['kind'], id: number, context: OutputFlowContext): boolean {
  if (kind !== 'device') return false
  const device = context.devices.find((d) => d.id === id)
  if (!device || device.input_port_count === 0) return false
  const connected = devicePorts(device).inputs.filter((p) => isPortConnected(p.kind, p.id, p.port, 'in', context.cables)).length
  return connected < device.input_port_count
}

/**
 * Walks forward from one output-side port, following `to` → that node's
 * other `from` ports, branching into one array per downstream path when a
 * node fans out to more than one destination (contracts/output-graph-
 * api.md) — a mixer port can itself carry more than one cable (fan-out to
 * several physical destinations at once), so every match is its own
 * branch from the very first hop, not just further down the chain. An
 * unconnected starting port renders as "direct" — matching the input
 * side's "no routing = direct to console, not a gap" precedent,
 * generalized to any source's output side.
 */
function walkFromPort(port: PortRef, context: OutputFlowContext, gapNodes: Set<string>): FlowHop[][] {
  const nameContext = { outputs: [], stageboxes: context.stageboxes, stageMultis: context.stageMultis, devices: context.devices }
  const outgoing = context.cables.filter((c) => c.from_kind === port.kind && c.from_id === port.id && c.from_port === port.port)
  if (outgoing.length === 0) return [[{ label: 'Direct to output', kind: 'direct', missing: false }]]

  return outgoing.flatMap((cable) => {
    if (hasUnfilledInput(cable.to_kind, cable.to_id, context)) gapNodes.add(`${cable.to_kind}:${cable.to_id}`)

    const stepHops: FlowHop[] = []
    if (cable.cable_item_id) {
      stepHops.push({ label: context.itemLabelById.get(cable.cable_item_id) ?? `Item #${cable.cable_item_id}`, kind: 'cable', missing: false })
    }
    const destName = nodeName(cable.to_kind, cable.to_id, nameContext)
    stepHops.push({
      label: `${destName} ch ${cable.to_port + 1}`,
      kind: cable.to_kind === 'stage_multi' ? 'multi' : cable.to_kind === 'stagebox' ? 'stagebox' : 'device',
      missing: false,
    })

    // A device mixes/distributes internally, so every declared output
    // port — plus any link-out ports, for a chained destination device —
    // is a candidate continuation. A stage multi or stagebox is a
    // straight pass-through — input index N is physically the same jack
    // as output index N, so only that one port continues.
    let outPorts: PortRef[] = []
    if (cable.to_kind === 'device') {
      const device = context.devices.find((d) => d.id === cable.to_id)
      if (device) {
        const ports = devicePorts(device)
        outPorts = [...ports.outputs, ...ports.links].filter((p) => isPortConnected(p.kind, p.id, p.port, 'out', context.cables))
      }
    } else if (cable.to_kind === 'stage_multi') {
      const multi = context.stageMultis.find((sm) => sm.id === cable.to_id)
      if (multi) outPorts = stageMultiPorts(multi).outputs.filter((p) => p.port === cable.to_port && isPortConnected(p.kind, p.id, p.port, 'out', context.cables))
    } else {
      const stagebox = context.stageboxes.find((sb) => sb.id === cable.to_id)
      if (stagebox) outPorts = stageboxPorts(stagebox).outputs.filter((p) => p.port === cable.to_port && isPortConnected(p.kind, p.id, p.port, 'out', context.cables))
    }
    if (outPorts.length === 0) return [stepHops]
    return outPorts.flatMap((outPort) => walkFromPort(outPort, context, gapNodes).map((branch) => [...stepHops, ...branch]))
  })
}

/** Derives every path for one output channel — mirrors buildChannelFlow's presentation but over the cable graph instead of fixed source/cable/path fields (Slice 11, replaces the Slice 10 chain walk). */
export function buildOutputChannelFlow(output: AudioPatchOutput, context: OutputFlowContext): OutputChannelFlow {
  const ports = mixerPorts([output])
  const gapNodes = new Set<string>()
  const paths: OutputPathFlow[] = ports.flatMap((port) =>
    walkFromPort(port, context, gapNodes).map((hops) => ({ sideLabel: ports.length > 1 ? port.label : undefined, hops })),
  )
  return {
    outputNumber: output.output_number,
    outputName: output.output_name ?? '',
    paths,
    hasGap: gapNodes.size > 0,
  }
}

/** All output channels' flows, sorted by output number (same order as the outputs tab). */
export function buildOutputChannelFlows(outputs: AudioPatchOutput[], context: OutputFlowContext): OutputChannelFlow[] {
  return [...outputs]
    .sort((a, b) => a.output_number - b.output_number)
    .map((output) => buildOutputChannelFlow(output, context))
}
