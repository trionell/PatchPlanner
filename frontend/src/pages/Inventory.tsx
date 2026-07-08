import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { importInventory, listInventoryCategories, listInventoryItems } from '../api/inventory'
import { FixtureModeManager } from '../components/FixtureModeManager'
import { OwnedGearManager } from '../components/OwnedGearManager'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Dialog } from '../components/ui/Dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table'
import { Tab, TabList, TabPanel, Tabs } from '../components/ui/Tabs'
import type { InventoryItem } from '../types'

export function InventoryPage() {
  return (
    <Tabs defaultValue="rental">
      <TabList>
        <Tab value="rental">Rental catalog</Tab>
        <Tab value="owned">Owned gear</Tab>
      </TabList>
      <TabPanel value="rental"><RentalCatalog /></TabPanel>
      <TabPanel value="owned"><OwnedGearManager /></TabPanel>
    </Tabs>
  )
}

function RentalCatalog() {
  const queryClient = useQueryClient()
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>()
  const [message, setMessage] = useState('')
  const [modesItem, setModesItem] = useState<InventoryItem | null>(null)

  const categoriesQuery = useQuery({ queryKey: ['inventory-categories'], queryFn: listInventoryCategories })
  const itemsQuery = useQuery({
    queryKey: ['inventory-items', selectedCategoryId],
    queryFn: () => listInventoryItems(selectedCategoryId ? { categoryId: selectedCategoryId } : undefined),
  })

  const importMutation = useMutation({
    mutationFn: importInventory,
    onSuccess: async (result) => {
      setMessage(`Imported ${result.categories_imported} categories and ${result.items_imported} items.`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-categories'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-items'] }),
      ])
    },
  })

  const selectedCategory = useMemo(
    () => categoriesQuery.data?.find((category) => category.id === selectedCategoryId),
    [categoriesQuery.data, selectedCategoryId],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400">Import the LL rental list and browse available stock by category.</p>
          {message && <p className="mt-2 text-sm text-emerald-400">{message}</p>}
        </div>
        <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
          {importMutation.isPending ? 'Importing...' : 'Import from LL.xlsx'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(categoriesQuery.data ?? []).map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategoryId(category.id === selectedCategoryId ? undefined : category.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left text-sm ${
                  category.id === selectedCategoryId
                    ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="font-medium">{category.name}</div>
                  <div className="text-xs text-zinc-500">{category.category_type}</div>
                </div>
                <Badge>{category.item_count ?? 0}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedCategory?.name ?? 'All inventory items'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price ex VAT</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(itemsQuery.data ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-zinc-400">{item.description || '—'}</TableCell>
                      <TableCell>{item.quantity_available}</TableCell>
                      <TableCell>{item.price_ex_vat.toFixed(2)}</TableCell>
                      <TableCell>{item.category_name}</TableCell>
                      <TableCell>
                        {item.category_type === 'lighting' && (
                          <Button size="sm" variant="ghost" title="DMX modes" onClick={() => setModesItem(item)}>
                            <SlidersHorizontal className="mr-1 h-4 w-4" />Modes
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={modesItem !== null} onClose={() => setModesItem(null)} title={`DMX modes — ${modesItem?.name ?? ''}`}>
        {modesItem && <FixtureModeManager itemId={modesItem.id} />}
      </Dialog>
    </div>
  )
}
