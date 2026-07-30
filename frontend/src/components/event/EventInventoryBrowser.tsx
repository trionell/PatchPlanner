import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listEventInventoryCategories, listEventInventoryItems } from '../../api/inventory'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { InventoryItem } from '../../types'
import { CondensedListRow } from '../mobile/CondensedListRow'
import { MobilePicker } from '../mobile/MobilePicker'
import { PanelCols, PanelMain, PanelRail, PanelRailRow } from '../ui/PanelRail'
import { NumCell, SheetBody, SheetCell, SheetHead, SheetHeadCell, SheetRow, SheetTable } from '../ui/SheetTable'

/**
 * A read-only browse of the inventory an event is bound to (Slice 16 US3).
 *
 * Offered to anyone who cannot *manage* it — a contributor or viewer on an event
 * bound to someone else's catalog — since only the inventory's own owner can
 * change it. Opened from Overview's inventory row.
 *
 * Its own file since Slice 28: it used to live inside `EventInventoryCard`, and
 * that card became a row on Overview.
 *
 * **It is the same data as `inventory/InventorySheet`, so it is the same surface**
 * (ROADMAP D4). Until then it was the last consumer of `ui/Table` in the
 * application — a navigation-tier table, a `Badge` and a hand-written copy of
 * `Tab`'s classes, on a catalog of equipment, which is the work surface the
 * Inventories page had already concluded this data to be (components.md §1,
 * patterns.md §4). The rail is `ui/PanelRail`, the fourth instance of the pattern
 * and the same one the owner's own view of these rows filters with.
 *
 * It has no editor and no add: everything a role may not do is **absent** rather
 * than disabled (P7), which is the whole difference between this and the sheet it
 * mirrors.
 */
export function EventInventoryBrowser({ eventId }: { eventId: number }) {
  const isMobile = useIsMobile()
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>()

  const categoriesQuery = useQuery({
    queryKey: ['inventory-categories', eventId],
    queryFn: () => listEventInventoryCategories(eventId),
  })
  const itemsQuery = useQuery({
    queryKey: ['inventory-items', eventId, selectedCategoryId],
    queryFn: () => listEventInventoryItems(eventId, selectedCategoryId ? { categoryId: selectedCategoryId } : undefined),
  })

  const categories = categoriesQuery.data ?? []
  const items = itemsQuery.data ?? []
  // What *All* holds. The categories carry the only counts either reach has —
  // `items` is the filtered page, so it cannot answer this.
  const total = categories.reduce((sum, category) => sum + (category.item_count ?? 0), 0)

  /*
    The phone (patterns.md §7c). The columns rank into a title and a subtitle, and
    the rail — a column, which is the one thing a 375px screen does not have —
    becomes the control that names the current choice and opens a sheet.

    There is no `max-h` and no scroll container of either kind here. This renders
    inside `ui/Drawer`, which is a bottom `ui/Sheet` at this width and owns the
    only scroll on the surface; a second one nested in it is what `70vh` used to
    add on top of the sheet's own `85svh` (tokens.md §7).
  */
  if (isMobile) {
    return (
      <>
        {/* Sticky, because a filter you have scrolled past is a filter you have to
            scroll back to — and a catalog is 308 rows (patterns.md §4). */}
        <div className="sticky top-0 z-10 flex flex-none items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3">
          <MobilePicker
            label="All categories"
            onChange={(id) => setSelectedCategoryId(id === ALL ? undefined : Number(id))}
            options={[
              { id: ALL, label: 'All categories', hint: String(total) },
              ...categories.map((category) => ({
                id: category.id,
                label: category.name,
                hint: String(category.item_count ?? 0),
              })),
            ]}
            title="Filter by category"
            /* `title`, not `field`: the sheet's own heading is the inventory, so
               this names which category is on screen rather than sitting among a
               bar's other targets — and 112px of truncation would hide it. */
            variant="title"
            value={selectedCategoryId ?? ALL}
          />
          <span className="ml-auto flex-none font-mono text-xs tabular-nums text-zinc-500">{items.length}</span>
        </div>

        {items.map((item) => (
          <CondensedListRow key={item.id} subtitle={phoneSubtitle(item)} title={item.name} />
        ))}
        {items.length === 0 && <p className="px-3 py-3 text-sm text-zinc-500">{EMPTY}</p>}
      </>
    )
  }

  return (
    /* `min-h-full` so the rail's border reaches the foot of the drawer when a
       category holds four items. The rail is given no height of its own — the
       columns stretch it, and the drawer body is the one thing that scrolls. */
    <PanelCols className="min-h-full">
      <PanelRail>
        <PanelRailRow
          count={total}
          label="All items"
          onSelect={() => setSelectedCategoryId(undefined)}
          selected={selectedCategoryId === undefined}
        />
        {categories.map((category) => (
          <PanelRailRow
            count={category.item_count ?? 0}
            key={category.id}
            label={category.name}
            onSelect={() => setSelectedCategoryId(category.id === selectedCategoryId ? undefined : category.id)}
            qualifier={category.category_type}
            selected={category.id === selectedCategoryId}
          />
        ))}
        {categories.length === 0 && <p className="px-2 py-1 text-xs text-zinc-500">Nothing in this catalog yet.</p>}
      </PanelRail>

      <PanelMain>
        <div className="overflow-x-auto">
          <SheetTable>
            <SheetHead>
              <tr>
                {COLUMNS.map((column) => (
                  <SheetHeadCell key={column}>{column}</SheetHeadCell>
                ))}
              </tr>
            </SheetHead>
            <SheetBody>
              {items.map((item, index) => (
                <SheetRow key={item.id} striped={index % 2 === 1}>
                  <SheetCell className="whitespace-nowrap text-zinc-100">{item.name}</SheetCell>
                  <SheetCell className="max-w-64 truncate text-zinc-500">{item.description || <Dash />}</SheetCell>
                  <NumCell>{item.quantity_available}</NumCell>
                  <NumCell>{item.price_ex_vat.toFixed(2)}</NumCell>
                </SheetRow>
              ))}

              {items.length === 0 && (
                <tr>
                  <SheetCell className="text-zinc-500" colSpan={COLUMNS.length}>
                    {EMPTY}
                  </SheetCell>
                </tr>
              )}
            </SheetBody>
          </SheetTable>
        </div>
      </PanelMain>
    </PanelCols>
  )
}

const COLUMNS = ['Item', 'Description', 'Qty', 'Price ex VAT']

/** The `MobilePicker` entry for *no filter*. Its ids are strings or numbers, and
 *  every number is a category. */
const ALL = 'all'

const EMPTY = 'Nothing in this catalog yet.'

/**
 * The three remaining columns, joined — the same order and the same wording the
 * owner's own phone list of these rows uses (`pages/Inventories`), because two
 * lists of one catalog that disagree about what a row says are two designs.
 */
function phoneSubtitle(item: InventoryItem): string {
  return [item.description || item.category_name, `Qty ${item.quantity_available}`, `${item.price_ex_vat.toFixed(2)} kr`]
    .filter(Boolean)
    .join(' · ')
}

function Dash() {
  return <span className="text-zinc-600">—</span>
}
