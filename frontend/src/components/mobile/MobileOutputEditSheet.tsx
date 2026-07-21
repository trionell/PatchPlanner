import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createAudioOutput, createOutputCable, deleteOutputCable, updateAudioOutput } from '../../api/audioPatch'
import { computeOutputRoutingSave, resolveOutputRouting, type OutputRouting } from '../../lib/mobileOutputList'
import { toOptionalNumber } from '../../lib/utils'
import type { AudioPatchOutput, OutputCable, Stagebox } from '../../types'
import { ColorSelect } from '../event/ColorSelect'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

/** Output-side mirror of MobileChannelEditSheet — same fields, routing is a single mixer→stagebox hop (research.md R3/mobileOutputList.ts). */
export function MobileOutputEditSheet({
  eventId,
  output,
  outputs,
  stageboxes,
  cables,
  onClose,
  onSaved,
}: {
  eventId: number
  /** Omitted → creating a new output. */
  output?: AudioPatchOutput
  outputs: AudioPatchOutput[]
  stageboxes: Stagebox[]
  cables: OutputCable[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const currentRouting = output ? resolveOutputRouting(output.id, cables) : {}

  const [name, setName] = useState(output?.output_name ?? '')
  const [color, setColor] = useState(output?.color)
  const [notes, setNotes] = useState(output?.notes ?? '')
  const [stageboxId, setStageboxId] = useState<number | undefined>(currentRouting.stageboxId)
  const [port, setPort] = useState<number | undefined>(currentRouting.port)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedStagebox = stageboxes.find((sb) => sb.id === stageboxId)

  async function handleSave() {
    setError(null)
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
        })
      } else {
        const nextNumber = Math.max(0, ...outputs.map((o) => o.output_number)) + 1
        const created = await createAudioOutput(eventId, {
          event_id: eventId,
          output_number: nextNumber,
          output_name: name,
          output_type: 'foh',
          color,
          width: 'mono',
          notes,
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
    <Dialog open onClose={onClose} title={output ? `Edit output ${output.output_number}` : 'Add output'}>
      <div className="space-y-4">
        {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Output name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monitor 2" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Channel color</label>
          <ColorSelect eventId={eventId} value={color} onChange={setColor} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Stagebox</label>
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
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Output #</label>
            <Select value={port ?? ''} onChange={(e) => setPort(toOptionalNumber(e.target.value))} disabled={!selectedStagebox}>
              <option value="">—</option>
              {selectedStagebox &&
                Array.from({ length: selectedStagebox.output_count }, (_, i) => (
                  <option key={i} value={i}>Out {i + 1}</option>
                ))}
            </Select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
    </Dialog>
  )
}
