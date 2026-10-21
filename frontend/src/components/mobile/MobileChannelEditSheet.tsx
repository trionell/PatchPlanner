import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createInputCable, createInputChannel, deleteInputCable, updateInputChannel } from '../../api/audioPatch'
import { ApiError } from '../../api/client'
import { deskModelOf } from '../../hooks/useDeskModels'
import { deskLabel, stripLabel } from '../../lib/deskStrips'
import { auxJackCount, localJackCount } from '../../lib/inputGraph'
import { computeRoutingSave, resolveChannelRouting, type ChannelRouting, type JackPanel, type JackPanelKind } from '../../lib/mobileChannelList'
import { toOptionalNumber } from '../../lib/utils'
import type { Console, DeskModel, InputCable, InputChannel, InputSource, Stagebox, StripPool, StripRefusal } from '../../types'
import { ColorSelect } from '../event/ColorSelect'
import { Button } from '../ui/Button'
import { FieldStack } from '../ui/GearList'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Sheet } from '../ui/Sheet'

/**
 * On-site edit form for one audio input channel — name, color, notes, and
 * a simplified "which jack / which source" routing view over the input-cable
 * graph (research.md R3): a stagebox input, or a desk's own local jack or rear
 * aux socket (D9). Also handles adding a new
 * channel when `channel` is omitted. A device- or stage-multi-in-the-
 * chain routing stays a desktop-only edit, per the same research note.
 */
export function MobileChannelEditSheet({
  eventId,
  channel,
  sources,
  stageboxes,
  cables,
  onClose,
  onSaved,
  readOnly = false,
  consoles,
  models,
  deskId,
  onMoved,
}: {
  /** Called when a save moves the channel to another desk, with B7's line. */
  onMoved?: (line: { text: string; deskId: number; deskName: string }) => void
  eventId: number
  consoles: Console[]
  models: DeskModel[]
  /** The desk a new channel is added to — the selected one (Slice 47). */
  deskId?: number
  /** Omitted → creating a new channel. */
  channel?: InputChannel
  sources: InputSource[]
  stageboxes: Stagebox[]
  cables: InputCable[]
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
  const currentRouting = channel ? resolveChannelRouting(channel.id, cables) : {}

  const [name, setName] = useState(channel?.channel_name ?? '')
  const [color, setColor] = useState(channel?.color)
  const [notes, setNotes] = useState(channel?.notes ?? '')
  const [panel, setPanel] = useState<JackPanel | undefined>(currentRouting.panel)
  const [port, setPort] = useState<number | undefined>(currentRouting.port)
  const [sourceId, setSourceId] = useState<number | undefined>(currentRouting.sourceId)
  const [error, setError] = useState<string | null>(null)
  /* Required (Slice 47): a channel is always on a desk, and a save cannot take it off. */
  const [consoleId, setConsoleId] = useState<number | undefined>(channel ? channel.console_id : deskId)
  const [pool, setPool] = useState<StripPool>(channel?.strip_pool ?? 'channel')
  const [number, setNumber] = useState(channel?.channel_number ?? 0)
  const [fix, setFix] = useState<StripRefusal['fix']>()
  const desk = consoles.find((candidate) => candidate.id === consoleId)
  const hasAux = desk ? deskModelOf(models, desk).aux_in > 0 : false
  const [saving, setSaving] = useState(false)

  // The chosen panel's jacks, labelled as the Jack field lists them.
  const jackCount = (() => {
    if (!panel) return 0
    if (panel.kind === 'stagebox') return stageboxes.find((sb) => sb.id === panel.id)?.input_count ?? 0
    const deskFor = consoles.find((candidate) => candidate.id === panel.id)
    if (!deskFor) return 0
    return panel.kind === 'console_local' ? localJackCount(deskFor, cables) : auxJackCount(deskFor, cables)
  })()
  const jackPrefix = panel?.kind === 'console_local' ? 'Local' : panel?.kind === 'console_aux' ? 'Aux' : 'In'
  const panelValue = panel ? `${panel.kind}:${panel.id}` : ''

  async function handleSave() {
    setError(null)
    setFix(undefined)
    if (consoleId == null) {
      setError('Pick the desk this channel is on.')
      return
    }
    setSaving(true)
    try {
      let channelId = channel?.id
      let saved: InputChannel | undefined
      if (channel) {
        saved = await updateInputChannel(eventId, channel.id, {
          channel_number: number,
          strip_pool: hasAux ? pool : 'channel',
          channel_name: name,
          color,
          // A desk change drops the old desk's routes on the server; otherwise they stay.
          mix_ids: consoleId === channel.console_id ? channel.mix_ids : undefined,
          width: channel.width,
          mixer_behavior: channel.mixer_behavior,
          notes,
          // A PATCH replaces the row's whole state: the desk always travels.
          console_id: consoleId,
        })
      } else {
        // 0 asks the server for the desk's next strip, the same rule + Channel uses.
        const created = await createInputChannel(eventId, {
          channel_number: 0,
          console_id: consoleId,
          strip_pool: hasAux ? pool : 'channel',
          channel_name: name,
          color,
          width: 'mono',
          mixer_behavior: 'stereo_channel',
          notes,
        })
        channelId = created.id
      }

      if (channelId != null) {
        const desired: ChannelRouting = { panel, port, sourceId }
        const ops = computeRoutingSave(channelId, cables, desired)
        for (const id of ops.cablesToDelete) await deleteInputCable(eventId, id)
        for (const data of ops.cablesToCreate) await createInputCable(eventId, data)
      }

      if (channel && saved && desk && consoleId !== channel.console_id) {
        const model = deskModelOf(models, desk)
        onMoved?.({ text: `${name || 'The channel'} is now on ${deskLabel(desk, model)}, as ${stripLabel(model, saved)}.`, deskId: desk.id, deskName: desk.name || 'that desk' })
      }
      await queryClient.invalidateQueries({ queryKey: ['audio-patch', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
      await onSaved()
      onClose()
    } catch (err) {
      // Sheet stays open, form values (React state) are untouched — the
      // user's edit is never silently discarded on a failed save (FR-017).
      setError(err instanceof Error ? err.message : 'Failed to save channel.')
      if (err instanceof ApiError) setFix((err.body as StripRefusal | undefined)?.fix)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={channel ? `Channel ${channel.channel_number}` : 'Add channel'}
      footer={
        readOnly ? undefined : (
          <Button className="w-full" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save channel'}
          </Button>
        )
      }
    >
      {error && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
          {fix && (
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                setNumber(fix.number)
                setPool(fix.pool)
                setError(null)
                setFix(undefined)
              }}
            >
              Use {fix.pool === 'aux' ? 'Aux ' : ''}
              {fix.number}
              {(channel?.width === 'stereo' && desk && deskModelOf(models, desk).engine === 'x32') ? `–${fix.number + 1}` : ''}
            </Button>
          )}
        </div>
      )}
      {/* Inert rather than absent: the values are the point of opening it. */}
      <fieldset className="flex min-w-0 flex-col gap-3.5" disabled={readOnly}>
      <FieldStack label="Channel" width="full">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kick In" autoFocus />
      </FieldStack>
      <div className="flex gap-2.5">
        <FieldStack label="Desk" width="grow">
          <Select value={consoleId ?? ''} onChange={(e) => setConsoleId(toOptionalNumber(e.target.value))}>
            {consoleId == null && <option value="">Pick a desk…</option>}
            {consoles.map((option) => (
              <option key={option.id} value={option.id}>
                {deskLabel(option, deskModelOf(models, option))}
              </option>
            ))}
          </Select>
        </FieldStack>
        {hasAux && (
          <FieldStack label="Strip" width="short">
            <Select value={pool} onChange={(e) => setPool(e.target.value as StripPool)}>
              <option value="channel">Channel</option>
              <option value="aux">Aux in</option>
            </Select>
          </FieldStack>
        )}
      </div>
      <FieldStack label="Tape" width="full">
        <ColorSelect eventId={eventId} value={color} onChange={setColor} />
      </FieldStack>
      {/* Two side by side only where they are one idea: a panel and the jack
          on it are one route (tokens.md §7). Everything else stacks. Stageboxes
          first, then each desk's own sockets grouped under it (D9). */}
      <div className="flex gap-2.5">
        <FieldStack label="Into" width="grow">
          <Select
            value={panelValue}
            onChange={(e) => {
              const [kind, id] = e.target.value.split(':')
              setPanel(kind ? { kind: kind as JackPanelKind, id: Number(id) } : undefined)
              setPort(undefined)
            }}
          >
            <option value="">— none —</option>
            {stageboxes.map((sb) => (
              <option key={sb.id} value={`stagebox:${sb.id}`}>{sb.name}</option>
            ))}
            {consoles.map((option) => {
              const name = option.name || 'Console'
              // A panel the model lacks is still listed while this channel is on it
              // (kept after a switch), so the field shows what is patched.
              const kept = (kind: JackPanelKind) => currentRouting.panel?.kind === kind && currentRouting.panel.id === option.id
              const local = option.local_input_count > 0 || kept('console_local')
              const aux = option.aux_socket_count > 0 || kept('console_aux')
              if (!local && !aux) return null
              return (
                <optgroup key={option.id} label={name}>
                  {local && <option value={`console_local:${option.id}`}>{name} local in</option>}
                  {aux && <option value={`console_aux:${option.id}`}>{name} aux in</option>}
                </optgroup>
              )
            })}
          </Select>
        </FieldStack>
        <FieldStack label="Jack" width="short">
          <Select value={port ?? ''} onChange={(e) => setPort(toOptionalNumber(e.target.value))} disabled={jackCount === 0}>
            <option value="">—</option>
            {Array.from({ length: jackCount }, (_, i) => (
              <option key={i} value={i}>{jackPrefix} {i + 1}</option>
            ))}
          </Select>
        </FieldStack>
      </div>
      <FieldStack label="Source" width="full">
        <Select value={sourceId ?? ''} onChange={(e) => setSourceId(toOptionalNumber(e.target.value))}>
          <option value="">— none —</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </FieldStack>
      <FieldStack label="Notes" width="full">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FieldStack>
      </fieldset>
    </Sheet>
  )
}
