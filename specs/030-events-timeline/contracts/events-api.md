# Contract · Events API

**No endpoint is added, removed or moved by this slice.** The five existing routes keep
their paths, methods, status codes and auth. What changes is one field name and three new
fields on the `Event` payload, plus one new `400`.

| Route | Change |
|---|---|
| `GET /api/v1/events` | payload only |
| `GET /api/v1/events/{id}` | payload only |
| `POST /api/v1/events` | payload + new `400` |
| `PATCH /api/v1/events/{id}` | payload + new `400` |
| `DELETE /api/v1/events/{id}` | none |

There is deliberately **no** `GET /events/{id}/summary`. See [research.md](../research.md)
R7: the timeline's per-event figures are derivations the browser already performs, and a Go
copy's failure mode is the timeline disagreeing with the tab it links to.

---

## 1 · The `Event` payload

### Before

```json
{
  "id": 12,
  "name": "Bruksrock",
  "date": "2026-09-18",
  "venue": "Avesta Folkets Park",
  "notes": "Two stages, shared FOH.",
  "created_at": "2026-07-02T09:14:00Z",
  "updated_at": "2026-07-20T16:02:00Z",
  "yourRole": "owner",
  "inventoryId": 3
}
```

### After

```json
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
  "yourRole": "owner",
  "inventoryId": 3
}
```

**`date` is gone, not deprecated.** It is renamed to `startDate` in the same commit on both
sides. There is no transitional period and no alias: this is a single-deployment application
with no third-party API consumers, so a compatibility window would be ceremony protecting
nobody. A client older than the server would break — and the client is served *by* the
server, so there cannot be one.

All four date fields carry `omitempty`. A one-day event therefore serialises as:

```json
{ "id": 13, "name": "Karin & Erik — vigsel", "startDate": "2026-08-22", … }
```

with no `loadInDate`, `endDate` or `loadOutDate` keys at all. **Absent means "derives from
its neighbour"** (see [data-model.md](../data-model.md) §2), which is why absence is
represented by absence rather than by an empty string.

### Go struct

```go
type Event struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	LoadInDate  string `json:"loadInDate,omitempty"`
	StartDate   string `json:"startDate,omitempty"`
	EndDate     string `json:"endDate,omitempty"`
	LoadOutDate string `json:"loadOutDate,omitempty"`
	Venue       string `json:"venue,omitempty"`
	Notes       string `json:"notes,omitempty"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	OwnerUserID *int64 `json:"-"`
	YourRole    string `json:"yourRole,omitempty"`
	InventoryID int64  `json:"inventoryId"`
}
```

Field order follows chronological order, not alphabetical: reading the struct should read
like the event.

---

## 2 · Validation

Applied on `POST` and `PATCH`, **before any write**, to the *resolved* dates:

```
loadIn ≤ start ≤ end ≤ loadOut
```

where each absent value is filled from its neighbour first. An event with no dates at all is
valid. An event with only `startDate` is valid.

### Responses

| Condition | Status | Body |
|---|---|---|
| ordering holds | `201` / `200` | the event |
| `loadInDate` after `startDate` | `400` | `{"error":"loadInDate must not be after startDate"}` |
| `endDate` before `startDate` | `400` | `{"error":"endDate must not be before startDate"}` |
| `loadOutDate` before `endDate` | `400` | `{"error":"loadOutDate must not be before endDate"}` |
| a date that is not `YYYY-MM-DD` | `400` | `{"error":"<field> must be a date in YYYY-MM-DD form"}` |

**Each message names the pair**, because the form has four fields and "invalid dates" tells
the user to check all four. Where more than one rule is broken, the **earliest in
chronological order** is reported — fixing the first commonly fixes the rest, and reporting
four errors about one mistyped year is noise.

Ordering is checked before format is used for comparison, but format is checked first, so a
malformed date is never compared lexicographically against a well-formed one.

### What is deliberately *not* validated

- **Collisions with other events.** Never a `400`, never a warning, never a confirmation.
  Two events sharing days is a fact about a plan and the server has no opinion about it
  (FR-037).
- **Spans of any particular length.** A 40-day event is allowed.
- **Dates in the past.** Back-filling last year's festival is a normal thing to do.

---

## 3 · List ordering

`GET /events` currently orders by `e.date IS NULL, e.date ASC, e.id DESC`. After the rename
this becomes `e.start_date IS NULL, e.start_date ASC, e.id DESC` — the same order, on the
renamed column.

The timeline re-sorts client-side anyway, because it groups and inserts a today marker. The
server order is retained because the mobile branch and the dashboard both consume the list
directly, and because a list whose order depends on which client asked would be worse than
one redundant `ORDER BY`.

---

## 4 · Test obligations

`backend/internal/api/events_dates_test.go`, one table:

| Case | Expect |
|---|---|
| no dates | `201` |
| `startDate` only | `201`, other fields absent from the response |
| all four, in order | `201`, all four round-trip |
| all four, all equal | `201` — a one-day event stated the long way is still valid |
| `endDate` without `startDate` | `400` |
| `loadInDate` after `startDate` | `400`, message names both |
| `endDate` before `startDate` | `400`, message names both |
| `loadOutDate` before `endDate` | `400`, message names both |
| `loadOutDate` before `startDate`, no `endDate` | `400` — resolution must fall back twice |
| two rules broken | `400`, message names the chronologically earliest pair |
| `"2026-9-18"` | `400`, format |
| `PATCH` clearing a date to `""` | `200`, field absent from the response |

`backend/internal/db/events_test.go` gains: a four-date round trip, a null round trip, and a
read of a row written before migration 046 (all three new columns `NULL`).
