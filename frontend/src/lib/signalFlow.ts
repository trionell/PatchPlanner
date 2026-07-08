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
}

/**
 * Derives the signal chain for one input channel. Pure: renders stored data
 * as-is (legacy values included) and never guesses intent — a channel with
 * no stagebox/multi routing is a legitimate "direct to console" run, not a
 * gap, while a half-assigned routing (box without channel, or channel
 * without box) is flagged.
 */
export function buildChannelFlow(input: AudioPatchInput, context: FlowContext): ChannelFlow {
  const source = sourceHop(input, context.micNameById)
  const cable = cableHop(input, context)
  const path = pathHop(input, context)
  return {
    channelNumber: input.channel_number,
    channelName: input.channel_name ?? '',
    source,
    cable,
    path,
    hasGap: source.missing || cable.missing || path.missing,
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

function pathHop(input: AudioPatchInput, context: FlowContext): FlowHop {
  if (input.stagebox_id) {
    const name = context.stageboxes.find((sb) => sb.id === input.stagebox_id)?.name ?? `Stagebox #${input.stagebox_id}`
    if (!input.stagebox_channel) {
      return { label: `SB ${name} — no channel`, kind: 'stagebox', missing: true }
    }
    return { label: `SB ${name} · ch ${input.stagebox_channel}`, kind: 'stagebox', missing: false }
  }
  if (input.stage_multi_id) {
    const name = context.stageMultis.find((sm) => sm.id === input.stage_multi_id)?.name ?? `Multi #${input.stage_multi_id}`
    if (!input.stage_multi_channel) {
      return { label: `Multi ${name} — no channel`, kind: 'multi', missing: true }
    }
    return { label: `Multi ${name} · ch ${input.stage_multi_channel}`, kind: 'multi', missing: false }
  }
  if (input.stagebox_channel) {
    return { label: `ch ${input.stagebox_channel} — no stagebox picked`, kind: 'stagebox', missing: true }
  }
  if (input.stage_multi_channel) {
    return { label: `ch ${input.stage_multi_channel} — no multi picked`, kind: 'multi', missing: true }
  }
  return { label: 'Direct to console', kind: 'direct', missing: false }
}
