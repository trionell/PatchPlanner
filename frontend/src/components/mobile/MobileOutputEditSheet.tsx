import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createAudioOutput, createOutputCable, deleteOutputCable, updateAudioOutput } from '../../api/audioPatch'
import { computeOutputRoutingSave, resolveOutputRouting, type OutputRouting } from '../../lib/mobileOutputList'
import { deskModelOf } from '../../hooks/useDeskModels'
import { deskLabel } from '../../lib/deskStrips'
import { toOptionalNumber } from '../../lib/utils'
import type { AudioPatchOutput, Console, DeskModel, OutputCable, Stagebox } from '../../types'
import { ColorSelect } from '../event/ColorSelect'
import { Button } from '../ui/Button'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Sheet } from '../ui/Sheet'

/** Output-side mirror of MobileChannelEditSheet — same fields, routing is a single mixer→stagebox hop (research.md R3/mobileOutputList.ts). */
export function MobileOutputEditSheet({
  eventId,
  output,
  outputs,
  stageboxes,
  cables,
  onClose,
  onSaved,
  readOnly = false,
  consoles,
  models,
  deskId,
}: {
  eventId: number
  consoles: Console[]
  models: DeskModel[]
  /** The desk a new output is added to — the selected one (Slice 47). */
  deskId?: number
  /** Omitted → creating a new output. */
  output?: AudioPatchOutput
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  cables: OutputCable[]
  onClose: () => void
  onSaved: () => Promise<void>
  /**
   * A viewer taps a row to *read* it (Wave 6c, audit.md M4). A phone row is a
   * truncation, so a role that cannot edit still has to be able to open one — it
   * gets this sheet with its fields inert and no confirm, never a dead row.
   */
  readOnly?: boolean
}) {
  const queryClient = useQueryClient()
  const currentRouting = output ? resolveOutputRouting(output.id, cables) : {}

  const [name, setName] = useState(output?.output_name ?? '')
  const [color, setColor] = useState(output?.color)
  const [notes, setNotes] = useState(output?.notes ?? '')
  const [stageboxId, setStageboxId] = useState<number | undefined>(currentRouting.stageboxId)
  const [port, setPort] = useState<number | undefined>(currentRouting.port)
  const [error, setError] = useState<string | null>(null)
  const [consoleId, setConsoleId] = useState<number | undefined>(output ? output.console_id : deskId)
  const [saving, setSaving] = useState(false)

  const selectedStagebox = stageboxes.find((sb) => sb.id === stageboxId)

  async function handleSave() {
    setError(null)
    if (consoleId == null) {
      setError('Pick the desk this output is on.')
      return
    }
    setSaving(true)
    try {
      let outputId = output?.id
      if (output) {
        await updateAudioOutput(eventId, output.id, {
          event_id: eventId,
          output_number: output.output_number,
          output_name: name,
          output_type: output.output_type,
          color,
          width: output.width,
          notes,
          // See MobileChannelEditSheet: carry the desk rather than clearing it.
          console_id: consoleId,
        })
      } else {
        const nextNumber = Math.max(0, ...outputs.filter((o) => o.console_id === consoleId).map((o) => o.output_number)) + 1
        const created = await createAudioOutput(eventId, {
          event_id: eventId,
          output_number: nextNumber,
          output_name: name,
          output_type: 'foh',
          color,
          width: 'mono',
          notes,
          console_id: consoleId,
        })
        outputId = created.id
      }

      if (outputId != null) {
        const desired: OutputRouting = { stageboxId, port }
        const ops = computeOutputRoutingSave(outputId, cables, desired)
        for (const id of ops.cablesToDelete) await deleteOutputCable(eventId, id)
        for (const data of ops.cablesToCreate) await createOutputCable(eventId, data)
      }

      await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save output.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={output ? `Output ${output.output_number}` : 'Add output'}
      footer={
        readOnly ? undefined : (
          <Button className="w-full" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save output'}
          </Button>
        )
      }
    >
      {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
      {/* Inert rather than absent: the values are the point of opening it. */}
      <fieldset className="flex min-w-0 flex-col gap-3.5" disabled={readOnly}>
      <FieldStack label="Output" width="full">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monitor 2" autoFocus />
      </FieldStack>
      <FieldStack label="Desk" width="full">
        <Select value={consoleId ?? ''} onChange={(e) => setConsoleId(toOptionalNumber(e.target.value))}>
          {consoleId == null && <option value="">Pick a desk…</option>}
          {consoles.map((option) => (
            <option key={option.id} value={option.id}>
              {deskLabel(option, deskModelOf(models, option))}
            </option>
          ))}
        </Select>
      </FieldStack>
      <FieldStack label="Tape" width="full">
        <ColorSelect eventId={eventId} value={color} onChange={setColor} />
      </FieldStack>
      {/* One idea, two controls: the box and the socket on it. */}
      <div className="flex gap-2.5">
        <FieldStack label="Stagebox" width="grow">
          <Select
            value={stageboxId ?? ''}
            onChange={(e) => {
              setStageboxId(toOptionalNumber(e.target.value))
              setPort(undefined)
            }}
          >
            <option value="">— none —</option>
            {stageboxes.map((sb) => (
              <option key={sb.id} value={sb.id}>{sb.name}</option>
            ))}
          </Select>
        </FieldStack>
        <FieldStack label="Out" width="short">
          <Select value={port ?? ''} onChange={(e) => setPort(toOptionalNumber(e.target.value))} disabled={!selectedStagebox}>
            <option value="">—</option>
            {selectedStagebox &&
              Array.from({ length: selectedStagebox.output_count }, (_, i) => (
                <option key={i} value={i}>Out {i + 1}</option>
              ))}
          </Select>
        </FieldStack>
      </div>
      <FieldStack label="Notes" width="full">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FieldStack>
      </fieldset>
    </Sheet>
  )
}
