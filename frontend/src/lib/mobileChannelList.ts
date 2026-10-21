import { buildInputChannelFlows } from './inputSignalFlow'
import { inputChainSegments } from './patchSheet'
import type { Console, InputCable, InputChannel, InputDevice, InputSource, StageMulti, Stagebox } from '../types'

/** One row in the mobile Audio Inputs/Outputs list — read projection only, never a new query (data-model.md). */
export interface MobileChannelListItem {
  id: number
  channelNumber: number
  name: string
  color?: string
  /** Ultimate origin (mic/DI) name, or "—" for a gap. */
  sourceLabel: string
  /** Nearest upstream hop (usually "Stagebox A — In 7"), or "—" for a gap. */
  routingLabel: string
  /**
   * True when this channel is one of the ones the status strip is counting.
   *
   * It is a flag rather than a `sourceLabel === '—'` test at the call site because that
   * would make a filter depend on a display value: the next person to write "no source"
   * instead of an em dash would break a filter in a file they never opened (research.md
   * R7).
   *
   * And it is read from **the sheet's own chain model**, not derived here, so the
   * phone's filtered view and the strip's count cannot disagree — the strip says
   * *3 gaps* and the filter must show those three, by construction rather than by two
   * definitions that happen to agree today.
   */
  hasGap: boolean
}

interface ListContext {
  sources: InputSource[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
  itemLabelById: Map<number, string>
  /** For a desk jack's name on the row (`FOH aux in 3`), D9. */
  consoles?: Console[]
}

/** Builds the mobile channel list from the same audio-patch data the desktop tab already fetches. */
export function buildMobileChannelList(channels: InputChannel[], context: ListContext): MobileChannelListItem[] {
  const flowContext = { ...context, channels }
  const flows = buildInputChannelFlows(channels, flowContext)
  const byNumber = new Map(flows.map((flow) => [flow.channelNumber, flow]))
  return [...channels]
    .sort((a, b) => a.channel_number - b.channel_number)
    .map((channel) => {
      const flow = byNumber.get(channel.channel_number)
      const path = flow?.paths[0]
      return {
        id: channel.id,
        channelNumber: channel.channel_number,
        name: channel.channel_name || `Ch ${channel.channel_number}`,
        color: channel.color,
        sourceLabel: path?.sourceName ?? '—',
        routingLabel: path?.hops.at(-1)?.label ?? '—',
        hasGap: inputChainSegments(channel, flowContext).hasGap,
      }
    })
}

/**
 * The panels a cable lands on before a channel, as the phone edits them: a
 * stagebox, or a desk's own local jacks or rear aux sockets (D9). All three are
 * the same pass-through — a cable into jack N, a hop from jack N to the channel.
 */
export type JackPanelKind = 'stagebox' | 'console_local' | 'console_aux'
export interface JackPanel {
  kind: JackPanelKind
  id: number
}
const JACK_PANEL_KINDS: readonly string[] = ['stagebox', 'console_local', 'console_aux']

function isJackPanel(kind: string): kind is JackPanelKind {
  return JACK_PANEL_KINDS.includes(kind)
}

/** A channel's current routing, resolved to editable IDs (not just display labels) — covers the two on-site-common shapes: source→panel→channel, and a direct source→channel cable. Devices/stage-multis in the chain stay a desktop-only edit (research.md R3's documented scope). */
export interface ChannelRouting {
  panel?: JackPanel
  /** 0-indexed jack on the panel. */
  port?: number
  sourceId?: number
}

export function resolveChannelRouting(channelId: number, cables: InputCable[], channelPort = 0): ChannelRouting {
  const toChannel = cables.find((c) => c.to_kind === 'channel' && c.to_id === channelId && c.to_port === channelPort)
  if (!toChannel) return {}
  if (isJackPanel(toChannel.from_kind)) {
    const panel = { kind: toChannel.from_kind, id: toChannel.from_id }
    const port = toChannel.from_port
    const toPanel = cables.find((c) => c.to_kind === panel.kind && c.to_id === panel.id && c.to_port === port)
    const sourceId = toPanel?.from_kind === 'source' ? toPanel.from_id : undefined
    return { panel, port, sourceId }
  }
  if (toChannel.from_kind === 'source') {
    return { sourceId: toChannel.from_id }
  }
  return {}
}

export interface RoutingSaveOps {
  cablesToDelete: number[]
  cablesToCreate: Array<Omit<InputCable, 'id' | 'event_id'>>
}

/** Diffs the desired routing against the current cables and returns exactly the delete/create pair needed (research.md R3 — never a rewrite of the whole graph, only the edges that actually changed). */
export function computeRoutingSave(channelId: number, cables: InputCable[], desired: ChannelRouting, channelPort = 0): RoutingSaveOps {
  const cablesToDelete: number[] = []
  const cablesToCreate: RoutingSaveOps['cablesToCreate'] = []
  const currentToChannel = cables.find((c) => c.to_kind === 'channel' && c.to_id === channelId && c.to_port === channelPort)

  const panel = desired.panel
  if (panel && desired.port != null) {
    const jackChanged =
      !currentToChannel || currentToChannel.from_kind !== panel.kind || currentToChannel.from_id !== panel.id || currentToChannel.from_port !== desired.port
    if (jackChanged) {
      if (currentToChannel) {
        cablesToDelete.push(currentToChannel.id)
        // Moving off a jack orphans whatever fed *that* jack (a physical
        // unplug) — remove it too, or the vacated jack keeps showing a
        // source that's no longer actually feeding anything.
        if (isJackPanel(currentToChannel.from_kind)) {
          const oldFeed = cables.find((c) => c.to_kind === currentToChannel.from_kind && c.to_id === currentToChannel.from_id && c.to_port === currentToChannel.from_port)
          if (oldFeed) cablesToDelete.push(oldFeed.id)
        }
      }
      cablesToCreate.push({ from_kind: panel.kind, from_id: panel.id, from_port: desired.port, to_kind: 'channel', to_id: channelId, to_port: channelPort })
    }
    if (desired.sourceId != null) {
      const currentToPanel = cables.find((c) => c.to_kind === panel.kind && c.to_id === panel.id && c.to_port === desired.port)
      const sourceMatches = currentToPanel?.from_kind === 'source' && currentToPanel.from_id === desired.sourceId
      if (!sourceMatches) {
        if (currentToPanel && !cablesToDelete.includes(currentToPanel.id)) cablesToDelete.push(currentToPanel.id)
        cablesToCreate.push({ from_kind: 'source', from_id: desired.sourceId, from_port: 0, to_kind: panel.kind, to_id: panel.id, to_port: desired.port })
      }
    }
    return { cablesToDelete, cablesToCreate }
  }

  if (desired.sourceId != null) {
    const matches = currentToChannel && currentToChannel.from_kind === 'source' && currentToChannel.from_id === desired.sourceId
    if (!matches) {
      if (currentToChannel) cablesToDelete.push(currentToChannel.id)
      cablesToCreate.push({ from_kind: 'source', from_id: desired.sourceId, from_port: 0, to_kind: 'channel', to_id: channelId, to_port: channelPort })
    }
  }

  return { cablesToDelete, cablesToCreate }
}
