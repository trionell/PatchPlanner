import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { createOwnedItem, deleteOwnedItem, listOwnedItems, updateOwnedItem, type OwnedItemDraft } from '../api/owned'
import type { OwnedItem } from '../types'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'

const categoryTypes = ['audio', 'lighting', 'rigging', 'video', 'misc'] as const

const emptyDraft: OwnedItemDraft = { name: '', description: '', category_type: 'misc', quantity_owned: 1, notes: '' }

/** CRUD manager for the technician's own (non-rental) equipment catalog. */
export function OwnedGearManager() {
  const queryClient = useQueryClient()
  const itemsQuery = useQuery({ queryKey: ['owned-items'], queryFn: listOwnedItems })

  const [draft, setDraft] = useState<OwnedItemDraft>(emptyDraft)
  const [editingId, setEditingId] = useState<number | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['owned-items'] })
  const saveMutation = useMutation({
    mutationFn: () => (editingId === null ? createOwnedItem(draft) : updateOwnedItem(editingId, draft)),
    onSuccess: async () => {
      setDraft(emptyDraft)
      setEditingId(null)
      await invalidate()
    },
  })
  const deleteMutation = useMutation({ mutationFn: (id: number) => deleteOwnedItem(id), onSuccess: invalidate })

  const startEdit = (item: OwnedItem) => {
    setEditingId(item.id)
    setDraft({ name: item.name, description: item.description ?? '', category_type: item.category_type, quantity_owned: item.quantity_owned, notes: item.notes ?? '' })
  }

  const confirmDelete = (item: OwnedItem) => {
    const warning = item.planned_on_events > 0
      ? `"${item.name}" is planned on ${item.planned_on_events} event${item.planned_on_events > 1 ? 's' : ''}. Deleting it removes it from those plans too. Continue?`
      : `Delete "${item.name}" from your owned gear?`
    if (window.confirm(warning)) deleteMutation.mutate(item.id)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Owned gear</CardTitle>
        <p className="mt-1 text-sm text-zinc-400">Your own equipment — usable in event plans, never on the rental order.</p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-sm text-zinc-300">Name</label>
            <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Shure SM7B" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Type</label>
            <Select value={draft.category_type} onChange={(e) => setDraft((prev) => ({ ...prev, category_type: e.target.value as OwnedItemDraft['category_type'] }))}>
              {categoryTypes.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Owned</label>
            <Input type="number" min={0} value={draft.quantity_owned} onChange={(e) => setDraft((prev) => ({ ...prev, quantity_owned: Math.max(0, Number(e.target.value)) }))} className="w-24" />
          </div>
          <div className="min-w-40">
            <label className="mb-1 block text-sm text-zinc-300">Notes</label>
            <Input value={draft.notes ?? ''} onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))} />
          </div>
          <Button size="sm" disabled={!draft.name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <Plus className="mr-2 h-4 w-4" />{editingId === null ? 'Add item' : 'Save changes'}
          </Button>
          {editingId !== null && (
            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setDraft(emptyDraft) }}>
              <X className="mr-2 h-4 w-4" />Cancel
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {['Item', 'Type', 'Owned', 'Notes', 'Planned on', ''].map((label) => <TableHead key={label}>{label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(itemsQuery.data ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}{item.description && <div className="text-xs text-zinc-500">{item.description}</div>}</TableCell>
                  <TableCell><Badge>{item.category_type}</Badge></TableCell>
                  <TableCell>{item.quantity_owned}</TableCell>
                  <TableCell className="text-zinc-400">{item.notes || '—'}</TableCell>
                  <TableCell>{item.planned_on_events > 0 ? `${item.planned_on_events} event${item.planned_on_events > 1 ? 's' : ''}` : '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" title="Edit" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title="Delete" onClick={() => confirmDelete(item)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(itemsQuery.data ?? []).length === 0 && (
                <TableRow><TableCell className="text-zinc-500" colSpan={6}>No owned gear yet — add your first item above.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
