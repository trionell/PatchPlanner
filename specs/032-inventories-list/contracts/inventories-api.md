# Contract · Inventories API

One route is added and one payload is extended. Nothing is removed, moved, or
changes its status codes or auth.

| Route | Change |
|---|---|
| `GET /api/v1/inventories` | payload — three counts per row |
| `GET /api/v1/inventories/{id}/events` | **new** |
| `POST /api/v1/inventories` | none |
| `GET`/`PATCH`/`DELETE /api/v1/inventories/{id}` | none |
| `POST /api/v1/inventories/{id}/duplicate` | none |

There is deliberately **no** `/inventories/summary` route and no membership
filter on the new one. See [research.md](../research.md) R1 and R2.

---

## 1 · `GET /api/v1/inventories`

Lists the catalogs owned by the authenticated user, `name ASC`. Auth: session
required; scoped to the context user, as today.

### Before

```json
[
  {
    "id": 3,
    "name": "LL prislista 2026",
    "sourceFilename": "LL-2026.xlsx",
    "sourceFormat": "ll",
    "createdAt": "2026-01-14T08:22:00Z"
  }
]
```

### After

```json
[
  {
    "id": 3,
    "name": "LL prislista 2026",
    "sourceFilename": "LL-2026.xlsx",
    "sourceFormat": "ll",
    "createdAt": "2026-01-14T08:22:00Z",
    "itemCount": 308,
    "categoryCount": 12,
    "eventCount": 9
  },
  {
    "id": 7,
    "name": "Sandbox",
    "createdAt": "2026-03-02T19:40:00Z",
    "itemCount": 3,
    "categoryCount": 1
  }
]
```

**`omitempty` on all three.** A zero count is absent, as `sourceFilename` and
`sourceFormat` already are. The second row above is a catalog no event uses:
`eventCount` is missing, and the page renders `—`.

Every count is computed in the listing query as a correlated sub-select; the
`eventCount` predicate is the one `DeleteInventory` runs
(`db/inventories.go:85`).

**Only this route populates them.** `GET /inventories/{id}`, `PATCH`, and
`POST /duplicate` return the same struct with all three absent — a
single-inventory response has never counted anything.

| Status | When |
|---|---|
| `200` | always, including the empty list (`[]`, never `null`) |
| `401` | no session |

## 2 · `GET /api/v1/inventories/{inventoryID}/events` — new

Every event bound to the catalog. Registered inside the existing
`/inventories/{inventoryID}` group, so it inherits `RequireInventoryOwner`:
anyone who is not the owner gets `404`, with no role gradient, exactly as the
other owner-only routes do.

### Response

```json
[
  {
    "id": 12,
    "name": "Bruksrock",
    "loadInDate": "2026-09-17",
    "startDate": "2026-09-18",
    "endDate": "2026-09-20",
    "loadOutDate": "2026-09-21",
    "venue": "Avesta Folkets Park",
    "notes": "Two stages, shared FOH.",
    "created_at": "2026-07-02T09:14:00Z",
    "updated_at": "2026-07-20T16:02:00Z",
    "inventoryId": 3
  }
]
```

`domain.Event` unchanged and unextended — the drawer reads `id`, `name`,
`venue` and `startDate` and ignores the rest. `yourRole` is absent: this route
does not join memberships, because it must return exactly the set `eventCount`
counted.

Order: `COALESCE(start_date, '') ASC, name ASC`. Undated events sort first and
are drawn with `—` where the date goes, as the timeline draws them.

| Status | When |
|---|---|
| `200` | always for the owner, including the empty list (`[]`, never `null`) |
| `401` | no session |
| `404` | the catalog does not exist, or the caller is not its owner |

## 3 · What still refuses a delete

`DELETE /api/v1/inventories/{id}` is unchanged and still answers `409` with
`inventory in use by N event(s)` while any event is bound.

With this slice the interface offers no way to reach it — the delete control is
absent whenever `eventCount > 0` — so the `409` becomes reachable only by a
race between two tabs. It stays exactly as it is: the interface hiding a control
is not a security boundary, and the server is.

## 4 · Frontend types

```ts
export interface Inventory {
  id: number
  name: string
  sourceFilename?: string
  sourceFormat?: 'll' | 'generic'
  createdAt: string
  /** Present on the list payload only; absent means zero. */
  itemCount?: number
  categoryCount?: number
  eventCount?: number
}
```

```ts
export const listInventoryEvents = (inventoryId: number) =>
  request<Event[]>(`/inventories/${inventoryId}/events`)
```

Query key: `['inventory-events', inventoryId]`, fetched only while the drawer is
open (`enabled`), and invalidated by nothing — an event's binding cannot change
from this page.
