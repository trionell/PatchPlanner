# Tasks: Equipment Lists — Owned Gear & Event Extras

**Input**: Design documents from `/specs/003-equipment-lists/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/owned-gear-api.md, quickstart.md

**Tests**: Included (Go tests for catalog CRUD, event lines, and — critically — isolation from the rental order/export/import).

## Format: `[ID] [P?] [Story] Description`

- **[Story]**: US1 = owned catalog, US2 = plan owned gear per event, US3 = unified extras view

## Phase 1: Setup / Foundational

- [X] T001 [P] Migrations backend/migrations/011_owned_items.{up,down}.sql and 012_event_owned_equipment.{up,down}.sql per data-model.md (one statement per file; FKs with ON DELETE CASCADE; UNIQUE(event_id, owned_item_id))
- [X] T002 [P] Domain types OwnedItem (with PlannedOnEvents) and EventOwnedEquipment (with OwnedItemName, CategoryType, QuantityOwned, IsOverOwned) in backend/internal/domain/owned.go

**Checkpoint**: Schema + types ready.

---

## Phase 2: User Story 1 — Owned gear catalog (Priority: P1) 🎯 MVP

**Goal**: CRUD catalog of owned gear, independent of the rental catalog and imports.

**Independent Test**: quickstart.md "Verify: owned catalog".

- [X] T003 [US1] Failing tests in backend/internal/db/owned_test.go: create/list (with planned_on_events count)/update/delete owned items; category_type CHECK rejected for invalid values; price-list import (UpsertInventory) leaves owned items untouched
- [X] T004 [US1] Implement List/Create/Update/DeleteOwnedItem in backend/internal/db/owned.go; make T003 pass
- [X] T005 [US1] OwnedHandler in backend/internal/api/owned.go: GET/POST /owned-items, PATCH/DELETE /owned-items/{itemID} per contracts (400 empty name/invalid type, 404 unknown id); register in backend/internal/api/router.go
- [X] T006 [US1] Endpoint tests in backend/internal/api/owned_test.go: CRUD round-trip, validation errors, 404s
- [X] T007 [P] [US1] Frontend: OwnedItem type in frontend/src/types/index.ts; typed calls in frontend/src/api/owned.ts
- [X] T008 [US1] Owned gear management UI: frontend/src/components/OwnedGearManager.tsx (add form: name/type/quantity/notes; list with inline edit + delete with confirm showing planned_on_events); Inventory page tabs "Rental catalog" | "Owned gear" in frontend/src/pages/Inventory.tsx

**Checkpoint**: MVP — owned catalog usable end-to-end.

---

## Phase 3: User Story 2 — Plan owned gear on an event (Priority: P2)

**Goal**: Per-event owned-equipment lines with over-owned flag; provably absent from rental order and export.

**Independent Test**: quickstart.md "Verify: plan owned gear".

- [X] T009 [US2] Failing tests in backend/internal/db/owned_test.go: upsert line (unique per item), quantity-0 removes, list joins name/type/owned-qty and computes is_over_owned, owned-item delete cascades lines, event delete cascades lines; **isolation**: an event with owned lines has an unchanged rental summary, and BuildRentalExport places nothing for them
- [X] T010 [US2] Implement ListEventOwnedEquipment/UpsertEventOwnedEquipment/DeleteEventOwnedEquipment in backend/internal/db/owned.go; make T009 pass
- [X] T011 [US2] Endpoints GET /events/{eventID}/owned-equipment, PUT/DELETE /events/{eventID}/owned-equipment/{ownedItemID} in backend/internal/api/owned.go per contracts (404 event/item, 400 negative quantity); endpoint tests in backend/internal/api/owned_test.go
- [X] T012 [P] [US2] Frontend: EventOwnedEquipment type + api calls in frontend/src/api/owned.ts
- [X] T013 [US2] EquipmentTab (owned section) in frontend/src/components/event/EquipmentTab.tsx: picker over owned catalog + quantity + note, list with edit/remove, red flag "exceeds owned (N)"; add Equipment tab to frontend/src/pages/EventDetail.tsx

**Checkpoint**: Owned gear plannable; order/export provably clean.

---

## Phase 4: User Story 3 — Unified extras view (Priority: P3)

**Goal**: Rented extras (manual rental lines) visible and editable on the Equipment tab.

**Independent Test**: quickstart.md "Verify: unified extras".

- [X] T014 [US3] Rented-extras section in frontend/src/components/event/EquipmentTab.tsx: manual-share lines from the rental summary (['rental-summary', eventId] query), compact add/edit/remove reusing putManualRental/deleteManualRental; mutations invalidate the shared query key so the Rental Order tab stays in sync

**Checkpoint**: One tab shows everything beyond patch + rig.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T015 [P] Docs: README.md features bullet + API table (owned-items, owned-equipment endpoints); PROJECT.md §3.2/§3.9 marked implemented; ROADMAP.md Slice 3 checked off
- [X] T016 Run quickstart.md end-to-end against the live app (catalog CRUD, event lines, order/export isolation, re-import isolation)
- [X] T017 Gate: backend vet/test/golangci-lint; frontend lint/typecheck/test/build

---

## Dependencies & Execution Order

- T001 ∥ T002 → US1 (T003→T004→T005→T006; T007 ∥ backend; T008 last)
- US2 after US1's db/api files exist (same files); T012 ∥ T009–T011
- US3 after US2's EquipmentTab exists
- Polish last

## Implementation Strategy

MVP = Phases 1–2 (owned catalog). US2 delivers the §3.9 payoff (planning
without polluting the order), US3 is view-only convenience. The isolation
tests in T009 are the contract that keeps owned gear off the renter's order
forever.

**Total**: 17 tasks (Foundational 2, US1 6, US2 5, US3 1, Polish 3).
