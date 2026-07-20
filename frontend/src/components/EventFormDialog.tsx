import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { listMyInventories } from '../api/inventories'
import type { Event } from '../types'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'
import { Input } from './ui/Input'

const eventSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  date: z.string().optional(),
  venue: z.string().optional(),
  notes: z.string().optional(),
  inventoryId: z.number().positive('Choose an inventory'),
})

type EventFormValues = {
  name: string
  date: string
  venue: string
  notes: string
  inventoryId: number
}

interface EventFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (values: EventFormValues) => Promise<unknown>
  title: string
  submitLabel: string
  initialValues?: Partial<Event>
  submitting?: boolean
}

export function EventFormDialog({
  open,
  onClose,
  onSubmit,
  title,
  submitLabel,
  initialValues,
  submitting,
}: EventFormDialogProps) {
  const inventoriesQuery = useQuery({ queryKey: ['inventories'], queryFn: listMyInventories, enabled: open })

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: initialValues?.name ?? '',
      date: initialValues?.date ?? '',
      venue: initialValues?.venue ?? '',
      notes: initialValues?.notes ?? '',
      inventoryId: initialValues?.inventoryId ?? 0,
    },
  })

  useEffect(() => {
    form.reset({
      name: initialValues?.name ?? '',
      date: initialValues?.date ?? '',
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
    <Dialog open={open} onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(values)
          form.reset()
        })}
      >
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Event name</label>
          <Input {...form.register('name')} />
          {form.formState.errors.name && <p className="mt-1 text-sm text-red-400">{form.formState.errors.name.message}</p>}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Date</label>
            <Input type="date" {...form.register('date')} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Venue</label>
            <Input {...form.register('venue')} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Notes</label>
          <textarea
            className="min-h-28 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
            {...form.register('notes')}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">Inventory</label>
          <select
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
            {...form.register('inventoryId', { valueAsNumber: true })}
          >
            <option value={0} disabled>
              Select an inventory...
            </option>
            {(inventoriesQuery.data ?? []).map((inventory) => (
              <option key={inventory.id} value={inventory.id}>
                {inventory.name}
              </option>
            ))}
          </select>
          {form.formState.errors.inventoryId && (
            <p className="mt-1 text-sm text-red-400">{form.formState.errors.inventoryId.message}</p>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
