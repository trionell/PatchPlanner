# Phase 0 — Research

Six questions. Four were settled by finding the decision already made somewhere
in the repository; two are new.

---

## R1 · Where are the three counts computed?

**Decision.** In SQL, as correlated sub-selects inside the existing
`ListInventoriesForOwner` query.

```sql
SELECT id, …,
  (SELECT COUNT(*) FROM inventory_items      WHERE inventory_id = inventories.id),
  (SELECT COUNT(*) FROM inventory_categories WHERE inventory_id = inventories.id),
  (SELECT COUNT(*) FROM events               WHERE inventory_id = inventories.id)
FROM inventories WHERE owner_user_id = ? ORDER BY name ASC
```

**Rationale.** Slice 29 made this exact decision once already and recorded it in
[design/audit.md](../../design/audit.md) Wave 5: Overview's figures got *no*
endpoint because the browser already had the data to derive them, and the
vocabulary panel's **In use** column got one because *"a `COUNT` over eight plan
tables only the database can see"*. This is the second case. The browser has the
catalog list; it does not have the events of other people's plans, and getting
the item count the way the page does today means shipping 308 rows to compute a
three-character string.

The event count is the same predicate `DeleteInventory` already uses
(`SELECT COUNT(*) FROM events WHERE inventory_id = ?`, `inventories.go:85`), so
the number on screen and the refusal that follows cannot disagree — asserted by
a Go test that binds an event, reads the list, and then attempts the delete.

**Alternatives considered.**

- *A `/inventories/summary` endpoint.* A second route returning the same rows
  with more columns; the list would then have two shapes for one resource.
- *`GROUP BY` with three `LEFT JOIN`s.* One join fan-out per catalog and a
  `COUNT(DISTINCT …)` per column to undo it. Correlated sub-selects on an
  indexed foreign key are both faster to read and faster to run at this size.
- *Keeping the per-row `listItems` call.* It is the defect being fixed.

## R2 · Does the drawer's event list need its own route?

**Decision.** Yes — `GET /inventories/{inventoryID}/events`, inside the existing
`RequireInventoryOwner` group, returning every bound event ordered by start date.

**Rationale.** The obvious alternative is to derive it in the browser from the
`['events']` query the Events page already caches:
`events.filter(e => e.inventoryId === id)`. It is free, and it is wrong in a way
that matters here: `ListEventsForUser` returns events the user **owns or is a
member of**, while the count in the column comes from `COUNT(*) FROM events`
with no membership predicate at all. In every realistic account those two sets
are identical — an event can only be bound to a catalog its creator owns — but
"identical in every case we can think of" is exactly the property that produces
a section headed *9* listing eight rows, and the page's whole claim is that the
count is trustworthy.

Deriving both from the same table removes the question. The route is four lines
of handler over one query, and it is only called when the drawer opens.

**Alternatives considered.**

- *Client-side filter of the events cache* — rejected above.
- *Embedding the events in the list payload* — every catalog's whole event list
  on every page load, to serve a drawer that opens on one of them.

## R3 · Where do the counts live on the wire?

**Decision.** Three `omitempty` fields on `domain.Inventory`:
`itemCount`, `categoryCount`, `eventCount`. Populated by the list query only.

**Rationale.** `domain.InventoryCategory.ItemCount` is the precedent, verbatim —
a derived count on the domain struct, `json:"item_count,omitempty"`, filled in
by the query that can afford it and absent from the ones that cannot. A second
struct (`InventorySummary`) would mean the frontend holds two types for one
object and the drawer, which is opened from the list's own cached row, would
have to be handed the poorer one.

`omitempty` reads correctly at the page: an absent `eventCount` and a zero one
both mean *no event uses this*, and both render `—`. Item and category counts
render `?? 0`, which is what the categories rail already does.

**Alternatives considered.** A separate DTO (above); non-`omitempty` fields
(which would make `GET /inventories/{id}` claim, in JSON, that a catalog has
zero items).

## R4 · What tier is the drawer's interior?

**Decision.** Work surface — `ui/GearList` throughout: `DrawerSection` with a
`MicroLabel` heading and a mono count, `GearCard`, `GearSpecs`/`Spec`,
`GearForm` + `FieldStack` + `FormActions`, `Button size="xs"`,
`Input size="sm"`.

**Rationale.** This is the one thing the mockup got wrong twice, so it is worth
writing down rather than inferring again. [design/principles.md](../../design/principles.md)
P2 lists *"dialogs, drawer forms"* under the navigation surface, and
[design/components.md](../../design/components.md) §1 pairs work/navigation
tiers per component — read together they suggest a drawer is navigation tier
throughout. The code says otherwise, and the code is right: Rig, Buses,
Universes and the Categories drawer all render `MicroLabel`, `xs` buttons and
`sm` fields inside a `text-lg`-titled frame.

The rule that reconciles them, which this slice writes into
[design/patterns.md](../../design/patterns.md) §3: **a drawer's frame is
navigation tier; its contents take the tier of the surface that references
them.** What is declared in a drawer is referenced from a sheet, which is why
the declaration is drawn at the sheet's density.

**Alternatives considered.** Navigation-tier internals (`h-10` fields,
`FieldLabel`) — what revisions 1 and 2 of the mockup drew, and what the user
rejected on sight by naming Rig, Buses and Universes as the reference.

## R5 · Why does *Used on* take no height of its own?

**Decision.** No `max-h`, no nested scroll container. The drawer body is already
`flex-1 overflow-y-auto`; the section is as tall as its contents.

**Rationale.** [design/patterns.md](../../design/patterns.md) §4 records the
same failure by name: a leftover `max-h-[70vh]` on the category rail cut
twenty-seven categories off at the fold, in a private scrollbar, on a page with
room to spare — *"a cap is right only if the panel is pinned to the viewport"*.
A drawer body is pinned; a section inside it is not. One scroll region per
overlay.

The user's instruction — *"I want all events to show in the list. Make it
scrollable if/when necessary"* — is satisfied by the body doing what it already
does.

## R6 · What belongs in the pure module?

**Decision.** `lib/inventoryList.ts` exports one function,
`summariseInventories(inventories, search)`, returning the visible rows and the
strip's figures:

```ts
{ visible: Inventory[], total: number, items: number, events: number, unused: number }
```

**Rationale.** The repo's habit, and the reason its pages are testable at all:
`lib/eventTimeline.ts`, `lib/dashboard.ts`, `lib/eventSummary.ts`,
`lib/patchCapacity.ts`. The strip is a readout of what the search left, so the
filter and the totals have to be computed together or they can disagree — which
is precisely the bug that makes the strip worth testing (`0 of 5 catalogs` with
five rows on screen). Matching is delegated to `matchesSearch`, unchanged, over
name and `sourceFilename`.

Nothing else in this page is derived: ordering comes from the server, and the
counts come from the payload.

**Alternatives considered.** Inline `filter`/`reduce` in the component — where
this logic lives today for Owned gear, and untestable without rendering.
