# Tasks: Rental Completeness — Cables & Stands from Inventory

**Input**: Design documents from `/specs/006-rental-cables-stands/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/cables-stands-api.md, quickstart.md

**Tests**: Go `httptest` for aggregation, filters, and CRUD legacy-clearing; a
focused backfill test; Vitest updates for sheet/signal-flow label rules
(research.md R6). Picker UX and the real-DB upgrade are manual per quickstart.md.

**Organization**: Full-stack slice — one migration, small backend surface, four
frontend surfaces. Phases map to the four user stories after a shared
schema/model foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = input cables, US2 = stands, US3 = output cables, US4 = legacy migration

## Phase 1: Setup

No setup tasks — no new dependencies, tooling, or structure changes (plan.md
Technical Context).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, domain structs, and CRUD plumbing every story needs.

- [x] T001 Create `backend/migrations/019_cable_stand_items.up.sql` + `.down.sql`: `ALTER TABLE inventory_categories ADD COLUMN picker_role TEXT` with name-match seed (Signalkablage / Signalkablage digital / Högtalarkablage → 'cable'; Stativ & Lyftutrustning → 'stand'); `cable_item_id` + `stand_item_id` on `audio_patch_inputs` and `cable_item_id` on `audio_patch_outputs` (all `INTEGER REFERENCES inventory_items(id)`); conservative backfill per data-model.md (cable_type='xlr' + exactly-one 'Mikrofonkabel' match on `LOWER(REPLACE(description,',','.')) = printf('%gm', cable_length_m)` → set cable_item_id, NULL cable_type/cable_length_m). Down: recreate without the columns (table rebuild) or document irreversibility consistent with existing down files
- [x] T002 [P] Add `PickerRole` to `InventoryCategory` in `backend/internal/domain/inventory.go` and `CableItemID`/`StandItemID` to `AudioInput`, `CableItemID` to `AudioOutput` in `backend/internal/domain/audio.go` (`omitempty` JSON like `mic_item_id`)
- [x] T003 Wire the new columns through `backend/internal/db/audio_patch.go`: select/insert/update for both tables; UPDATE clears legacy fields on pick (`cable_type = CASE WHEN ? IS NOT NULL THEN NULL ELSE cable_type END`, same for `cable_length_m` with `cable_item_id`, and `mic_stand` with `stand_item_id` — the `mic_model` pattern); inserts never write legacy fields
- [x] T004 [P] Extend `frontend/src/types/index.ts` (`cable_item_id?`/`stand_item_id?` on `AudioPatchInput`, `cable_item_id?` on `AudioPatchOutput`, `picker_role?` on `InventoryCategory`) and `frontend/src/api/inventory.ts` (`role` param on `listInventoryItems`, `updateCategoryPickerRole` PATCH helper)

**Checkpoint**: `go vet`/`go test` and `tsc` green; schema live.

---

## Phase 3: User Story 1 — Input cables from the catalog (Priority: P1) 🎯 MVP

**Goal**: Cable picker on input rows fed by `cable`-role categories; every pick
counted on the rental order and Excel export (FR-001, FR-004–FR-007, FR-011).

**Independent Test**: quickstart.md §1 steps 1–2, 4–6 for cables — pick cables
on channels, verify quantities/prices/over-stock on the Rental Order tab and in
the export, and item labels on sheet + signal flow.

- [x] T005 [US1] Add the `role` filter to `ListInventoryItems` and `picker_role` to category listing in `backend/internal/db/inventory.go`; parse/validate `?role=` (400 on unknown) in `backend/internal/api/inventory.go`
- [x] T006 [US1] Add the input-cable arm (`SELECT cable_item_id, 1, 0 FROM audio_patch_inputs WHERE event_id = ? AND cable_item_id IS NOT NULL`) to `rentalSummaryQuery` in `backend/internal/db/rental.go` (+ arg count)
- [x] T007 [P] [US1] httptest: input cables aggregate per item across rows, merge with manual lines, flag over-stock in `backend/internal/api/rental_test.go`
- [x] T008 [P] [US1] httptest: `?role=cable` returns only cable-category items, unknown role → 400 in `backend/internal/api/inventory_test.go`
- [x] T009 [US1] Replace the cable-type select + length input with a cable picker in `frontend/src/components/event/AudioInputsTab.tsx`: options `name — description` from a `['inventory-items','role','cable']` query, empty "—" option, legacy `cable_type`/`cable_length_m` shown as read-only text beside the picker until a pick is made (mic-cell pattern)
- [x] T010 [US1] Update `frontend/src/components/print/InputPatchSheet.tsx`: Cable column shows picked item `name — description` (via an items-by-id map including descriptions) or legacy `<label> <length> m` text; remove the separate Length column
- [x] T011 [US1] Update `frontend/src/lib/signalFlow.ts` + `frontend/src/components/event/SignalFlowTab.tsx`: cable hop = picked item label > legacy text > absent-without-gap; context gains a cable-item label map
- [x] T012 [P] [US1] Update `frontend/src/lib/signalFlow.test.ts`: picked-cable label, legacy fallback, no-cable no-gap cases
- [x] T013 [P] [US1] Update `frontend/src/components/print/printSheets.test.tsx`: input sheet shows item label for picks, legacy text otherwise, no form controls
- [x] T014 [US1] Manual verification per quickstart.md §1 (cable rows) — picker uniqueness, rental quantities, export placement

**Checkpoint**: US1 delivers the MVP — input cables fully derived.

---

## Phase 4: User Story 2 — Stands from the catalog (Priority: P2)

**Goal**: Stand picker on input rows; picks counted (FR-003–FR-007, FR-011).

**Independent Test**: quickstart.md §1 stand steps — pick stands, verify rental
quantities and sheet display.

- [x] T015 [US2] Add the stand arm (`stand_item_id` from inputs) to `rentalSummaryQuery` in `backend/internal/db/rental.go` + aggregation case in `backend/internal/api/rental_test.go`
- [x] T016 [US2] Replace the stand select with a stand picker (`role=stand`, empty option, legacy `mic_stand` read-only fallback) in `frontend/src/components/event/AudioInputsTab.tsx`
- [x] T017 [US2] Show picked stand label / legacy text in the Stand column of `frontend/src/components/print/InputPatchSheet.tsx` + update `frontend/src/components/print/printSheets.test.tsx`
- [x] T018 [US2] Manual verification per quickstart.md §1 (stand rows)

**Checkpoint**: Inputs fully catalog-driven.

---

## Phase 5: User Story 3 — Output cables from the catalog (Priority: P2)

**Goal**: Cable picker on output rows; picks counted (FR-002, FR-004–FR-007, FR-011).

**Independent Test**: quickstart.md §1 step 3 — output cable picks appear on
the rental order and output sheet.

- [x] T019 [US3] Add the output-cable arm to `rentalSummaryQuery` in `backend/internal/db/rental.go` + aggregation case in `backend/internal/api/rental_test.go`
- [x] T020 [US3] Replace cable type/length fields with the cable picker (shared query/options, legacy fallback) in `frontend/src/components/event/AudioOutputsTab.tsx`
- [x] T021 [US3] Show cable item label / legacy text in `frontend/src/components/print/OutputPatchSheet.tsx` + update `frontend/src/components/print/printSheets.test.tsx`
- [x] T022 [US3] Manual verification per quickstart.md §1 (outputs)

**Checkpoint**: All three planning surfaces feed the rental order.

---

## Phase 6: User Story 4 — Legacy data preserved (Priority: P3)

**Goal**: Upgrade converts only unambiguous rows and preserves everything else
visibly (FR-008–FR-010).

**Independent Test**: quickstart.md §2 on a COPY of a pre-upgrade database.

- [x] T023 [P] [US4] Focused backfill test: temp DB seeded with legacy-shaped rows (xlr + stocked length, xlr + unknown length, jack_ts, stand values), run the migration's conversion statement, assert matched rows picked + legacy cleared and all others untouched (new test in `backend/internal/db/` or `backend/internal/api/` beside existing DB tests)
- [x] T024 [P] [US4] httptest: audio patch CRUD round-trips the new fields and clears legacy values on pick (and does not resurrect them on clear) in `backend/internal/api/audio_patch_test.go`
- [x] T025 [US4] Manual verification per quickstart.md §2 against a copy of the real dev DB (never the live file)

**Checkpoint**: All user stories complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T026 Add `PATCH /api/v1/inventory/categories/{id}` (body `{picker_role}`, 400 on unknown value, 404 on missing category) in `backend/internal/api/inventory.go` + `backend/internal/db/inventory.go` + httptest in `backend/internal/api/inventory_test.go`
- [x] T027 Add the per-category role selector (— / Cable / Stand) to the categories list in `frontend/src/pages/Inventory.tsx`, PATCHing via `updateCategoryPickerRole`; verify quickstart.md §3
- [x] T028 [P] Update `README.md` (rental completeness bullet, `?role=` param + category PATCH in the API table) and mark the Slice 6 bullets done in `ROADMAP.md`; note cables/stands coverage in `PROJECT.md` §3.1/§3.6 if applicable
- [x] T029 Run full gates: `cd backend && go vet ./... && go test ./... && golangci-lint run`; `cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run && npm run build`

---

## Dependencies

```text
Phase 2: T001 → T002 ∥ T003 ∥ T004 (T003 needs T002's structs)
   ├─→ US1: T005 → T006 → (T007 ∥ T008) → T009 → T010 ∥ T011 → (T012 ∥ T013) → T014   🎯 MVP
   ├─→ US2: T015 → T016 → T017 → T018      (T015 after T006 — same file)
   ├─→ US3: T019 → T020 → T021 → T022      (T019 after T015 — same file)
   └─→ US4: T023 ∥ T024 → T025             (only needs Phase 2)
Polish: T026 → T027; T028 ∥ everything; T029 last.
US2/US3 both reuse US1's picker query/options plumbing (T009) — priority order
US1 → US2 → US3 is also the practical order; US4 can run any time after Phase 2.
```

## Parallel Execution Examples

- **Foundational**: T002 and T004 in parallel; T003 after T002.
- **US1**: T007 + T008 together after T006; T012 + T013 together after T010/T011.
- **US4**: T023 and T024 in parallel with the US2/US3 UI work.
- **Polish**: T028 alongside T026/T027.

## Implementation Strategy

MVP = Phase 2 + US1: input cables are the highest-volume missing line items,
and US1 builds the picker/label/aggregation machinery that US2 and US3 then
apply to two more fields each. US4 is mostly guaranteed by the Phase 2
migration design and verified by its own tests. Rental CTE edits (T006, T015,
T019) touch the same constant and run sequentially. Stop-and-verify checkpoints
are the quickstart sections per story.

---

## Implementation Notes (post-completion)

- The pre-019 column DEFAULT `'xlr'` on `cable_type` (both tables) would have
  leaked into new catalog-driven rows, so the INSERTs write explicit NULLs for
  all legacy fields, and the read column lists serve `COALESCE(cable_type, '')`
  instead of the old `'xlr'` fallback.
- Item-reference validation was generalized (`validMicItem` → `validItemRef`)
  and applied to `cable_item_id`/`stand_item_id` on inputs and `cable_item_id`
  on outputs — dangling references 400 like mic picks always did.
- New shared helpers in `frontend/src/lib/utils.ts`: `itemLabel(item)`
  ("name — description") and `legacyCableText(type, length, labelFor)` used by
  both tabs, both sheets, and the signal-flow chain.
- T023 replays the two UPDATE statements verbatim from the shipped
  `019_cable_stand_items.up.sql`, covering: exact match, Swedish decimal-comma
  normalization ("7,5m"), ambiguous duplicate lengths, discontinued-only
  matches, wrong types, and missing lengths.
- T025 was executed for real: the new binary ran against a **copy** of the dev
  database (`PATCHPLANNER_DB` override, port :7431). Result: roles seeded on
  all four categories; 46 cable / 44 stand picker items; the existing event's
  XLR rows with stocked lengths converted (4m ×1, 6m ×5 — now on the rental
  order, correctly priced); the length-less XLR row and all stand values
  stayed as legacy text. The live dev DB was never touched — the migration
  applies to it on the next backend restart.
- T014/T018/T022 (browser UX checks): everything assertable without a print
  dialog/browser is covered by the Vitest/httptest suites; the visual pass
  over quickstart.md §1 remains for a human.
