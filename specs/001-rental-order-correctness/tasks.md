# Tasks: Rental Order Correctness

**Input**: Design documents from `/specs/001-rental-order-correctness/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rental-api.md, quickstart.md

**Tests**: Included (pragmatic tier agreed for this project: Go `httptest` for the money paths — aggregation, manual lines, import safety, backfill).

**Organization**: Grouped by user story so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = complete rental order, US2 = import safety, US3 = manual lines, US4 = stock validation

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test harness — the repo has zero tests today; every story's tests depend on this.

- [X] T001 Create test DB helper in backend/internal/db/testutil_test.go: open SQLite in t.TempDir(), run real migrations from backend/migrations (resolve path relative to package), seed a minimal inventory fixture (2 categories, ~6 items incl. a mic named "Shure SM58", a stagebox model, a multi, an amp, a speaker, a fixture)
- [X] T002 [P] Create API test helper in backend/internal/api/testutil_test.go: httptest.NewServer(api.NewRouter(db)) wrapper + JSON request/decode helpers

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and domain-model changes every story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Migration backend/migrations/008_input_mic_item.up.sql (+ .down.sql): ALTER TABLE audio_patch_inputs ADD COLUMN mic_item_id INTEGER REFERENCES inventory_items(id); down drops via column rename-free strategy consistent with existing down files
- [X] T004 [P] Migration backend/migrations/009_input_mic_backfill.up.sql (+ .down.sql): single UPDATE linking mic_item_id by LOWER(name) match per research.md R5; down sets mic_item_id = NULL
- [X] T005 [P] Migration backend/migrations/010_inventory_discontinued.up.sql (+ .down.sql): ALTER TABLE inventory_items ADD COLUMN discontinued INTEGER NOT NULL DEFAULT 0
- [X] T006 Update domain structs: MicItemID *int64 + MicLabel (JSON mic_label, was mic_model) in backend/internal/domain/audio.go; Discontinued bool in backend/internal/domain/inventory.go; extend EventRental/RentalSummary in backend/internal/domain/rental.go with ManualQuantityAudio, ManualQuantityLighting, ManualNotes, QuantityAvailable, IsOverStock, IsDiscontinued, HasOverStock
- [X] T007 Update input scan/insert/update for mic_item_id + mic_label in backend/internal/db/audio_patch.go (scanAudioInput, Create/Update/List/Get queries); server clears stored label when a non-null mic_item_id is written
- [X] T008 Verify migrations run clean on a fresh DB and on a copy of an existing pre-feature DB (manual: cd backend && go run ./cmd/main.go against both)

**Checkpoint**: Schema + domain ready — user stories can begin.

---

## Phase 3: User Story 1 — Complete auto-derived rental order (Priority: P1) 🎯 MVP

**Goal**: Every catalog item referenced anywhere in the plan (mics/DI/IEM, stageboxes, multis, amps, speakers, fixtures) appears on the rental order with correct quantities.

**Independent Test**: quickstart.md "Verify: complete rental order" — 3 inputs (2× same mic, 1 DI), catalog-linked stagebox + multi, amp + speaker on an output, 1 fixture ⇒ 7 correctly-quantified lines and a correct total.

### Tests for User Story 1

- [X] T009 [US1] Failing test in backend/internal/db/rental_test.go: seed an event touching every source (inputs with mic_item_id, stagebox, multi, amp, speaker, fixture) and assert GetRentalSummary returns one merged line per item with correct audio/lighting quantities and totals
- [X] T010 [P] [US1] Failing test in backend/internal/db/rental_test.go: backfill semantics — row with matching mic_model text gets linked by migration 009; non-matching text stays NULL and contributes nothing to the summary

### Implementation for User Story 1

- [X] T011 [US1] Extend the rental CTE in backend/internal/db/rental.go with three UNION ALL arms (audio_patch_inputs.mic_item_id, stageboxes.inventory_item_id, stage_multis.inventory_item_id per data-model.md quantity rules); make T009/T010 pass
- [X] T012 [US1] Accept/return mic_item_id and mic_label on input endpoints in backend/internal/api/audio_patch.go; 400 when mic_item_id references a missing item
- [X] T013 [P] [US1] Update frontend types in frontend/src/types/index.ts: AudioPatchInput.mic_item_id (number|null) + mic_label (string, read-only); RentalItem stock/manual/discontinued fields; RentalSummary.has_over_stock
- [X] T014 [US1] Rebind the mic/DI/IEM cell in frontend/src/pages/EventDetail.tsx: Select binds mic_item_id (option value = item.id), filtered by signal type as today; when mic_item_id is null and mic_label non-empty render the label with an "unlinked" badge
- [X] T015 [US1] Verify acceptance scenarios 1–5 of US1 in the running app per quickstart.md (rental order reflects add/change/remove of every source)

**Checkpoint**: MVP — the core value proposition ("no manual counting") is true.

---

## Phase 4: User Story 2 — Catalog re-import never destroys planning data (Priority: P2)

**Goal**: Re-importing LL.xlsx preserves all planning rows and catalog references; missing items become `discontinued`, never deleted.

**Independent Test**: quickstart.md "Verify: import safety" — plan, re-import, plan unchanged; import of a sheet missing a referenced item flags the line instead of losing data.

### Tests for User Story 2

- [X] T016 [US2] Failing tests in backend/internal/db/inventory_test.go: (a) upsert preserves item ids for same-named items and updates price/qty/xlsx_row; (b) items absent from the new list get discontinued=1 and their FK references survive; (c) duplicate names match by list position; (d) reappearing item flips back to discontinued=0; (e) failed import (constraint violation mid-batch) leaves DB unchanged
- [X] T017 [P] [US2] Failing round-trip test in backend/internal/service/inventory_import_test.go: import fixture xlsx → create plan rows referencing items → re-import same file → all references resolve to identical item ids

### Implementation for User Story 2

- [X] T018 [US2] Replace ReplaceInventory with UpsertInventory in backend/internal/db/inventory.go per research.md R2 (name-match with list-position fallback, update-in-place, discontinued flagging, single transaction, NO deletes of planning data); make T016/T017 pass
- [X] T019 [US2] Exclude discontinued items from ListInventoryItems by default and add includeDiscontinued parameter in backend/internal/db/inventory.go; wire ?include_discontinued=true in backend/internal/api/inventory.go per contracts/rental-api.md
- [X] T020 [P] [US2] Surface is_discontinued on rental lines: include discontinued in the summary SELECT in backend/internal/db/rental.go and mark referenced-but-discontinued lines; roll into has_over_stock summary flag
- [X] T021 [P] [US2] Show a "discontinued" badge on affected rental lines in frontend/src/pages/EventDetail.tsx and pass include_discontinued=false default through frontend/src/api/inventory.ts
- [X] T022 [US2] Fix README.md import note ("existing event data is not affected" — now actually true) and document discontinued behavior

**Checkpoint**: Re-import is safe; US1 and US2 independently verifiable.

---

## Phase 5: User Story 3 — Manual rental line items (Priority: P3)

**Goal**: Technician can add/edit/remove manual quantities of any catalog item on the Rental Order tab; manual lines merge with derived lines.

**Independent Test**: quickstart.md "Verify: manual lines" — PUT/DELETE round-trip via curl and UI flow on an empty event.

### Tests for User Story 3

- [X] T023 [US3] Failing tests in backend/internal/api/rental_test.go: PUT /events/{id}/rentals/manual/{itemID} creates then updates a line (upsert), quantities <0 → 400, unknown item → 404, both-zero PUT removes the line, DELETE idempotent 204, summary merges manual + derived quantities for the same item and exposes manual_* fields

### Implementation for User Story 3

- [X] T024 [US3] Add UpsertManualRental + DeleteManualRental in backend/internal/db/rental.go (INSERT ... ON CONFLICT(event_id, inventory_item_id) DO UPDATE; delete when both quantities zero) and add manual_quantity_audio/lighting/notes columns to the summary query
- [X] T025 [US3] Register PUT/DELETE /events/{eventID}/rentals/manual/{itemID} handlers in backend/internal/api/rental.go per contracts/rental-api.md (validation, 200-with-line / 204 responses); make T023 pass
- [X] T026 [P] [US3] Add putManualRental/deleteManualRental to frontend/src/api/rentals.ts
- [X] T027 [US3] Manual-line editor on the Rental Order tab in frontend/src/pages/EventDetail.tsx: searchable full-catalog item select, audio + lighting quantity inputs, note field; inline edit/delete on lines with a manual share; mutations invalidate ['rental-summary', eventId]

**Checkpoint**: Order is complete end-to-end including gear with no planning view.

---

## Phase 6: User Story 4 — Stock validation (Priority: P4)

**Goal**: Over-booked lines (total > available stock) are flagged per line and event-wide.

**Independent Test**: quickstart.md "Verify: stock validation" — plan 5 of an item stocked at 4 ⇒ red line flag + banner; reduce ⇒ clears.

### Tests for User Story 4

- [X] T028 [US4] Failing test in backend/internal/db/rental_test.go: line with total_quantity > quantity_available has is_over_stock=true and summary has_over_stock=true; within-stock event has no flags; zero-stock item planned once is flagged

### Implementation for User Story 4

- [X] T029 [US4] Join quantity_available into the summary query and compute is_over_stock per line + has_over_stock on the summary in backend/internal/db/rental.go; make T028 pass
- [X] T030 [US4] Rental Order tab UI in frontend/src/pages/EventDetail.tsx: stock column ("planned / available"), red highlight + "exceeds stock (N available)" on flagged lines, warning banner when has_over_stock

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T031 [P] Sync README.md API reference with the endpoints actually registered (audio-inputs/audio-outputs/rentals/lighting-rigs paths + new manual-line endpoints per contracts/rental-api.md)
- [X] T032 Run full quickstart.md validation end-to-end (all five verify sections) against a fresh DB and against a migrated pre-feature DB
- [X] T033 Gate check: cd backend && go vet ./... && go test ./...; cd frontend && npx tsc --noEmit

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately
- **Foundational (Phase 2)**: after Setup; **blocks all stories** (T006/T007 depend on T003–T005 conceptually; migrations are independent of T001/T002)
- **US1 (Phase 3)**: after Phase 2
- **US2 (Phase 4)**: after Phase 2; independent of US1 (touches inventory import, not the mic path). T020 touches db/rental.go — coordinate with T011 if run in parallel
- **US3 (Phase 5)**: after Phase 2; merges cleanly after US1's T011 lands (same file db/rental.go)
- **US4 (Phase 6)**: after US1's T011 (extends the same query); UI task independent
- **Polish (Phase 7)**: after all stories

### Parallel Opportunities

- T001 ∥ T002; T003 ∥ T004 ∥ T005
- After Phase 2: US1 and US2 can proceed in parallel (different subsystems; only T011/T020 share db/rental.go — sequence those two tasks)
- Within stories: frontend type/api tasks marked [P] parallel to backend tasks

---

## Implementation Strategy

**MVP first**: Phases 1–3 only (T001–T015) already deliver the headline fix —
the rental order stops lying. Stop, validate with quickstart.md, then continue.

**Incremental delivery**: each subsequent phase is shippable on its own:
US2 (import safety) → US3 (manual lines) → US4 (stock flags) → polish.

**Single developer order**: T001→T008 straight through, then phases in
priority order; write each story's failing tests first, implement to green,
run the story's quickstart section before moving on.

**Total**: 33 tasks (Setup 2, Foundational 6, US1 7, US2 7, US3 5, US4 3, Polish 3).
