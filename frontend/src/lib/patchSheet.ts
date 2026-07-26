import { isCablelessEdge, type PortRef as InputPortRef } from './inputGraph'
import { buildInputChannelFlow, type FlowHop as InputFlowHop, type InputFlowContext } from './inputSignalFlow'
import { isCablelessToKind } from './outputGraph'
import { buildOutputChannelFlow, type OutputFlowContext } from './signalFlow'
import type { AudioPatchOutput, Console, InputChannel, InputSource } from '../types'

/** A node a chain segment addresses — the click target the per-hop picker acts on. */
export interface SegmentNode {
  kind: InputPortRef['kind'] | 'mixer' | 'device_link'
  id: number
  /** Zero-based port index. A range collapses two consecutive ports into one segment. */
  port: number
  /** Set when a stereo pair collapsed to a range: the second port index. */
  portTo?: number
}

/** One addressable hop of a row's signal path, rendered left to right in signal order. */
export interface ChainSegment {
  /** What the sheet prints, e.g. `Beta 91A`, `SB1 : 1`, `SB1 : 6–7`, `ch 1`. */
  label: string
  kind: 'source' | 'stagebox' | 'multi' | 'device' | 'console' | 'channel' | 'destination'
  /** True → a stated gap ("no source", "not patched"), never an empty cell. */
  missing: boolean
  /** The node this segment is, when it is repatchable. Absent on the row's own end. */
  node?: SegmentNode
  /** The cable that lands on this segment, for the per-hop picker. */
  cableId?: number
  /** The second cable, when a stereo pair collapsed into one segment. */
  cableIdTo?: number
  /**
   * The cable behind this hop, as text — the picked catalog item, or
   * `built-in` for a network hop. The screen keeps it out of the line (it is
   * one click away in the hop picker); the printed sheet shows it, because
   * paper is what you pack cables from.
   */
  detail?: string
}

/** One line of a chain cell. A stereo pair whose two sides diverge produces two. */
export interface ChainLine {
  /** `L`/`R` when the sides had to be shown separately; undefined when they collapsed. */
  sideLabel?: string
  segments: ChainSegment[]
}

export interface ChainCellModel {
  lines: ChainLine[]
  /** At least one line states a missing link. */
  hasGap: boolean
}

/**
 * The catalog item's own name, without its description — `Shure SM58 —
 * Dynamic vocal mic` reads as `Shure SM58`. The sheet has one line per
 * channel and the full label belongs in the row editor, not the chain.
 */
function shortLabel(label: string | undefined): string | undefined {
  return label?.split(' — ')[0]
}

function portLabel(name: string, port: number, portTo?: number): string {
  return portTo != null ? `${name} : ${port + 1}–${portTo + 1}` : `${name} : ${port + 1}`
}

/**
 * A console's own jack, which reads as prose rather than as a numbered port:
 * `SD10 local in 1`, not `SD10 : 1` — the desk's jacks are named on its back
 * panel that way, and it keeps them distinct from a stagebox jack at a glance.
 */
function jackLabel(prefix: string, port: number, portTo?: number): string {
  return portTo != null ? `${prefix} ${port + 1}–${portTo + 1}` : `${prefix} ${port + 1}`
}

function nodeNameFor(node: SegmentNode, context: { stageboxes: { id: number; name: string }[]; stageMultis: { id: number; name: string }[]; devices: { id: number; name: string }[] }): string {
  if (node.kind === 'stagebox') return context.stageboxes.find((sb) => sb.id === node.id)?.name ?? `#${node.id}`
  if (node.kind === 'stage_multi') return context.stageMultis.find((sm) => sm.id === node.id)?.name ?? `#${node.id}`
  return context.devices.find((d) => d.id === node.id)?.name ?? `#${node.id}`
}

/**
 * What a Source contributes as the first segment of an input chain: the mic
 * it carries, or its connector when it is a line source — the source's own
 * name is already the row's Name column, so repeating it would waste the
 * width the chain needs.
 */
function sourceSegmentLabel(source: InputSource | undefined, context: InputFlowContext): string {
  if (!source) return 'source'
  const mic = source.mic_item_id ? shortLabel(context.itemLabelById.get(source.mic_item_id)) : undefined
  return mic ?? source.name
}

/** The cable behind a hop as text: the picked item, or `built-in` for a network hop. */
function inputCableDetail(cableId: number | undefined, context: InputFlowContext): string | undefined {
  const cable = context.cables.find((candidate) => candidate.id === cableId)
  if (!cable) return undefined
  if (cable.cable_item_id) return context.itemLabelById.get(cable.cable_item_id) ?? `Item #${cable.cable_item_id}`
  return isCablelessEdge(cable.from_kind, cable.to_kind) ? 'built-in' : undefined
}

function inputSegmentsForHops(hops: InputFlowHop[], context: InputFlowContext): ChainSegment[] {
  return hops.flatMap((hop): ChainSegment[] => {
    if (!hop.node) return []
    const node = { kind: hop.node.kind, id: hop.node.id, port: hop.node.port }
    const detail = inputCableDetail(hop.cableId, context)
    if (hop.node.kind === 'source') {
      const source = context.sources.find((s) => s.id === hop.node!.id)
      return [{ label: sourceSegmentLabel(source, context), kind: 'source', missing: false, node, cableId: hop.cableId, detail }]
    }
    if (hop.node.kind === 'device') {
      // A DI box's port index is noise: they have one or two, and which one
      // carries the signal is visible in Flow, not useful on a sheet line.
      return [{ label: nodeNameFor(node, context), kind: 'device', missing: false, node, cableId: hop.cableId, detail }]
    }
    if (hop.node.kind === 'console_local') {
      // Straight into the desk's own preamp — the run that had to be faked
      // through a stagebox before the console existed.
      const desk = context.consoles?.find((console) => console.id === hop.node!.id)
      const name = desk?.name ? `${desk.name} local in` : 'local in'
      return [{ label: jackLabel(name, hop.node.port), kind: 'console', missing: false, node, cableId: hop.cableId, detail }]
    }
    return [
      {
        label: portLabel(nodeNameFor(node, context), hop.node.port),
        kind: hop.node.kind === 'stage_multi' ? 'multi' : 'stagebox',
        missing: false,
        node,
        cableId: hop.cableId,
        detail,
      },
    ]
  })
}

/**
 * Two lines collapse into one when they pass through the same nodes in the
 * same order — the ordinary stereo case, where L and R run down adjacent
 * jacks of the same boxes. Consecutive ports become a range (`SB1 : 6–7`),
 * a shared node becomes `×2`. When the sides genuinely diverge (L through a
 * stagebox, R straight into the desk) they stay two labelled lines, because
 * collapsing them would state something untrue.
 */
function collapseStereo(a: ChainSegment[], b: ChainSegment[], context: { stageboxes: { id: number; name: string }[]; stageMultis: { id: number; name: string }[]; devices: { id: number; name: string }[] }): ChainSegment[] | null {
  if (a.length !== b.length || a.length === 0) return null
  const merged: ChainSegment[] = []
  for (let i = 0; i < a.length; i++) {
    const left = a[i]
    const right = b[i]
    if (left.kind !== right.kind || left.missing || right.missing) return null
    if (!left.node || !right.node) return null
    if (left.node.kind !== right.node.kind) return null
    // A stereo pair's two sides are two separate Sources by design (the model
    // has no "stereo source row" — `sourcePorts` returns two real ports), so
    // differing ids are expected at the origin and only there.
    if (left.node.kind !== 'source' && left.node.id !== right.node.id) return null
    const consecutive = right.node.port === left.node.port + 1
    const node: SegmentNode = { ...left.node, portTo: consecutive ? right.node.port : undefined }
    const label =
      left.kind === 'stagebox' || left.kind === 'multi'
        ? portLabel(nodeNameFor(node, context), node.port, node.portTo)
        : left.label !== right.label
          ? `${left.label} / ${right.label}`
          : left.kind === 'source'
            ? `${left.label} ×2`
            : left.label
    merged.push({ ...left, label, node, cableIdTo: right.cableId })
  }
  return merged
}

/**
 * One input channel's chain cell (Slice 23 FR-009 to FR-011): the whole
 * signal path from the mic to the desk channel, in signal order, on one
 * line, with every hop addressable.
 *
 * This is a render of `buildInputChannelFlow`, not a second traversal — the
 * backward walk over `input_cables` is unchanged and still shared with the
 * printed sheet, so screen and paper cannot drift.
 */
export function inputChainSegments(channel: InputChannel, context: InputFlowContext): ChainCellModel {
  const flow = buildInputChannelFlow(channel, context)
  const tail: ChainSegment = { label: `ch ${channel.channel_number}`, kind: 'channel', missing: false }

  const perPath = flow.paths.map((path) => {
    if (path.hops.length === 0) {
      return [{ label: 'no source', kind: 'source' as const, missing: true }, tail]
    }
    return [...inputSegmentsForHops(path.hops, context), tail]
  })

  if (perPath.length === 2) {
    const collapsed = collapseStereo(perPath[0].slice(0, -1), perPath[1].slice(0, -1), context)
    if (collapsed) return { lines: [{ segments: [...collapsed, tail] }], hasGap: flow.hasGap }
  }

  const lines: ChainLine[] =
    perPath.length === 1
      ? [{ segments: perPath[0] }]
      : perPath.map((segments, index) => ({ sideLabel: flow.paths[index].sideLabel ?? (index === 0 ? 'L' : 'R'), segments }))
  return { lines, hasGap: flow.hasGap }
}

/**
 * One output's chain cell: the desk output, then every hop out to the last
 * destination. Mirrors the input side, over `buildOutputChannelFlow`'s
 * forward walk.
 *
 * `consoleLabel` names the desk; until an event declares a console it is
 * simply "Mixer", which is what the graph has always called it.
 */
export function outputChainSegments(
  output: AudioPatchOutput,
  context: OutputFlowContext,
  options: { consoleLabel?: string; consoles?: Console[] } = {},
): ChainCellModel {
  const flow = buildOutputChannelFlow(output, context)
  const consoleLabel = options.consoleLabel ?? 'Mixer'
  const head: ChainSegment = {
    label: `${consoleLabel} : ${output.output_number}`,
    kind: 'console',
    missing: false,
  }

  const perPath = flow.paths.map((path): ChainSegment[] => {
    const segments = path.hops.flatMap((hop): ChainSegment[] => {
      if (hop.kind === 'cable') return []
      if (hop.kind === 'direct' || !hop.node) return [{ label: 'not patched', kind: 'destination', missing: true }]
      const node: SegmentNode = { kind: hop.node.kind, id: hop.node.id, port: hop.node.port }
      const cable = context.cables.find((candidate) => candidate.id === hop.cableId)
      const detail = cable?.cable_item_id
        ? context.itemLabelById.get(cable.cable_item_id) ?? `Item #${cable.cable_item_id}`
        : cable && isCablelessToKind(cable.to_kind)
          ? 'built-in'
          : undefined
      if (hop.node.kind === 'console_local') {
        const desk = options.consoles?.find((console) => console.id === hop.node!.id)
        const name = desk?.name ? `${desk.name} local out` : 'local out'
        return [{ label: jackLabel(name, hop.node.port), kind: 'console', missing: false, node, cableId: hop.cableId, detail }]
      }
      if (hop.node.kind === 'device' || hop.node.kind === 'device_link') {
        return [{ label: `${nodeNameFor({ ...node, kind: 'device' }, context)} in ${hop.node.port + 1}`, kind: 'device', missing: false, node, cableId: hop.cableId, detail }]
      }
      return [
        {
          label: portLabel(nodeNameFor(node, context), hop.node.port),
          kind: hop.node.kind === 'stage_multi' ? 'multi' : 'stagebox',
          missing: false,
          node,
          cableId: hop.cableId,
          detail,
        },
      ]
    })
    return [head, ...segments]
  })

  const gap = perPath.some((segments) => segments.some((segment) => segment.missing))

  if (perPath.length === 2) {
    const collapsed = collapseStereo(perPath[0].slice(1), perPath[1].slice(1), context)
    if (collapsed) {
      const stereoHead: ChainSegment = { ...head, label: `${consoleLabel} : ${output.output_number}` }
      return { lines: [{ segments: [stereoHead, ...collapsed] }], hasGap: gap }
    }
  }

  const lines: ChainLine[] =
    perPath.length === 1
      ? [{ segments: perPath[0] }]
      : perPath.map((segments, index) => ({ sideLabel: flow.paths[index]?.sideLabel ?? (index === 0 ? 'L' : 'R'), segments }))
  return { lines, hasGap: gap || flow.hasGap }
}

/**
 * Middle-out truncation (FR of the sheet's chain column): the first and last
 * hop always survive, because they are the two a technician checks — what the
 * signal is, and where it lands. Returns the segments to render plus how many
 * were dropped, so the cell can say so rather than silently shortening.
 */
export function truncateSegments(segments: ChainSegment[], max: number): { segments: ChainSegment[]; hidden: number } {
  if (max < 2 || segments.length <= max) return { segments, hidden: 0 }
  const head = Math.ceil(max / 2)
  const tail = max - head
  return {
    segments: [...segments.slice(0, head), ...segments.slice(segments.length - tail)],
    hidden: segments.length - max,
  }
}
