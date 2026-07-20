import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { createInputChannel, deleteInputChannel, updateInputChannel } from '../../api/audioPatch'
import { buildInputChannelFlow } from '../../lib/inputSignalFlow'
import type { InputCable, InputChannel, InputDevice, InputSource, MixerDCA, MixerGroup, Stagebox, StageMulti } from '../../types'
import { busTint } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { BusMultiSelect } from './BusMultiSelect'
import { ColorSelect } from './ColorSelect'

/** Read-only fallback for BusMultiSelect (a shared component with no
 * disabled prop) — assigned buses only, no remove/add affordances. */
function ReadOnlyBusBadges({ selected, options }: { selected: number[]; options: { id: number; name: string; color?: string }[] }) {
  if (selected.length === 0) return <span className="text-sm text-zinc-500">—</span>
  const byId = new Map(options.map((option) => [option.id, option]))
  return (
    <div className="flex flex-wrap gap-1">
      {selected.map((id) => {
        const bus = byId.get(id)
        return <Badge key={id} style={busTint(bus?.color)}>{bus?.name ?? `#${id}`}</Badge>
      })}
    </div>
  )
}

/**
 * Manager for input Channels — the console strip only (name, width,
 * mixer behavior, groups, DCA, color, notes). What feeds a channel is
 * entirely determined by the graph below; the "Source" column here is a
 * read-only summary resolved from input_cables, never a stored
 * reference — editing a channel's own fields never touches whichever
 * Source ends up feeding it (US2).
 */
export function ChannelSection({
  eventId,
  channels,
  sources,
  devices,
  stageboxes,
  stageMultis,
  cables,
  groups,
  dcas,
  readOnly = false,
}: {
  eventId: number
  channels: InputChannel[]
  sources: InputSource[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
  groups: MixerGroup[]
  dcas: MixerDCA[]
  readOnly?: boolean
}) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const createM = useMutation({ mutationFn: (data: Omit<InputChannel, 'id' | 'event_id'>) => createInputChannel(eventId, data), onSuccess: invalidate })
  const updateM = useMutation({ mutationFn: ({ id, data }: { id: number; data: Omit<InputChannel, 'id' | 'event_id'> }) => updateInputChannel(eventId, id, data), onSuccess: invalidate })
  const deleteM = useMutation({ mutationFn: (id: number) => deleteInputChannel(eventId, id), onSuccess: invalidate })

  /**
   * The ultimate origin Source's own name for each of a channel's ports —
   * walks input_cables all the way back (research.md R8's full backward
   * walk, shared with inputSignalFlow.ts), not just one hop, so a chain
   * through both a Stagebox and a Stage-Multi resolves to the real
   * Source, never an intermediate node's name. Collapses to a single
   * name when every port agrees (the common mono case, or a stereo
   * channel whose two sides happen to share one label already).
   */
  function feedSummary(channel: InputChannel): string {
    const flow = buildInputChannelFlow(channel, { sources, channels, devices, stageboxes, stageMultis, cables, itemLabelById: new Map() })
    const names = flow.paths.map((p) => p.sourceName ?? '—')
    return names.every((n) => n === names[0]) ? names[0] : names.join(' / ')
  }

  const saveField = (channel: InputChannel, patch: Partial<InputChannel>) => {
    const merged = { ...channel, ...patch }
    updateM.mutate({
      id: channel.id,
      data: {
        channel_number: merged.channel_number,
        channel_name: merged.channel_name,
        color: merged.color,
        group_ids: merged.group_ids,
        dca_ids: merged.dca_ids,
        width: merged.width,
        mixer_behavior: merged.mixer_behavior,
        notes: merged.notes,
      },
    })
  }

  const addChannel = () => {
    const highest = channels.reduce((max, c) => Math.max(max, c.channel_number), 0)
    createM.mutate({ channel_number: highest + 1, width: 'mono', mixer_behavior: 'stereo_channel' })
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Channels</CardTitle>
        {!readOnly && <Button size="sm" onClick={addChannel}><Plus className="mr-2 h-4 w-4" />Add channel</Button>}
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm text-zinc-400">
          The console strip only — name, width, groups, DCA, notes, color. What feeds a channel is decided in the graph below, not here.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {['Ch#', 'Name', 'Width', 'Source (from graph)', 'Groups', 'DCA', 'Color', 'Notes', ''].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => (
                <TableRow key={channel.id} style={channel.color ? { backgroundColor: `${channel.color}0f` } : undefined}>
                  <TableCell style={channel.color ? { boxShadow: `inset 3px 0 0 0 ${channel.color}` } : undefined}>
                    <Input
                      type="number"
                      defaultValue={channel.channel_number}
                      disabled={readOnly}
                      onBlur={(e) => saveField(channel, { channel_number: Number(e.target.value) || channel.channel_number })}
                      className="w-16"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={channel.channel_name ?? ''}
                      disabled={readOnly}
                      onBlur={(e) => saveField(channel, { channel_name: e.target.value })}
                      className="min-w-36"
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={channel.width} disabled={readOnly} onChange={(e) => saveField(channel, { width: e.target.value as InputChannel['width'] })} className="min-w-24">
                      <option value="mono">Mono</option>
                      <option value="stereo">Stereo</option>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-400">{feedSummary(channel)}</TableCell>
                  <TableCell>
                    {readOnly ? (
                      <ReadOnlyBusBadges selected={channel.group_ids ?? []} options={groups} />
                    ) : (
                      <BusMultiSelect
                        selected={channel.group_ids ?? []}
                        options={groups}
                        onChange={(ids) => saveField(channel, { group_ids: ids })}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {readOnly ? (
                      <ReadOnlyBusBadges selected={channel.dca_ids ?? []} options={dcas} />
                    ) : (
                      <BusMultiSelect
                        selected={channel.dca_ids ?? []}
                        options={dcas}
                        onChange={(ids) => saveField(channel, { dca_ids: ids })}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {readOnly ? (
                      <span aria-hidden className="inline-block h-4 w-4 rounded border border-zinc-600" style={channel.color ? { backgroundColor: channel.color } : undefined} />
                    ) : (
                      <ColorSelect value={channel.color} onChange={(color) => saveField(channel, { color })} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={channel.notes ?? ''}
                      disabled={readOnly}
                      onBlur={(e) => saveField(channel, { notes: e.target.value })}
                      className="min-w-36"
                    />
                  </TableCell>
                  <TableCell>
                    {!readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => deleteM.mutate(channel.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {(createM.error ?? updateM.error ?? deleteM.error) && (
          <p className="mt-2 text-sm text-red-400">{(createM.error ?? updateM.error ?? deleteM.error)?.message}</p>
        )}
      </CardContent>
    </Card>
  )
}
