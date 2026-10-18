import type { DeskMix, DeskRoute, InputChannel } from '../types'
import type { SelectedDesk } from './patchCapacity'
import { directOutAllowed, fedByKinds, mixLabel } from './deskRouting'
import { stripLabel } from './deskStrips'

/**
 * An output's Fed by as one key (Slice 48): `mix:id:port` (port 0 = L or mono,
 * 1 = R), `channel:id` for an LV1 direct out, '' for nothing. It is the source of
 * the output's one route into it.
 */
export function fedByKey(routes: DeskRoute[], outputId: number): string {
  const route = routes.find((candidate) => candidate.dst_kind === 'output' && candidate.dst_id === outputId)
  if (!route) return ''
  return route.src_kind === 'mix' ? `mix:${route.src_id}:${route.src_port}` : `channel:${route.src_id}`
}

export function fedBySource(key: string): { src_kind: 'mix' | 'channel'; src_id: number; side?: 'L' | 'R' } | null {
  if (!key) return null
  const [kind, id, port] = key.split(':')
  if (kind === 'channel') return { src_kind: 'channel', src_id: Number(id) }
  return { src_kind: 'mix', src_id: Number(id), side: port === '1' ? 'R' : port === '0' ? 'L' : undefined }
}

/** The Fed by cell: the mix (with its side when one was picked), a direct out, or —. */
export function fedByLabel(key: string, mixes: DeskMix[], channels: InputChannel[]): string {
  if (!key) return '—'
  const [kind, id, port] = key.split(':')
  if (kind === 'channel') {
    const channel = channels.find((candidate) => candidate.id === Number(id))
    return channel ? `${channel.channel_name || `Ch ${channel.channel_number}`} direct` : 'direct out'
  }
  const mix = mixes.find((candidate) => candidate.id === Number(id))
  if (!mix) return '—'
  return mix.width === 'stereo' && port === '1' ? `${mixLabel(mix)} · R` : mixLabel(mix)
}

/**
 * What an output on this desk can be fed by: its mains, groups or buses, monitors
 * and matrices (never FX), and on LV1 and Generic a channel's direct out. A stereo
 * mix on a mono output is offered side by side.
 */
export function fedByOptions(desk: SelectedDesk, mixes: DeskMix[], channels: InputChannel[], outputWidth: 'mono' | 'stereo') {
  const kinds = fedByKinds()
  const options = mixes
    .filter((mix) => mix.console_id === desk.console.id && kinds.includes(mix.kind))
    .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || a.slot - b.slot)
    .flatMap((mix) =>
      mix.width === 'stereo' && outputWidth === 'mono'
        ? [
            { value: `mix:${mix.id}:0`, label: `${mixLabel(mix)} · L` },
            { value: `mix:${mix.id}:1`, label: `${mixLabel(mix)} · R` },
          ]
        : [{ value: `mix:${mix.id}:0`, label: mixLabel(mix) }],
    )
  if (directOutAllowed(desk.model)) {
    for (const channel of channels.filter((candidate) => candidate.console_id === desk.console.id)) {
      options.push({ value: `channel:${channel.id}`, label: `${stripLabel(desk.model, channel)} ${channel.channel_name ?? ''} · direct out` })
    }
  }
  return options
}
