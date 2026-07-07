import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { listInventoryItems } from '../../api/inventory'
import { deleteEventOwnedEquipment, listEventOwnedEquipment, listOwnedItems, putEventOwnedEquipment } from '../../api/owned'
import { deleteManualRental, getRentalSummary, putManualRental } from '../../api/rentals'
import type { ManualRentalRequest, OwnedEquipmentRequest } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'

const emptyOwnedDraft = { itemId: '', quantity: 1, notes: '' }
const emptyRentedDraft = { itemId: '', quantityAudio: 0, quantityLighting: 0, notes: '' }

/**
 * Everything coming to the gig beyond the patch and the rig: owned gear the
 * technician brings, and rented extras (the manual rental lines, shared with
 * the Rental Order tab).
 */
export function EquipmentTab({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient()
  const ownedCatalogQuery = useQuery({ queryKey: ['owned-items'], queryFn: listOwnedItems })
  const ownedLinesQuery = useQuery({ queryKey: ['owned-equipment', eventId], queryFn: () => listEventOwnedEquipment(eventId) })
  const rentalQuery = useQuery({ queryKey: ['rental-summary', eventId], queryFn: () => getRentalSummary(eventId) })
  const allInventoryQuery = useQuery({ queryKey: ['inventory-all-items'], queryFn: () => listInventoryItems() })

  const [ownedDraft, setOwnedDraft] = useState(emptyOwnedDraft)
  const [rentedDraft, setRentedDraft] = useState(emptyRentedDraft)

  const invalidateOwned = async () => {
    await queryClient.invalidateQueries({ queryKey: ['owned-equipment', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['owned-items'] })
  }
  const ownedPutMutation = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: number; payload: OwnedEquipmentRequest }) => putEventOwnedEquipment(eventId, itemId, payload),
    onSuccess: async () => {
      setOwnedDraft(emptyOwnedDraft)
      await invalidateOwned()
    },
  })
  const ownedDeleteMutation = useMutation({
    mutationFn: (itemId: number) => deleteEventOwnedEquipment(eventId, itemId),
    onSuccess: invalidateOwned,
  })

  const invalidateRental = () => queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  const rentedPutMutation = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: number; payload: ManualRentalRequest }) => putManualRental(eventId, itemId, payload),
    onSuccess: async () => {
      setRentedDraft(emptyRentedDraft)
      await invalidateRental()
    },
  })
  const rentedDeleteMutation = useMutation({
    mutationFn: (itemId: number) => deleteManualRental(eventId, itemId),
    onSuccess: invalidateRental,
  })

  const rentedExtras = (rentalQuery.data?.items ?? []).filter((line) => line.manual_quantity_audio > 0 || line.manual_quantity_lighting > 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Owned gear</CardTitle>
          <p className="mt-1 text-sm text-zinc-400">Equipment you bring yourself — never part of the rental order.</p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="min-w-64 flex-1">
              <label className="mb-1 block text-sm text-zinc-300">Owned item</label>
              <Select value={ownedDraft.itemId} onChange={(e) => setOwnedDraft((prev) => ({ ...prev, itemId: e.target.value }))}>
                <option value="">Select item…</option>
                {(ownedCatalogQuery.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{item.category_type} — {item.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Quantity</label>
              <Input type="number" min={0} value={ownedDraft.quantity} onChange={(e) => setOwnedDraft((prev) => ({ ...prev, quantity: Math.max(0, Number(e.target.value)) }))} className="w-24" />
            </div>
            <div className="min-w-40">
              <label className="mb-1 block text-sm text-zinc-300">Note</label>
              <Input value={ownedDraft.notes} onChange={(e) => setOwnedDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="e.g. FOH laptop" />
            </div>
            <Button
              size="sm"
              disabled={!ownedDraft.itemId || ownedPutMutation.isPending}
              onClick={() => ownedPutMutation.mutate({ itemId: Number(ownedDraft.itemId), payload: { quantity: ownedDraft.quantity, notes: ownedDraft.notes || undefined } })}
            >
              <Plus className="mr-2 h-4 w-4" />Set line
            </Button>
          </div>
          {(ownedCatalogQuery.data ?? []).length === 0 && (
            <p className="mb-4 text-sm text-zinc-500">Your owned-gear catalog is empty — add items on the Inventory page first.</p>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>{['Item', 'Type', 'Quantity', 'Owned', 'Note', ''].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {(ownedLinesQuery.data ?? []).map((line) => (
                  <TableRow key={line.owned_item_id} className={line.is_over_owned ? 'bg-red-950/40' : undefined}>
                    <TableCell className="font-medium">{line.owned_item_name}</TableCell>
                    <TableCell><Badge>{line.category_type}</Badge></TableCell>
                    <TableCell>
                      {line.quantity}
                      {line.is_over_owned && <span className="ml-2 text-xs font-medium text-red-400">exceeds owned ({line.quantity_owned})</span>}
                    </TableCell>
                    <TableCell>{line.quantity_owned}</TableCell>
                    <TableCell className="text-zinc-400">{line.notes || '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" title="Edit line" onClick={() => setOwnedDraft({ itemId: String(line.owned_item_id), quantity: line.quantity, notes: line.notes ?? '' })}>Edit</Button>
                        <Button size="sm" variant="ghost" title="Remove line" onClick={() => ownedDeleteMutation.mutate(line.owned_item_id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(ownedLinesQuery.data ?? []).length === 0 && (
                  <TableRow><TableCell className="text-zinc-500" colSpan={6}>No owned gear planned for this event yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rented extras</CardTitle>
          <p className="mt-1 text-sm text-zinc-400">Manual rental lines beyond the patch and rig — shared with the Rental Order tab.</p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="min-w-64 flex-1">
              <label className="mb-1 block text-sm text-zinc-300">Catalog item</label>
              <Select value={rentedDraft.itemId} onChange={(e) => setRentedDraft((prev) => ({ ...prev, itemId: e.target.value }))}>
                <option value="">Select item…</option>
                {(allInventoryQuery.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{item.category_name ? `${item.category_name} — ${item.name}` : item.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Audio qty</label>
              <Input type="number" min={0} value={rentedDraft.quantityAudio} onChange={(e) => setRentedDraft((prev) => ({ ...prev, quantityAudio: Math.max(0, Number(e.target.value)) }))} className="w-24" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Lighting qty</label>
              <Input type="number" min={0} value={rentedDraft.quantityLighting} onChange={(e) => setRentedDraft((prev) => ({ ...prev, quantityLighting: Math.max(0, Number(e.target.value)) }))} className="w-24" />
            </div>
            <div className="min-w-40">
              <label className="mb-1 block text-sm text-zinc-300">Note</label>
              <Input value={rentedDraft.notes} onChange={(e) => setRentedDraft((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
            <Button
              size="sm"
              disabled={!rentedDraft.itemId || rentedPutMutation.isPending}
              onClick={() => rentedPutMutation.mutate({ itemId: Number(rentedDraft.itemId), payload: { quantity_audio: rentedDraft.quantityAudio, quantity_lighting: rentedDraft.quantityLighting, notes: rentedDraft.notes || undefined } })}
            >
              <Plus className="mr-2 h-4 w-4" />Set line
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>{['Item', 'Manual audio', 'Manual lighting', 'Note', ''].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {rentedExtras.map((line) => (
                  <TableRow key={line.inventory_item_id}>
                    <TableCell className="font-medium">{line.inventory_item_name}</TableCell>
                    <TableCell>{line.manual_quantity_audio}</TableCell>
                    <TableCell>{line.manual_quantity_lighting}</TableCell>
                    <TableCell className="text-zinc-400">{line.manual_notes || '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" title="Edit line" onClick={() => setRentedDraft({ itemId: String(line.inventory_item_id), quantityAudio: line.manual_quantity_audio, quantityLighting: line.manual_quantity_lighting, notes: line.manual_notes ?? '' })}>Edit</Button>
                        <Button size="sm" variant="ghost" title="Remove line" onClick={() => rentedDeleteMutation.mutate(line.inventory_item_id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rentedExtras.length === 0 && (
                  <TableRow><TableCell className="text-zinc-500" colSpan={5}>No rented extras yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
