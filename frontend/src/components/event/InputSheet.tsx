import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteInputCable, deleteInputChannel, updateInputCable, updateInputChannel } from '../../api/audioPatch'
import { useRowEditor } from '../../hooks/useRowEditor'
import { isCablelessEdge } from '../../lib/inputGraph'
import { inputPatchStatus, type PatchStatus } from '../../lib/patchCapacity'
import { matchesSearch } from '../../lib/patchSearch'
import { chainSourceNode, inputChainSegments, type ChainCellModel, type SegmentNode } from '../../lib/patchSheet'
import type { InputFlowContext } from '../../lib/inputSignalFlow'
import { busTint } from '../../lib/utils'
import type { Console, InputCable, InputChannel, InputDevice, InputSource, InventoryItem, MixerDCA, MixerGroup, StageMulti, Stagebox } from '../../types'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { NumCell, PhantomBar, Pill, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable, TapeBar } from '../ui/SheetTable'
import { BusMultiSelect } from './BusMultiSelect'
import { ChainCell, type HopCable } from './ChainCell'
import { ColorSelect } from './ColorSelect'
import { PatchStatusRail } from './PatchStatusRail'
import { RowEditor } from './RowEditor'

const COLUMNS = ['Ch', 'Name', 'W', 'Chain', '48 V', 'Buses', 'Notes']

interface ChannelDraft {
  channel_number: number
  channel_name: string
  width: InputChannel['width']
  color?: string
  group_ids: number[]
  dca_ids: number[]
  notes: string
  /**
   * Carried in the draft, not written by the Desk select's own mutation
   * (Slice 24 FR-004). Two reasons: a PATCH here replaces the row's whole
   * state, so leaving it out wrote NULL and detached the channel from its
   * desk; and a picker that saved on change while every other field waited
   * for Save is what made the two fight each other.
   */
  console_id?: number
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
      console_id: channel.console_id,
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
          console_id: draft.console_id,
          mixer_behavior: channel.mixer_behavior,
        },
      }),
  })

  const status: PatchStatus = inputPatchStatus({
    channels,
    gaps: rows.filter((row) => row.chain.hasGap).map((row) => row.channel),
    consoles,
    stageboxes,
    stageMultis,
    cables,
  })

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
    <>
      <div className="overflow-x-auto">
        <SheetTable>
          <SheetHead>
            <tr>{COLUMNS.map((column) => <SheetHeadCell key={column}>{column}</SheetHeadCell>)}</tr>
          </SheetHead>
          <SheetBody>
            {visible.map(({ channel, chain, phantom }, index) => (
              <Fragment key={channel.id}>
                <SheetRow
                  striped={index % 2 === 1}
                  open={editor.openId === channel.id}
                  className={readOnly ? undefined : 'cursor-pointer'}
                  onClick={readOnly ? undefined : () => editor.openRow(channel)}
                >
                  <NumCell>{channel.channel_number}</NumCell>
                  <SheetCell className="whitespace-nowrap text-zinc-100">
                    <TapeBar color={channel.color} />
                    {channel.channel_name || <span className="text-zinc-500">unnamed</span>}
                  </SheetCell>
                  <NumCell>{channel.width === 'stereo' ? 'S' : 'M'}</NumCell>
                  <SheetCell onClick={(event) => event.stopPropagation()}>
                    <ChainCell
                      model={chain}
                      cableItems={cableItems}
                      hopCable={hopCable}
                      onChangeCableItem={(id, cableItemId) => setCableItem.mutate({ id, cableItemId })}
                      onUnpatch={(id) => removeCable.mutate(id)}
                      onEditInFlow={onEditInFlow}
                      readOnly={readOnly}
                    />
                  </SheetCell>
                  <SheetCell>{phantom && <PhantomBar />}</SheetCell>
                  <SheetCell>
                    <div className="flex flex-wrap gap-1">
                      {[...(channel.group_ids ?? []).map((id) => groups.find((g) => g.id === id)), ...(channel.dca_ids ?? []).map((id) => dcas.find((d) => d.id === id))]
                        .filter((bus): bus is MixerGroup => !!bus)
                        .map((bus) => (
                          <Pill key={`${bus.id}-${bus.name}`} style={busTint(bus.color)}>
                            {bus.name}
                          </Pill>
                        ))}
                    </div>
                  </SheetCell>
                  <SheetCell className="max-w-48 truncate text-zinc-500">{channel.notes}</SheetCell>
                </SheetRow>

                {editor.openId === channel.id && editor.draft && (
                  <SheetRow className="border-b-0 hover:bg-transparent">
                    <SheetCell colSpan={COLUMNS.length} className="bg-amber-500/[0.04] pt-0">
                      <RowEditor
                        saveLabel="Save channel"
                        onSave={editor.save}
                        onCancel={editor.close}
                        onDelete={() => {
                          if (window.confirm(`Delete channel ${channel.channel_number}${channel.channel_name ? ` ${channel.channel_name}` : ''}? Any cable landing on it is removed with it.`)) {
                            removeChannel.mutate(channel.id)
                          }
                        }}
                        handoff={
                          onEditInFlow && chainSourceNode(chain)
                            ? { label: 'Source', text: 'Edit in Flow', onSelect: () => onEditInFlow(chainSourceNode(chain)!) }
                            : undefined
                        }
                        onKeyDown={editor.onKeyDown}
                      >
                        <FieldStack label="Ch" width="count">
                          <Input
                            size="sm"
                            type="number"
                            value={editor.draft.channel_number}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, channel_number: Number(event.target.value) || editor.draft!.channel_number })}
                          />
                        </FieldStack>
                        <FieldStack label="Name" width="grow">
                          <Input
                            size="sm"
                            autoFocus
                            value={editor.draft.channel_name}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, channel_name: event.target.value })}
                          />
                        </FieldStack>
                        <FieldStack label="Width" width="short">
                          <Select
                            size="sm"
                            value={editor.draft.width}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, width: event.target.value as InputChannel['width'] })}
                          >
                            <option value="mono">Mono</option>
                            <option value="stereo">Stereo</option>
                          </Select>
                        </FieldStack>
                        <FieldStack label="Tape" width="short">
                          <ColorSelect eventId={eventId} value={editor.draft.color} onChange={(color) => editor.setDraft({ ...editor.draft!, color })} />
                        </FieldStack>
                        <FieldStack label="Groups" width="default">
                          <BusMultiSelect
                            selected={editor.draft.group_ids}
                            options={groups}
                            onChange={(ids) => editor.setDraft({ ...editor.draft!, group_ids: ids })}
                          />
                        </FieldStack>
                        <FieldStack label="DCA" width="default">
                          <BusMultiSelect
                            selected={editor.draft.dca_ids}
                            options={dcas}
                            onChange={(ids) => editor.setDraft({ ...editor.draft!, dca_ids: ids })}
                          />
                        </FieldStack>
                        {consoles.length > 1 && (
                          <FieldStack label="Desk" width="default">
                            <Select
                              size="sm"
                              value={editor.draft.console_id ?? ''}
                              onChange={(event) =>
                                editor.setDraft({ ...editor.draft!, console_id: event.target.value ? Number(event.target.value) : undefined })
                              }
                            >
                              <option value="">No desk</option>
                              {consoles.map((desk) => (
                                <option key={desk.id} value={desk.id}>
                                  {desk.name || 'Console'}
                                </option>
                              ))}
                            </Select>
                          </FieldStack>
                        )}
                        <FieldStack label="Notes" width="grow">
                          <Input size="sm" value={editor.draft.notes} onChange={(event) => editor.setDraft({ ...editor.draft!, notes: event.target.value })} />
                        </FieldStack>
                      </RowEditor>
                    </SheetCell>
                  </SheetRow>
                )}
              </Fragment>
            ))}
          </SheetBody>
        </SheetTable>
        {visible.length === 0 && (
          <p className="px-3 py-3 text-xs text-zinc-500">
            {channels.length === 0 ? 'No input channels yet.' : gapsOnly ? 'No gaps — every channel has a source.' : `Nothing matches “${search}”.`}
          </p>
        )}
      </div>

      <PatchStatusRail
        status={status}
        noun="channel"
        onShowGaps={status.gaps.length > 0 || gapsOnly ? () => setGapsOnly((only) => !only) : undefined}
        gapsOnly={gapsOnly}
        onOpenRig={onOpenRig}
      />

      {(updateChannel.error ?? removeChannel.error ?? setCableItem.error ?? removeCable.error) && (
        <p className="px-3 pb-2 text-xs text-red-400">
          {(updateChannel.error ?? removeChannel.error ?? setCableItem.error ?? removeCable.error)?.message}
        </p>
      )}
    </>
  )
}

/** Whether any Source feeding this channel has phantom power switched on. */
function phantomFor(chain: ChainCellModel, sources: InputSource[]): boolean {
  const ids = chain.lines.flatMap((line) =>
    line.segments.filter((segment) => segment.node?.kind === 'source').map((segment) => segment.node!.id),
  )
  return sources.some((source) => ids.includes(source.id) && source.phantom_power)
}
