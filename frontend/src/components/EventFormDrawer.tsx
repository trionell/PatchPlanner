import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { listMyInventories } from '../api/inventories'
import { dateOrderError } from '../lib/eventTimeline'
import type { Event } from '../types'
import { EventDates, type EventDateValues } from './event/EventDates'
import { Button } from './ui/Button'
import { Drawer } from './ui/Drawer'
import { Input } from './ui/Input'
import { FieldLabel } from './ui/Label'
import { Select } from './ui/Select'
import { Textarea } from './ui/Textarea'

/**
 * Creating an event, in a drawer.
 *
 * It was a `Dialog`, and it was the only form in the application that still
 * was. `EventDetailsDrawer` edits the same fields in a drawer, and patterns
 * §4b is explicit that editing an event is a drawer — so the create form was
 * asserting, by being a different kind of overlay, that making an event and
 * changing one are different kinds of act. They are not: it is the same seven
 * fields.
 *
 * **`wide`, and the four dates are what set it.** A narrow drawer is 448 px,
 * which leaves about 93 px per date field once the padding and gaps are taken
 * out — too narrow for a date input to show `2026-09-17`. Stacking them two by
 * two would fit, and would break the one thing the row is for: read left to
 * right, it reads like the event. So the width follows the content rather than
 * the content being folded to fit the width.
 */
const eventSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  loadInDate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  loadOutDate: z.string().optional(),
  venue: z.string().optional(),
  notes: z.string().optional(),
  inventoryId: z.number().positive('Choose an inventory'),
})

type EventFormValues = {
  name: string
  loadInDate: string
  startDate: string
  endDate: string
  loadOutDate: string
  venue: string
  notes: string
  inventoryId: number
}

interface EventFormDrawerProps {
  open: boolean
  onClose: () => void
  onSubmit: (values: EventFormValues) => Promise<unknown>
  title: string
  submitLabel: string
  initialValues?: Partial<Event>
  submitting?: boolean
}

export function EventFormDrawer({
  open,
  onClose,
  onSubmit,
  title,
  submitLabel,
  initialValues,
  submitting,
}: EventFormDrawerProps) {
  const inventoriesQuery = useQuery({ queryKey: ['inventories'], queryFn: listMyInventories, enabled: open })

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: initialValues?.name ?? '',
      loadInDate: initialValues?.loadInDate ?? '',
      startDate: initialValues?.startDate ?? '',
      endDate: initialValues?.endDate ?? '',
      loadOutDate: initialValues?.loadOutDate ?? '',
      venue: initialValues?.venue ?? '',
      notes: initialValues?.notes ?? '',
      inventoryId: initialValues?.inventoryId ?? 0,
    },
  })

  // The four dates live in the form like every other field; EventDates just
  // needs them as one value, because it derives two spans from all four.
  const watched = useWatch({
    control: form.control,
    name: ['loadInDate', 'startDate', 'endDate', 'loadOutDate'],
  })
  const dates: EventDateValues = {
    loadInDate: watched[0] ?? '',
    startDate: watched[1] ?? '',
    endDate: watched[2] ?? '',
    loadOutDate: watched[3] ?? '',
  }
  const dateError = dateOrderError(dates)

  useEffect(() => {
    form.reset({
      name: initialValues?.name ?? '',
      loadInDate: initialValues?.loadInDate ?? '',
      startDate: initialValues?.startDate ?? '',
      endDate: initialValues?.endDate ?? '',
      loadOutDate: initialValues?.loadOutDate ?? '',
      venue: initialValues?.venue ?? '',
      notes: initialValues?.notes ?? '',
      inventoryId: initialValues?.inventoryId ?? 0,
    })
  }, [form, initialValues, open])

  // Silently default to the user's only inventory once the list loads —
  // most users will only ever have one.
  useEffect(() => {
    if (!initialValues?.inventoryId && inventoriesQuery.data?.length === 1 && !form.getValues('inventoryId')) {
      form.setValue('inventoryId', inventoriesQuery.data[0].id)
    }
  }, [form, initialValues, inventoriesQuery.data])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Name, venue, dates, notes and the inventory it draws from"
      footer={<>An event&rsquo;s inventory is chosen once, at creation, and never changes afterwards.</>}
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={form.handleSubmit(async (values) => {
          if (dateOrderError(values)) return
          await onSubmit(values)
          form.reset()
        })}
      >
        <div>
          <FieldLabel>Event name</FieldLabel>
          <Input {...form.register('name')} />
          {form.formState.errors.name && (
            <p className="mt-1 text-sm text-red-400">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div>
          <FieldLabel>Venue</FieldLabel>
          <Input {...form.register('venue')} />
        </div>

        <EventDates
          values={dates}
          onChange={(next) => {
            for (const [key, value] of Object.entries(next)) {
              form.setValue(key as keyof EventDateValues, value, { shouldDirty: true })
            }
          }}
        />

        <div>
          <FieldLabel>Notes</FieldLabel>
          <Textarea {...form.register('notes')} />
        </div>

        <div>
          <FieldLabel>Inventory</FieldLabel>
          <Select {...form.register('inventoryId', { valueAsNumber: true })}>
            <option value={0} disabled>
              Select an inventory…
            </option>
            {(inventoriesQuery.data ?? []).map((inventory) => (
              <option key={inventory.id} value={inventory.id}>
                {inventory.name}
              </option>
            ))}
          </Select>
          {form.formState.errors.inventoryId && (
            <p className="mt-1 text-sm text-red-400">{form.formState.errors.inventoryId.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || Boolean(dateError)}>
            {submitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Drawer>
  )
}
