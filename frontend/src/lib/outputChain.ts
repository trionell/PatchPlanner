import type { OutputChainHop, OutputDevice, StageMulti, Stagebox } from '../types'
import { legacyCableText } from './utils'

export interface HopLabelContext {
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  outputDevices: OutputDevice[]
  /** Catalog item labels (name — description), for inventory device/cable picks. */
  itemLabelById: Map<number, string>
  /** Owned-gear item labels, for owned device picks. */
  ownedItemLabelById: Map<number, string>
  /** Display label for a legacy cable type value (defaults to the raw value). */
  cableLabel?: (value: string) => string
}

/**
 * A hop's device/route label, e.g. "Shure SM58", "SB FOH Rack ch 5", or
 * "—" when nothing is picked yet — reuses the exact "SB {name} ch {n}" /
 * "Multi {name} ch {n}" format the input/output patch sheets already use
 * for stagebox/stage-multi routing.
 */
export function hopLabel(hop: OutputChainHop, context: HopLabelContext): string {
  if (hop.hop_kind === 'route') {
    if (hop.stagebox_id) {
      const name = context.stageboxes.find((sb) => sb.id === hop.stagebox_id)?.name ?? `#${hop.stagebox_id}`
      return `SB ${name} ch ${hop.stagebox_channel ?? '—'}`
    }
    if (hop.stage_multi_id) {
      const name = context.stageMultis.find((sm) => sm.id === hop.stage_multi_id)?.name ?? `#${hop.stage_multi_id}`
      return `Multi ${name} ch ${hop.stage_multi_channel ?? '—'}`
    }
    return '—'
  }
  if (hop.device_source === 'shared' && hop.output_device_id) {
    return context.outputDevices.find((device) => device.id === hop.output_device_id)?.name ?? `#${hop.output_device_id}`
  }
  if (hop.device_source === 'inventory' && hop.inventory_item_id) {
    return context.itemLabelById.get(hop.inventory_item_id) ?? `#${hop.inventory_item_id}`
  }
  if (hop.device_source === 'owned' && hop.owned_item_id) {
    return context.ownedItemLabelById.get(hop.owned_item_id) ?? `#${hop.owned_item_id}`
  }
  return '—'
}

/** Side B's own, independently-patched route (stereo route hops only). */
export function hopLabelB(hop: OutputChainHop, context: HopLabelContext): string | undefined {
  if (hop.hop_kind !== 'route') return undefined
  if (hop.stagebox_id_b) {
    const name = context.stageboxes.find((sb) => sb.id === hop.stagebox_id_b)?.name ?? `#${hop.stagebox_id_b}`
    return `SB ${name} ch ${hop.stagebox_channel_b ?? '—'}`
  }
  if (hop.stage_multi_id_b) {
    const name = context.stageMultis.find((sm) => sm.id === hop.stage_multi_id_b)?.name ?? `#${hop.stage_multi_id_b}`
    return `Multi ${name} ch ${hop.stage_multi_channel_b ?? '—'}`
  }
  return undefined
}

/** The hop's cable pick, catalog label or legacy text — '' when none set. */
export function hopCableLabel(hop: OutputChainHop, context: HopLabelContext): string {
  if (hop.cable_item_id) return context.itemLabelById.get(hop.cable_item_id) ?? `#${hop.cable_item_id}`
  if (hop.cable_type) return legacyCableText(hop.cable_type, hop.cable_length_m, context.cableLabel ?? ((value) => value))
  return ''
}

/**
 * Side B's own, independently-picked cable — undefined when unset (the
 * default "same cable both sides" convenience is active, no second label
 * to show). No legacy fallback: cable_item_id_b is new in this slice, so
 * a migrated hop never has legacy text for it.
 */
export function hopCableLabelB(hop: OutputChainHop, context: HopLabelContext): string | undefined {
  if (!hop.cable_item_id_b) return undefined
  return context.itemLabelById.get(hop.cable_item_id_b) ?? `#${hop.cable_item_id_b}`
}

/**
 * A hop is a gap when its device (device hops) or route (route hops) is
 * unset — the cable is optional and never itself a gap, matching how a
 * missing non-DI cable already isn't flagged on the input side (FR-013).
 */
export function isHopGap(hop: OutputChainHop): boolean {
  if (hop.hop_kind === 'route') {
    return !hop.stagebox_id && !hop.stage_multi_id
  }
  return !hop.inventory_item_id && !hop.owned_item_id && !hop.output_device_id
}
