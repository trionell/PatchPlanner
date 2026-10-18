import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteAudioOutput, deleteOutputCable, setFedBy, updateAudioOutput, updateOutputCable } from '../../api/audioPatch'
import { fedByKey, fedByLabel, fedByOptions, fedBySource } from '../../lib/fedBy'
import { deskModelOf } from '../../hooks/useDeskModels'
import { deskLabel } from '../../lib/deskStrips'
import { useReferenceData } from '../../hooks/useReferenceData'
import { useRowEditor } from '../../hooks/useRowEditor'
import { isCablelessToKind } from '../../lib/outputGraph'
import { outputPatchStatus, type PatchStatus, type SelectedDesk } from '../../lib/patchCapacity'
import { matchesSearch } from '../../lib/patchSearch'
import { vocabularyTint } from '../../lib/vocabularyTint'
import { outputChainSegments, type ChainCellModel, type SegmentNode } from '../../lib/patchSheet'
import type { OutputFlowContext } from '../../lib/signalFlow'
import type { AudioPatchOutput, Console, DeskMix, DeskModel, DeskRoute, InputChannel, InventoryItem, OutputCable, OutputDevice, StageMulti, Stagebox } from '../../types'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { NumCell, Pill, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable, TapeBar } from '../ui/SheetTable'
import { ChainCell, type HopCable } from './ChainCell'
import { ColorSelect } from './ColorSelect'
import { DesklessNote } from './DesklessNote'
import { RefusalNotice, type SheetRefusal } from './RefusalNotice'
import { PatchStatusRail } from './PatchStatusRail'
import { RowEditor } from './RowEditor'

// No Desk column: the sheet lists one desk at a time (Slice 47, B6).
const COLUMNS = ['Out', 'Name', 'Fed by', 'Type', 'W', 'Chain', 'Notes']

interface OutputDraft {
  output_number: number
  output_name: string
  output_type: string
  width: AudioPatchOutput['width']
  color?: string
  notes: string
  /**
   * In the draft rather than saved by the Desk select on change (Slice 24
   * FR-004). This sheet's persist spread `{ ...output, ...draft }`, so unlike
   * the inputs sheet it never dropped the field — but a picker that saved
   * immediately while Save spread a possibly-stale `output` could still put the
   * old desk back. One editor, one Save, no race.
   */
  console_id?: number
  /** `mix:id:port`, `channel:id`, or '' — written as the output's one Fed by route (Slice 48). */
  fed_by: string
}

interface OutputSheetProps {
  eventId: number
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  consoles: Console[]
  cableItems: InventoryItem[]
  itemLabelById: Map<number, string>
  search?: string
  /** A chain *hop* was clicked: open Flow with that box selected. */
  onEditInFlow?: (node: SegmentNode) => void
  /**
   * The row's own "Edit in Flow": open Flow with the **output** selected (Slice 26).
   * Before the outputs canvas had a rail, this button had to settle for the first box
   * downstream of the desk — so asking to edit a bus opened a stagebox.
   */
  onEditOutputInFlow?: (output: AudioPatchOutput) => void
  onOpenRig?: () => void
  readOnly?: boolean
  /** The desk this list is (B6); absent on the No desk list. */
  desk?: SelectedDesk
  models: DeskModel[]
  desklessCount?: number
  onSelectDeskless?: () => void
  onShowDesk?: (deskId: number) => void
  addRefusal?: SheetRefusal
  /** Bumped by every add: the next action clears the moved-row line (B7). */
  actionCount?: number
  /** Every desk's mixes, routes and channels — Fed by's options and its current value (Slice 48). */
  mixes: DeskMix[]
  routes: DeskRoute[]
  channels: InputChannel[]
}

/**
 * The output patch sheet — the mirror of `InputSheet`, reading outward from the
 * desk instead of inward to it (Slice 23 US2).
 */
export function OutputSheet({
  eventId,
  outputs,
  stageboxes,
  stageMultis,
  devices,
  cables,
  consoles,
  cableItems,
  itemLabelById,
  search = '',
  onEditInFlow,
  onEditOutputInFlow,
  onOpenRig,
  readOnly = false,
  desk,
  models,
  desklessCount = 0,
  onSelectDeskless,
  onShowDesk,
  addRefusal,
  actionCount = 0,
  mixes,
  routes,
  channels,
}: OutputSheetProps) {
  const queryClient = useQueryClient()
  const { options } = useReferenceData(eventId)
  const [gapsOnly, setGapsOnly] = useState(false)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const [moved, setMoved] = useState<{ text: string; deskId: number; deskName: string } | null>(null)
  const [rowRefusal, setRowRefusal] = useState<{ id: number; message: string } | null>(null)
  const [seenActions, setSeenActions] = useState(actionCount)
  if (seenActions !== actionCount) {
    setSeenActions(actionCount)
    setMoved(null)
  }
  const saveOutput = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Omit<AudioPatchOutput, 'id'> }) => updateAudioOutput(eventId, id, payload),
    onSuccess: async (saved) => {
      if (desk && saved.console_id !== desk.console.id) {
        const target = consoles.find((candidate) => candidate.id === saved.console_id)
        if (target) {
          setMoved({
            text: `${saved.output_name || 'The output'} is now on ${deskLabel(target, deskModelOf(models, target))}, as ${saved.output_number}.`,
            deskId: target.id,
            deskName: target.name || 'that desk',
          })
        }
      }
      await invalidate()
    },
  })
  const fedBy = useMutation({
    mutationFn: ({ id, key }: { id: number; key: string }) => setFedBy(eventId, id, fedBySource(key)),
    onSuccess: invalidate,
  })
  const removeOutput = useMutation({ mutationFn: (id: number) => deleteAudioOutput(eventId, id), onSuccess: invalidate })
  const setCableItem = useMutation({
    mutationFn: ({ id, cableItemId }: { id: number; cableItemId?: number }) => updateOutputCable(eventId, id, cableItemId),
    onSuccess: invalidate,
  })
  const removeCable = useMutation({ mutationFn: (id: number) => deleteOutputCable(eventId, id), onSuccess: invalidate })

  const ordered = useMemo(() => [...outputs].sort((a, b) => a.output_number - b.output_number), [outputs])
  const context: OutputFlowContext = { stageboxes, stageMultis, devices, cables, itemLabelById, consoles }

  // The desk's own name heads every chain, once the event has one.
  const consoleName = (output: AudioPatchOutput) => consoles.find((desk) => desk.id === output.console_id)?.name || undefined
  const rows = useMemo(
    () => ordered.map((output) => ({ output, chain: outputChainSegments(output, context, { consoleLabel: consoleName(output), consoles }) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordered, stageboxes, stageMultis, devices, cables, consoles, itemLabelById],
  )

  const editor = useRowEditor<AudioPatchOutput, OutputDraft>({
    rows: ordered,
    idOf: (output) => output.id,
    draftOf: (output) => ({
      output_number: output.output_number,
      output_name: output.output_name ?? '',
      output_type: output.output_type ?? 'foh',
      width: output.width,
      color: output.color,
      notes: output.notes ?? '',
      console_id: output.console_id,
      fed_by: fedByKey(routes, output.id),
    }),
    persist: (output, draft) => {
      const { fed_by, ...fields } = draft
      saveOutput.mutate({ id: output.id, payload: { ...output, ...fields } })
      // Fed by is a route, saved beside the row; a desk change has already cleared it.
      if (fed_by !== fedByKey(routes, output.id) && draft.console_id === output.console_id) fedBy.mutate({ id: output.id, key: fed_by })
    },
  })
  const saveRow = () => {
    if (editor.draft && editor.draft.console_id == null && editor.openId != null) {
      setRowRefusal({ id: editor.openId, message: 'Pick the desk this output is on.' })
      return
    }
    setRowRefusal(null)
    editor.save()
  }
  const openRow = (output: AudioPatchOutput) => {
    setMoved(null)
    setRowRefusal(null)
    editor.openRow(output)
  }

  const status: PatchStatus = outputPatchStatus({
    outputs,
    desk,
    deskless: desklessCount,
    gaps: rows.filter((row) => row.chain.hasGap).map((row) => row.output),
    consoles,
    stageboxes,
    stageMultis,
    cables,
  })

  const chainText = (chain: ChainCellModel) => chain.lines.flatMap((line) => line.segments.map((segment) => segment.label)).join(' ')
  const visible = rows.filter(
    (row) =>
      (!gapsOnly || row.chain.hasGap) &&
      matchesSearch(search, row.output.output_number, row.output.output_name, row.output.output_type, row.output.notes, chainText(row.chain)),
  )

  const hopCable = (cableId: number): HopCable | undefined => {
    const cable = cables.find((candidate) => candidate.id === cableId)
    if (!cable) return undefined
    return { id: cable.id, cableItemId: cable.cable_item_id, cableless: isCablelessToKind(cable.to_kind) }
  }

  const columns = COLUMNS
  /* The output, never a boolean — a list of near-identical numbered rows. */
  const [pendingOutput, setPendingOutput] = useState<AudioPatchOutput | null>(null)
  const shown = visible

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
      {!desk && (
        <div className="mx-3 mt-3">
          <DesklessNote eventId={eventId} kind="outputs" ids={outputs.map((output) => output.id)} consoles={consoles} readOnly={readOnly} onOpenRig={onOpenRig} onPlaced={invalidate} />
        </div>
      )}
      <div className="overflow-x-auto">
        <SheetTable>
          <SheetHead>
            <tr>{columns.map((column) => <SheetHeadCell key={column}>{column}</SheetHeadCell>)}</tr>
          </SheetHead>
          <SheetBody>
            {shown.map(({ output, chain }, index) => (
              <Fragment key={output.id}>
                <SheetRow
                  striped={index % 2 === 1}
                  open={editor.openId === output.id}
                  className={readOnly ? undefined : 'cursor-pointer'}
                  onClick={readOnly ? undefined : () => openRow(output)}
                >
                  <NumCell className={desk ? undefined : 'text-zinc-500'}>{output.output_number}</NumCell>
                  <SheetCell className="whitespace-nowrap text-zinc-100">
                    <TapeBar color={output.color} />
                    {output.output_name || <span className="text-zinc-500">unnamed</span>}
                  </SheetCell>
                  <SheetCell className="whitespace-nowrap text-zinc-300">{fedByLabel(fedByKey(routes, output.id), mixes, channels)}</SheetCell>
                  <SheetCell>
                    <Pill className={vocabularyTint(output.output_type)}>{output.output_type}</Pill>
                  </SheetCell>
                  <NumCell>{output.width === 'stereo' ? 'S' : 'M'}</NumCell>
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
                  <SheetCell className="max-w-48 truncate text-zinc-500">{output.notes}</SheetCell>
                </SheetRow>

                {editor.openId === output.id && editor.draft && (
                  <SheetRow className="border-b-0 hover:bg-transparent">
                    <SheetCell colSpan={columns.length} className="bg-amber-500/[0.04] pt-0">
                      <RowEditor
                        saveLabel="Save output"
                        onSave={saveRow}
                        notice={rowRefusal?.id === output.id ? <RefusalNotice refusal={{ message: rowRefusal.message }} /> : undefined}
                        onCancel={editor.close}
                        onDelete={() => setPendingOutput(output)}
                        handoff={
                          onEditOutputInFlow
                            ? { label: 'Routing', text: 'Edit in Flow', onSelect: () => onEditOutputInFlow(output) }
                            : undefined
                        }
                        onKeyDown={editor.onKeyDown}
                      >
                        <FieldStack label="Out" width="count">
                          <Input
                            size="sm"
                            type="number"
                            value={editor.draft.output_number}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, output_number: Number(event.target.value) || editor.draft!.output_number })}
                          />
                        </FieldStack>
                        <FieldStack label="Name" width="grow">
                          <Input
                            size="sm"
                            autoFocus
                            value={editor.draft.output_name}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, output_name: event.target.value })}
                          />
                        </FieldStack>
                        {desk && editor.draft.console_id === output.console_id && (
                          <FieldStack label="Fed by" width="default">
                            <Select size="sm" value={editor.draft.fed_by} onChange={(event) => editor.setDraft({ ...editor.draft!, fed_by: event.target.value })}>
                              <option value="">—</option>
                              {fedByOptions(desk, mixes, channels, editor.draft.width).map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                          </FieldStack>
                        )}
                        <FieldStack label="Type" width="short">
                          <Select
                            size="sm"
                            value={editor.draft.output_type}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, output_type: event.target.value })}
                          >
                            {options('output_types', editor.draft.output_type).map((value) => (
                              <option key={value.value} value={value.value}>
                                {value.label}
                              </option>
                            ))}
                          </Select>
                        </FieldStack>
                        <FieldStack label="Width" width="short">
                          <Select
                            size="sm"
                            value={editor.draft.width}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, width: event.target.value as AudioPatchOutput['width'] })}
                          >
                            <option value="mono">Mono</option>
                            <option value="stereo">Stereo</option>
                          </Select>
                        </FieldStack>
                        <FieldStack label="Tape" width="short">
                          <ColorSelect eventId={eventId} value={editor.draft.color} onChange={(color) => editor.setDraft({ ...editor.draft!, color })} />
                        </FieldStack>
                        {(consoles.length > 1 || editor.draft.console_id == null) && (
                          <FieldStack label="Desk" width="default">
                            <Select
                              size="sm"
                              value={editor.draft.console_id ?? ''}
                              onChange={(event) => editor.setDraft({ ...editor.draft!, console_id: event.target.value ? Number(event.target.value) : undefined })}
                            >
                              {editor.draft.console_id == null && <option value="">Pick a desk…</option>}
                              {consoles.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {deskLabel(option, deskModelOf(models, option))}
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
        {shown.length === 0 && (
          <p className="px-3 py-3 text-xs text-zinc-500">
            {outputs.length === 0 ? 'No output channels yet.' : gapsOnly ? 'Every output is patched.' : `Nothing matches “${search}”.`}
          </p>
        )}
      </div>

      <PatchStatusRail
        onShowDeskless={desklessCount > 0 && desk ? onSelectDeskless : undefined}
        status={status}
        noun="output"
        onShowGaps={status.gaps.length > 0 || gapsOnly ? () => setGapsOnly((only) => !only) : undefined}
        gapsOnly={gapsOnly}
        onOpenRig={onOpenRig}
      />

      {(saveOutput.error ?? fedBy.error ?? removeOutput.error ?? setCableItem.error ?? removeCable.error) && (
        <p className="px-3 pb-2 text-xs text-red-400">
          {(saveOutput.error ?? fedBy.error ?? removeOutput.error ?? setCableItem.error ?? removeCable.error)?.message}
        </p>
      )}

      {/* Last sibling, for the same reason as the input sheet: the row editor that
          raises this lives in a `<tr>`. */}
      <ConfirmDialog
        open={pendingOutput != null}
        title="Delete output"
        onCancel={() => setPendingOutput(null)}
        onConfirm={() => {
          if (pendingOutput) removeOutput.mutate(pendingOutput.id)
          setPendingOutput(null)
        }}
      >
        {pendingOutput && (
          <>
            Output{' '}
            <span className="text-zinc-200">
              {pendingOutput.output_number}
              {pendingOutput.output_name ? ` ${pendingOutput.output_name}` : ''}
            </span>{' '}
            is removed from the patch. Any cable leaving it is removed with it.
          </>
        )}
      </ConfirmDialog>
    </>
  )
}
