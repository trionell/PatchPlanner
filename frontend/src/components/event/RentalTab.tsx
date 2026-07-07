import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cable, Plus, Trash2 } from 'lucide-react'
import { listInventoryItems } from '../../api/inventory'
import { deleteManualRental, getRentalSummary, putManualRental } from '../../api/rentals'
import type { ManualRentalRequest } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'

const emptyManualDraft = { itemId: '', quantityAudio: 0, quantityLighting: 0, notes: '' }

export function RentalTab({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient()
  const rentalQuery = useQuery({ queryKey: ['rental-summary', eventId], queryFn: () => getRentalSummary(eventId) })
  const allInventoryQuery = useQuery({ queryKey: ['inventory-all-items'], queryFn: () => listInventoryItems() })

  const [manualDraft, setManualDraft] = useState(emptyManualDraft)
  const [toast, setToast] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rental-summary', eventId] })
  const manualPutMutation = useMutation({
    mutationFn: ({ itemId, payload }: { itemId: number; payload: ManualRentalRequest }) => putManualRental(eventId, itemId, payload),
    onSuccess: async () => {
      setManualDraft(emptyManualDraft)
      await invalidate()
    },
  })
  const manualDeleteMutation = useMutation({
    mutationFn: (itemId: number) => deleteManualRental(eventId, itemId),
    onSuccess: invalidate,
  })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Rental order</CardTitle>
        <Button variant="secondary" size="sm" onClick={() => { setToast('Export coming soon'); window.setTimeout(() => setToast(''), 2200) }}>
          <Cable className="mr-2 h-4 w-4" />Export
        </Button>
      </CardHeader>
      <CardContent>
        {rentalQuery.data?.has_over_stock && (
          <div className="mb-4 rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            Some lines exceed the renter's available stock or reference items no longer in the price list. Resolve them before submitting the order.
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="min-w-64 flex-1">
            <label className="mb-1 block text-sm text-zinc-300">Manual line — catalog item</label>
            <Select value={manualDraft.itemId} onChange={(e) => setManualDraft((prev) => ({ ...prev, itemId: e.target.value }))}>
              <option value="">Select item…</option>
              {(allInventoryQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.category_name ? `${item.category_name} — ${item.name}` : item.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Audio qty</label>
            <Input type="number" min={0} value={manualDraft.quantityAudio} onChange={(e) => setManualDraft((prev) => ({ ...prev, quantityAudio: Math.max(0, Number(e.target.value)) }))} className="w-24" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Lighting qty</label>
            <Input type="number" min={0} value={manualDraft.quantityLighting} onChange={(e) => setManualDraft((prev) => ({ ...prev, quantityLighting: Math.max(0, Number(e.target.value)) }))} className="w-24" />
          </div>
          <div className="min-w-40">
            <label className="mb-1 block text-sm text-zinc-300">Note</label>
            <Input value={manualDraft.notes} onChange={(e) => setManualDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="e.g. spares" />
          </div>
          <Button
            size="sm"
            disabled={!manualDraft.itemId || manualPutMutation.isPending}
            onClick={() => manualPutMutation.mutate({
              itemId: Number(manualDraft.itemId),
              payload: { quantity_audio: manualDraft.quantityAudio, quantity_lighting: manualDraft.quantityLighting, notes: manualDraft.notes || undefined },
            })}
          >
            <Plus className="mr-2 h-4 w-4" />{manualPutMutation.isPending ? 'Saving…' : 'Set line'}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {['Item','Description','Qty Audio','Qty Lighting','Total','Stock','Price (ex VAT)','Subtotal',''].map((label) => <TableHead key={label}>{label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rentalQuery.data?.items ?? []).map((item) => (
                <TableRow key={item.inventory_item_id} className={item.is_over_stock ? 'bg-red-950/40' : undefined}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{item.inventory_item_name}</span>
                      {item.is_discontinued && <Badge variant="warning">discontinued</Badge>}
                    </div>
                    {item.manual_notes && <div className="mt-1 text-xs text-zinc-500">{item.manual_notes}</div>}
                  </TableCell>
                  <TableCell className="text-zinc-400">{item.description || '—'}</TableCell>
                  <TableCell>
                    {item.quantity_audio}
                    {item.manual_quantity_audio > 0 && <span className="ml-1 text-xs text-zinc-500">({item.manual_quantity_audio} manual)</span>}
                  </TableCell>
                  <TableCell>
                    {item.quantity_lighting}
                    {item.manual_quantity_lighting > 0 && <span className="ml-1 text-xs text-zinc-500">({item.manual_quantity_lighting} manual)</span>}
                  </TableCell>
                  <TableCell>{item.total_quantity}</TableCell>
                  <TableCell>
                    {item.is_over_stock ? (
                      <span className="font-medium text-red-400">exceeds stock ({item.quantity_available} available)</span>
                    ) : (
                      <span className="text-zinc-400">{item.quantity_available} available</span>
                    )}
                  </TableCell>
                  <TableCell>{item.price_ex_vat.toFixed(2)}</TableCell>
                  <TableCell>{item.subtotal_ex_vat.toFixed(2)}</TableCell>
                  <TableCell>
                    {(item.manual_quantity_audio > 0 || item.manual_quantity_lighting > 0) && (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" title="Edit manual line" onClick={() => setManualDraft({ itemId: String(item.inventory_item_id), quantityAudio: item.manual_quantity_audio, quantityLighting: item.manual_quantity_lighting, notes: item.manual_notes ?? '' })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" title="Remove manual line" onClick={() => manualDeleteMutation.mutate(item.inventory_item_id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Totals</TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell className="font-semibold">{rentalQuery.data?.total_quantity ?? 0}</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="font-semibold">{(rentalQuery.data?.total_ex_vat ?? 0).toFixed(2)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {toast && <div className="fixed bottom-6 right-6 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-xl">{toast}</div>}
    </Card>
  )
}
