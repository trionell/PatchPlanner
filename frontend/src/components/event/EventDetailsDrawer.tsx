import { useState } from 'react'
import type { Event } from '../../types'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Drawer'
import { Input } from '../ui/Input'
import { EventDates } from './EventDates'
import { dateOrderError } from '../../lib/eventTimeline'
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
 * things and are dense for it; this one holds a handful of fields. P2 decides
 * density by asking about the surface's job, *not per component*.
 *
 * It was `narrow` until Slice 30 gave an event four dates. A narrow drawer
 * leaves about 93 px per date field, which will not show `2026-09-17`; folding
 * the four into two rows would fit and would break the one thing the row is
 * for, which is that read left to right it reads like the event. The width
 * follows the content.
 */

export interface EventDraft {
  name: string
  venue: string
  loadInDate: string
  startDate: string
  endDate: string
  loadOutDate: string
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
    loadInDate: event.loadInDate ?? '',
    startDate: event.startDate ?? '',
    endDate: event.endDate ?? '',
    loadOutDate: event.loadOutDate ?? '',
    notes: event.notes ?? '',
  })

  const dateError = dateOrderError(draft)
  const ready = draft.name.trim().length > 0 && !dateError

  return (
    <Drawer
      open
      onClose={onClose}
      title="Event details"
      subtitle="Name, venue, dates and notes"
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
        <EventDates
          values={draft}
          onChange={(next) => setDraft((prev) => ({ ...prev, ...next }))}
        />
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
