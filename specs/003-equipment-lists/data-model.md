# Data Model: Equipment Lists — Owned Gear & Event Extras

## New: `owned_items` (migration 011)

| Field | Type | Notes |
|-------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `name` | TEXT NOT NULL | Required |
| `description` | TEXT | Optional |
| `category_type` | TEXT NOT NULL CHECK IN ('audio','lighting','rigging','video','misc') DEFAULT 'misc' | Same vocabulary as `inventory_categories` |
| `quantity_owned` | INTEGER NOT NULL DEFAULT 1 | Informational; drives the over-planned flag |
| `notes` | TEXT | Optional |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | |

Derived in listings: `planned_on_events` — COUNT(DISTINCT event_id) from
`event_owned_equipment`, so the UI can warn before deletes (FR-006).

## New: `event_owned_equipment` (migration 012)

| Field | Type | Notes |
|-------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `event_id` | INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE | FR-008 |
| `owned_item_id` | INTEGER NOT NULL REFERENCES owned_items(id) ON DELETE CASCADE | FR-006 |
| `quantity` | INTEGER NOT NULL DEFAULT 1 | 0 ⇒ line removed (upsert semantics) |
| `notes` | TEXT | e.g. "FOH laptop" |
| | | `UNIQUE(event_id, owned_item_id)` — one line per item per event (FR-004) |

Derived per line (event listing): item name/type/owned quantity joined in;
`is_over_owned = quantity > quantity_owned` (FR-005).

## Isolation invariants

- No rental-order query (`rentalSummaryQuery`), export writer, or import
  touches these tables — FR-003/SC-002/SC-004 hold by construction.
- Both tables are covered by FK enforcement (Slice 0), so both cascades run.
