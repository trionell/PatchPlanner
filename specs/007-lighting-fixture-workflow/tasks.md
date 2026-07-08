# Tasks: Lighting Rig Workflow — Fixture IDs, Mode Picking & Bulk-Add

**Input**: Design documents from `/specs/007-lighting-fixture-workflow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/lighting-workflow-api.md, quickstart.md

**Tests**: Go `httptest` in a new `lighting_test.go` (bulk placement, 409
rollback, validation, fixture_number round-trip); Vitest for the duplicate
helper and the FID sheet column (research.md R6). Dialog UX is manual per
quickstart.md.

**Organization**: One shared migration/model foundation, then one phase per
user story. US2 is frontend-only; US3 carries the only new backend logic.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = fixture IDs, US2 = dialog modes, US3 = bulk-add

## Phase 1: Setup

No setup tasks — no new dependencies, tooling, or structure changes (plan.md
Technical Context).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `fixture_number` column and its plumbing, needed by US1 and US3.

- [x] T001 Create `backend/migrations/020_fixture_number.up.sql` (`ALTER TABLE lighting_fixtures ADD COLUMN fixture_number INTEGER`) and `.down.sql` (`DROP COLUMN`) — no backfill, no default
- [x] T002 Add `FixtureNumber *int` (`json:"fixture_number,omitempty"`) to `LightingFixture` in `backend/internal/domain/lighting.go`
- [x] T003 Wire `fixture_number` through select/insert/update/scan in `backend/internal/db/lighting.go` (nullable, reject nothing — API validates positivity); validate `fixture_number` > 0 with 400 in create/update handlers in `backend/internal/api/lighting.go`
- [x] T004 [P] Add `fixture_number?: number` to `LightingFixture` in `frontend/src/types/index.ts`

**Checkpoint**: `go vet`/`go test` and `tsc` green; column live.

---

## Phase 3: User Story 1 — Console fixture IDs (Priority: P1) 🎯 MVP

**Goal**: Editable, persisted FID on every rig row, duplicate-flagged, printed
on the sheet (FR-001–FR-003, FR-011).

**Independent Test**: quickstart.md §1 — type IDs, reload, duplicate two,
print the sheet.

- [x] T005 [P] [US1] Create `frontend/src/lib/lightingRig.ts` with `duplicateFixtureNumbers(fixtures): Set<number>` (numbers appearing on >1 row; unset never counts) + colocated `frontend/src/lib/lightingRig.test.ts` (duplicates, unset rows, all-unique)
- [x] T006 [P] [US1] httptest: `fixture_number` round-trips through fixture create/PATCH/list, `fixture_number <= 0` → 400, and pre-existing rows serve no number, in new `backend/internal/api/lighting_test.go`
- [x] T007 [US1] Add the FID column (first column, numeric input bound to `fixture_number`, persist on blur) to the rig table in `frontend/src/components/event/LightingTab.tsx`, with amber warning treatment on cells whose number is in `duplicateFixtureNumbers(fixtures)`
- [x] T008 [US1] Add the `FID` column (first column, empty when unset) to `frontend/src/components/print/LightingRigSheet.tsx` and update the lighting expectations in `frontend/src/components/print/printSheets.test.tsx`
- [x] T009 [US1] Manual verification per quickstart.md §1 (persist, duplicate flag, print)

**Checkpoint**: US1 delivers the MVP — plans and console speak the same numbers.

---

## Phase 4: User Story 2 — Modes in the Add Fixture dialog (Priority: P2)

**Goal**: The dialog offers the selected catalog model's DMX modes (FR-004).

**Independent Test**: quickstart.md §2 — model with modes shows the picker and
fills name+count; switching models resets; free text still works.

- [x] T010 [US2] In the Add Fixture dialog in `frontend/src/components/event/LightingTab.tsx`: query `['fixture-modes', selectedItemId]` (`listFixtureModes`, enabled only for catalog picks), render a mode `<Select>` above the mode/channels inputs when modes exist, copy name + channel count into the draft on pick, and reset both draft fields to defaults whenever the model selection changes
- [x] T011 [US2] Manual verification per quickstart.md §2 (picker appears/fills, reset on switch, free text for modeless/custom)

**Checkpoint**: Modes defined in the catalog are usable at add time.

---

## Phase 5: User Story 3 — Bulk-add fixtures (Priority: P2)

**Goal**: One transactional operation creates N patch-ready units: shared
settings, incrementing FIDs, appended positions and DMX addresses
(FR-005–FR-010).

**Independent Test**: quickstart.md §3 — 8 units land numbered/addressed;
overflow and bad quantities reject whole.

- [x] T012 [US3] Implement `BulkCreateLightingFixtures(db, rigID, req)` in `backend/internal/db/lighting.go`: single tx; positions after `MAX(position_index)`; first DMX address = `MAX(dmx_start_address + dmx_channel_count)` on the chosen universe (1 when none), sequential per unit; last unit past 512 → `ErrUniverseFull`, rollback; fixture numbers from optional start; returns the full updated fixtures list
- [x] T013 [US3] Add `POST /events/{eventID}/lighting-rigs/{rigID}/fixtures/bulk` in `backend/internal/api/lighting.go`: decode/validate per data-model.md (quantity 1–100, channel count ≥ 1, positive start, item exists, section belongs to rig → 400; unknown rig → 404; `ErrUniverseFull` → 409), respond with the fixtures array
- [x] T014 [US3] httptest in `backend/internal/api/lighting_test.go`: happy path (8 units — IDs increment, shared mode/truss/universe/power, addresses continue after an existing fixture, positions appended), universe overflow → 409 and zero rows, quantity 0 and 101 → 400, omitted `fixture_number_start` → units without IDs
- [x] T015 [P] [US3] Add `BulkFixtureRequest` to `frontend/src/types/index.ts` and `bulkAddFixtures(eventId, rigId, req)` to `frontend/src/api/lighting.ts`
- [x] T016 [US3] Add the Bulk add dialog + button (beside Add fixture) in `frontend/src/components/event/LightingTab.tsx`: catalog model (required), quantity, mode picker/free text + channel count (same source as T010), truss section, universe, power connection + connector, start FID pre-filled with `max(fixture_number)+1` (101 for an unnumbered rig, clearable); submit → mutation → invalidate lighting + rental queries; 400/409 message shown in the dialog
- [x] T017 [US3] Manual verification per quickstart.md §3 (batch correctness, overflow rejection, auto-assign still works)

**Checkpoint**: All user stories complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T018 [P] Update `README.md` (lighting feature bullet: FID + bulk-add + dialog modes; fixture columns list; bulk endpoint in the API table) and mark Slice 7 done in `ROADMAP.md`
- [x] T019 Run full gates: `cd backend && go vet ./... && go test ./... && golangci-lint run`; `cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run && npm run build`

---

## Dependencies

```text
Phase 2: T001 → T002 → T003; T004 ∥ (after T001)
   ├─→ US1: (T005 ∥ T006) → T007 → T008 → T009   🎯 MVP
   ├─→ US2: T010 → T011                            (LightingTab.tsx — after T007 to avoid same-file conflicts)
   └─→ US3: T012 → T013 → T014; T015 ∥ → T016 → T017   (T016 after T010 — shares the dialog mode source)
Polish: T018 ∥ anything; T019 last.
US1 → US2 → US3 is both priority and the practical same-file order for
LightingTab.tsx (T007 → T010 → T016).
```

## Parallel Execution Examples

- **Foundational**: T004 alongside T002/T003.
- **US1**: T005 and T006 together; T008's sheet + test after T007.
- **US3**: T015 in parallel with T012–T014 backend work.
- **Polish**: T018 while T017 verification runs.

## Implementation Strategy

MVP = Phase 2 + US1: the FID column is standalone value (printable console
patch) and the numbering base for bulk-add. US2 is a small, isolated dialog
fix. US3 builds on both (IDs + the dialog's mode source) and holds the only
new backend logic — `BulkCreateLightingFixtures` — which gets its httptest
before the UI wires in. All three LightingTab.tsx edits run sequentially
(T007 → T010 → T016) to avoid conflicts in the slice's one shared file.

---

## Implementation Notes (post-completion)

- `lib/lightingRig.ts` gained `nextFixtureNumber()` alongside the planned
  duplicate helper — the bulk dialog's suggested-start logic is unit-tested
  the same way.
- The bulk endpoint checks rig existence inside the transaction (404 instead
  of an FK 500), and the handler reuses `validFixtureNumber` for the start
  value and the generic dangling-item 400 message style.
- End-to-end smoke against a **copy** of the dev DB (:7432, live DB never
  touched): migration 020 applied, bulk-add of 4 catalog fixtures produced
  FIDs 101–104, DMX addresses 1/13/25/37, positions appended — matching the
  httptest expectations on real data.
- T009/T011/T017 (browser UX checks): everything assertable headlessly is
  covered by the 2 new httptests, 5 lightingRig unit tests, and the updated
  sheet tests; the visual pass (duplicate highlight, dialog feel, print
  preview) remains quickstart.md for a human.
