import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createInputCable, createInputChannel, deleteInputCable, updateInputChannel } from '../../api/audioPatch'
import { computeRoutingSave, resolveChannelRouting, type ChannelRouting } from '../../lib/mobileChannelList'
import { toOptionalNumber } from '../../lib/utils'
import type { InputCable, InputChannel, InputSource, Stagebox } from '../../types'
import { ColorSelect } from '../event/ColorSelect'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

/**
 * On-site edit form for one audio input channel — name, color, notes, and
 * a simplified "which stagebox input / which source" routing view over
 * the input-cable graph (research.md R3). Also handles adding a new
 * channel when `channel` is omitted. A device- or stage-multi-in-the-
 * chain routing stays a desktop-only edit, per the same research note.
 */
export function MobileChannelEditSheet({
  eventId,
  channel,
  channels,
  sources,
  stageboxes,
  cables,
  onClose,
  onSaved,
}: {
  eventId: number
  /** Omitted → creating a new channel. */
  channel?: InputChannel
  channels: InputChannel[]
  sources: InputSource[]
  stageboxes: Stagebox[]
  cables: InputCable[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const currentRouting = channel ? resolveChannelRouting(channel.id, cables) : {}

  const [name, setName] = useState(channel?.channel_name ?? '')
  const [color, setColor] = useState(channel?.color)
  const [notes, setNotes] = useState(channel?.notes ?? '')
  const [stageboxId, setStageboxId] = useState<number | undefined>(currentRouting.stageboxId)
  const [port, setPort] = useState<number | undefined>(currentRouting.port)
  const [sourceId, setSourceId] = useState<number | undefined>(currentRouting.sourceId)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedStagebox = stageboxes.find((sb) => sb.id === stageboxId)

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      let channelId = channel?.id
      if (channel) {
        await updateInputChannel(eventId, channel.id, {
          channel_number: channel.channel_number,
          channel_name: name,
          color,
          group_ids: channel.group_ids,
          dca_ids: channel.dca_ids,
          width: channel.width,
          mixer_behavior: channel.mixer_behavior,
          notes,
        })
      } else {
        const nextNumber = Math.max(0, ...channels.map((c) => c.channel_number)) + 1
        const created = await createInputChannel(eventId, {
          channel_number: nextNumber,
          channel_name: name,
          color,
          width: 'mono',
          mixer_behavior: 'stereo_channel',
          notes,
        })
        channelId = created.id
      }

      if (channelId != null) {
        const desired: ChannelRouting = { stageboxId, port, sourceId }
        const ops = computeRoutingSave(channelId, cables, desired)
        for (const id of ops.cablesToDelete) await deleteInputCable(eventId, id)
        for (const data of ops.cablesToCreate) await createInputCable(eventId, data)
      }

      await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
      await onSaved()
      onClose()
    } catch (err) {
      // Sheet stays open, form values (React state) are untouched — the
      // user's edit is never silently discarded on a failed save (FR-017).
      setError(err instanceof Error ? err.message : 'Failed to save channel.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={channel ? `Edit channel ${channel.channel_number}` : 'Add channel'}>
      <div className="space-y-4">
        {error && <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Channel name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kick In" autoFocus />
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
            <label className="mb-1 block text-sm text-zinc-300">Input #</label>
            <Select value={port ?? ''} onChange={(e) => setPort(toOptionalNumber(e.target.value))} disabled={!selectedStagebox}>
              <option value="">—</option>
              {selectedStagebox &&
                Array.from({ length: selectedStagebox.output_count }, (_, i) => (
                  <option key={i} value={i}>In {i + 1}</option>
                ))}
            </Select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Source / mic</label>
          <Select value={sourceId ?? ''} onChange={(e) => setSourceId(toOptionalNumber(e.target.value))}>
            <option value="">— none —</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
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
