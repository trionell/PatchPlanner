import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  createInventory,
  deleteInventory,
  duplicateInventory,
  listInventoryEvents,
  renameInventory,
} from '../../api/inventories'
import type { Inventory } from '../../types'
import { Button } from '../ui/Button'
import { Drawer } from '../ui/Drawer'
import { DrawerSection, FieldStack, FormActions, GearCard, GearForm, GearSpecs, GearTop, Spec } from '../ui/GearList'
import { Input } from '../ui/Input'

/**
 * Everything you can do to a catalog as a whole (Slice 32).
 *
 * It replaces the page's two browser dialogs — a `window.prompt` for the
 * rename and a `window.confirm` for the delete, the latter asking you to
 * approve something the server then refused — and the three ghost buttons
 * that opened them from every row.
 *
 * **Create and manage are the same construction**, with the mode implied by
 * whether an inventory was passed, which is the call `GearForm` already makes
 * about adding and editing a row: they look like one operation because they
 * are one.
 *
 * The interior is `ui/GearList`, not the navigation tier the frame is drawn
 * at. A drawer's contents take the tier of the surface that references them,
 * and what is declared in here is referenced from a 308-row sheet — which is
 * why this looks like Rig, Buses and Universes rather than like a form.
 */

interface InventoryDrawerProps {
  open: boolean
  onClose: () => void
  /** Absent means create. Present means manage that catalog. */
  inventory?: Inventory
  onError: (message: string) => void
  /** Called after a delete, so the caller can leave the catalog it was on. */
  onDeleted?: () => void
}

export function InventoryDrawer({ open, onClose, inventory, onError, onDeleted }: InventoryDrawerProps) {
  const queryClient = useQueryClient()
  // Both call sites mount this only while it is open, so the draft starts
  // from the catalog it is editing and needs no effect to keep it in step —
  // closing the drawer is what discards it.
  const [name, setName] = useState(inventory?.name ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const eventsQuery = useQuery({
    queryKey: ['inventory-events', inventory?.id],
    queryFn: () => listInventoryEvents(inventory!.id),
    enabled: open && inventory != null,
  })
  const events = eventsQuery.data ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['inventories'] })
  const fail = (error: Error) => onError(error.message)

  const create = useMutation({
    mutationFn: () => createInventory(name.trim()),
    onSuccess: async () => {
      await invalidate()
      onClose()
    },
    onError: fail,
  })
  const rename = useMutation({
    mutationFn: () => renameInventory(inventory!.id, name.trim()),
    onSuccess: async () => {
      await invalidate()
      onClose()
    },
    onError: fail,
  })
  const duplicate = useMutation({
    mutationFn: () => duplicateInventory(inventory!.id),
    onSuccess: async () => {
      await invalidate()
      onClose()
    },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: () => deleteInventory(inventory!.id),
    onSuccess: async () => {
      await invalidate()
      onClose()
      onDeleted?.()
    },
    onError: fail,
  })

  const items = inventory?.itemCount ?? 0
  const categories = inventory?.categoryCount ?? 0
  // The list's count and the drawer's list come from the same table, so once
  // the events have loaded they are the same number; before that the count
  // the row already showed stands in.
  const boundEvents = eventsQuery.data?.length ?? inventory?.eventCount ?? 0
  const pending = create.isPending || rename.isPending || duplicate.isPending || remove.isPending
  const unchanged = name.trim() === (inventory?.name ?? '')

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={inventory ? inventory.name : 'New catalog'}
      subtitle={inventory ? manageSubtitle(inventory, boundEvents) : 'An independent catalog of equipment and prices'}
      width="narrow"
      footer={
        inventory ? (
          <>
            <b className="font-medium text-zinc-400">Duplicate</b> copies every category and item · no event bindings
            come with the copy
          </>
        ) : (
          <>
            A catalog holds its own <b className="font-medium text-zinc-400">categories</b> and{' '}
            <b className="font-medium text-zinc-400">items</b> · import a price list into it, or build it by hand
          </>
        )
      }
    >
      <DrawerSection
        label="Catalog"
        action={
          inventory && (
            <Button size="xs" variant="outline" disabled={pending} onClick={() => duplicate.mutate()}>
              Duplicate
            </Button>
          )
        }
      >
        {/* The card states the catalog; no field appears in it. Editing is the
            form below, which is the same form that creates one. */}
        {inventory && (
          <GearCard>
            <GearTop
              name={inventory.name}
              item={inventory.sourceFilename}
              actions={
                <span className="font-mono text-[10px] tabular-nums text-zinc-400">
                  {items} {items === 1 ? 'item' : 'items'}
                </span>
              }
            />
            <GearSpecs>
              <Spec label="items" value={items} />
              <Spec label="categories" value={categories} />
              <Spec label="format" value={formatLabel(inventory)} />
              <Spec label="created" value={inventory.createdAt.slice(0, 10)} />
            </GearSpecs>
          </GearCard>
        )}

        <GearForm>
          <FieldStack label="Name" width="grow">
            <Input
              size="sm"
              autoFocus={!inventory}
              value={name}
              placeholder="e.g. Backline"
              onChange={(event) => setName(event.target.value)}
            />
          </FieldStack>

          <FormActions>
            <Button
              size="xs"
              disabled={!name.trim() || pending || (inventory != null && unchanged)}
              onClick={() => (inventory ? rename.mutate() : create.mutate())}
            >
              {inventory ? 'Save' : 'Create'}
            </Button>

            {/* Absent, never disabled, while any event depends on the catalog
                (P7): a control that cannot do its job is a promise the
                interface can't keep, and the Used on section says why. */}
            {inventory && boundEvents === 0 && !confirmingDelete && (
              <Button
                size="xs"
                variant="ghost"
                className="ml-3 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                disabled={pending}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
            )}
          </FormActions>

          {/* Asks in place, inside the form's own body, naming what goes —
              never a dialog (patterns §2). */}
          {confirmingDelete && (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-[5px] border border-red-400/40 bg-red-500/[0.05] px-2.5 py-2 text-xs text-zinc-300">
              <span className="min-w-0 flex-1">
                Delete <b className="font-medium text-zinc-100">{inventory?.name}</b> and its {items}{' '}
                {items === 1 ? 'item' : 'items'}? This can't be undone.
              </span>
              <Button size="xs" variant="destructive" disabled={pending} onClick={() => remove.mutate()}>
                Delete
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          )}
        </GearForm>
      </DrawerSection>

      {inventory && (
        <DrawerSection label="Used on" count={boundEvents}>
          {/* Every event, and no height of its own: the drawer body scrolls.
              A capped section inside a scrolling body is what cut the category
              rail off at the fold (patterns §4). */}
          {eventsQuery.isLoading && <p className="text-xs text-zinc-500">Loading events…</p>}
          {!eventsQuery.isLoading && events.length === 0 && (
            <p className="text-xs text-zinc-500">Not used by any event.</p>
          )}
          {events.length > 0 && (
            <p className="text-xs text-zinc-500">A catalog can't be deleted while an event uses it.</p>
          )}
          {events.map((event) => (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              onClick={onClose}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2 transition-colors hover:border-zinc-700 hover:bg-zinc-800/40"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-zinc-100">{event.name}</span>
                {event.venue && <span className="truncate text-xs text-zinc-400">{event.venue}</span>}
                <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-400">
                  {event.startDate || '—'}
                </span>
                <span className="text-xs text-zinc-600">→</span>
              </div>
            </Link>
          ))}
        </DrawerSection>
      )}
    </Drawer>
  )
}

function manageSubtitle(inventory: Inventory, boundEvents: number): string {
  const origin = inventory.sourceFilename
    ? `Imported ${inventory.createdAt.slice(0, 10)}`
    : 'Hand-built'
  const use = boundEvents === 0 ? 'not used by any event' : `used on ${boundEvents} ${boundEvents === 1 ? 'event' : 'events'}`
  return `${origin} · ${use}`
}

/** The format is data, not a vocabulary: an unknown one reads as hand-built. */
function formatLabel(inventory: Inventory): string {
  if (inventory.sourceFormat === 'll') return 'LL price list'
  if (inventory.sourceFormat === 'generic') return 'generic'
  return 'hand-built'
}
