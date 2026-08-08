## Context

`inventory_categories.picker_role` already exists (migration
`019_cable_stand_items.up.sql`) with three live values — `cable`, `stand`,
`truss` — validated in `backend/internal/api/inventories.go`'s
`validPickerRole` and assignable via a `<Select>` in
`frontend/src/components/inventory/InventoryDrawers.tsx` (`PICKER_ROLES`
array). There is no DB-level `CHECK` constraint on the column; validity is
enforced only in application code and the frontend's TS union type
(`frontend/src/types/index.ts:90`), so adding a fourth value touches no
migration for the column itself — only a one-time data backfill migration
(see below).

`standItems` in `AudioInputsTab.tsx` already resolves correctly by category
role today; `micItems` next to it does not — it filters on
`category_name?.toLowerCase().startsWith('mikrofon')`. See proposal.md - Why.

`backend/internal/api/audio_patch.go`'s `validInputSource` currently rejects
`kind: "mic"` with `mic_item_id == nil`. `domain.InputSource.MicItemID` is
already `*int64` (nullable) — the field has always supported "unset"; only
the validation rule treats it as required.

## Goals / Non-Goals

**Goals:**
- Make mic eligibility data-driven via `picker_role`, matching the cable/
  stand/truss pattern exactly.
- Allow a mic source to exist unassigned, so defaulting new sources to
  `kind: "mic"` doesn't require picking an item at creation time.
- Preserve every existing behavior for `kind: "line"` sources and for mic
  sources that do have an item.

**Non-Goals:**
- No change to how cable or stand roles work.
- No change to the drawer's visual layout — the "Mic" `<Select>` in
  `InputFlowInspector.tsx` already renders correctly once fed a non-empty
  list; it is not touched.
- No change to how an item's category assignment happens elsewhere (import,
  price-list mapping) beyond the one-time backfill below.

## Decisions

**Extend `picker_role` as a fourth string value, not a new column.**
Cable/stand/truss already establish "one column, several mutually exclusive
roles" (a category is a cable source *or* a stand source *or* a truss
source). Mic fits the same shape — a category is not simultaneously a mic
source and a cable source in practice — so reusing the column avoids a
second, parallel boolean/role concept for no behavioral gain. Alternative
considered: a separate `is_mic_category` boolean, rejected as introducing a
second way to express the same "which picker does this category feed" idea
Principle II already answers with one column.

**Backfill by the same heuristic the bug used, once, in the migration —
not in application code.** The old `LOWER(name) LIKE 'mikrofon%'` match is
wrong as a *permanent* mechanism but is a reasonable one-time signal for
"this category was already being treated as mic inventory." The migration
sets `picker_role = 'mic'` for any category matching it, mirroring how
migration `019` backfilled `cable_item_id` conservatively from existing
naming conventions. After the backfill, the name is never consulted again;
a user who named their mic category anything else assigns the role by hand
via the existing category editor, same as they would for a newly added
cable category.

**Relax `validInputSource` by deleting the nil-check, not by adding a new
"pending" state.** `MicItemID` is already `*int64`; "no item yet" is simply
`nil`, an already-representable state, so no schema or type change is
needed — only the removal of the one validation branch that forbade it.
Alternative considered: a separate `assigned bool` or `status` field to mark
a source as "incomplete" — rejected as unneeded complexity (Principle V):
every consumer of `mic_item_id` already branches on nullness for display
purposes (`frontend/src/lib/patchSheet.ts:127`,
`InputGraphCanvas.tsx:323-324`), so nil already means "no item" everywhere
that matters.

**Default kind chosen client-side at creation, not via a DB column
default.** `kind` has no DB `DEFAULT` today (migration
`029_input_signal_graph.up.sql:19`, `kind TEXT NOT NULL`) — every INSERT
path already supplies it explicitly from application code. Changing the one
frontend call site (`InputGraphCanvas.tsx:290`) is sufficient and consistent
with how the value has always been sourced; adding a DB default would be a
second source of truth for a value application code always provides anyway.

## Risks / Trade-offs

- [Relaxing a validated invariant that other code may implicitly assume]
  → Mitigated by auditing every read site of `mic_item_id` on a `kind:
  "mic"` source before implementation (`rental.go`, `audio_pdf_sections.go`,
  `patchSheet.ts`, `InputGraphCanvas.tsx`), listed in proposal.md - Impact,
  and by the spec's explicit "excluded from rental counts" scenario.
- [Backfill heuristic misses a mic category with an unrelated name, or
  wrongly tags a non-mic category that happens to start with "mikrofon"]
  → Same residual risk the original bug already had; not worsened by this
  change. Any category the heuristic misses is a one-time manual role
  assignment, same action already required for a *new* mic category to work
  under the fixed mechanism.
- [Existing mic sources whose `mic_item_id` already references an item in a
  category with no picker role set] → Unaffected: this change only governs
  which items are *offered* going forward; an already-saved `mic_item_id`
  keeps working regardless of its category's role.

## Migration Plan

1. `backend/migrations/NNN_mic_picker_role.up.sql`: backfill
   `UPDATE inventory_categories SET picker_role = 'mic' WHERE picker_role IS
   NULL AND LOWER(name) LIKE 'mikrofon%'` (mirrors the frontend heuristic
   being replaced). `.down.sql` clears `picker_role` back to `NULL` for rows
   this migration set (tracked by the same `WHERE` shape, since no separate
   marker column exists — consistent with how `019`'s down migration
   handles its own backfill).
2. Backend: add `'mic'` to `validPickerRole` (`inventories.go`) and to the
   error strings naming valid values (3 call sites per proposal.md -
   Impact).
3. Backend: remove the `mic_item_id == nil` rejection branch in
   `validInputSource` (`audio_patch.go`).
4. Backend: audit and adjust the four downstream consumers listed in
   proposal.md - Impact for a null `mic_item_id` on a `kind: "mic"` row.
5. Frontend: add `'mic'` to `InventoryCategory['picker_role']`
   (`types/index.ts`) and to `PICKER_ROLES` (`InventoryDrawers.tsx`).
6. Frontend: change `AudioInputsTab.tsx`'s `micItems` to filter by
   `picker_role === 'mic'` (mirroring `standItems`'s existing resolution),
   removing the name-based filter.
7. Frontend: change `InputGraphCanvas.tsx:290`'s new-source default from
   `kind: 'line'` to `kind: 'mic'`.
8. Update/extend tests per proposal.md - Impact.
9. Rollback: the `.down.sql` migration plus reverting the application code
   changes is sufficient; no data beyond the backfilled `picker_role` values
   is created or destroyed by this change.
