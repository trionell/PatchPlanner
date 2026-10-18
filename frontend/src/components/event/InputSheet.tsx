import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteInputCable, deleteInputChannel, updateInputCable, updateInputChannel } from '../../api/audioPatch'
import { ApiError } from '../../api/client'
import { deskModelOf } from '../../hooks/useDeskModels'
import { deskLabel, isOver, orderChannels, poolCapacity, poolOf, poolUsage, stripLabel } from '../../lib/deskStrips'
import type { SelectedDesk } from '../../lib/patchCapacity'
import { useRowEditor } from '../../hooks/useRowEditor'
import { isCablelessEdge } from '../../lib/inputGraph'
import { inputPatchStatus, type PatchStatus } from '../../lib/patchCapacity'
import { matchesSearch } from '../../lib/patchSearch'
import { chainSourceNode, inputChainSegments, type ChainCellModel, type SegmentNode } from '../../lib/patchSheet'
import type { InputFlowContext } from '../../lib/inputSignalFlow'
import { busTint } from '../../lib/utils'
import type { Console, DeskModel, InputCable, InputChannel, InputDevice, InputSource, InventoryItem, MixerDCA, MixerGroup, StageMulti, Stagebox, StripPool, StripRefusal } from '../../types'
import { Button } from '../ui/Button'
import { MicroLabel } from '../ui/Label'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { NumCell, PhantomBar, Pill, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable, TapeBar } from '../ui/SheetTable'
import { BusMultiSelect } from './BusMultiSelect'
import { ChainCell, type HopCable } from './ChainCell'
import { ColorSelect } from './ColorSelect'
import { DesklessNote } from './DesklessNote'
import { RefusalNotice, type SheetRefusal } from './RefusalNotice'
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
  strip_pool: StripPool
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
  /** The desk this list is (Slice 47, B6); absent on the No desk list and on an event with no desk. */
  desk?: SelectedDesk
  models: DeskModel[]
  /** Rows on no desk across the event, for the strip's amber count. */
  desklessCount?: number
  onSelectDeskless?: () => void
  /** Shows another desk's list — the moved-row line's action (B7). */
  onShowDesk?: (deskId: number) => void
  /** + Aux, in the aux heading. Absent for restricted roles. */
  onAddAux?: () => void
  /** What + Channel / + Aux was refused with, inline above the rows. */
  addRefusal?: SheetRefusal
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
  desk,
  models,
  desklessCount = 0,
  onSelectDeskless,
  onShowDesk,
  onAddAux,
  addRefusal,
}: InputSheetProps) {
  const queryClient = useQueryClient()
  const [gapsOnly, setGapsOnly] = useState(false)
  /* The channel, never a boolean — the sheet is a list of near-identical numbered
     rows, which is exactly the case a boolean gets wrong. */
  const [pendingChannel, setPendingChannel] = useState<InputChannel | null>(null)
  /* A save the server refused, held beside the reopened editor with its fix. */
  const [rowRefusal, setRowRefusal] = useState<{ id: number; refusal: SheetRefusal } | null>(null)
  /* B7: one line where a row that left this list went; the next action clears it. */
  const [moved, setMoved] = useState<{ text: string; deskId: number; deskName: string } | null>(null)
  const deskless = !desk
  const modelOf = (target: Pick<Console, 'desk_model' | 'bus_mode'>) => deskModelOf(models, target)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const updateChannel = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<InputChannel, 'id' | 'event_id'> }) => updateInputChannel(eventId, id, data),
    onSuccess: async (saved) => {
      if (desk && saved.console_id !== desk.console.id) {
        const target = consoles.find((candidate) => candidate.id === saved.console_id)
        if (target) {
          const name = deskLabel(target, modelOf(target))
          setMoved({ text: `${saved.channel_name || 'The channel'} is now on ${name}, as ${stripLabel(modelOf(target), saved)}.`, deskId: target.id, deskName: target.name || 'that desk' })
        }
      }
      await invalidate()
    },
  })
  const removeChannel = useMutation({ mutationFn: (id: number) => deleteInputChannel(eventId, id), onSuccess: invalidate })
  const setCableItem = useMutation({
    mutationFn: ({ id, cableItemId }: { id: number; cableItemId?: number }) => updateInputCable(eventId, id, cableItemId),
    onSuccess: invalidate,
  })
  const removeCable = useMutation({ mutationFn: (id: number) => deleteInputCable(eventId, id), onSuccess: invalidate })

  const ordered = useMemo(() => orderChannels(channels), [channels])
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
      strip_pool: poolOf(channel),
    }),
    persist: (channel, draft) => {
      setRowRefusal(null)
      updateChannel.mutate(
        {
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
            strip_pool: draft.strip_pool,
            mixer_behavior: channel.mixer_behavior,
          },
        },
        {
          // A refused save reopens the row with what was typed, the refusal and its fix
          // beside it — the editor closed optimistically, and the planner's work must not.
          onError: (error) => {
            const body = error instanceof ApiError ? (error.body as StripRefusal | undefined) : undefined
            const fix = body?.fix
            editor.openRow(channel)
            editor.setDraft(draft)
            setRowRefusal({
              id: channel.id,
              refusal: {
                message: error.message,
                fix: fix
                  ? {
                      label: `Use ${fix.pool === 'aux' ? 'Aux ' : ''}${fix.number}`,
                      apply: () => editor.setDraft({ ...draft, channel_number: fix.number, strip_pool: fix.pool }),
                    }
                  : undefined,
              },
            })
          },
        },
      )
    },
  })

  /* A row with no desk cannot be saved without one (decided in review). */
  const saveRow = () => {
    if (editor.draft && editor.draft.console_id == null && editor.openId != null) {
      setRowRefusal({ id: editor.openId, refusal: { message: 'Pick the desk this channel is on.' } })
      return
    }
    editor.save()
  }
  const openRow = (channel: InputChannel) => {
    setMoved(null)
    setRowRefusal(null)
    editor.openRow(channel)
  }

  const status: PatchStatus = inputPatchStatus({
    channels,
    desk,
    deskless: desklessCount,
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
      {addRefusal && (
        <div className="mx-3 mt-3">
          <RefusalNotice refusal={addRefusal} />
        </div>
      )}
      {moved && (
        <p className="mx-3 mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
          {moved.text}
          {onShowDesk && (
            <Button size="xs" variant="outline" onClick={() => { setMoved(null); onShowDesk(moved.deskId) }}>
              Show {moved.deskName}
            </Button>
          )}
        </p>
      )}
      {deskless && (
        <div className="mx-3 mt-3">
          <DesklessNote eventId={eventId} kind="channels" ids={channels.map((channel) => channel.id)} consoles={consoles} readOnly={readOnly} onOpenRig={onOpenRig} onPlaced={invalidate} />
        </div>
      )}
      <div className="overflow-x-auto">
        <SheetTable>
          <SheetHead>
            <tr>{COLUMNS.map((column) => <SheetHeadCell key={column}>{column}</SheetHeadCell>)}</tr>
          </SheetHead>
          <SheetBody>
            {sectionsOf(visible, desk).map((section) => (
              <Fragment key={section.pool}>
                {section.heading && (
                  <SheetRow className="hover:bg-transparent">
                    <SheetCell colSpan={COLUMNS.length} className="pt-3">
                      <div className="flex items-center gap-2">
                        <MicroLabel>{section.heading}</MicroLabel>
                        <span className="font-mono text-[10px] tabular-nums text-zinc-500">{section.fill}</span>
                        {section.pool === 'aux' && onAddAux && (
                          <Button size="xs" variant="outline" className="ml-auto" onClick={() => { setMoved(null); onAddAux() }}>
                            + Aux
                          </Button>
                        )}
                      </div>
                      {section.rows.length === 0 && <p className="pt-1 text-xs text-zinc-500">No aux inputs used.</p>}
                    </SheetCell>
                  </SheetRow>
                )}
            {section.rows.map(({ channel, chain, phantom }, index) => (
              <Fragment key={channel.id}>
                <SheetRow
                  striped={index % 2 === 1}
                  open={editor.openId === channel.id}
                  className={readOnly ? undefined : 'cursor-pointer'}
                  onClick={readOnly ? undefined : () => openRow(channel)}
                >
                  <NumberCell channel={channel} desk={desk} />
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
                        onSave={saveRow}
                        notice={rowRefusal?.id === channel.id ? <RefusalNotice refusal={rowRefusal.refusal} /> : undefined}
                        onCancel={editor.close}
                        onDelete={() => setPendingChannel(channel)}
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
                        {(consoles.length > 1 || editor.draft.console_id == null) && (
                          /* Required, with no "No desk" option: a save cannot take a channel off its desk. */
                          <FieldStack label="Desk" width="default">
                            <Select
                              size="sm"
                              value={editor.draft.console_id ?? ''}
                              onChange={(event) => {
                                const target = consoles.find((candidate) => candidate.id === Number(event.target.value))
                                editor.setDraft({
                                  ...editor.draft!,
                                  console_id: target?.id,
                                  strip_pool: target && modelOf(target).aux_in > 0 ? editor.draft!.strip_pool : 'channel',
                                })
                              }}
                            >
                              {editor.draft.console_id == null && <option value="">Pick a desk…</option>}
                              {consoles.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {deskLabel(option, modelOf(option))}
                                </option>
                              ))}
                            </Select>
                          </FieldStack>
                        )}
                        {(() => {
                          const target = consoles.find((candidate) => candidate.id === editor.draft!.console_id)
                          if (!target || modelOf(target).aux_in === 0) return null
                          return (
                            <FieldStack label="Strip" width="short">
                              <Select
                                size="sm"
                                value={editor.draft.strip_pool}
                                onChange={(event) => editor.setDraft({ ...editor.draft!, strip_pool: event.target.value as StripPool })}
                              >
                                <option value="channel">Channel</option>
                                <option value="aux">Aux in</option>
                              </Select>
                            </FieldStack>
                          )
                        })()}
                        <FieldStack label="Notes" width="grow">
                          <Input size="sm" value={editor.draft.notes} onChange={(event) => editor.setDraft({ ...editor.draft!, notes: event.target.value })} />
                        </FieldStack>
                      </RowEditor>
                    </SheetCell>
                  </SheetRow>
                )}
              </Fragment>
            ))}
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
        onShowDeskless={desklessCount > 0 && !deskless ? onSelectDeskless : undefined}
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

      {/* Last sibling. The row editor that raises this sits in a `<tr>`, inside the
          table's own stacking; a dialog rendered there would be under the sheet. */}
      <ConfirmDialog
        open={pendingChannel != null}
        title="Delete channel"
        onCancel={() => setPendingChannel(null)}
        onConfirm={() => {
          if (pendingChannel) removeChannel.mutate(pendingChannel.id)
          setPendingChannel(null)
        }}
      >
        {pendingChannel && (
          <>
            Channel{' '}
            <span className="text-zinc-200">
              {pendingChannel.channel_number}
              {pendingChannel.channel_name ? ` ${pendingChannel.channel_name}` : ''}
            </span>{' '}
            is removed from the patch. Any cable landing on it is removed with it.
          </>
        )}
      </ConfirmDialog>

    </>
  )
}

/** The number cell: the model's label, grey on No desk, red with "over" past the pool (B2). */
function NumberCell({ channel, desk }: { channel: InputChannel; desk?: SelectedDesk }) {
  if (!desk) return <NumCell className="text-zinc-500">{channel.channel_number}</NumCell>
  const label = stripLabel(desk.model, channel)
  if (isOver(desk.model, desk.console, channel)) {
    return (
      <NumCell className="whitespace-nowrap text-red-400">
        {label} <span className="font-mono text-[10px]">over</span>
      </NumCell>
    )
  }
  return <NumCell className="whitespace-nowrap">{label}</NumCell>
}

interface SheetSection<Row> {
  pool: StripPool
  heading?: ReactNode
  fill?: string
  rows: Row[]
}

/** X32 · M32 lists Channels then Aux in, each with its own count; every other desk is one run. */
function sectionsOf<Row extends { channel: InputChannel }>(rows: Row[], desk?: SelectedDesk): SheetSection<Row>[] {
  if (!desk || desk.model.aux_in === 0) return [{ pool: 'channel', rows }]
  const channels = rows.map((row) => row.channel)
  const fill = (pool: StripPool) => `${poolUsage(desk.model, channels.filter((c) => poolOf(c) === pool), pool)}/${poolCapacity(desk.model, desk.console, pool)}`
  return [
    { pool: 'channel', heading: 'Channels', fill: fill('channel'), rows: rows.filter((row) => poolOf(row.channel) === 'channel') },
    { pool: 'aux', heading: 'Aux in', fill: fill('aux'), rows: rows.filter((row) => poolOf(row.channel) === 'aux') },
  ]
}

/** Whether any Source feeding this channel has phantom power switched on. */
function phantomFor(chain: ChainCellModel, sources: InputSource[]): boolean {
  const ids = chain.lines.flatMap((line) =>
    line.segments.filter((segment) => segment.node?.kind === 'source').map((segment) => segment.node!.id),
  )
  return sources.some((source) => ids.includes(source.id) && source.phantom_power)
}
