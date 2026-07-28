import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listEventInventoryCategories, listEventInventoryItems } from '../../api/inventory'
import { Badge } from '../ui/Badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'

/**
 * A read-only browse of the inventory an event is bound to (Slice 16 US3).
 *
 * Offered to anyone who cannot *manage* it — a contributor or viewer on an event
 * bound to someone else's catalog — since only the inventory's own owner can
 * change it. Opened from Overview's inventory row.
 *
 * Its own file since Slice 28: it used to live inside `EventInventoryCard`, and
 * that card became a row on Overview.
 */
export function EventInventoryBrowser({ eventId }: { eventId: number }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>()
  const categoriesQuery = useQuery({
    queryKey: ['inventory-categories', eventId],
    queryFn: () => listEventInventoryCategories(eventId),
  })
  const itemsQuery = useQuery({
    queryKey: ['inventory-items', eventId, selectedCategoryId],
    queryFn: () => listEventInventoryItems(eventId, selectedCategoryId ? { categoryId: selectedCategoryId } : undefined),
  })

  return (
    <div className="grid max-h-[70vh] gap-4 overflow-y-auto lg:grid-cols-[220px,1fr]">
      <div className="space-y-2">
        {(categoriesQuery.data ?? []).map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setSelectedCategoryId(category.id === selectedCategoryId ? undefined : category.id)}
            className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${
              category.id === selectedCategoryId
                ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-700'
            }`}
          >
            <span>{category.name}</span>
            <Badge>{category.item_count ?? 0}</Badge>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Price ex VAT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(itemsQuery.data ?? []).map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-zinc-400">{item.description || '—'}</TableCell>
                <TableCell>{item.quantity_available}</TableCell>
                <TableCell>{item.price_ex_vat.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
