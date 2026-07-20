---

description: "Task list for Slice 17 — Per-Event Settings from a Personal Template"
---

# Tasks: Per-Event Settings from a Personal Template

**Input**: Design documents from `/specs/017-event-settings/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reference-data-api.md — all present and read.

**Tests**: Included, matching this project's established convention (Go `httptest` + Vitest, co-located with the code they cover) and Slices 14–16's precedent.

**Organization**: Tasks are grouped by user story (spec.md's US1/US2/US3, priority order P1/P2/P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, or US3 — omitted for Setup/Foundational/Polish tasks

---

## Phase 1: Setup

- [X] T001 Verify a clean baseline on `017-event-settings`: `cd backend && go build ./... && go test ./...`, and `cd frontend && npx tsc -b && npm run lint && npm run test` — all must pass before any Slice 17 edit, so any later failure is attributable to this slice

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema (new `reference_templates` table, rebuilt `reference_values` with `event_id`), the pre-existing-event fan-out, per-event-scoped reference-data functions, the personal-template functions, and the event-creation copy-in — every user story depends on all of this existing and working.

**⚠️ CRITICAL**: No user story task can start until this phase is complete.

- [X] T002 Write `backend/migrations/039_event_settings.up.sql`: `CREATE TABLE reference_templates` (id, owner_user_id NOT NULL REFERENCES users(id), vocabulary, value, label, `UNIQUE(owner_user_id, vocabulary, value)`); rebuild `reference_values` (SQLite can't `ALTER TABLE` a constraint — use the `PRAGMA defer_foreign_keys = ON` / `CREATE ..._new` / `INSERT ... SELECT` / `DROP` / `RENAME` pattern from migrations 017/018/023) adding `event_id INTEGER REFERENCES events(id)` (nullable — the 48 pre-existing rows keep `NULL` permanently as the shared seed) and changing the unique constraint from `(vocabulary, value)` to `(event_id, vocabulary, value)`; then a pure-SQL fan-out, `INSERT INTO reference_values (event_id, vocabulary, value, label) SELECT e.id, r.vocabulary, r.value, r.label FROM events e CROSS JOIN reference_values r WHERE r.event_id IS NULL`, giving every event that exists at migration time its own full copy (research.md R2/R4 — deliberately pure SQL, not a Go conversion)
- [X] T003 Write `backend/migrations/039_event_settings.down.sql`: drop `reference_templates`; rebuild `reference_values` back to its pre-migration shape (drop `event_id`, restore `UNIQUE(vocabulary, value)`), keeping only the `event_id IS NULL` rows (the fanned-out per-event copies are lost on rollback, matching this project's existing down-migration precedent of not attempting to reconstruct pre-migration state beyond schema)
- [X] T004 Edit `backend/internal/domain/reference.go`: `ReferenceValue` gains `EventID int64` (mirroring `InventoryCategory`/`InventoryItem`'s `InventoryID` precedent from Slice 16); add a `ReferenceTemplateValue` struct (same shape: ID, Vocabulary, Value, Label) for personal-template rows (depends on T002)
- [X] T005 Edit `backend/internal/db/reference.go`: `ListReferenceData`, `CreateReferenceValue`, `UpdateReferenceValueLabel`, `DeleteReferenceValue`, `getReferenceValue` all gain an `eventID int64` parameter and scope their queries accordingly; `countReferenceUsage` gains `eventID` too — for `preamp_connectors`/`speaker_cable_types`/`output_types` the generated query becomes `WHERE <column> = ? AND event_id = ?` (direct column), but `power_connectors` (backed by `lighting_fixtures`, which has no `event_id` column of its own) needs `SELECT COUNT(*) FROM lighting_fixtures f JOIN lighting_rigs g ON g.id = f.rig_id WHERE f.<column> = ? AND g.event_id = ?` (research.md R6) — extend `vocabularyUsage`'s map value with an optional join clause so `countReferenceUsage` can build either shape from the same data structure; the `fixture_modes`-related functions in this same file are Slice 16's concern and stay untouched (depends on T002, T004)
- [X] T006 [P] Write/extend `backend/internal/db/reference_test.go`: event-scoped CRUD works correctly for a single event (create/list/rename/delete all scoped to the right `event_id`); `countReferenceUsage`'s join-based `power_connectors` check correctly counts a `lighting_fixtures` row through its `lighting_rigs.event_id` (depends on T005)
- [X] T007 Create `backend/internal/db/reference_templates.go`: `ListReferenceTemplate(db, ownerUserID) (domain.ReferenceData, error)`, `CreateReferenceTemplateValue(db, ownerUserID, vocabulary, req) (domain.ReferenceTemplateValue, error)`, `UpdateReferenceTemplateValueLabel(db, ownerUserID, vocabulary, id, label) (domain.ReferenceTemplateValue, error)`, `DeleteReferenceTemplateValue(db, ownerUserID, vocabulary, id) error` (no in-use check at all — research.md R6, spec.md FR-009), `EnsureUserHasReferenceTemplate(db, userID) error` (idempotent copy-from-seed, not claim-one-row — research.md R5: no-op if the user already has any `reference_templates` rows, else copies every `event_id IS NULL` `reference_values` row into fresh rows owned by that user) (depends on T002, T004)
- [X] T008 [P] Write `backend/internal/db/reference_templates_test.go`: create/list/rename/delete a template value (delete always succeeds even for a value with no corresponding usage check); `EnsureUserHasReferenceTemplate` populates a fresh user with the full seed set, is a no-op for a user who already has a template, and gives two different users their own independent copies (editing one never affects the other) (depends on T007)
- [X] T009 Edit `backend/internal/db/events.go`: `CreateEvent`'s existing transaction (the one that already seeds the built-in `LR` `mixer_groups` row) gains one more step — copy the creating user's current `reference_templates` rows into new `reference_values` rows bound to the new event's id, a flat `INSERT ... SELECT`-shaped copy with no id-remapping (research.md R1, since nothing references `reference_values.id` by foreign key) (depends on T007)
- [X] T010 Edit `backend/internal/api/reference.go`: `ReferenceHandler`'s handlers resolve `eventID` from the URL (mounted inside the existing `/events/{eventID}` group going forward — see T013) and delegate to the now-event-scoped `db` functions from T005; the `fixture-modes`-related handlers already live in `inventories.go` since Slice 16 and are untouched here (depends on T005)
- [X] T011 Create `backend/internal/api/reference_templates.go`: `ReferenceTemplateHandler{DB *sql.DB}` with `Register(r)` wiring `GET/POST /reference-templates`, `PATCH/DELETE /reference-templates/{vocabulary}/values/{valueID}` — no path param for "which template" at all, always resolved from `middleware.UserFromContext` (mirrors `InventoriesHandler`'s list-mine/create routes, but simpler since a template is singular per user, not plural like inventories) (depends on T007)
- [X] T012 [P] Write `backend/internal/api/reference_templates_test.go`: create/list/rename/delete as the owner; a value that doesn't belong to the caller 404s on PATCH/DELETE (depends on T011)
- [X] T013 Edit `backend/internal/api/router.go`: add `ReferenceTemplateHandler{DB: db}.Register(r)` in the outer authenticated group (no new middleware — `RequireAuth` alone is sufficient, research.md R3); remove the old top-level `ReferenceHandler{DB: db}.Register(r)` call and instead register `ReferenceHandler{DB: db}.Register(er)` inside the existing `/events/{eventID}` group, reusing `RequireEventAccess` verbatim (no new middleware here either — research.md R3) (depends on T010, T011)
- [X] T014 Edit `backend/internal/api/auth.go`: callback calls `db.EnsureUserHasReferenceTemplate(h.DB, user.ID)` right after `db.EnsureUserHasInventory`, same error-handling pattern (depends on T007)
- [X] T015 Edit `backend/internal/api/reference_test.go`: update every request to the new event-scoped paths (`seedEvent` + `/events/{id}/reference-data/...`), matching the new router shape from T013 (depends on T013)
- [X] T016 Run the full existing backend test suite (`go test ./...`) to confirm zero regressions from the event-scoping changes and router restructuring

**Checkpoint**: Schema, event-scoped reference-data CRUD, personal-template CRUD, the event-creation copy-in, and both new/changed route groups are all in place and compile; every pre-existing backend test still passes. User story work can now begin.

---

## Phase 3: User Story 1 - An event's settings are its own (Priority: P1) 🎯 MVP

**Goal**: Editing one event's vocabulary (add/rename/delete a value) is visible and effective only within that event — no other event, and no user's personal template, is ever affected. Viewers can see an event's vocabulary but never mutate it.

**Independent Test**: Create two events, customize one event's vocabulary, and confirm the other event's vocabulary is byte-for-byte unchanged, and that a planning row already using the changed vocabulary elsewhere is unaffected.

### Implementation for User Story 1

- [X] T017 [US1] Write a test proving cross-event isolation: renaming/adding/deleting a value on Event A's vocabulary never changes Event B's vocabulary for the same `(vocabulary, value)` pair — extend `backend/internal/api/reference_test.go` or a new `cross_event_reference_test.go`
- [X] T018 [US1] Write a test proving delete-protection is scoped per event: a value in use by a planning row on Event A does not block deleting the identical `(vocabulary, value)` pair from Event B; include the `power_connectors`/`lighting_fixtures` join case specifically (research.md R6)
- [X] T019 [P] [US1] Edit `frontend/src/api/reference.ts`: `getReferenceData`, `createReferenceValue`, `updateReferenceValue`, `deleteReferenceValue` all take an `eventId` argument and hit `/events/{eventId}/reference-data/...`
- [X] T020 [P] [US1] Edit `frontend/src/hooks/useReferenceData.ts`: takes an `eventId: number` argument; query key becomes `['reference-data', eventId]` (depends on T019)
- [X] T021 [US1] Create a new event-scoped Settings tab component (e.g. `frontend/src/components/event/SettingsTab.tsx`), reusing the existing `VocabularySection` add/rename/delete CRUD UI from the old `Settings.tsx`, `readOnly`-gated the same way every other mutating event tab already is (depends on T020)
- [X] T022 [US1] Wire the new Settings tab into the event-detail tab list alongside Audio Inputs/Outputs/Lighting/etc. (depends on T021)
- [X] T023 [P] [US1] Thread `eventId` into the audio-side `useReferenceData` consumers: `ColorSelect`, `ProcessingDeviceSection`, `InputDeviceSection`, `SourceSection`, `TrueOutputDeviceSection`, `AudioOutputsTab` (depends on T020)
- [X] T024 [P] [US1] Thread `eventId` into the lighting/print `useReferenceData` consumers: `LightingTab`, `print/LightingRigSheet`, `print/OutputPatchSheet` (depends on T020)
- [X] T025 [US1] Manually verify: create two events, customize one's vocabulary (add/rename/delete), confirm the other's is unaffected in the running app

**Checkpoint**: Two events' vocabularies are fully isolated; every existing dropdown/label reads from the correct event's vocabulary; an event's own Settings tab lets an owner/contributor edit it, hidden from viewers.

---

## Phase 4: User Story 2 - A personal template seeds new events (Priority: P2)

**Goal**: A user's personal template is directly reachable and editable as its own surface; every new event they create starts from a one-time copy of it, and editing the template afterward never retroactively changes an already-created event.

**Independent Test**: As a user with a customized personal template, create a new event and confirm its vocabulary matches the template at that moment. Edit the template afterward and confirm neither that event, nor any other event previously created from the same template, changes.

### Implementation for User Story 2

- [X] T026 [US2] Write a test proving the event-creation copy is a one-time snapshot: editing a user's `reference_templates` after creating an event never changes that event's `reference_values`; editing an event's `reference_values` never changes the user's `reference_templates` (extend `backend/internal/db/events_test.go` or `reference_templates_test.go`)
- [X] T027 [P] [US2] Create `frontend/src/api/referenceTemplates.ts`, mirroring `reference.ts`'s four functions but with no `eventId` argument, hitting `/reference-templates/...`
- [X] T028 [P] [US2] Edit `frontend/src/hooks/useReferenceData.ts`: add `useReferenceTemplate()` (no `eventId` argument), same `options`/`label` derived-helper shape as `useReferenceData` (depends on T027)
- [X] T029 [US2] Create `frontend/src/pages/MyDefaults.tsx`: personal-template CRUD UI, reusing the same `VocabularySection` component as the event Settings tab (T021); also add the `channel_colors` title missing from the old `Settings.tsx`'s hardcoded `vocabularyTitles` map (research.md R7 — a pre-existing gap, fixed here since this page supersedes it) (depends on T028)
- [X] T030 [US2] Edit `frontend/src/App.tsx`/`frontend/src/components/Layout.tsx`: replace the old global `/settings` route and nav entry with `/my-defaults` → `MyDefaults.tsx` (depends on T029)
- [X] T031 [US2] Delete `frontend/src/pages/Settings.tsx` — fully superseded by `MyDefaults.tsx` (T029) and the event Settings tab (T021/T022) (depends on T021, T029, T030)
- [X] T032 [US2] Manually verify: edit the personal template, create a new event, confirm its vocabulary matches; edit the template again, confirm the already-created event is unaffected

**Checkpoint**: A user can find and edit their personal defaults on their own page; new events start pre-populated from it; editing the template never retroactively touches an existing event.

---

## Phase 5: User Story 3 - Existing events keep working (Priority: P3)

**Goal**: Every event that existed before this slice shipped keeps exactly the vocabulary it had, with no action required from anyone, and behaves identically to any other event from that point on (fully isolated, no link back to the migration's seed data).

**Independent Test**: Take an event that existed before this feature, confirm its planning rows still show the same vocabulary labels they did before, and confirm editing that event's vocabulary afterward behaves exactly like User Story 1.

### Implementation for User Story 3

- [X] T033 [US3] Write a migration test (mirroring `buses_migration_test.go`'s existing `mixer_groups` per-event-seed assertion) confirming every event that existed before migration `039_event_settings` gets its own full, byte-for-byte copy of the pre-migration global vocabulary
- [X] T034 [US3] Write a test confirming two pre-existing events' post-migration vocabularies are fully independent of each other (editing one never affects the other) — the same isolation guarantee as User Story 1, specifically exercised against migrated (not newly-created) data
- [X] T035 [US3] Manually verify against a **copy** of the real dev DB, never the live file ([[db-safety-rule]]): copy `patchplanner.db` to a scratch location, run the backend against the copy with `PATCHPLANNER_DB` pointed at it, confirm the one real pre-existing event's vocabulary labels are byte-for-byte unchanged after migration, and every existing planning row's picked value still resolves and displays correctly

**Checkpoint**: All three user stories independently verified — isolation, personal templates, and migration safety for pre-existing events all work end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T036 [P] Run `go vet ./...` and `golangci-lint run` in `backend/`, and `tsc -b` + ESLint in `frontend/`, per the constitution's Development Workflow gates — fix anything they flag
- [X] T037 Check whether `README.md` needs an update: the global `GET /reference-data` endpoint and the single global Settings page it documents are both gone, replaced by per-event settings and a personal "My defaults" page — update its description accordingly
- [X] T038 Run the full backend (`go test ./...`) and frontend (`npm run test`) suites one final time across all three completed user stories to confirm zero regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup passing cleanly — blocks all user stories
- **User Story 1 (Phase 3)**: depends on Foundational completion
- **User Story 2 (Phase 4)**: depends on Foundational completion; independent of US1 (different frontend files — `MyDefaults.tsx` vs the event Settings tab — sharing only the read-only `VocabularySection` component), but sequenced after US1 here since it reuses the tab component US1 builds
- **User Story 3 (Phase 5)**: depends on Foundational completion; independent of US1/US2 (pure verification of what Foundational's migration already did) — could run in parallel with either, sequenced last here only because it's lowest priority
- **Polish (Phase 6)**: depends on all three user stories being complete

### Within Each User Story

- Backend validation/test tasks before the frontend pieces that depend on them
- Foundational db/api pieces before any handler or component that uses them
- Story complete (checkpoint) before moving to the next priority

### Parallel Opportunities

- T006 and T008 (foundational tests, two different files) can run in parallel once their respective implementation files exist
- T012 is independent of T006/T008
- T019, and T023/T024 (once T020 lands) touch different files and can run in parallel
- T027 and T028 (frontend template API + hook) can run in parallel with US1's T019-T024, since they touch entirely different files
- T033 and T034 (two different migration/isolation tests) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# After T002 (migration) and T004 (domain structs) land, launch together:
Task: "Edit db/reference.go to scope every query to event_id, plus the lighting_fixtures join"
Task: "Create db/reference_templates.go (CRUD + EnsureUserHasReferenceTemplate)"
```

## Parallel Example: User Story 1

```bash
Task: "Thread eventId into ColorSelect, ProcessingDeviceSection, InputDeviceSection, SourceSection, TrueOutputDeviceSection, AudioOutputsTab"
Task: "Thread eventId into LightingTab, print/LightingRigSheet, print/OutputPatchSheet"
```

---

## Implementation Strategy

### MVP: User Story 1 alone is safe and meaningful

Like Slices 15 and 16, US1 is self-contained and safe to ship on its own — isolation is the entire point, and US2 (personal templates as their own reachable surface) and US3 (migration-safety verification for pre-existing events) are additive on top of a fully working, fully isolated foundation. Complete Setup + Foundational + US1 for a genuinely demoable MVP; note that Foundational already includes the event-creation copy-in (T009) since without it no new event would have any vocabulary to isolate-test in the first place — the same "backend plumbing is Foundational, the user-facing surface is its owning story" split Slice 16 used for inventory creation vs. the "My Inventories" page.

### Incremental Delivery

1. Setup + Foundational → schema, event-scoped CRUD, personal-template CRUD, and the event-creation copy-in ready; zero regressions confirmed
2. US1 → real isolation: two events' vocabularies never leak into each other; every dropdown/label reads the right event's data; an event's own Settings tab exists
3. US2 → personal templates become their own directly-editable, directly-reachable surface (My Defaults page)
4. US3 → pre-existing events' migration safety verified explicitly
5. Polish → lint/vet/typecheck gates green, README updated, full suite green one final time

---

## Notes

- [P] tasks touch different files with no unfinished-task dependency between them
- [Story] labels map tasks to spec.md's US1/US2/US3 for traceability
- research.md R4's deliberate deviation (pure-SQL migration fan-out instead of a Go conversion) is the highest-conceptual-risk part of this slice's Foundational phase — T033's migration test is the concrete gate proving it worked correctly
- T035 is the only task touching anything resembling production data, and only ever a throwaway copy, never `backend/patchplanner.db` itself ([[db-safety-rule]])
