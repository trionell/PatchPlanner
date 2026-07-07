# Data Model: Rental Order Correctness

Phase 1 output. Only deltas against the existing schema are listed; unchanged
tables/fields are omitted.

## Changed: `audio_patch_inputs`

| Field | Type | Notes |
|-------|------|-------|
| `mic_item_id` | INTEGER NULL, FK → `inventory_items.id` | **NEW.** The mic/DI/IEM catalog reference. Source of truth for the rental order. |
| `mic_model` | TEXT | **REPURPOSED.** Legacy display label, exposed as `mic_label`. Read-only in the UI; shown with an "unlinked" badge when `mic_item_id IS NULL` and label non-empty. New rows never write it. |

**Backfill rule** (migration 009): `mic_item_id` ← first `inventory_items.id`
whose `LOWER(name)` equals `LOWER(mic_model)`; NULL otherwise. Idempotent.

**Validation**: `mic_item_id`, when set, must reference an existing item
(FK enforced). No signal-type restriction at the DB level — filtering is a UI
concern (mics for `mic`, line boxes for `di`, IEM for `return`).

## Changed: `inventory_items`

| Field | Type | Notes |
|-------|------|-------|
| `discontinued` | INTEGER NOT NULL DEFAULT 0 | **NEW.** Set to 1 by import when the item is absent from the new price list; back to 0 if it reappears. Discontinued items are excluded from planning dropdowns but still resolve for existing references. |

**Identity rule (import upsert)**: an incoming sheet row matches an existing
item by case-insensitive name; among same-named items, by order of appearance
(nth duplicate in sheet ↔ nth duplicate in DB). Matched items are updated in
place (id preserved); unmatched incoming rows are inserted; unmatched existing
items are flagged `discontinued = 1`. Items are never deleted by import.
Import runs in one transaction; any failure rolls back everything (FR-009).

## Unchanged (write path added): `event_rentals`

| Field | Type | Notes |
|-------|------|-------|
| `event_id` | INTEGER FK → events | ON DELETE CASCADE (existing) |
| `inventory_item_id` | INTEGER FK → inventory_items | `UNIQUE(event_id, inventory_item_id)` (existing) — one manual line per item per event |
| `quantity_audio` | INTEGER DEFAULT 0 | Manual audio quantity |
| `quantity_lighting` | INTEGER DEFAULT 0 | Manual lighting quantity |
| `notes` | TEXT | Optional reason ("spares", "backup mic") |

**Validation**: quantities ≥ 0; both 0 ⇒ the line is removed (or the PUT is
treated as a delete). Item must exist and (for new lines) not be discontinued.

## Derived (not stored): Rental order line

Computed per event by a single aggregation query. Sources and unit counting:

| Source | Contributes | Quantity column |
|--------|-------------|-----------------|
| `audio_patch_inputs.mic_item_id` | 1 per row | audio |
| `stageboxes.inventory_item_id` | 1 per stagebox | audio |
| `stage_multis.inventory_item_id` | 1 per multi | audio |
| `audio_patch_outputs.amplifier_item_id` | 1 per row | audio |
| `audio_patch_outputs.speaker_item_id` | 1 per row | audio |
| `lighting_fixtures.inventory_item_id` | 1 per fixture | lighting |
| `event_rentals` | as entered | audio + lighting |

Per line: `inventory_item_id`, `name`, `description`, `quantity_audio`,
`quantity_lighting`, `total_quantity`, `manual_quantity_audio`,
`manual_quantity_lighting`, `manual_notes`, `price_ex_vat`,
`subtotal_ex_vat`, `quantity_available`, `is_over_stock`
(= total > available), `is_discontinued`.

Summary level: `total_items`, `total_quantity`, `total_ex_vat`,
`has_over_stock` (any line over stock or discontinued-but-referenced).

## Relationships (after change)

```
inventory_items 1 ←─ * audio_patch_inputs.mic_item_id      (NEW)
inventory_items 1 ←─ * stageboxes.inventory_item_id         (existing)
inventory_items 1 ←─ * stage_multis.inventory_item_id       (existing)
inventory_items 1 ←─ * audio_patch_outputs.{amplifier,speaker}_item_id (existing)
inventory_items 1 ←─ * lighting_fixtures.inventory_item_id  (existing)
inventory_items 1 ←─ * event_rentals.inventory_item_id      (existing, now writable)
```

## State transitions

- **Catalog item**: `active ⇄ discontinued` (driven solely by import).
- **Mic reference on legacy row**: `unlinked (label only) → linked` when the
  user picks a catalog item; the label is cleared at that point. No transition
  back to unlinked except clearing the selection (label stays cleared).
