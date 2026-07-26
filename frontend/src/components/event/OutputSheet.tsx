import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteAudioOutput, deleteOutputCable, updateAudioOutput, updateOutputCable } from '../../api/audioPatch'
import { useReferenceData } from '../../hooks/useReferenceData'
import { useRowEditor } from '../../hooks/useRowEditor'
import { isCablelessToKind } from '../../lib/outputGraph'
import { boxUsage, cablesPicked, consoleCapacity, type PatchStatus } from '../../lib/patchCapacity'
import { matchesSearch } from '../../lib/patchSearch'
import { chainSourceNode, outputChainSegments, type ChainCellModel, type SegmentNode } from '../../lib/patchSheet'
import type { OutputFlowContext } from '../../lib/signalFlow'
import type { AudioPatchOutput, Console, InventoryItem, OutputCable, OutputDevice, StageMulti, Stagebox } from '../../types'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { NumCell, Pill, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable, TapeBar } from '../ui/SheetTable'
import { ChainCell, type HopCable } from './ChainCell'
import { ColorSelect } from './ColorSelect'
import { PatchStatusRail } from './PatchStatusRail'
import { RowEditor } from './RowEditor'

// The Desk column appears only when the event has more than one console — with
// one desk there is nothing to disambiguate, and a column of identical values is
// the kind of clutter this slice exists to remove (FR-021).
const COLUMNS = ['Out', 'Name', 'Type', 'W', 'Chain', 'Notes']
const columnsFor = (multiDesk: boolean) => (multiDesk ? ['Out', 'Name', 'Desk', 'Type', 'W', 'Chain', 'Notes'] : COLUMNS)

/**
 * An output type's pill tint. The same vocabulary `Badge` carries, at the sheet's
 * smaller pill size — a full-size badge two hundred rows deep is what makes a
 * patch sheet read as a form (Slice 25 FR-017).
 */
function outputTypeTint(type: string): string {
  switch (type) {
    case 'foh': return 'bg-cyan-500/15 text-cyan-300'
    case 'monitor': return 'bg-emerald-500/15 text-emerald-300'
    case 'iem': return 'bg-orange-500/15 text-orange-300'
    case 'sub': return 'bg-red-500/15 text-red-300'
    case 'matrix': return 'bg-indigo-500/15 text-indigo-300'
    case 'aux': return 'bg-pink-500/15 text-pink-300'
    default: return 'bg-zinc-700 text-zinc-100'
  }
}

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
  onEditInFlow?: (node: SegmentNode) => void
  onOpenRig?: () => void
  readOnly?: boolean
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
  onOpenRig,
  readOnly = false,
}: OutputSheetProps) {
  const queryClient = useQueryClient()
  const { options } = useReferenceData(eventId)
  const [gapsOnly, setGapsOnly] = useState(false)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  }
  const saveOutput = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Omit<AudioPatchOutput, 'id'> }) => updateAudioOutput(eventId, id, payload),
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
    }),
    persist: (output, draft) => saveOutput.mutate({ id: output.id, payload: { ...output, ...draft } }),
  })

  const capacity = consoleCapacity(
    consoles,
    (desk) => outputs.filter((output) => output.console_id === desk.id).length,
    (desk) => desk.output_count,
    'output',
  )
  const status: PatchStatus = {
    rowCount: outputs.length,
    consoleLabels: capacity.labels,
    boxes: boxUsage(stageboxes, stageMultis, cables),
    cablesPicked: cablesPicked(cables),
    gaps: rows
      .filter((row) => row.chain.hasGap)
      .map((row) => `Out ${row.output.output_number} ${row.output.output_name || ''} is not patched`.replace('  ', ' ')),
    overCapacity: capacity.overCapacity,
  }

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

  const multiDesk = consoles.length > 1
  const columns = columnsFor(multiDesk)
  const deskLabel = (output: AudioPatchOutput) => consoleName(output) ?? 'no desk'
  const [deskFilter, setDeskFilter] = useState<number | null>(null)
  const shown = multiDesk && deskFilter != null ? visible.filter((row) => row.output.console_id === deskFilter) : visible

  return (
    <>
      {multiDesk && (
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5 text-[11px] text-zinc-500">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">Desk</span>
          <Select size="sm" className="w-auto" value={deskFilter ?? ''} onChange={(event) => setDeskFilter(event.target.value ? Number(event.target.value) : null)}>
            <option value="">All desks</option>
            {consoles.map((desk) => (
              <option key={desk.id} value={desk.id}>
                {desk.name || 'Console'}
              </option>
            ))}
          </Select>
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
                  onClick={readOnly ? undefined : () => editor.openRow(output)}
                >
                  <NumCell>{output.output_number}</NumCell>
                  <SheetCell className="whitespace-nowrap text-zinc-100">
                    <TapeBar color={output.color} />
                    {output.output_name || <span className="text-zinc-500">unnamed</span>}
                  </SheetCell>
                  {multiDesk && <SheetCell className="text-zinc-400">{deskLabel(output)}</SheetCell>}
                  <SheetCell>
                    <Pill className={outputTypeTint(output.output_type)}>{output.output_type}</Pill>
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
                        onSave={editor.save}
                        onCancel={editor.close}
                        onDelete={() => {
                          if (window.confirm(`Delete output ${output.output_number}${output.output_name ? ` ${output.output_name}` : ''}? Any cable leaving it is removed with it.`)) {
                            removeOutput.mutate(output.id)
                          }
                        }}
                        onEditInFlow={onEditInFlow && chainSourceNode(chain) ? () => onEditInFlow(chainSourceNode(chain)!) : undefined}
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
                        {multiDesk && (
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
        {shown.length === 0 && (
          <p className="px-3 py-3 text-xs text-zinc-500">
            {outputs.length === 0 ? 'No output channels yet.' : gapsOnly ? 'Every output is patched.' : `Nothing matches “${search}”.`}
          </p>
        )}
      </div>

      <PatchStatusRail
        status={status}
        noun="output"
        onShowGaps={status.gaps.length > 0 ? () => setGapsOnly((only) => !only) : undefined}
        gapsOnly={gapsOnly}
        onOpenRig={onOpenRig}
      />

      {(saveOutput.error ?? removeOutput.error ?? setCableItem.error ?? removeCable.error) && (
        <p className="px-3 pb-2 text-xs text-red-400">
          {(saveOutput.error ?? removeOutput.error ?? setCableItem.error ?? removeCable.error)?.message}
        </p>
      )}
    </>
  )
}
