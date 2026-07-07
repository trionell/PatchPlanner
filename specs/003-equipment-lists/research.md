# Research: Equipment Lists — Owned Gear & Event Extras

## R1. Separate tables, not a flag on `inventory_items`

**Decision**: `owned_items` is its own table; owned gear is never a row in
`inventory_items`.

**Rationale**: `inventory_items` is the renter's catalog, replaced/updated by
imports and read by the rental summary CTE and the export writer. Keeping
owned gear out of that table makes FR-003 ("never on the order") and SC-004
("imports never touch owned gear") true *by construction* instead of by
filtering, and no existing query needs a new WHERE clause.

**Alternatives considered**: `inventory_items.owned` flag — every rental
query and the import upsert would need to exclude it, one missed filter puts
owned gear on the renter's order; rejected.

## R2. Event lines mirror the manual-rental-line pattern

**Decision**: `event_owned_equipment(event_id, owned_item_id, quantity,
notes)` with `UNIQUE(event_id, owned_item_id)`; API is item-addressed
`PUT/DELETE /events/{id}/owned-equipment/{ownedItemID}` with quantity-0-
removes semantics, plus a GET list joined with item fields.

**Rationale**: Identical shape to `event_rentals` manual lines (Slice 1 R4),
so both the backend and the UI reuse a proven pattern; "one line per item"
comes free from the unique constraint.

## R3. Deletion semantics

**Decision**: `owned_item_id` FK declared `ON DELETE CASCADE`; the DELETE
endpoint response is preceded by a client-side confirm that shows the number
of affected events (served by a `planned_on_events` count in the catalog
listing). `event_id` FK also `ON DELETE CASCADE` (FR-008).

**Rationale**: FK enforcement is now real (Slice 0), so cascades actually
run. Owned plans without their catalog item are meaningless — cascade is the
honest semantic. The count-in-listing keeps the warning cheap (no extra
endpoint).

## R4. Over-planned flag

**Decision**: Computed server-side in the event-lines listing:
`is_over_owned = quantity > quantity_owned`, joined from the catalog row.

**Rationale**: Same placement as the rental stock flags (server computes,
UI renders); keeps clients dumb.

## R5. Rented extras on the Equipment tab

**Decision**: No new storage or endpoints. The Equipment tab reads the
existing rental summary, filters to lines with a manual share, and reuses the
manual-line PUT/DELETE. The manual-line editor markup is extracted from
RentalTab into a shared component only if it stays small; otherwise a compact
purpose-built list is written for the Equipment tab (both tabs already share
mutations via the same API functions and query key).

**Rationale**: One storage, two views (spec Assumption); avoids divergence.

## R6. Equipment type vocabulary

**Decision**: `category_type TEXT CHECK IN ('audio','lighting','rigging',
'video','misc') DEFAULT 'misc'` — the same vocabulary `inventory_categories`
already uses.

**Rationale**: Familiar sorting/filtering; Slice 4 (reference data) will lift
both CHECKs into data together.
