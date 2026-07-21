import { buildInputChannelFlows } from './inputSignalFlow'
import type { InputCable, InputChannel, InputDevice, InputSource, StageMulti, Stagebox } from '../types'

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
}

interface ListContext {
  sources: InputSource[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
  itemLabelById: Map<number, string>
}

/** Builds the mobile channel list from the same audio-patch data the desktop tab already fetches. */
export function buildMobileChannelList(channels: InputChannel[], context: ListContext): MobileChannelListItem[] {
  const flows = buildInputChannelFlows(channels, { ...context, channels })
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
      }
    })
}

/** A channel's current routing, resolved to editable IDs (not just display labels) — covers the two on-site-common shapes: source→stagebox→channel, and a direct source→channel cable. Devices/stage-multis in the chain stay a desktop-only edit (research.md R3's documented scope). */
export interface ChannelRouting {
  stageboxId?: number
  /** 0-indexed stagebox input port. */
  port?: number
  sourceId?: number
}

export function resolveChannelRouting(channelId: number, cables: InputCable[], channelPort = 0): ChannelRouting {
  const toChannel = cables.find((c) => c.to_kind === 'channel' && c.to_id === channelId && c.to_port === channelPort)
  if (!toChannel) return {}
  if (toChannel.from_kind === 'stagebox') {
    const stageboxId = toChannel.from_id
    const port = toChannel.from_port
    const toStagebox = cables.find((c) => c.to_kind === 'stagebox' && c.to_id === stageboxId && c.to_port === port)
    const sourceId = toStagebox?.from_kind === 'source' ? toStagebox.from_id : undefined
    return { stageboxId, port, sourceId }
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

  if (desired.stageboxId != null && desired.port != null) {
    const stageboxPortChanged =
      !currentToChannel || currentToChannel.from_kind !== 'stagebox' || currentToChannel.from_id !== desired.stageboxId || currentToChannel.from_port !== desired.port
    if (stageboxPortChanged) {
      if (currentToChannel) {
        cablesToDelete.push(currentToChannel.id)
        // Moving off a stagebox port orphans whatever fed *that* port (a
        // physical unplug) — remove it too, or the vacated port keeps
        // showing a source that's no longer actually feeding anything.
        if (currentToChannel.from_kind === 'stagebox') {
          const oldPortFeed = cables.find((c) => c.to_kind === 'stagebox' && c.to_id === currentToChannel.from_id && c.to_port === currentToChannel.from_port)
          if (oldPortFeed) cablesToDelete.push(oldPortFeed.id)
        }
      }
      cablesToCreate.push({ from_kind: 'stagebox', from_id: desired.stageboxId, from_port: desired.port, to_kind: 'channel', to_id: channelId, to_port: channelPort })
    }
    if (desired.sourceId != null) {
      const currentToStagebox = cables.find((c) => c.to_kind === 'stagebox' && c.to_id === desired.stageboxId && c.to_port === desired.port)
      const sourceMatches = currentToStagebox?.from_kind === 'source' && currentToStagebox.from_id === desired.sourceId
      if (!sourceMatches) {
        if (currentToStagebox && !cablesToDelete.includes(currentToStagebox.id)) cablesToDelete.push(currentToStagebox.id)
        cablesToCreate.push({ from_kind: 'source', from_id: desired.sourceId, from_port: 0, to_kind: 'stagebox', to_id: desired.stageboxId, to_port: desired.port })
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
