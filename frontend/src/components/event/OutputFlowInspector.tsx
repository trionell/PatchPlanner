import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { createAudioOutput, deleteAudioOutput, updateAudioOutput } from '../../api/audioPatch'
import { useReferenceData } from '../../hooks/useReferenceData'
import { duplicateOf, landsOn } from '../../lib/outputInspector'
import { derivedOutputPortColor } from '../../lib/outputGraph'
import { outputTypeTint } from '../../lib/patchTints'
import { outputChainSegments } from '../../lib/patchSheet'
import type { OutputFlowContext } from '../../lib/signalFlow'
import type { AudioPatchOutput, Console, OutputCable, OutputDevice, StageMulti, Stagebox } from '../../types'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Pill } from '../ui/SheetTable'
import { Select } from '../ui/Select'
import { ColorSelect } from './ColorSelect'
import { Field, InspectorHeader, InspectorRail, Legend, Note, type LegendRow } from './graph/InspectorRail'

/**
 * What the outputs canvas has selected (Slice 26, data-model.md §2).
 *
 * `output` is the new one and the point of the slice: a box is too coarse to say
 * which row the rail is editing, because a desk's bus list holds many. It is
 * deliberately **not** a `PortRef` kind — `mixer` was already doing two jobs on this
 * graph (a mixer *port*'s id is an output's id, the mixer *node*'s selection id was a
 * desk's id), and a new kind makes that ambiguity unwritable rather than merely
 * unwritten.
 *
 * `mixer` is gone: the desk box and the "No desk" box are no longer selectable, since
 * a desk's own fields live in the Rig drawer and its contents each have a rail now.
 */
export type OutputFlowSelection =
  | { kind: 'output'; id: number }
  | { kind: 'stagebox'; id: number }
  | { kind: 'stage_multi'; id: number }
  | { kind: 'device'; id: number }
  | { kind: 'console_local'; id: number }

interface OutputFlowInspectorProps {
  eventId: number
  selection: OutputFlowSelection
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  stageMultis: StageMulti[]
  devices: OutputDevice[]
  cables: OutputCable[]
  consoles: Console[]
  itemLabelById: Map<number, string>
  onSelectionChange: (selection: OutputFlowSelection | null) => void
  onChanged: () => Promise<void>
  readOnly?: boolean
}

/**
 * The outputs Flow view's editor (Slice 26 US1/US2) — the rail the inputs canvas has
 * had since Slice 23, on the entity that maps one-to-one onto the sheet's rows.
 *
 * Built on `graph/InspectorRail`, so it is the same rail as the inputs one rather
 * than a second one that matches today. It holds all seven fields the sheet's inline
 * editor holds, which is what makes an output editable in either view.
 *
 * **No draft.** Each field mutates the row directly, as the source rail's do. The
 * sheet keeps its explicit Save because it edits a whole row with the keyboard
 * (Enter saves, Escape reverts, which needs a draft); a rail that also held one would
 * be a second copy of a row the sheet may be editing at the same time.
 */
export function OutputFlowInspector({
  eventId,
  selection,
  outputs,
  stageboxes,
  stageMultis,
  devices,
  cables,
  consoles,
  itemLabelById,
  onSelectionChange,
  onChanged,
  readOnly = false,
}: OutputFlowInspectorProps) {
  const queryClient = useQueryClient()
  const { options } = useReferenceData(eventId)
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
    await onChanged()
  }
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<AudioPatchOutput, 'id'> }) => updateAudioOutput(eventId, id, data),
    onSuccess: invalidate,
  })
  const create = useMutation({ mutationFn: (data: Omit<AudioPatchOutput, 'id'>) => createAudioOutput(eventId, data), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: number) => deleteAudioOutput(eventId, id), onSuccess: invalidate })

  const output = selection.kind === 'output' ? outputs.find((candidate) => candidate.id === selection.id) : undefined
  const box = selection.kind === 'output' ? undefined : describeBox(selection, { stageboxes, stageMultis, devices, consoles })

  /**
   * The rail's subject can disappear underneath it — deleted here, or from the sheet
   * in another window between refetches. Clear the selection rather than render a
   * frame around a row that no longer exists (research.md R9). In an effect, because
   * a component may not change its parent's state while rendering.
   */
  const orphaned = !output && !box
  useEffect(() => {
    if (orphaned) onSelectionChange(null)
  }, [orphaned, onSelectionChange])
  if (orphaned) return null

  const close = () => onSelectionChange(null)

  const saveOutput = (patch: Partial<AudioPatchOutput>) => {
    if (!output) return
    // The whole row, because the route takes the whole row. `output` is read from the
    // live query on every render, so this is never more than one refetch stale — the
    // same shape the source rail's save uses.
    update.mutate({ id: output.id, data: { ...output, ...patch } })
  }

  if (!output) {
    return (
      <InspectorRail>
        <InspectorHeader label={box!.heading} onClose={close} />
        <p className="text-sm font-semibold text-zinc-100">{box!.title}</p>
        <Note label="Edited in the Rig drawer">
          <span className="text-[11px] leading-snug text-zinc-400">
            Rig gear is declared once per event and shared by both audio tabs. Select an output to edit it here.
          </span>
        </Note>
        <Legend rows={OUTPUT_LEGEND} />
      </InspectorRail>
    )
  }

  const desk = consoles.find((candidate) => candidate.id === output.console_id)
  const context: OutputFlowContext = { stageboxes, stageMultis, devices, cables, itemLabelById, consoles }
  const chain = outputChainSegments(output, context, { consoleLabel: desk?.name || undefined, consoles })
  const { landings, patched } = landsOn(chain)
  const color = derivedOutputPortColor('mixer', output.id, 0, { outputs, cables, devices })
  const portCount = output.width === 'stereo' ? 2 : 1

  return (
    <InspectorRail>
      <InspectorHeader
        label="Output"
        onClose={close}
        pill={<Pill className={outputTypeTint(output.output_type)}>{output.output_type}</Pill>}
      />

      <Input
        size="sm"
        className="h-7 font-semibold"
        defaultValue={output.output_name ?? ''}
        disabled={readOnly}
        key={`${output.id}-name`}
        placeholder="unnamed"
        onBlur={(event) => {
          const name = event.target.value.trim()
          if (name !== (output.output_name ?? '')) saveOutput({ output_name: name })
        }}
      />

      <Field label="Out">
        <Input
          size="sm"
          type="number"
          defaultValue={output.output_number}
          disabled={readOnly}
          key={`${output.id}-number`}
          // On blur, not per keystroke: typing "12" would otherwise save 1 and then
          // 12, and briefly renumber the row to a number someone else may hold.
          onBlur={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next) && next > 0 && next !== output.output_number) saveOutput({ output_number: next })
          }}
        />
      </Field>
      <Field label="Type">
        <Select size="sm" value={output.output_type} disabled={readOnly} onChange={(event) => saveOutput({ output_type: event.target.value })}>
          {options('output_types', output.output_type).map((value) => (
            <option key={value.value} value={value.value}>
              {value.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Width">
        <Select size="sm" value={output.width} disabled={readOnly} onChange={(event) => saveOutput({ width: event.target.value as AudioPatchOutput['width'] })}>
          <option value="mono">Mono</option>
          <option value="stereo">Stereo</option>
        </Select>
      </Field>
      <Field label="Tape">
        <ColorSelect eventId={eventId} value={output.color} disabled={readOnly} onChange={(next) => saveOutput({ color: next || undefined })} />
      </Field>
      {/* Only with more than one desk, exactly as the sheet's Desk column is: a picker
          with one option is a control that cannot be used (FR-003). */}
      {consoles.length > 1 && (
        <Field label="Desk">
          <Select
            size="sm"
            value={output.console_id ?? ''}
            disabled={readOnly}
            onChange={(event) => saveOutput({ console_id: event.target.value ? Number(event.target.value) : undefined })}
          >
            <option value="">No desk</option>
            {consoles.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name || 'Console'}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Notes">
        <Input
          size="sm"
          defaultValue={output.notes ?? ''}
          disabled={readOnly}
          key={`${output.id}-notes`}
          onBlur={(event) => {
            const notes = event.target.value
            if (notes !== (output.notes ?? '')) saveOutput({ notes })
          }}
        />
      </Field>

      <Note label="Lands on">
        {patched ? (
          landings.map((landing) => (
            <span key={`${landing.sideLabel ?? ''}${landing.label}`} className="font-mono text-[11px]" style={color ? { color } : undefined}>
              {landing.sideLabel ? `${landing.sideLabel} → ` : ''}
              {landing.label}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-zinc-500">Not patched — this output doesn't leave the desk.</span>
        )}
        <span className="font-mono text-[10px] text-zinc-500">
          {portCount} {portCount === 1 ? 'port' : 'ports'} · {desk?.name || 'no desk'}
        </span>
      </Note>
      <Legend rows={OUTPUT_LEGEND} />

      {!readOnly && (
        <div className="mt-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={() =>
              create.mutate(duplicateOf(output, outputs), {
                // Follow the copy. The route returns the created row, so the rail does
                // not have to guess which of two identical-looking rows is the new one.
                onSuccess: (created) => onSelectionChange({ kind: 'output', id: created.id }),
              })
            }
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />Duplicate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
            onClick={() => {
              const label = `${output.output_number}${output.output_name ? ` ${output.output_name}` : ''}`
              if (window.confirm(`Delete output ${label}? Any cable leaving it is removed with it.`)) {
                remove.mutate(output.id)
                close()
              }
            }}
          >
            Delete
          </Button>
        </div>
      )}

      {(update.error ?? create.error ?? remove.error) && (
        <p className="text-[11px] text-red-400">{(update.error ?? create.error ?? remove.error)?.message}</p>
      )}
    </InspectorRail>
  )
}

/**
 * What this canvas's lines mean. The strokes are the shared rail's; the words are
 * this graph's — here a run's colour says which *output* it carries, and there is no
 * 48 V row, because no output carries phantom power (FR-013).
 */
const OUTPUT_LEGEND: LegendRow[] = [
  { kind: 'cable', meaning: 'cable, carrying that output' },
  { kind: 'network', meaning: 'desk or network routing' },
  { kind: 'unpatched', meaning: 'no cable picked yet' },
]

/**
 * The rig box the rail is showing. Returns undefined when the box is gone, which is
 * what tells the caller to clear the selection rather than name a stagebox that was
 * deleted.
 */
function describeBox(
  selection: Exclude<OutputFlowSelection, { kind: 'output' }>,
  context: { stageboxes: Stagebox[]; stageMultis: StageMulti[]; devices: OutputDevice[]; consoles: Console[] },
): { heading: string; title: string } | undefined {
  switch (selection.kind) {
    case 'stagebox': {
      const box = context.stageboxes.find((candidate) => candidate.id === selection.id)
      return box && { heading: 'Stagebox', title: box.name }
    }
    case 'stage_multi': {
      const multi = context.stageMultis.find((candidate) => candidate.id === selection.id)
      return multi && { heading: 'Stage multi', title: multi.name }
    }
    case 'device': {
      const device = context.devices.find((candidate) => candidate.id === selection.id)
      return device && { heading: 'Device', title: device.name }
    }
    case 'console_local': {
      const desk = context.consoles.find((candidate) => candidate.id === selection.id)
      return desk && { heading: 'Local jacks', title: `${desk.name || 'Console'} · local jacks` }
    }
  }
}
