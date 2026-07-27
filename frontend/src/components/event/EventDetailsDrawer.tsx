import { useState } from 'react'
import type { Event } from '../../types'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Drawer'
import { Input } from '../ui/Input'
import { FieldLabel } from '../ui/Label'
import { Textarea } from '../ui/Textarea'

/**
 * Where an event's name, venue, date and notes are changed (Slice 28 US4).
 *
 * Editing moved off the tab and in here, which settles a question rather than
 * answering it: Overview was the only surface in the application with an explicit
 * Save, and everywhere else a field persists on blur. A *drawer* with a Save is
 * ordinary — it opens, you change things, you save or you cancel — and the tab
 * has no form left to save.
 *
 * The read-only case falls out for free: the caller passes no handler, so there
 * is no `Edit details` button and nothing else on the tab differs (P7).
 *
 * **Navigation-tier fields inside a work-tier drawer's chrome**, and that is not
 * an inconsistency. The Rig, Buses and Universes drawers hold lists of many
 * things and are dense for it; this one holds four fields. P2 decides density by
 * asking about the surface's job, *not per component*.
 */

export interface EventDraft {
  name: string
  venue: string
  date: string
  notes: string
}

interface EventDetailsDrawerProps {
  open: boolean
  onClose: () => void
  event?: Event
  saving?: boolean
  onSave: (draft: EventDraft) => void
}

export function EventDetailsDrawer({ open, onClose, event, saving, onSave }: EventDetailsDrawerProps) {
  // Unmounted while closed, so the draft is created on open and destroyed on
  // close. That is what makes Cancel really discard — reopening shows what is
  // stored, not what was abandoned last time — without an effect resetting state
  // somebody has to remember to write.
  if (!open || !event) return null
  return <EventDetailsForm event={event} saving={saving} onSave={onSave} onClose={onClose} />
}

function EventDetailsForm({
  event,
  saving,
  onSave,
  onClose,
}: {
  event: Event
  saving?: boolean
  onSave: (draft: EventDraft) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<EventDraft>({
    name: event.name,
    venue: event.venue ?? '',
    date: event.date ?? '',
    notes: event.notes ?? '',
  })

  const ready = draft.name.trim().length > 0

  return (
    <Drawer
      open
      onClose={onClose}
      title="Event details"
      subtitle="Name, venue, date and notes"
      width="narrow"
      footer={<>Renaming an event never changes its patch, its rig or its rental order.</>}
    >
      <div className="flex flex-col gap-3.5">
        <div>
          <FieldLabel>Name</FieldLabel>
          <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
        </div>
        <div>
          <FieldLabel>Venue</FieldLabel>
          <Input value={draft.venue} onChange={(e) => setDraft((prev) => ({ ...prev, venue: e.target.value }))} />
        </div>
        <div>
          <FieldLabel>Date</FieldLabel>
          <Input type="date" value={draft.date} onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))} />
        </div>
        <div>
          <FieldLabel>Notes</FieldLabel>
          <Textarea value={draft.notes} onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready || saving} onClick={() => onSave(draft)}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
