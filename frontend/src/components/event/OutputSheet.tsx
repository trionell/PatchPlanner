import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { deleteAudioOutput, deleteOutputCable, updateAudioOutput, updateOutputCable } from '../../api/audioPatch'
import { useReferenceData } from '../../hooks/useReferenceData'
import { useRowEditor } from '../../hooks/useRowEditor'
import { isCablelessToKind } from '../../lib/outputGraph'
import { boxUsage, cablesPicked, consoleCapacity, type PatchStatus } from '../../lib/patchCapacity'
import { matchesSearch } from '../../lib/patchSearch'
import { outputChainSegments, type ChainCellModel, type SegmentNode } from '../../lib/patchSheet'
import type { OutputFlowContext } from '../../lib/signalFlow'
import type { AudioPatchOutput, Console, InventoryItem, OutputCable, OutputDevice, StageMulti, Stagebox } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'
import { ChainCell, type HopCable } from './ChainCell'
import { ColorSelect } from './ColorSelect'
import { PatchStatusRail } from './PatchStatusRail'

// The Desk column appears only when the event has more than one console — with
// one desk there is nothing to disambiguate, and a column of identical values is
// the kind of clutter this slice exists to remove (FR-021).
const COLUMNS = ['Out', 'Name', 'Type', 'W', 'Chain', 'Notes']
const columnsFor = (multiDesk: boolean) => (multiDesk ? ['Out', 'Name', 'Desk', 'Type', 'W', 'Chain', 'Notes'] : COLUMNS)

interface OutputDraft {
  output_number: number
  output_name: string
  output_type: string
  width: AudioPatchOutput['width']
  color?: string
  notes: string
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
  const context: OutputFlowContext = { stageboxes, stageMultis, devices, cables, itemLabelById }

  // The desk's own name heads every chain, once the event has one.
  const consoleName = (output: AudioPatchOutput) => consoles.find((console) => console.id === output.console_id)?.name || undefined
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
    }),
    persist: (output, draft) => saveOutput.mutate({ id: output.id, payload: { ...output, ...draft } }),
  })

  const capacity = consoleCapacity(
    consoles,
    (console) => outputs.filter((output) => output.console_id === console.id).length,
    (console) => console.output_count,
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
    <div>
      {multiDesk && (
        <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
          <span>Desk</span>
          <Select className="h-8 w-auto" value={deskFilter ?? ''} onChange={(event) => setDeskFilter(event.target.value ? Number(event.target.value) : null)}>
            <option value="">All desks</option>
            {consoles.map((console) => (
              <option key={console.id} value={console.id}>
                {console.name || 'Console'}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-zinc-700 bg-zinc-850">
        <Table>
          <TableHeader>
            <TableRow>{columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {shown.map(({ output, chain }) => (
              <Fragment key={output.id}>
                <TableRow
                  className={readOnly ? undefined : 'cursor-pointer'}
                  style={output.color ? { backgroundColor: `${output.color}0f` } : undefined}
                  onClick={readOnly ? undefined : () => editor.openRow(output)}
                >
                  <TableCell
                    className="font-mono text-zinc-300"
                    style={output.color ? { boxShadow: `inset 3px 0 0 0 ${output.color}` } : undefined}
                  >
                    {output.output_number}
                  </TableCell>
                  <TableCell className="text-zinc-100">{output.output_name || <span className="text-zinc-500">unnamed</span>}</TableCell>
                  {multiDesk && <TableCell className="text-xs text-zinc-400">{deskLabel(output)}</TableCell>}
                  <TableCell>
                    <Badge variant={output.output_type === 'aux' ? 'warning' : output.output_type}>{output.output_type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-500">{output.width === 'stereo' ? 'S' : 'M'}</TableCell>
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
                  <TableCell className="max-w-48 truncate text-xs text-zinc-500">{output.notes}</TableCell>
                </TableRow>

                {editor.openId === output.id && editor.draft && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="bg-zinc-900/70">
                      <div className="grid gap-3 md:grid-cols-[6rem_1fr_10rem_8rem_9rem] md:items-end" onKeyDown={editor.onKeyDown}>
                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Out</span>
                          <Input
                            type="number"
                            value={editor.draft.output_number}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, output_number: Number(event.target.value) || editor.draft!.output_number })}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Name</span>
                          <Input
                            autoFocus
                            value={editor.draft.output_name}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, output_name: event.target.value })}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Type</span>
                          <Select
                            value={editor.draft.output_type}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, output_type: event.target.value })}
                          >
                            {options('output_types', editor.draft.output_type).map((value) => (
                              <option key={value.value} value={value.value}>
                                {value.label}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Width</span>
                          <Select
                            value={editor.draft.width}
                            onChange={(event) => editor.setDraft({ ...editor.draft!, width: event.target.value as AudioPatchOutput['width'] })}
                          >
                            <option value="mono">Mono</option>
                            <option value="stereo">Stereo</option>
                          </Select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Tape</span>
                          <ColorSelect eventId={eventId} value={editor.draft.color} onChange={(color) => editor.setDraft({ ...editor.draft!, color })} />
                        </label>

                        {multiDesk && (
                          <label className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Desk</span>
                            <Select
                              value={output.console_id ?? ''}
                              onChange={(event) =>
                                saveOutput.mutate({
                                  id: output.id,
                                  payload: { ...output, console_id: event.target.value ? Number(event.target.value) : undefined },
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

                        <label className="space-y-1 md:col-span-4">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">Notes</span>
                          <Input value={editor.draft.notes} onChange={(event) => editor.setDraft({ ...editor.draft!, notes: event.target.value })} />
                        </label>

                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={editor.save}>
                            Save output
                          </Button>
                          <Button size="sm" variant="ghost" onClick={editor.close}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeOutput.mutate(output.id)} title="Delete output">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-zinc-500">
                        Desk strip only — where this output goes is decided in Flow. <kbd>Esc</kbd> discards, <kbd>⌘↵</kbd> saves and opens the next row.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        {shown.length === 0 && (
          <p className="px-4 py-3 text-sm text-zinc-500">
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
        <p className="mt-2 text-sm text-red-400">
          {(saveOutput.error ?? removeOutput.error ?? setCableItem.error ?? removeCable.error)?.message}
        </p>
      )}
    </div>
  )
}
