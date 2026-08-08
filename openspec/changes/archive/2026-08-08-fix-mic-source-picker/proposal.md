## Why

In the Audio Inputs flow graph, a source's "Mic" field is populated by matching
inventory item category names against the hardcoded string prefix `"mikrofon"`
(`frontend/src/components/event/AudioInputsTab.tsx:126`), instead of the
`inventory_categories.picker_role` mechanism the app already uses for cable and
stand items. Any inventory whose mic category isn't named with that exact
prefix gets an empty mic list, so switching a source's kind to "Mic" and saving
fails with "mic_item_id is required when kind is mic" — there is no way to pick
a mic. Fixing this the right way also removes a category-name branch that
Constitution Principle II already forbids. Separately, the user wants a new
source to default to kind "Mic" rather than "Line", which requires a mic
source to be able to exist before an item is chosen, since a new source is
created immediately on the graph, before the drawer where a mic gets attached
is ever opened.

## What Changes

- Add `'mic'` as a valid `inventory_categories.picker_role` value, alongside
  the existing `'cable'`, `'stand'`, and `'truss'` roles, with the same
  migration + backend validation + `InventoryDrawers.tsx` role-picker UI
  treatment those roles already have.
- Migrate existing data: any category currently matched by the old
  `LOWER(name) LIKE 'mikrofon%'` heuristic gets `picker_role = 'mic'` set
  automatically, so inventories that worked under the old heuristic keep
  working under the new one.
- Replace `AudioInputsTab.tsx`'s hardcoded category-name filter with a lookup
  by `picker_role = 'mic'`, matching how `standItems` is already resolved.
- **BREAKING** (relaxed, not tightened): a source of kind `"mic"` may now be
  created or saved with no `mic_item_id` set. The "must be unset when kind is
  line" side of the rule is unchanged. Existing consumers of `mic_item_id`
  (rental counting, PDF export, patch-sheet display) already treat it as
  optional and are audited as part of this change; any that assume kind
  `"mic"` implies a non-null item are fixed here.
- Change the default kind for a newly created source from `"line"` to
  `"mic"` (with no item attached until the user picks one in the drawer).

## Capabilities

### New Capabilities

- `audio-input-mic-assignment`: how an Audio Inputs source of kind "mic" is
  linked to an inventory item — which inventory categories can supply mic
  options, whether a mic source may exist before an item is chosen, and what
  kind a newly created source defaults to.

### Modified Capabilities

_None — no existing `openspec/specs/` capability describes this behavior
today; the picker-role mechanism and source validation predate this tool and
are being extended, not amended, from OpenSpec's point of view._

## Impact

- **Migration**: new `backend/migrations/NNN_mic_picker_role.up.sql` (+
  `.down.sql`) extending whatever constrains `picker_role` today and
  backfilling `picker_role = 'mic'` from the old name heuristic.
- **Backend**: `backend/internal/api/inventories.go` (picker_role enum
  validation, 3 call sites), `backend/internal/api/audio_patch.go`
  (`validInputSource` — drop the mic_item_id-required check),
  `backend/internal/db` (wherever category-role-scoped item queries live).
- **Backend tests**: `backend/internal/api/audio_patch_test.go` (the "mic
  without mic_item_id → 400" case changes to 201; add coverage for the new
  allowed state), plus inventory picker-role tests for the new value.
- **Frontend**: `frontend/src/components/event/AudioInputsTab.tsx` (micItems
  lookup), `frontend/src/components/event/InputGraphCanvas.tsx` (default
  kind), `frontend/src/components/inventory/InventoryDrawers.tsx` (role
  picker gains a `mic` option, reusing the existing control — no new design).
- **Downstream consumers audited for a null `mic_item_id` on a kind="mic"
  source**: `backend/internal/db/rental.go`, `backend/internal/service/
  audio_pdf_sections.go`, `frontend/src/lib/patchSheet.ts`,
  `frontend/src/components/event/InputGraphCanvas.tsx`.
- **Constitution Check** (Principles I–V):
  - **I. Domain-First Data Model**: unaffected — the mic→cable→stagebox
    relationship model doesn't change, only how a mic is *offered* for
    selection.
  - **II. Extensibility by Design**: this change is a direct correction
    *toward* this principle — it removes the one place planning logic
    branches on a literal category name, replacing it with the same
    data-driven `picker_role` column every other picker category already
    uses. No new API endpoint or component is required to add a mic
    category; adding the role to an existing category is enough.
  - **III. Full-Stack Monorepo Architecture**: unaffected — no new service
    boundary, standard migration + handler + component change.
  - **IV. Inventory-Driven Rental Workflow**: an unassigned mic source
    references no inventory item, so it must not be silently counted as
    rented stock; `rental.go`'s existing `WHERE mic_item_id IS NOT NULL`
    filter already excludes it, verified as part of this change's audit.
  - **V. Pragmatic Simplicity**: the fix reuses an existing mechanism
    (`picker_role`) rather than inventing a new one; no new abstraction.
  - No deviation requiring Complexity Tracking.
