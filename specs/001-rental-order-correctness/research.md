# Research: Rental Order Correctness

Phase 0 output. All Technical Context unknowns resolved; decisions below were
made against the actual codebase (read in full) rather than assumptions.

## R1. How to represent the mic/DI/IEM reference on input rows

**Decision**: Add `mic_item_id INTEGER REFERENCES inventory_items(id)` to
`audio_patch_inputs`; keep the existing `mic_model TEXT` column as a legacy
display label (exposed as `mic_label` in the domain model). Backfill
`mic_item_id` by case-insensitive exact name match in a migration; rows whose
text matches nothing keep `mic_item_id = NULL` and retain their label.

**Rationale**: The frontend dropdown already writes catalog item *names* into
`mic_model` (see `EventDetail.tsx` — options come from inventory filtered by
signal type), so exact-name backfill will link ~100% of real data (SC-003).
Keeping the text column satisfies FR-002 (nothing silently discarded) with zero
extra machinery.

**Alternatives considered**:
- Drop `mic_model` and backfill-or-lose: violates FR-002, loses unmatched data.
- Store both name and id going forward: redundant; id + JOIN gives the name.

## R2. Making catalog re-import non-destructive

**Decision**: Replace `ReplaceInventory` (which currently runs `DELETE FROM
event_rentals / lighting_fixtures / audio_patch_outputs / inventory_items /
inventory_categories`) with an upsert inside one transaction:

1. Load existing items (`id`, lower(name), count per name).
2. For each parsed row: match an existing item by case-insensitive name; when
   several existing items share a name, match by order of appearance in the
   sheet (list position). Matched → `UPDATE` description, quantity, price,
   `xlsx_row`, category, `discontinued = 0`. Unmatched → `INSERT`.
3. Existing items not present in the new sheet → `UPDATE SET discontinued = 1`
   (never `DELETE`, so FK references from plans always survive).
4. Categories upserted by name the same way; a category with no remaining
   items is kept (harmless) rather than deleted.

**Rationale**: Preserves every `inventory_item_id` reference (FR-007), gives
FR-008 its "unavailable" signal via `discontinued`, and the existing
transaction already guarantees FR-009 (failed import changes nothing).

**Alternatives considered**:
- Keep delete-and-reinsert but remap FKs afterwards by name: more code, a
  window where references dangle, and loses items referenced by plans but
  absent from the new sheet.
- Content-addressable item identity (hash of name+category): overkill for a
  299-row price list (Principle V).

## R3. Rental summary aggregation shape

**Decision**: Extend the existing single-query CTE in `db/rental.go` with
three more `UNION ALL` arms (input mic items, stagebox items, stage multi
items) and join `inventory_items.quantity_available` + `discontinued` into the
result. Compute per line: `total_quantity`, `is_over_stock (total >
quantity_available)`, `is_discontinued`; compute summary-level
`has_over_stock`. Manual `event_rentals` quantities stay a fourth source in
the same CTE (already present) but are *also* returned as separate
`manual_quantity_audio/lighting` fields per line so the UI can edit them
in place.

**Rationale**: One query keeps the "always current" property (FR-010) with no
caching/recalc machinery; per-line manual quantities let the Rental tab edit
manual lines without a second endpoint round-trip to distinguish derived from
manual amounts.

**Alternatives considered**:
- Materialize order lines into `event_rentals` on every plan change: write
  amplification, sync bugs, violates Principle V.
- Separate endpoint for manual lines only: chosen *in addition* for writes,
  but reads stay merged in the summary (single source for the tab).

## R4. Manual rental line API shape

**Decision**: Item-addressed upsert + delete, no line ids in the API:

- `PUT /api/v1/events/{eventID}/rentals/manual/{itemID}` with
  `{quantity_audio, quantity_lighting, notes}` — creates or updates the line
  (the table's `UNIQUE(event_id, inventory_item_id)` makes item id the natural
  key; FR-005's "one manual line per item" for free).
- `DELETE /api/v1/events/{eventID}/rentals/manual/{itemID}` — removes it.
- Setting both quantities to 0 via PUT is equivalent to DELETE (kept
  idempotent either way).

**Rationale**: Matches the existing REST conventions, avoids exposing
`event_rentals.id` which nothing needs, and makes the UI a simple
"pick item → set quantities" flow (SC-005).

**Alternatives considered**:
- `POST /rentals/manual` returning ids + `PATCH /manual/{lineID}`: more
  endpoints and a client-side id bookkeeping burden for zero benefit given the
  uniqueness constraint.

## R5. Migration mechanics

**Decision**: Three migrations, one statement per file (established project
convention — commit c36225c split 006 for exactly this reason):

- `008_input_mic_item.up.sql`: `ALTER TABLE audio_patch_inputs ADD COLUMN mic_item_id INTEGER REFERENCES inventory_items(id)`
- `009_input_mic_backfill.up.sql`: single `UPDATE audio_patch_inputs SET mic_item_id = (SELECT i.id FROM inventory_items i WHERE LOWER(i.name) = LOWER(audio_patch_inputs.mic_model) LIMIT 1) WHERE mic_model IS NOT NULL AND TRIM(mic_model) <> ''`
- `010_inventory_discontinued.up.sql`: `ALTER TABLE inventory_items ADD COLUMN discontinued INTEGER NOT NULL DEFAULT 0`

Down migrations drop the columns (009's down is a no-op comment-equivalent:
`UPDATE audio_patch_inputs SET mic_item_id = NULL`).

**Rationale**: SQLite `ALTER TABLE ADD COLUMN` is cheap and non-destructive;
the backfill is deterministic and idempotent.

## R6. Test harness (first tests in the repo)

**Decision**: `internal/db/testutil_test.go` helper that opens a SQLite DB in
`t.TempDir()` and runs the real migrations from `backend/migrations` (path
resolved relative to the package via `runtime.Caller`/`../..`), seeding a
minimal catalog fixture. API-level tests use `httptest.NewServer(api.NewRouter(db))`.
Scope (pragmatic tier agreed 2026-07-07): rental aggregation across all
sources, manual-line PUT/DELETE, import round-trip preservation, mic backfill.

**Rationale**: Real migrations + real driver (pure Go, no CGO) keep tests
faithful and fast; no mocking layer to maintain (Principle V).

**Alternatives considered**:
- `:memory:` DB: golang-migrate + pooled `database/sql` connections can hand
  each connection a *different* empty in-memory DB; a temp file avoids the
  footgun entirely.

## R7. Frontend surface

**Decision**: Two touchpoints only. (a) Input-row mic cell: dropdown now binds
`mic_item_id` (number) with options from the same signal-type-filtered
inventory lists; when `mic_item_id` is null but `mic_label` is non-empty, show
the label with an "unlinked" badge. (b) Rental Order tab: add stock column,
red highlight + "exceeds stock (N available)" on over-stock lines,
"discontinued" badge, a warning banner when `has_over_stock`, and a manual-line
editor (searchable item select across the full catalog + two quantity inputs +
note). TanStack Query invalidation of `['rental-summary', eventId]` already
exists after patch edits; manual-line mutations invalidate the same key.

**Rationale**: Confines UI churn ahead of the planned EventDetail split
(ROADMAP.md Slice 0); reuses the existing inline-edit idiom.
