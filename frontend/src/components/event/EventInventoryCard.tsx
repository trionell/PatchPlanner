import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getEventInventory, listEventInventoryCategories, listEventInventoryItems } from '../../api/inventory'
import { listMyInventories } from '../../api/inventories'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Dialog } from '../ui/Dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table'

/**
 * Shows which inventory an event uses. Owners get a link to the full
 * management UI (My Inventories); everyone else — a contributor or
 * viewer on an event bound to someone else's inventory — gets a
 * read-only browse dialog instead, since only the inventory's own owner
 * can manage it (US3).
 */
export function EventInventoryCard({ eventId }: { eventId: number }) {
  const [browseOpen, setBrowseOpen] = useState(false)
  const inventoryQuery = useQuery({ queryKey: ['event-inventory', eventId], queryFn: () => getEventInventory(eventId) })
  const myInventoriesQuery = useQuery({ queryKey: ['inventories'], queryFn: listMyInventories })

  const owns = myInventoriesQuery.data?.some((inventory) => inventory.id === inventoryQuery.data?.id) ?? false

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-zinc-100">{inventoryQuery.data?.name ?? '—'}</div>
          <div className="text-xs text-zinc-500">
            {inventoryQuery.data?.sourceFilename ? `Imported from ${inventoryQuery.data.sourceFilename}` : 'No price list imported yet'}
          </div>
        </div>
        {owns ? (
          <Link to="/inventories">
            <Button size="sm" variant="secondary">
              <ExternalLink className="mr-2 h-4 w-4" />Manage
            </Button>
          </Link>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setBrowseOpen(true)}>
            <Eye className="mr-2 h-4 w-4" />Browse
          </Button>
        )}
      </CardContent>

      <Dialog open={browseOpen} onClose={() => setBrowseOpen(false)} title={`${inventoryQuery.data?.name ?? 'Inventory'} (read-only)`}>
        <EventInventoryBrowser eventId={eventId} />
      </Dialog>
    </Card>
  )
}

function EventInventoryBrowser({ eventId }: { eventId: number }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>()
  const categoriesQuery = useQuery({ queryKey: ['inventory-categories', eventId], queryFn: () => listEventInventoryCategories(eventId) })
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
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
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
