import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { deleteInputCable, deleteInputChannel, updateInputCable, updateInputChannel } from '../../api/audioPatch'
import { useRowEditor } from '../../hooks/useRowEditor'
import { isCablelessEdge } from '../../lib/inputGraph'
import { boxUsage, cablesPicked, consoleCapacity, type PatchStatus } from '../../lib/patchCapacity'
import { matchesSearch } from '../../lib/patchSearch'
import { inputChainSegments, type ChainCellModel, type SegmentNode } from '../../lib/patchSheet'
import type { InputFlowContext } from '../../lib/inputSignalFlow'
import { busTint } from '../../lib/utils'
import type { Console, InputCable, InputChannel, InputDevice, InputSource, InventoryItem, MixerDCA, MixerGroup, StageMulti, Stagebox } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { BusMultiSelect } from './BusMultiSelect'
import { ChainCell, type HopCable } from './ChainCell'
import { ColorSelect } from './ColorSelect'
import { PatchStatusRail } from './PatchStatusRail'

const COLUMNS = ['Ch', 'Name', 'W', 'Chain', '48 V', 'Buses', 'Notes']

interface ChannelDraft {
  channel_number: number
  channel_name: string
  width: InputChannel['width']
  color?: string
  group_ids: number[]
  dca_ids: number[]
  notes: string
}

interface InputSheetProps {
  eventId: number
  channels: InputChannel[]
  sources: InputSource[]
  devices: InputDevice[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  cables: InputCable[]
  groups: MixerGroup[]
  dcas: MixerDCA[]
  consoles: Console[]
  cableItems: InventoryItem[]
  itemLabelById: Map<number, string>
  search?: string
  /** Switches the tab to Flow with this node selected. */
  onEditInFlow?: (node: SegmentNode) => void
  onOpenRig?: () => void
  readOnly?: boolean
}

/**
 * The input patch sheet — the view an audio tab lands on (Slice 23 US2).
 * One line per channel carrying its whole signal path, one row editor at a
 * time, and a status rail that answers whether the plan holds.
 *
 * Routing is not editable here beyond a hop's cable pick: the row editor holds
 * console-strip fields only and links to Flow, which is the one place cabling
 * is decided.
 */
export function InputSheet({
  eventId,
  channels,
  sources,
  devices,
  stageboxes,
  stageMultis,
  cables,
  groups,
  dcas,
  consoles,
  cableItems,
  itemLabelById,
  search = '',
  onEditInFlow,
  onOpenRig,
  readOnly = false,
}: InputSheetProps) {
  const queryClient = useQueryClient()
  const [gapsOnly, setGapsOnly] = useState(false)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const updateChannel = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<InputChannel, 'id' | 'event_id'> }) => updateInputChannel(eventId, id, data),
    onSuccess: invalidate,
  })
  const removeChannel = useMutation({ mutationFn: (id: number) => deleteInputChannel(eventId, id), onSuccess: invalidate })
  const setCableItem = useMutation({
    mutationFn: ({ id, cableItemId }: { id: number; cableItemId?: number }) => updateInputCable(eventId, id, cableItemId),
    onSuccess: invalidate,
  })
  const removeCable = useMutation({ mutationFn: (id: number) => deleteInputCable(eventId, id), onSuccess: invalidate })

  const ordered = useMemo(() => [...channels].sort((a, b) => a.channel_number - b.channel_number), [channels])
  const context: InputFlowContext = { sources, channels, devices, stageboxes, stageMultis, cables, itemLabelById, consoles }

  /** One chain model per channel, plus what the row needs derived from it. */
  const rows = useMemo(
    () =>
      ordered.map((channel) => {
        const chain = inputChainSegments(channel, context)
        return { channel, chain, phantom: phantomFor(chain, sources) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordered, sources, devices, stageboxes, stageMultis, cables, consoles, itemLabelById],
  )

  const editor = useRowEditor<InputChannel, ChannelDraft>({
    rows: ordered,
    idOf: (channel) => channel.id,
    draftOf: (channel) => ({
      channel_number: channel.channel_number,
      channel_name: channel.channel_name ?? '',
      width: channel.width,
      color: channel.color,
      group_ids: channel.group_ids ?? [],
      dca_ids: channel.dca_ids ?? [],
      notes: channel.notes ?? '',
    }),
    persist: (channel, draft) =>
      updateChannel.mutate({
        id: channel.id,
        data: {
          channel_number: draft.channel_number,
          channel_name: draft.channel_name,
          width: draft.width,
          color: draft.color,
          group_ids: draft.group_ids,
          dca_ids: draft.dca_ids,
          notes: draft.notes,
          mixer_behavior: channel.mixer_behavior,
        },
      }),
  })

  const capacity = consoleCapacity(
    consoles,
    (console) => channels.filter((channel) => channel.console_id === console.id).length,
    (console) => console.input_count,
    'channel',
  )
  const status: PatchStatus = {
    rowCount: channels.length,
    consoleLabels: capacity.labels,
    boxes: boxUsage(stageboxes, stageMultis, cables),
    cablesPicked: cablesPicked(cables),
    gaps: rows
      .filter((row) => row.chain.hasGap)
      .map((row) => `Ch ${row.channel.channel_number} ${row.channel.channel_name || ''} has no source`.replace('  ', ' ')),
    overCapacity: capacity.overCapacity,
  }

  const chainText = (chain: ChainCellModel) => chain.lines.flatMap((line) => line.segments.map((segment) => segment.label)).join(' ')
  const visible = rows.filter(
    (row) =>
      (!gapsOnly || row.chain.hasGap) &&
      matchesSearch(search, row.channel.channel_number, row.channel.channel_name, row.channel.notes, chainText(row.chain)),
  )

  const hopCable = (cableId: number): HopCable | undefined => {
    const cable = cables.find((candidate) => candidate.id === cableId)
    if (!cable) return undefined
    return { id: cable.id, cableItemId: cable.cable_item_id, cableless: isCablelessEdge(cable.from_kind, cable.to_kind) }
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-zinc-700 bg-zinc-850">
        <Table>
          <TableHeader>
            <TableRow>{COLUMNS.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ channel, chain, phantom }) => (
              <Fragment key={channel.id}>
                <TableRow
                  className={readOnly ? undefined : 'cursor-pointer'}
                  style={channel.color ? { backgroundColor: `${channel.color}0f` } : undefined}
                  onClick={readOnly ? undefined : () => editor.openRow(channel)}
                >
                  <TableCell
                    className="font-mono text-zinc-300"
                    style={channel.color ? { boxShadow: `inset 3px 0 0 0 ${channel.color}` } : undefined}
                  >
                    {channel.channel_number}
                  </TableCell>
                  <TableCell className="text-zinc-100">{channel.channel_name || <span className="text-zinc-500">unnamed</span>}</TableCell>
                  <TableCell className="font-mono text-xs text-zinc-500">{channel.width === 'stereo' ? 'S' : 'M'}</TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <ChainCell
                      model={chain}
                      cableItems={cableItems}
                      hopCable={hopCable}
                      onChangeCableItem={(id, cableItemId) => setCableItem.mutate({ id, cableItemId })}
                      onUnpatch={(id) => removeCable.mutate(id)}
                      onEditInFlow={onEditInFlow}
                      readOnly={readOnly}
                    />
                  </TableCell>
                  <TableCell>{phantom && <PhantomBar />}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {[...(channel.group_ids ?? []).map((id) => groups.find((g) => g.id === id)), ...(channel.dca_ids ?? []).map((id) => dcas.find((d) => d.id === id))]
                        .filter((bus): bus is MixerGroup => !!bus)
                        .map((bus) => (
                          <Badge key={`${bus.id}-${bus.name}`} style={busTint(bus.color)}>
                            {bus.name}
                          </Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-zinc-500">{channel.notes}</TableCell>
                </TableRow>

                {editor.openId === channel.id && editor.draft && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length} className="bg-zinc-900/70">
                      <div className="grid gap-3 md:grid-cols-[6rem_1fr_8rem_9rem] md:items-end" onKeyDown={editor.onKeyDown}>
                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Ch</span>
                          <Input
                            type="number"
                            value={editor.draft.channel_number}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, channel_number: Number(event.target.value) || editor.draft!.channel_number })}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Name</span>
                          <Input
                            autoFocus
                            value={editor.draft.channel_name}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, channel_name: event.target.value })}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Width</span>
                          <Select
                            value={editor.draft.width}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, width: event.target.value as InputChannel['width'] })}
                          >
                            <option value="mono">Mono</option>
                            <option value="stereo">Stereo</option>
                          </Select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Tape</span>
                          <ColorSelect eventId={eventId} value={editor.draft.color} onChange={(color) => editor.setDraft({ ...editor.draft!, color })} />
                        </label>

                        <div className="space-y-1 md:col-span-2">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Groups</span>
                          <BusMultiSelect
                            selected={editor.draft.group_ids}
                            options={groups}
                            onChange={(ids) => editor.setDraft({ ...editor.draft!, group_ids: ids })}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">DCA</span>
                          <BusMultiSelect
                            selected={editor.draft.dca_ids}
                            options={dcas}
                            onChange={(ids) => editor.setDraft({ ...editor.draft!, dca_ids: ids })}
                          />
                        </div>

                        {consoles.length > 1 && (
                          <label className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Desk</span>
                            <Select
                              value={channel.console_id ?? ''}
                              onChange={(event) =>
                                updateChannel.mutate({
                                  id: channel.id,
                                  data: { ...channel, console_id: event.target.value ? Number(event.target.value) : undefined },
                                })
                              }
                            >
                              <option value="">No desk</option>
                              {consoles.map((console) => (
                                <option key={console.id} value={console.id}>
                                  {console.name || 'Console'}
                                </option>
                              ))}
                            </Select>
                          </label>
                        )}

                        <label className="space-y-1 md:col-span-3">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Notes</span>
                          <Input value={editor.draft.notes} onChange={(event) => editor.setDraft({ ...editor.draft!, notes: event.target.value })} />
                        </label>

                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={editor.save}>
                            Save channel
                          </Button>
                          <Button size="sm" variant="ghost" onClick={editor.close}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeChannel.mutate(channel.id)} title="Delete channel">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-zinc-500">
                        Console strip only — what feeds this channel is decided in Flow. <kbd>Esc</kbd> discards, <kbd>⌘↵</kbd> saves and opens the next row.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        {visible.length === 0 && (
          <p className="px-4 py-3 text-sm text-zinc-500">
            {channels.length === 0 ? 'No input channels yet.' : gapsOnly ? 'No gaps — every channel has a source.' : `Nothing matches “${search}”.`}
          </p>
        )}
      </div>

      <PatchStatusRail
        status={status}
        noun="channel"
        onShowGaps={status.gaps.length > 0 ? () => setGapsOnly((only) => !only) : undefined}
        gapsOnly={gapsOnly}
        onOpenRig={onOpenRig}
      />

      {(updateChannel.error ?? removeChannel.error ?? setCableItem.error ?? removeCable.error) && (
        <p className="mt-2 text-sm text-red-400">
          {(updateChannel.error ?? removeChannel.error ?? setCableItem.error ?? removeCable.error)?.message}
        </p>
      )}
    </div>
  )
}

/** 48 V is red and bar-shaped — every circle in this app's patch surfaces is a port. */
function PhantomBar() {
  return (
    <span
      title="48 V phantom power on"
      aria-label="48 V on"
      className="inline-block h-[3px] w-2 rounded-sm bg-red-500 align-middle shadow-[0_0_5px_rgba(239,68,68,0.65)]"
    />
  )
}

/** Whether any Source feeding this channel has phantom power switched on. */
function phantomFor(chain: ChainCellModel, sources: InputSource[]): boolean {
  const ids = chain.lines.flatMap((line) =>
    line.segments.filter((segment) => segment.node?.kind === 'source').map((segment) => segment.node!.id),
  )
  return sources.some((source) => ids.includes(source.id) && source.phantom_power)
}
