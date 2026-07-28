import type { AudioPatchOutput, Console, OutputCable, OutputDevice, StageMulti, Stagebox } from '../types'
import { consoleLocalPorts, devicePorts, isPortConnected, mixerPorts, nodeName, stageboxPorts, stageMultiPorts, type PortRef } from './outputGraph'

/** One hop in a channel's signal chain (input side: see inputSignalFlow.ts's own copy — the two graphs' node-kind sets differ). */
export interface FlowHop {
  label: string
  kind: 'source' | 'cable' | 'stagebox' | 'multi' | 'direct' | 'device' | 'route'
  /** True → rendered as a flagged gap, never silently omitted. */
  missing: boolean
  /** Secondary line, e.g. cable length. */
  detail?: string
  /**
   * The node this hop lands on and the port it lands on (Slice 23) — what
   * makes a hop addressable, so the sheet's chain cell can offer to repatch
   * this hop and nothing else. `label` is unchanged, so the print sheets and
   * the mobile list are unaffected.
   */
  node?: { kind: PortRef['kind']; id: number; port: number }
  /** The cable this hop arrived through, for the per-hop picker. */
  cableId?: number
}

export interface OutputFlowContext {
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  /**
   * The event's desks, so a hop through a local jack can name the console
   * rather than printing `#3`, and so the walk can continue past one
   * (Slice 24 R9).
   */
  consoles?: Console[]
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
  const nameContext = {
    outputs: [],
    stageboxes: context.stageboxes,
    stageMultis: context.stageMultis,
    devices: context.devices,
    consoles: context.consoles,
  }
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
      // A desk's own socket is named as such rather than as a channel of the
      // desk: "FOH · SD10 local out 1" is what is written on the desk, and what
      // the sheets and the printed signal flow have to say (Slice 24 FR-016).
      label: cable.to_kind === 'console_local' ? `${destName} local out ${cable.to_port + 1}` : `${destName} ch ${cable.to_port + 1}`,
      kind: cable.to_kind === 'stage_multi' ? 'multi' : cable.to_kind === 'device' ? 'device' : 'stagebox',
      missing: false,
      node: { kind: cable.to_kind, id: cable.to_id, port: cable.to_port },
      cableId: cable.id,
    })

    // A stage multi, a stagebox, or a desk's own jack panel is a straight
    // pass-through — input index N is physically the same jack as output
    // index N, so only that one port continues.
    //
    // A device with **as many outputs as inputs** is the same claim about a
    // different box: an amplifier, an EQ, a comp, a symmetric DSP all carry
    // channel N to channel N. Treating every device as a distributor instead
    // meant a stereo output through a 2×2 amp branched from both its inputs to
    // both its outputs — four chains where the room has two, printed as
    // duplicate L and R lines with no way to tell which was real. A device
    // whose port counts differ genuinely does distribute (one in, four out is
    // a splitter), so that case still fans out.
    //
    // This is the rule the input graph has always used — inputSignalFlow's
    // `upstreamPort` pairs a device same-index when its two sides match and
    // falls back to the sole input when they do not. The two graphs disagreed
    // about the same piece of hardware; now they do not.
    //
    // Link-outs never take the jack rule: a link is a copy of the whole input,
    // which is the entire reason a subwoofer has one.
    //
    // console_local needs its own branch (Slice 24, research.md R9): before
    // this it fell through to the stagebox case, looked itself up among the
    // stageboxes, found nothing, and yielded no continuation — so a bus routed
    // to a local out and cabled onward to an amplifier read as ending at the
    // desk.
    const connectedOut = (p: PortRef) => isPortConnected(p.kind, p.id, p.port, 'out', context.cables)
    const sameJack = (p: PortRef) => p.port === cable.to_port && connectedOut(p)
    let outPorts: PortRef[] = []
    if (cable.to_kind === 'device') {
      const device = context.devices.find((d) => d.id === cable.to_id)
      if (device) {
        const ports = devicePorts(device)
        const channelPerChannel = device.output_port_count > 0 && device.output_port_count === device.input_port_count
        outPorts = [
          ...ports.outputs.filter(channelPerChannel ? sameJack : connectedOut),
          ...ports.links.filter(connectedOut),
        ]
      }
    } else if (cable.to_kind === 'stage_multi') {
      const multi = context.stageMultis.find((sm) => sm.id === cable.to_id)
      if (multi) outPorts = stageMultiPorts(multi).outputs.filter(sameJack)
    } else if (cable.to_kind === 'console_local') {
      const desk = context.consoles?.find((c) => c.id === cable.to_id)
      if (desk) outPorts = consoleLocalPorts(desk).outputs.filter(sameJack)
    } else if (cable.to_kind === 'stagebox') {
      const stagebox = context.stageboxes.find((sb) => sb.id === cable.to_id)
      if (stagebox) outPorts = stageboxPorts(stagebox).outputs.filter(sameJack)
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
