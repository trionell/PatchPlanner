import { useState } from 'react'
import { mixLabel, recorderTracks } from '../../../lib/deskRouting'
import { stripLabel } from '../../../lib/deskStrips'
import type { Console, DeskMix, DeskModel, DeskRoute, InputChannel } from '../../../types'
import { Button } from '../../ui/Button'
import { MicroLabel } from '../../ui/Label'
import { Select } from '../../ui/Select'

type TrackRoute = Omit<DeskRoute, 'id' | 'console_id'>

interface TrackDraft {
  /** `channel:id` for a preamp, `mix:id:side` for a mix side, '' for nothing. */
  record: string
  /** A channel id, or 0. */
  play: number
  mode: 'soundcheck' | 'source'
}

interface RecorderTableProps {
  desk: Console
  model: DeskModel
  channels: InputChannel[]
  mixes: DeskMix[]
  routes: DeskRoute[]
  readOnly: boolean
  pending?: boolean
  error?: string
  onSave: (routes: TrackRoute[]) => void
  onFill: () => void
}

function draftsFrom(desk: Console, routes: DeskRoute[], tracks: number): TrackDraft[] {
  const drafts: TrackDraft[] = Array.from({ length: tracks }, () => ({ record: '', play: 0, mode: 'soundcheck' }))
  for (const route of routes) {
    if (route.dst_kind === 'recorder' && route.dst_id === desk.id && route.dst_port >= 1 && route.dst_port <= tracks) {
      drafts[route.dst_port - 1].record = route.src_kind === 'channel' ? `channel:${route.src_id}` : `mix:${route.src_id}:${route.src_port}`
    }
    if (route.src_kind === 'recorder' && route.src_id === desk.id && route.src_port >= 1 && route.src_port <= tracks) {
      drafts[route.src_port - 1].play = route.dst_id
      drafts[route.src_port - 1].mode = route.mode === 'source' ? 'source' : 'soundcheck'
    }
  }
  return drafts
}

/**
 * The Recorder table (Slice 48 §09): one row per track, what it records — a preamp,
 * named by the channel it feeds, or a mix side — and which channel it plays back
 * into, as soundcheck or as the channel's source. The card's 32 on X32 · M32, 64 on
 * LV1, typed on Generic.
 */
export function RecorderTable({ desk, model, channels, mixes, routes, readOnly, pending, error, onSave, onFill }: RecorderTableProps) {
  const tracks = recorderTracks(model, desk)
  const [drafts, setDrafts] = useState<TrackDraft[] | null>(null)
  if (!desk.recorder) {
    return <p className="px-3 py-3 text-xs text-zinc-500">This desk has no recorder. Declare it on the desk's card in Rig.</p>
  }
  const current = drafts ?? draftsFrom(desk, routes, tracks)
  const editing = drafts != null
  const recordOptions = [
    ...channels.map((channel) => ({ value: `channel:${channel.id}`, label: `Preamp · ${stripLabel(model, channel)} ${channel.channel_name ?? ''}` })),
    ...mixes
      .filter((mix) => mix.kind !== 'dca' && mix.kind !== 'mute')
      .flatMap((mix) =>
        mix.width === 'stereo'
          ? [
              { value: `mix:${mix.id}:0`, label: `${mixLabel(mix)} · L` },
              { value: `mix:${mix.id}:1`, label: `${mixLabel(mix)} · R` },
            ]
          : [{ value: `mix:${mix.id}:0`, label: mixLabel(mix) }],
      ),
  ]
  const set = (index: number, patch: Partial<TrackDraft>) => setDrafts(current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)))
  const save = () => {
    const next: TrackRoute[] = []
    current.forEach((draft, index) => {
      const track = index + 1
      if (draft.record) {
        const [kind, id, side] = draft.record.split(':')
        next.push({ src_kind: kind as 'channel' | 'mix', src_id: Number(id), src_port: Number(side ?? 0), dst_kind: 'recorder', dst_id: desk.id, dst_port: track, mode: '' })
      }
      if (draft.play) {
        next.push({ src_kind: 'recorder', src_id: desk.id, src_port: track, dst_kind: 'channel', dst_id: draft.play, dst_port: 0, mode: draft.mode })
      }
    })
    onSave(next)
    setDrafts(null)
  }
  const used = current.filter((draft) => draft.record || draft.play).length

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <MicroLabel>{model.engine === 'x32' ? 'Card' : model.engine === 'lv1' ? 'SoundGrid recorder' : 'Recorder'}</MicroLabel>
        <span className="font-mono text-[10px] tabular-nums text-zinc-500">
          {used}/{tracks} tracks
        </span>
        {!readOnly && (
          <span className="ml-auto flex gap-2">
            {editing ? (
              <>
                <Button size="xs" disabled={pending} onClick={save}>
                  Save tracks
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setDrafts(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="xs" variant="outline" disabled={pending} onClick={onFill}>
                  Record every preamp
                </Button>
                <Button size="xs" variant="outline" onClick={() => setDrafts(current)}>
                  Edit tracks
                </Button>
              </>
            )}
          </span>
        )}
      </div>
      {error && <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              <th className="px-2 py-1 font-normal"><MicroLabel>Track</MicroLabel></th>
              <th className="px-2 py-1 font-normal"><MicroLabel>Records</MicroLabel></th>
              <th className="px-2 py-1 font-normal"><MicroLabel>Plays into</MicroLabel></th>
              <th className="px-2 py-1 font-normal"><MicroLabel>As</MicroLabel></th>
            </tr>
          </thead>
          <tbody>
            {current.map((draft, index) =>
              !editing && !draft.record && !draft.play ? null : (
                <tr key={index} className="border-b border-zinc-800/40">
                  <td className="px-2 py-1 font-mono tabular-nums text-zinc-400">{index + 1}</td>
                  <td className="px-2 py-1">
                    {editing ? (
                      <Select size="sm" value={draft.record} onChange={(event) => set(index, { record: event.target.value })}>
                        <option value="">—</option>
                        {recordOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-zinc-200">{recordOptions.find((option) => option.value === draft.record)?.label ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {editing ? (
                      <Select size="sm" value={draft.play || ''} onChange={(event) => set(index, { play: Number(event.target.value) || 0 })}>
                        <option value="">—</option>
                        {channels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {stripLabel(model, channel)} {channel.channel_name ?? ''}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-zinc-300">
                        {(() => {
                          const channel = channels.find((candidate) => candidate.id === draft.play)
                          return channel ? `${stripLabel(model, channel)} ${channel.channel_name ?? ''}` : '—'
                        })()}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {editing && draft.play ? (
                      <Select size="sm" value={draft.mode} onChange={(event) => set(index, { mode: event.target.value as TrackDraft['mode'] })}>
                        <option value="soundcheck">Soundcheck</option>
                        <option value="source">Source</option>
                      </Select>
                    ) : (
                      <span className="text-zinc-500">{draft.play ? draft.mode : ''}</span>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {!editing && used === 0 && <p className="px-2 py-2 text-xs text-zinc-500">No tracks routed yet.</p>}
      </div>
    </div>
  )
}
