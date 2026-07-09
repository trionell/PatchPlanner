import type { AudioPatchInput, StageMulti, Stagebox } from '../types'

/** One hop in an input channel's signal chain. */
export interface FlowHop {
  label: string
  kind: 'source' | 'cable' | 'stagebox' | 'multi' | 'direct'
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
