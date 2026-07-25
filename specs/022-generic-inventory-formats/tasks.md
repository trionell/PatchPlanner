---

description: "Task list for 022-generic-inventory-formats"
---

# Tasks: Generic Inventory Formats, Manual Entry & PDF Rental Order

**Input**: Design documents from `/specs/022-generic-inventory-formats/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. The spec makes regression guarantees that only tests can hold
(SC-003 failed imports change nothing, SC-004 manual items survive imports, SC-005 the LL
export is byte-identical, FR-014 template and parser cannot drift), and CI already gates
`go test ./...` and `npm test`.

**Organization**: Grouped by user story. Phases 1–2 are shared; Phases 3–5 are the three
stories and are independently testable once Phase 2 lands.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1 / US2 / US3 from spec.md

## Path Conventions

Web app monorepo: `backend/` (Go) and `frontend/` (React + TS), per plan.md.

---

## Phase 1: Setup

**Purpose**: Dependency and schema groundwork.

- [X] T001 Add the PDF dependency: run `go get github.com/go-pdf/fpdf@v0.9.0` in `backend/`, then confirm only `fpdf` links by checking `go list -deps ./... | grep -c barcode` prints `0`
- [X] T002 [P] Create migration `backend/migrations/040_inventory_source_format.up.sql` — `ALTER TABLE inventories ADD COLUMN source_format TEXT;` plus the deterministic backfill `UPDATE inventories SET source_format = 'll' WHERE source_xlsx IS NOT NULL;`, and the matching `040_inventory_source_format.down.sql`
- [X] T003 [P] Create migration `backend/migrations/041_inventory_items_manual.up.sql` — `ALTER TABLE inventory_items ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0;` and the matching `041_inventory_items_manual.down.sql` (no backfill needed: every existing row is imported)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The provenance columns and the manual-safe upsert. Every user story reads or
writes these, so nothing else can start until they land.

**⚠️ CRITICAL**: T007 is the correctness heart of the slice — without it, every later import
silently discontinues hand-entered items.

- [X] T004 [P] Add `SourceFormat string` to `Inventory`, `IsManual bool` to `InventoryItem`, and `Warnings []string` to `InventoryImportResult` in `backend/internal/domain/inventory.go`
- [X] T005 Extend the inventory read/write layer in `backend/internal/db/inventories.go`: select `source_format` in `GetInventory`/`ListInventories`, add a setter that records format alongside the blob (replacing or wrapping `SetInventorySourceXLSX`), and make `DuplicateInventory` copy `source_format`
- [X] T006 Select and scan `is_manual` in every inventory-item read path in `backend/internal/db/inventory.go`, and make `DuplicateInventory` in `backend/internal/db/inventories.go` copy `is_manual` per item
- [X] T007 Make `UpsertInventory` manual-safe in `backend/internal/db/inventory.go`: scope the discontinue sweep to `... WHERE inventory_id = ? AND is_manual = 0`, and add `AND is_manual = 0` to the `loadItemIDsByName` pool query so an imported row can never adopt a hand-entered row
- [X] T008 Record `source_format = 'll'` at the end of `ImportFromXLSX` in `backend/internal/service/inventory_import.go`, leaving its parsing and upsert behaviour otherwise untouched
- [X] T009 [P] Add a DB test in `backend/internal/db/inventory_test.go` proving a manual item survives a subsequent import: not discontinued, values unchanged, and a same-named imported row creates a second item rather than adopting it
- [X] T010 [P] Add a DB test in `backend/internal/db/inventories_test.go` proving `DuplicateInventory` carries `source_format` and per-item `is_manual`

**Checkpoint**: Provenance is recorded and imports no longer destroy hand-entered data. User stories can now proceed in parallel.

---

## Phase 3: User Story 1 — Populate a catalog from a generic spreadsheet (Priority: P1) 🎯 MVP

**Goal**: A user with any supplier can fill in a downloaded template and get a working catalog.

**Independent test**: Create a fresh inventory, download the template, add rows across audio /
lighting / rigging, upload it, and confirm the items appear in the catalog and in an event's
planning dropdowns — with no other story implemented.

- [X] T011 [P] [US1] Implement the template generator in `backend/internal/service/inventory_template.go`: `BuildInventoryTemplate()` producing sheet `Inventory` (bold frozen header row, sized columns, a `Type` drop-list on rows 2–1000 via excelize `NewDataValidation`/`SetDropList`) and sheet `Example` (same headers, the six sample rows and the instructions block from `contracts/generic-xlsx-format.md`)
- [X] T012 [US1] Implement the generic parser in `backend/internal/service/inventory_import_generic.go`: `ImportFromGenericXLSX(inventoryID, filename, r)` resolving sheet `Inventory` else the first sheet, locating columns by `normalizeHeader` against the alias table, validating the whole file before writing, then delegating to `db.UpsertInventory` and recording `source_filename` + `source_format = 'generic'` (no blob stored)
- [X] T013 [US1] Add a typed validation error to `backend/internal/service/inventory_import_generic.go` that accumulates every bad row and renders 1-based sheet row numbers, so one 400 reports all problems at once
- [X] T014 [US1] Make `POST /inventories/{inventoryID}/import-xlsx` (multipart field `file`) handle both formats in `backend/internal/api/inventories.go`, mapping validation errors to 400. Format detection lives in `backend/internal/service/inventory_import_detect.go` and dispatches into the two importers, neither of which is modified — see research R9
- [X] T015 [US1] Add `GET /inventory-template.xlsx` to the authenticated group in `backend/internal/api/router.go` (handler in `backend/internal/api/inventories.go`), serving the generated template with spreadsheet `Content-Type` and an attachment `Content-Disposition`
- [X] T016 [P] [US1] Write parser tests in `backend/internal/service/inventory_import_generic_test.go`: happy path; missing `Category` column rejected; a `Name` row with blank `Category` rejected with its row number; unknown `Type` rejected; header aliases; reordered and extra columns; comma-decimal and `"550 kr"` prices; blank rows skipped; first-sheet fallback; conflicting category types warn without failing
- [X] T017 [P] [US1] Write the drift-guard round-trip test in `backend/internal/service/inventory_template_test.go`: generate a template with `BuildInventoryTemplate()`, append data rows to its `Inventory` sheet, feed it to `ImportFromGenericXLSX`, and assert it imports cleanly (FR-014)
- [X] T018 [P] [US1] Write an API test in `backend/internal/api/inventories_test.go` for the generic import route and the template download, reusing the multipart helper `uploadInventoryXLSX` from `backend/internal/api/rental_export_test.go`, and asserting a rejected upload leaves the catalog unchanged
- [X] T019 [P] [US1] Add `importInventoryGenericXlsx` and the template URL to `frontend/src/api/inventories.ts`, and add `sourceFormat` / `is_manual` to the mirrored types in `frontend/src/types/index.ts`
- [X] T020 [US1] In `frontend/src/pages/Inventories.tsx` (`InventoryDetail`), provide a single "Import (.xlsx)" button covering both formats plus a "Template" download, following the existing hidden-file-input pattern; report the server-detected format in the success message
- [X] T021 [US1] Add an `onError` handler to the import mutations in `frontend/src/pages/Inventories.tsx` so failures surface in the existing red banner — today a failed import shows the user nothing, and generic-import row-numbered errors are useless unless displayed

**Checkpoint**: A user can go from an empty inventory to a planned event without any LL file.

---

## Phase 4: User Story 2 — Build and maintain a catalog by hand (Priority: P2)

**Goal**: Categories and items can be created, edited and deleted in the UI on any inventory.

**Independent test**: On a brand-new inventory with no import ever performed, add two
categories and several items, edit one, delete another, then plan an event using them.

- [X] T022 [P] [US2] Implement `CountItemReferences(db, itemID)` in `backend/internal/db/inventory.go` as a `UNION ALL` over the same eleven arms as `rentalSummaryQuery` in `backend/internal/db/rental.go`, plus `event_rentals`
- [X] T023 [US2] Implement category CRUD in `backend/internal/db/inventory.go`: create (case-insensitively unique name within the inventory), update name/type/picker_role, and delete guarded by an item count
- [X] T024 [US2] Implement item CRUD in `backend/internal/db/inventory.go`: create with `is_manual = 1`, partial update of category/name/description/quantity/price with `is_manual` immutable, and delete guarded by `CountItemReferences`
- [X] T025 [US2] Add the category routes to `backend/internal/api/inventories.go` — `POST /categories`, `PATCH /categories/{categoryID}` (extending the existing picker_role PATCH), `DELETE /categories/{categoryID}` returning 409 while non-empty — with hand-rolled validation in the style of `decodeOwnedItem` in `backend/internal/api/owned.go`
- [X] T026 [US2] Add the item routes to `backend/internal/api/inventories.go` — `POST /items`, `PATCH /items/{itemID}`, `DELETE /items/{itemID}` returning 409 with the reference count — each passing through the existing `requireInventoryItem` cross-tenant guard
- [X] T027 [P] [US2] Write API tests in `backend/internal/api/inventories_test.go` covering create/edit/delete for both resources, the 409 on a referenced item, the 409 on a non-empty category, and `is_manual` being server-set and immutable
- [X] T028 [P] [US2] Extend `backend/internal/api/cross_inventory_test.go` and `backend/internal/api/idor_regression_test.go` so every new route 404s for a non-owner and for an ID belonging to another inventory
- [X] T029 [P] [US2] Add the CRUD client functions to `frontend/src/api/inventories.ts`
- [X] T030 [US2] Add an "Add category" inline draft to the Categories card in `frontend/src/pages/Inventories.tsx`, plus per-row edit and delete controls (desktop branch only)
- [X] T031 [US2] Add an "Add item" draft bar above the items table in `frontend/src/pages/Inventories.tsx` with per-row edit and delete controls, following the draft-object pattern from `frontend/src/components/OwnedGearManager.tsx` (single `useState` draft + `editingId`, `window.confirm` for deletes) — desktop branch only, leaving the mobile branch read-only

**Checkpoint**: A catalog can be built and maintained without any file.

---

## Phase 5: User Story 3 — Send the rental order to any supplier (Priority: P2)

**Goal**: Every event exports a PDF and a spreadsheet order; the LL export appears only where earned.

**Independent test**: Plan an event against a non-LL catalog, download the PDF and the generic
spreadsheet, confirm both list every planned item with correct quantities and totals, and
confirm the LL export is neither offered nor reachable.

- [X] T032 [US3] Add `category_id` / `category_name` / `category_type` to `EventRental` in `backend/internal/domain/rental.go` and to the projection in `backend/internal/db/rental.go` via a join — **leaving `ORDER BY i.name ASC, i.id ASC` unchanged** to protect the on-screen table and `specs/013-stage-plots/rental-baseline.json`
- [X] T033 [US3] Gate the LL export in `backend/internal/service/rental_export.go` on `source_format == "ll"` rather than on the blob being non-nil, and generalize `exportFilename` to take an extension
- [X] T034 [P] [US3] Implement `BuildRentalPDF(eventID)` in `backend/internal/service/rental_pdf.go` per `contracts/generic-xlsx-format.md` §2: A4 portrait, 12mm margins, event header, category sections with subtotals, grand total, `SetHeaderFunc` for repeating column headers, `SetFooterFunc` + `AliasNbPages` for "Page N of M", and `UnicodeTranslatorFromDescriptor("cp1252")` on every string drawn — ASCII markers only, no `▲`/en dash/`·`
- [X] T035 [P] [US3] Implement `BuildGenericRentalXLSX(eventID)` in `backend/internal/service/rental_xlsx.go`: sheet `Rental order`, columns Category / Item / Description / Audio / Lighting / Total / Unit price / Subtotal, grouped by category with a totals row
- [X] T036 [US3] Add `GET /rental-export/pdf` and `GET /rental-export/xlsx` to `backend/internal/api/rental.go` as siblings of the existing `/rental-export/report`, reusing its RFC 5987 `Content-Disposition` handling
- [X] T037 [P] [US3] Write export tests in `backend/internal/api/rental_export_test.go`: the LL export returns 400 for generic and manual inventories and is unchanged for LL ones; the PDF and xlsx routes return 200 with the right `Content-Type` and filename for every inventory kind; viewers can still export
- [X] T038 [P] [US3] Write PDF tests in `backend/internal/service/rental_pdf_test.go`: output starts with `%PDF-`; a 100+ line order paginates (SC-008); an empty order and an event with no date/venue both render without panic; Swedish characters survive
- [X] T039 [P] [US3] Add the PDF and xlsx export URLs to `frontend/src/api/rentals.ts`, following the existing plain-URL `window.location.assign` pattern
- [X] T040 [US3] Replace the single export button in `frontend/src/components/event/RentalTab.tsx` with a group, showing `Export LL.xlsx` only when the event inventory's `sourceFormat === 'll'` — read from the existing `GET /events/{id}/inventory` query rather than a new endpoint

**Checkpoint**: No inventory is a dead end; the LL export is withheld where unearned.

---

## Phase 6: Polish & Cross-Cutting

- [X] T041 [P] Add Slices 20, 21 and 22 to `ROADMAP.md` (it currently stops at 19 even though 20 and 21 are merged), and reword the standing invariant on line 27 so it covers all three export formats rather than "the Excel export"
- [X] T042 [P] Update `PROJECT.md` §1 and §2.2 so the catalog is no longer described as sourced from LL.xlsx, and add a §3 entry for this slice — clearing the two follow-ups flagged in the constitution v0.4.0 SYNC IMPACT REPORT
- [X] T043 [P] Update `README.md` to document both import paths, the template download, manual entry, and all three export formats
- [X] T044 Run the backend gates: `cd backend && go vet ./... && go test ./...`
- [X] T045 Run the frontend gates: `cd frontend && npm run typecheck && npm run lint && npm test` (`typecheck` is `tsc -b`; `tsc --noEmit` checks nothing here)
- [X] T046 Walk `quickstart.md` end to end against a throwaway DB copy (`PATCHPLANNER_DB=/tmp/pp-slice22.db`), paying particular attention to §4 (manual items survive imports) and §7 (LL regression)

---

## Dependencies

```text
Phase 1 (T001-T003)  ──> Phase 2 (T004-T010)  ──┬──> Phase 3 US1 (T011-T021)
                                                 ├──> Phase 4 US2 (T022-T031)
                                                 └──> Phase 5 US3 (T032-T040)
                                                            │
                                                            └──> Phase 6 (T041-T046)
```

- **Phase 2 blocks everything.** T007 in particular must land before any manual-entry work, or
  US2's data is destroyed by US1's importer.
- **US1, US2 and US3 are independent** of each other once Phase 2 is done and can be built in
  any order. US3 reads `source_format` (T005) and US2 reads `is_manual` (T006), both
  foundational.
- Within Phase 2, T005 and T006 both touch `DuplicateInventory` — sequence them rather than
  running them in parallel.
- T020/T021 and T030/T031 all edit `frontend/src/pages/Inventories.tsx`; do not parallelise
  across those pairs.
- T044–T046 run last.

## Parallel opportunities

- **Phase 1**: T002 and T003 (different migration files).
- **Phase 2**: T004 with T009/T010 once the columns exist.
- **Phase 3**: T011 (template) and T012 (parser) are separate files and can proceed together;
  T016, T017, T018, T019 are all parallel once their subjects exist.
- **Phase 4**: T022 is independent of the CRUD work; T027, T028, T029 are parallel.
- **Phase 5**: T034 and T035 are separate builders; T037, T038, T039 are parallel.
- **Phase 6**: T041, T042, T043 are three separate documents.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That alone makes the product usable by a
technician who rents from any supplier: they can build a catalog and plan an event. Ship it,
then add US2 (hand entry, the escape hatch) and US3 (getting the order out) as increments.

If time is short, US3 before US2 is the better second increment — being able to plan but not
export is a worse dead end than being able to import but not hand-edit.
