---

description: "Task list for Slice 16 — Inventory Ownership & Duplication"
---

# Tasks: Inventory Ownership & Duplication

**Input**: Design documents from `/specs/016-inventory-ownership/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/inventory-api.md — all present and read.

**Tests**: Included, matching this project's established convention (Go `httptest` + Vitest, co-located with the code they cover) and Slices 14/15's precedent.

**Organization**: Tasks are grouped by user story (spec.md's US1/US2/US3, priority order P1/P2/P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, or US3 — omitted for Setup/Foundational/Polish tasks

---

## Phase 1: Setup

- [X] T001 Verify a clean baseline on `016-inventory-ownership`: `cd backend && go build ./... && go test ./...`, and `cd frontend && npx tsc -b && npm run lint && npm run test` — all must pass before any Slice 16 edit, so any later failure is attributable to this slice

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, per-owner data access, the legacy bootstrap, and the two access-control paths (owner-only management, event-scoped read) every user story depends on.

**⚠️ CRITICAL**: No user story task can start until this phase is complete.

- [X] T002 Write `backend/migrations/038_inventory_ownership.up.sql`: `CREATE TABLE inventories` (id, owner_user_id REFERENCES users(id) nullable, name NOT NULL, source_xlsx BLOB nullable, source_filename TEXT nullable, created_at); `ALTER TABLE inventory_categories ADD COLUMN inventory_id INTEGER NOT NULL REFERENCES inventories(id)` and same for `inventory_items`; `ALTER TABLE events ADD COLUMN inventory_id INTEGER REFERENCES inventories(id)` (nullable); insert exactly one bootstrap `inventories` row and backfill every pre-existing `inventory_categories`/`inventory_items`/`events` row to it — all deterministic pure SQL (research.md R5), per data-model.md
- [X] T003 Write `backend/migrations/038_inventory_ownership.down.sql` dropping the three new columns and the `inventories` table
- [X] T004 Edit `backend/internal/domain/inventory.go`: add `Inventory` struct (ID, OwnerUserID, Name, SourceFilename, CreatedAt — never expose the BLOB itself in JSON); `InventoryCategory`/`InventoryItem` gain `InventoryID int64`
- [X] T005 Create `backend/internal/db/inventories.go`: `CreateInventory(db, ownerUserID, name) (Inventory, error)`, `ListInventoriesForOwner(db, ownerUserID) ([]Inventory, error)`, `GetInventory(db, id) (Inventory, error)`, `RenameInventory(db, id, name) (Inventory, error)`, `DeleteInventory(db, id) error` (400/error if any event has `inventory_id = id` — FR-010), `EnsureUserHasInventory(db, userID) error` (claim-or-create, research.md R4), `ItemBelongsToInventory(db, itemID, inventoryID) (bool, error)` (research.md R6) — **not** `DuplicateInventory`, deferred to US2 (depends on T002, T004)
- [X] T006 [P] Write `backend/internal/db/inventories_test.go`: create/list/get/rename; delete blocked while an event references the inventory; `EnsureUserHasInventory` claims an ownerless row if one exists, else creates a fresh empty one, and is a no-op for a user who already owns one; `ItemBelongsToInventory` true/false cases (depends on T005)
- [X] T007 Edit `backend/internal/db/inventory.go`: every function (`ListInventoryCategories`, `ListInventoryItems`, `GetInventoryItem`, `UpsertInventory`, `upsertCategories`, `loadItemIDsByName`) gains an `inventoryID int64` parameter and scopes its query/updates to it — `UpsertInventory`'s global `UPDATE inventory_items SET discontinued = 1` and unscoped category/item `SELECT`s must only ever touch the one inventory being re-imported (depends on T002, T004)
- [X] T008 Create `backend/internal/db/inventory_legacy_migration.go`: one-time Go conversion reading whatever file currently sits at `INVENTORY_PATH` (if any) and storing its bytes + filename into the bootstrap `inventories` row's `source_xlsx`/`source_filename` (research.md R5) — a no-op (leaves the column NULL) if no file is present
- [X] T009 [P] Write `backend/internal/db/inventory_legacy_migration_test.go`: the bootstrap row's `source_xlsx` is populated when a file exists at the configured path, stays NULL when it doesn't, and the conversion is idempotent (safe to run twice)
- [X] T010 Edit `backend/internal/db/db.go`: sequence `inventory_legacy_migration`'s conversion at migration version 038, following the established Slices 11–13 staged pattern (depends on T008)
- [X] T011 Edit `backend/internal/db/events.go`: `CreateEvent` takes an `inventoryID int64` parameter, sets it on insert; caller (API layer) is responsible for validating the caller owns that inventory before calling this (depends on T002)
- [X] T012 Edit `backend/internal/service/inventory_import.go`: `ImportFromXLSX` changes from `(path string)` to `(r io.Reader)`, using `excelize.OpenReader(r)` instead of `excelize.OpenFile(path)` — the parse/upsert logic itself is unchanged (research.md R1)
- [X] T013 Edit `backend/internal/service/inventory_import_test.go` to exercise the new `io.Reader` signature (open the test fixture file and pass its `*os.File` or bytes reader instead of a path)
- [X] T014 Create `backend/internal/api/middleware/inventory_access.go`: `RequireInventoryOwner(db *sql.DB) func(http.Handler) http.Handler` — resolves `{inventoryID}` via `chi.URLParam`, the user via the already-set `UserFromContext`, checks ownership via `db.GetInventory`; not-owner (or nonexistent) → 404 for every method, since this whole resource is owner-only with no role gradient (unlike `RequireEventAccess`, no GET-for-everyone exception)
- [X] T015 [P] Write `backend/internal/api/middleware/inventory_access_test.go`: owner succeeds on every method; non-owner 404s on every method including GET; nonexistent inventory 404s (depends on T014)
- [X] T016 Edit `backend/internal/api/router.go`: add `r.Route("/inventories/{inventoryID}", func(ir chi.Router) { ir.Use(middleware.RequireInventoryOwner(db)); InventoriesHandler{DB: db}.RegisterOwned(ir) })` in the outer authenticated group; add `r.Get("/inventories", ...)` + `r.Post("/inventories", ...)` (list-mine/create, no `{inventoryID}` yet so no ownership check needed — scoped by context user); inside the existing `/events/{eventID}` group (behind `RequireEventAccess`), add `EventInventoryHandler{DB: db}.Register(er)` for the two read-only routes (depends on T014)
- [X] T017 Create `backend/internal/api/inventories.go`: `InventoriesHandler{DB *sql.DB}` with `Register(r)` (`GET /inventories` list-mine, `POST /inventories` create) and `RegisterOwned(ir)` (`GET/PATCH/DELETE /inventories/{id}`, `GET /inventories/{id}/categories`, `PATCH /inventories/{id}/categories/{categoryID}`, `GET /inventories/{id}/items`, `POST /inventories/{id}/import-xlsx` — multipart, calls the new `io.Reader`-based `ImportFromXLSX`, then `db.UpsertInventory` scoped to this inventory — plus fixture-modes CRUD moved from the old global path) — **not** `/duplicate`, deferred to US2 (depends on T005, T007, T012, T016)
- [X] T018 [P] Write `backend/internal/api/inventories_test.go`: create/list-mine/get/rename/delete (incl. delete-blocked-while-in-use), categories/items CRUD, multipart import-xlsx round-trip, fixture-modes CRUD — all as the owner; a non-owner gets 404 on each (depends on T017)
- [X] T019 Edit `backend/internal/api/inventory.go`: remove the old global `InventoryHandler` route registration (superseded); add `EventInventoryHandler{DB: db}.Register(er)` wiring `GET /inventory/categories` → `GET /categories` (relative to the `/events/{eventID}` mount, i.e. final path `/events/{eventID}/inventory/categories`) and same for `/items`, each resolving the event's bound `inventory_id` first via `db.GetEvent`/a small lookup, then delegating to the now-scoped `db.ListInventoryCategories`/`ListInventoryItems` (depends on T007, T016)
- [X] T020 Edit `backend/internal/api/auth.go`: callback calls `db.EnsureUserHasInventory(h.DB, user.ID)` right after `db.ClaimOwnerlessEvents`, ignoring the returned error path the same way (fail the request on error, consistent with the existing claim call) (depends on T005)
- [X] T021 Edit `backend/internal/api/events.go`: `create` handler requires `inventoryId` in the request body, validates (via `db.GetInventory` + ownership check) that the caller owns it before calling `dbstore.CreateEvent(h.DB, event, user.ID, inventoryID)`; 400 if missing or not owned (depends on T011)
- [X] T022 Edit `backend/internal/api/rental.go`: `exportFile`/`exportReport` resolve the event's bound `inventory_id`, fetch that inventory's `source_xlsx` via `db.GetInventory` (or a small dedicated blob-fetch), and pass it to `excelize.OpenReader` via `bytes.NewReader` instead of calling `inventoryFilePath()` + `excelize.OpenFile` (research.md R2) — 400/clear error if the inventory has no stored template yet
- [X] T023 Run the full existing backend test suite (`go test ./...`) to confirm zero regressions from the inventory-scoping changes and router restructuring

**Checkpoint**: Schema, per-owner data access, the legacy bootstrap, both access-control paths, and import/export's new per-inventory template resolution are all in place and compile; every pre-existing backend test still passes. User story work can now begin.

---

## Phase 3: User Story 1 - Each user's inventory is their own (Priority: P1) 🎯 MVP

**Goal**: Users' inventories are fully isolated from each other; creating an event binds it to one of the creator's own inventories; the same inventory can be reused across events; every existing planning picker reads from the event's bound inventory instead of one global catalog.

**Independent Test**: Have two unrelated users each edit their own inventory (add an item, change a price, import a price list) and confirm neither ever sees or is affected by the other's changes, while each can freely create multiple events that all use their own single inventory.

### Implementation for User Story 1

- [X] T024 [US1] Edit `backend/internal/api/audio_patch.go`: add `db.ItemBelongsToInventory` checks (resolving the event's bound inventory first) to every create/update handler accepting a picked catalog item — stagebox/stage-multi `inventory_item_id`, input-source `mic_item_id`/`stand_item_id`, input-device `inventory_item_id`, input-cable `cable_item_id`; 400 with a clear message on mismatch (research.md R6)
- [X] T025 [US1] Edit `backend/internal/api/lighting.go`: same validation on fixture create/update's `inventory_item_id`
- [X] T026 [US1] Edit `backend/internal/api/rental.go`: same validation on the manual rental line create/update's `inventory_item_id` (separate change from T022's export-template edit)
- [X] T027 [US1] Edit `backend/internal/api/stage_plots.go`/`plot_trusses.go`: same validation on truss-piece create/update's `inventory_item_id`
- [X] T028 [US1] Write a new `backend/internal/api/cross_inventory_test.go`: for a representative sample of the handlers touched in T024–T027 (one per file), picking an item from a *different* inventory than the event's bound one → 400 with a clear message; picking from the correct inventory → succeeds as before
- [X] T029 [P] [US1] Edit `frontend/src/types/index.ts`: add an `Inventory` interface (id, name, sourceFilename, createdAt) and add `inventoryId: number` to the `Event` interface
- [X] T030 [P] [US1] Create `frontend/src/api/inventories.ts`: `listMyInventories`, `createInventory`, `renameInventory`, `deleteInventory`, `listCategories(inventoryId)`, `updateCategoryPickerRole(inventoryId, categoryId, role)`, `listItems(inventoryId)`, `importInventoryXlsx(inventoryId, file)` (posts `FormData`)
- [X] T031 [US1] Create `frontend/src/pages/Inventories.tsx`: "My Inventories" list/create page; clicking into one shows the existing item/category management UI (moved from the current global `Inventory.tsx`) scoped to that inventory — owner always, since this whole page is reached only for inventories the viewer owns (depends on T029, T030)
- [X] T032 [US1] Edit the event-creation dialog (`frontend/src/components/EventFormDialog.tsx` or wherever `createEvent` is called from): add a required inventory picker sourced from `listMyInventories`, defaulting silently to the user's only inventory when they have exactly one (depends on T030)
- [X] T033 [P] [US1] Switch the audio-input-side picker components (`StageboxMultiSection`/`StageboxMultiManager`, `SourceSection`, `InputDeviceSection`) from the old global inventory-items query to `GET /events/{eventId}/inventory/items`
- [X] T034 [P] [US1] Switch the audio-output-side picker components (`ProcessingDeviceSection`, `TrueOutputDeviceSection`, and `AudioOutputsTab`'s own cable/device item pickers) to the same event-scoped endpoint
- [X] T035 [P] [US1] Switch the Lighting/StagePlot/Equipment/Rental picker components (`LightingTab`, `PlotTrussManager`, `EquipmentTab`, `RentalTab`) to the same event-scoped endpoint

**Checkpoint**: Two unrelated users' inventories are fully isolated; events bind to one inventory at creation and can share it across events; every existing picker reads from the correct, event-scoped catalog; picking equipment from the wrong inventory is rejected.

---

## Phase 4: User Story 2 - Duplicate an inventory (Priority: P2)

**Goal**: An inventory owner can duplicate one of their inventories into a brand-new, fully independent copy, without re-importing from scratch.

**Independent Test**: Duplicate an inventory, edit an item in the copy, and confirm the original (and any event still using it) is unaffected — and vice versa.

### Implementation for User Story 2

- [X] T036 [US2] Add `DuplicateInventory(db, sourceInventoryID, ownerUserID) (Inventory, error)` to `backend/internal/db/inventories.go`: creates a new `inventories` row (same owner, copying `source_xlsx`/`source_filename` per research.md R7), deep-copies every category and item (new ids, same data) with an id-mapping, then re-inserts each copied item's `fixture_modes` against its new item id (no cascade helps here — this is a copy, not a delete)
- [X] T037 [US2] Extend `backend/internal/db/inventories_test.go`: duplicating produces a fully independent inventory; editing an item in the copy doesn't touch the original (and vice versa); fixture modes carry over correctly under the new item ids
- [X] T038 [US2] Add `POST /inventories/{id}/duplicate` to `backend/internal/api/inventories.go`'s `RegisterOwned`, calling `db.DuplicateInventory` (depends on T036)
- [X] T039 [US2] Extend `backend/internal/api/inventories_test.go`: duplicate endpoint returns a new inventory owned by the caller with matching contents; a non-owner 404s on this route like every other `/inventories/{id}/...` route
- [X] T040 [P] [US2] Add `duplicateInventory(inventoryId)` to `frontend/src/api/inventories.ts`
- [X] T041 [US2] Add a "Duplicate" action per inventory row in `frontend/src/pages/Inventories.tsx` (depends on T040)

**Checkpoint**: Duplication produces a fully independent copy; editing either the original or the copy never affects the other.

---

## Phase 5: User Story 3 - Collaborators can use but not change an event's inventory (Priority: P3)

**Goal**: A contributor (or viewer) on an event that uses someone else's inventory can view/select from it while planning, but every attempt to manage that inventory directly is blocked.

**Independent Test**: Have a contributor (not the inventory's owner) open an event using another person's inventory, confirm they can view items and pick them onto patch rows, and confirm every attempt to add/edit/re-import the inventory itself is blocked.

**Note**: Per research.md R3, the access-control mechanism for this story was already built in Foundational (`RequireInventoryOwner` for management, the existing `RequireEventAccess` reused for reads) — this phase is a verification pass plus one piece of frontend polish, not new backend authorization logic, mirroring how Slice 15's viewer story mostly verified an already-built mechanism.

### Implementation for User Story 3

- [X] T042 [US3] Write a test (extend `backend/internal/api/inventories_test.go` or a new case in `cross_inventory_test.go`): a contributor on an event bound to another user's inventory can `GET /events/{eventId}/inventory/items` successfully, but gets 404 on every `/inventories/{inventoryId}/...` management route for that same inventory (confirming `RequireInventoryOwner` and `RequireEventAccess` compose correctly — a contributor is never the inventory's owner just by being on the event)
- [X] T043 [US3] Edit `frontend/src/pages/EventDetail.tsx` (or `OverviewTab.tsx`): show which inventory the event uses, with a link that opens a read-only item/category view for non-owners (no add/edit/import controls) versus the full management UI (`Inventories.tsx`) when the viewer is that inventory's owner

**Checkpoint**: All three user stories independently verified — isolation/sharing, duplication, and collaborator read-only access all work end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T044 [P] Run `go vet ./...` and `golangci-lint run` in `backend/`, and `tsc -b` + ESLint in `frontend/`, per the constitution's Development Workflow gates — fix anything they flag
- [X] T045 Manually verify the legacy-inventory bootstrap against a **copy** of the real dev DB, never the live file ([[db-safety-rule]]): copy `patchplanner.db` to a scratch location, run the backend against the copy with `PATCHPLANNER_DB` pointed at it, confirm the one bootstrap `inventories` row appears with `source_xlsx` populated from the real `INVENTORY_PATH` file, every pre-existing event's `inventory_id` points at it, and rental totals for the reference event are byte-for-byte unchanged
- [X] T046 Manually verify the import-xlsx multipart upload flow end-to-end against the copy from T045: upload a real price-list file through the new "My Inventories" UI, confirm categories/items parse and store correctly scoped to that one inventory, and that re-importing doesn't touch any other inventory's items
- [X] T047 Check whether `README.md` needs an update: `INVENTORY_PATH`'s meaning has narrowed (it now only matters for the one-time legacy-migration read, not ongoing imports, which go through per-inventory upload) — update its description accordingly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup passing cleanly — blocks all user stories
- **User Story 1 (Phase 3)**: depends on Foundational completion
- **User Story 2 (Phase 4)**: depends on Foundational completion; independent of US1's picker-swap work, but shares `inventories.go`/`inventories_test.go` with it (T005/T006/T017/T018) — practically sequential after US1 lands to avoid churn in files US1 already touched
- **User Story 3 (Phase 5)**: depends on Foundational **and** US1 (needs the event-scoped read endpoint and picker UI to exist to verify against); independent of US2
- **Polish (Phase 6)**: depends on all three user stories being complete

### Within Each User Story

- Backend validation/handler changes before the frontend pieces that depend on them
- Foundational middleware/db pieces before any handler that uses them
- Story complete (checkpoint) before moving to the next priority

### Parallel Opportunities

- T006 and T009 (foundational tests, two different files) can run in parallel once their respective implementation files exist
- T015 (middleware test) is independent of T006/T009
- T024–T027 (four handler files' validation additions) can run in parallel — different files, same pattern, no cross-dependency
- T029, T030 (frontend types, api/inventories.ts) can run in parallel
- T033, T034, T035 (three picker-swap groups, different files) can run in parallel — mirrors the three-way split used for Slice 15's viewer-hiding fix

---

## Parallel Example: Foundational Phase

```bash
# After T002 (migration) and T004 (domain struct) land, launch together:
Task: "Create db/inventories.go (CRUD + EnsureUserHasInventory + ItemBelongsToInventory)"
Task: "Edit db/inventory.go to scope every query to inventory_id"
```

## Parallel Example: User Story 1

```bash
Task: "Edit api/audio_patch.go — add cross-inventory validation"
Task: "Edit api/lighting.go — add cross-inventory validation"
Task: "Edit api/rental.go — add cross-inventory validation"
Task: "Edit api/plot_trusses.go — add cross-inventory validation"
```

---

## Implementation Strategy

### MVP: User Story 1 alone is safe and meaningful

Like Slice 15 (and unlike Slice 14), US1 is self-contained and safe to ship on its own — isolation and event-binding are the entire point, and US2 (duplication) and US3 (collaborator verification) are additive on top of a fully working, fully isolated foundation. Complete Setup + Foundational + US1 for a genuinely demoable MVP.

### Incremental Delivery

1. Setup + Foundational → schema, per-owner data access, both access-control paths, and import/export's per-inventory template resolution ready; zero regressions confirmed
2. US1 → real isolation: two users' inventories never leak into each other; every picker reads from the right catalog
3. US2 → duplication ships as a productivity add-on
4. US3 → collaborator behavior verified explicitly, plus the read-only inventory view
5. Polish → lint/typecheck gates green, legacy bootstrap and upload flow verified against a real-data copy

---

## Notes

- [P] tasks touch different files with no unfinished-task dependency between them
- [Story] labels map tasks to spec.md's US1/US2/US3 for traceability
- The router restructuring and access-control split (research.md R3) is the highest-conceptual-risk part of this slice — T023's full-suite run is the concrete gate before any user story work begins
- T045/T046 are the only tasks touching anything resembling production data, and only ever a throwaway copy, never `backend/patchplanner.db` itself ([[db-safety-rule]])
