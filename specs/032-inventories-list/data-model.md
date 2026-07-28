# Phase 1 — Data Model

**No migration.** Nothing is added to the schema, nothing is renamed, and no
value in this slice is stored. What follows is what is *derived*, and from which
existing relationship.

## The relationship being traversed

```
inventories.id ◄──────── events.inventory_id      (migration 002 · NOT NULL since 038)
               ◄──────── inventory_items.inventory_id
               ◄──────── inventory_categories.inventory_id
```

`events.inventory_id` is the binding an event makes when it is created. It has
been traversed in one direction since Slice 16 — *which catalog does this event
use* — and, once, in the other, inside `DeleteInventory`, where it exists only
to refuse. This slice traverses it the second way on purpose.

## Derived values

| Name | Type | Derivation | Where it is shown |
|---|---|---|---|
| `itemCount` | int | `COUNT(*) FROM inventory_items WHERE inventory_id = ?` | Items column; drawer's spec line |
| `categoryCount` | int | `COUNT(*) FROM inventory_categories WHERE inventory_id = ?` | Categories column; drawer's spec line |
| `eventCount` | int | `COUNT(*) FROM events WHERE inventory_id = ?` | Used on column; drawer's section heading; whether a delete control exists |

All three are computed per request, in the query that lists a user's catalogs.
None is cached, denormalised or written anywhere.

**`eventCount` is the delete guard's own count.** `DeleteInventory` runs the
same predicate before deleting and returns `InventoryInUseError{Count}` when it
is non-zero. The column and the refusal are the same number by construction, not
by two implementations agreeing.

## Entities

### `domain.Inventory` (extended)

| Field | JSON | Notes |
|---|---|---|
| `ID` | `id` | unchanged |
| `OwnerUserID` | — | unchanged, never serialised |
| `Name` | `name` | unchanged |
| `SourceFilename` | `sourceFilename,omitempty` | unchanged |
| `SourceFormat` | `sourceFormat,omitempty` | unchanged — `ll`, `generic`, or absent |
| `CreatedAt` | `createdAt` | unchanged |
| **`ItemCount`** | `itemCount,omitempty` | **new**, list query only |
| **`CategoryCount`** | `categoryCount,omitempty` | **new**, list query only |
| **`EventCount`** | `eventCount,omitempty` | **new**, list query only |

`omitempty` follows `domain.InventoryCategory.ItemCount`, which has carried a
derived count this way since Slice 22. Endpoints that return a single inventory
(`GET`, `PATCH`, `POST /duplicate`) leave all three absent rather than reporting
zero — a single-inventory response has never counted anything and must not start
claiming to.

At the page, absent and zero mean the same thing and are read the same way:

```ts
inventory.eventCount ?? 0        // 0 → render "—"
inventory.itemCount ?? 0         // 0 → render "0"
```

That asymmetry is [design/patterns.md](../../design/patterns.md) §5's, not this
slice's: a catalog with no items has *zero* items, and a catalog no event uses
has *no* binding — empty-and-expected, which renders `—`.

### Event, as seen from a catalog

`GET /inventories/{inventoryID}/events` returns `domain.Event` rows, unchanged
and unextended, for every event bound to the catalog, ordered by
`start_date ASC, name ASC`. The drawer reads four of the fields — `id`, `name`,
`venue`, `startDate` — and ignores the rest.

The query carries **no membership predicate**, deliberately: it must return the
same set `eventCount` counted (see [research.md](research.md) R2). This is not a
disclosure change — the route is already behind `RequireInventoryOwner`, and an
event can only bind to a catalog its own creator owns.

## Ordering

| List | Order | Why |
|---|---|---|
| Catalogs | `name ASC` | unchanged; a picker scanned by name |
| A catalog's events | `start_date ASC, name ASC` | the spine's rule — reading down is moving forward. Undated events sort first under `COALESCE(start_date, '')` and are listed with `—` for a date, which is what the timeline does with them too |

## What is not modelled

- **No archive flag.** A catalog is used or it is not, and `eventCount` says
  which. A stored status would be a second answer to a question the data already
  answers.
- **No "default catalog" field.** Choosing among several is a decision per
  show.
- **No uniqueness constraint on `inventories.name`.** Names have never been
  unique and this slice does not make them so; the drawer permits a rename that
  collides.
