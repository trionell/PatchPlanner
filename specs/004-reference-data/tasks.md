# Tasks: Configurable Reference Data

**Input**: Design documents from `/specs/004-reference-data/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reference-data-api.md, quickstart.md

**Tests**: Included (pragmatic tier — Go tests for migrations/CRUD/protection rules; the rebuild-preserves-data and import-isolation tests are the contracts that keep upgrades invisible).

## Format: `[ID] [P?] [Story] Description`

- **[Story]**: US1 = stored vocabularies drive dropdowns, US2 = settings management, US3 = fixture DMX modes

## Phase 1: Setup / Foundational

- [ ] T001 [P] Migrations backend/migrations/013_reference_values.{up,down}.sql (table per data-model.md, UNIQUE(vocabulary, value)) and 014_reference_seed.{up,down}.sql (single multi-row INSERT of all 8 vocabularies' seed values exactly as tabled in data-model.md; down deletes seeded rows)
- [ ] T002 [P] Migration backend/migrations/015_fixture_modes.{up,down}.sql (table per data-model.md, FK ON DELETE CASCADE, UNIQUE(inventory_item_id, name))
- [ ] T003 Rebuild migrations backend/migrations/016_inputs_drop_checks.{up,down}.sql, 017_outputs_drop_checks.{up,down}.sql, 018_truss_drop_checks.{up,down}.sql — each: PRAGMA defer_foreign_keys=ON; CREATE …_new without the dropped CHECKs (keep destination_type CHECK in 017, keep all defaults/FKs, explicit column lists incl. mic_item_id); INSERT…SELECT; DROP old; RENAME (R1). Down files rebuild with CHECKs restored
- [ ] T004 [P] Domain types ReferenceValue/ReferenceData/ReferenceValueRequest/FixtureMode/FixtureModeRequest + Vocabularies list in backend/internal/domain/reference.go

**Checkpoint**: Schema + types ready; all migrations apply on a fresh DB.

---

## Phase 2: User Story 1 — Stored vocabularies drive dropdowns (Priority: P1) 🎯 MVP

**Goal**: Vocabularies live in the DB, seeded to today's values; all planning dropdowns read them; existing rows survive the rebuilds untouched.

**Independent Test**: quickstart.md "Verify: upgrade invisibility".

- [ ] T005 [US1] Failing tests in backend/internal/db/reference_test.go: after openTestDB all 8 vocabularies present with exact seed counts and label ordering; **rebuild preservation**: stepwise test (execMigrationFile up to 015, insert input/output/truss rows exercising every legacy value incl. empty-string mic_stand, apply 016–018, assert rows byte-identical) and post-rebuild INSERT of a non-seeded value (e.g. signal_type 'playback') succeeds
- [ ] T006 [US1] Implement ListReferenceData (all vocabularies, ORDER BY label COLLATE NOCASE) in backend/internal/db/reference.go; make T005 pass
- [ ] T007 [US1] GET /api/v1/reference-data handler in backend/internal/api/reference.go (all 8 keys always present, [] when empty), register in backend/internal/api/router.go; endpoint test in backend/internal/api/reference_test.go asserting response shape per contract
- [ ] T008 [P] [US1] Frontend: ReferenceValue/ReferenceData types in frontend/src/types/index.ts, getReferenceData in frontend/src/api/reference.ts, useReferenceData hook (query key ['reference-data'], options(vocab, currentValue?) merging legacy values per R5) in frontend/src/hooks/useReferenceData.ts
- [ ] T009 [US1] Rewire dropdowns to useReferenceData: frontend/src/components/event/AudioInputsTab.tsx (signal type, preamp connector, cable type, mic stand), AudioOutputsTab.tsx (output type, speaker cable type), LightingTab.tsx (power connectors, truss types); delete the 8 vocabulary arrays from frontend/src/lib/constants.ts keeping destinationTypes (SC-003)

**Checkpoint**: MVP — same UX as before, but data-driven end to end.

---

## Phase 3: User Story 2 — Manage vocabulary values in a settings page (Priority: P2)

**Goal**: Add / rename-label / delete values with duplicate and in-use protection, live in dropdowns immediately.

**Independent Test**: quickstart.md "Verify: settings page".

- [ ] T010 [US2] Failing tests in backend/internal/db/reference_test.go: CreateReferenceValue (duplicate in same vocabulary → ErrDuplicate; same value in another vocabulary OK), UpdateReferenceValueLabel (value immutable), DeleteReferenceValue with in-use probe per usage-map column (one test row per consuming column from data-model.md §Usage map, incl. power_connector_out) → ErrInUse; unused value deletes
- [ ] T011 [US2] Implement Create/UpdateLabel/Delete + usage-map EXISTS probes in backend/internal/db/reference.go; make T010 pass
- [ ] T012 [US2] Endpoints POST /reference-data/{vocabulary}/values, PATCH+DELETE /reference-data/{vocabulary}/values/{valueID} in backend/internal/api/reference.go per contract (400 empty value/label, 404 unknown vocabulary/id, 409 duplicate/in-use with message naming usage); endpoint tests in backend/internal/api/reference_test.go
- [ ] T013 [US2] Settings page frontend/src/pages/Settings.tsx (per-vocabulary sections: add form, inline label rename, delete with 409 error surfaced) + createReferenceValue/updateReferenceValue/deleteReferenceValue in frontend/src/api/reference.ts; mutations invalidate ['reference-data']; add /settings route + nav link in frontend/src/App.tsx

**Checkpoint**: Vocabularies grow with the gear; deletion can never orphan a plan.

---

## Phase 4: User Story 3 — Fixture DMX modes (Priority: P3)

**Goal**: Per-model mode lists; picking a mode copies name + channel count onto the fixture; catalog re-import leaves modes intact.

**Independent Test**: quickstart.md "Verify: fixture modes".

- [ ] T014 [US3] Failing tests in backend/internal/db/reference_test.go (or fixture_modes_test.go): mode CRUD + duplicate name per item → ErrDuplicate, cascade on inventory-item delete, **import isolation**: UpsertInventory re-import (reuse importFixture pattern from inventory_test.go) leaves modes untouched (FR-011), mode edit/delete leaves lighting_fixtures rows unchanged
- [ ] T015 [US3] Implement ListFixtureModes/CreateFixtureMode/UpdateFixtureMode/DeleteFixtureMode in backend/internal/db/reference.go; make T014 pass
- [ ] T016 [US3] Endpoints GET+POST /inventory/items/{itemID}/fixture-modes, PATCH+DELETE /fixture-modes/{modeID} in backend/internal/api/reference.go per contract (400/404/409); endpoint tests in backend/internal/api/reference_test.go
- [ ] T017 [P] [US3] Frontend: FixtureMode type in frontend/src/types/index.ts + list/create/update/delete calls in frontend/src/api/reference.ts
- [ ] T018 [US3] UI: FixtureModeManager in frontend/src/components/FixtureModeManager.tsx surfaced from the rental catalog for lighting items in frontend/src/pages/Inventory.tsx; mode picker on fixture rows in frontend/src/components/event/LightingTab.tsx (query ['fixture-modes', itemId]; selecting copies name→dmx_channel_mode and count→dmx_channel_count into the draft, manual entry still possible — FR-009/FR-010)

**Checkpoint**: Channel counts fill themselves; DMX auto-assign spaces correctly.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T019 [P] Docs: README.md features bullet + API table (reference-data, fixture-modes endpoints); PROJECT.md §3.5 marked implemented; ROADMAP.md Slice 4 checked off
- [ ] T020 Run quickstart.md end-to-end against the live app on a scratch DB copy (upgrade invisibility, settings flow, fixture modes, import isolation)
- [ ] T021 Gate: backend go vet/test/golangci-lint; frontend lint/typecheck/test/build

---

## Dependencies & Execution Order

- T001 ∥ T002 ∥ T004; T003 after T001 (numbering); US1 (T005→T006→T007; T008 ∥ backend; T009 last)
- US2 after US1's db/api files exist (same files): T010→T011→T012→T013
- US3 after T002+T004; db/api tasks sequential in shared files (after US2's to avoid file conflicts); T017 ∥ T014–T016; T018 last
- Polish last

## Implementation Strategy

MVP = Phases 1–2: the upgrade lands invisibly with all dropdowns
data-driven — Principle II discharged. US2 adds the editing payoff, US3 the
DMX quality-of-life. The rebuild-preservation test (T005) and import-isolation
test (T014) are the permanent contracts that upgrades never mutate plans and
imports never touch reference data.

**Total**: 21 tasks (Foundational 4, US1 5, US2 4, US3 5, Polish 3).
