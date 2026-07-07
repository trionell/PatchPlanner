# Tasks: Excel Rental Order Export

**Input**: Design documents from `/specs/002-xlsx-rental-export/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/export-api.md, quickstart.md

**Tests**: Included (pragmatic tier: Go tests for the writer — the money path — and the endpoint contract; Vitest not needed, frontend changes are wiring).

**Organization**: Grouped by user story. No schema changes; the foundational phase is tiny.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = submit-ready file, US2 = no silent omissions, US3 = UI wiring

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Extract a shared inventoryFilePath() helper (INVENTORY_PATH env, default ../LL.xlsx) in backend/internal/api/inventory.go and use it in importXLSX; the export handlers will reuse it

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 Add RentalExportReport and UnplacedLine types (fields per data-model.md, reasons discontinued/row_mismatch/no_row) to backend/internal/domain/rental.go
- [X] T003 Create the export fixture helper in backend/internal/service/rental_export_test.go: build a workbook in the renter's layout (header row 2 with "Antal Ljud"/"Antal Ljus" incl. newline-in-header variant, category rows, item rows, one stale leftover quantity) reusing the writeFixtureXLSX pattern; seed catalog via InventoryService.ImportFromXLSX

**Checkpoint**: Types + test scaffolding ready.

---

## Phase 3: User Story 1 — Submit-ready order file (Priority: P1) 🎯 MVP

**Goal**: One call produces a copy of LL.xlsx with the event's quantities at the right rows and nothing else changed.

**Independent Test**: quickstart.md "Verify: submit-ready file" — plan, export, diff against source shows only the two quantity columns changed.

### Tests for User Story 1

- [X] T004 [US1] Failing tests in backend/internal/service/rental_export_test.go: (a) quantities land at each item's row in the correct column (audio vs lighting, merged line writes both); (b) stale quantities anywhere in the columns are cleared; (c) no cell outside the two columns differs from the source (iterate rows/cells and compare); (d) empty order exports a clean copy; (e) header columns located by normalized text, error when a quantity header is missing; (f) source file on disk is byte-identical after export
- [X] T005 [P] [US1] Failing round-trip test in backend/internal/service/rental_export_test.go: re-import the exported bytes → catalog unchanged (same ids/prices), per research.md R7

### Implementation for User Story 1

- [X] T006 [US1] Implement the writer in backend/internal/service/rental_export.go: ExportService.BuildRentalExport(eventID) (*excelize.File, domain.RentalExportReport, error) — load summary via db.GetRentalSummary, open workbook, locate columns by normalized header text (R1), clear both columns below header (R3), place lines per data-model.md rules (R2), build filename from event name/date sanitized per R6; make T004/T005 pass
- [X] T007 [US1] Register GET /events/{eventID}/rental-export in backend/internal/api/rental.go: stream the workbook with xlsx content type and RFC 5987 Content-Disposition; 404 unknown event, 500 with JSON error when the source file or headers are missing (no partial file)
- [X] T008 [US1] Endpoint test in backend/internal/api/rental_export_test.go: 200 with attachment headers and openable xlsx body for a planned event; 404 for unknown event; 500 (JSON error, no attachment) when INVENTORY_PATH points nowhere

**Checkpoint**: MVP — a submit-ready file downloads via curl.

---

## Phase 4: User Story 2 — No silent omissions (Priority: P2)

**Goal**: Unplaceable lines are reported (discontinued / drifted rows), never silently dropped; placement is name-verified.

**Independent Test**: quickstart.md "Verify: no silent omissions".

### Tests for User Story 2

- [X] T009 [US2] Failing tests in backend/internal/service/rental_export_test.go: (a) discontinued item with quantities → unplaced with reason discontinued, file still contains all other lines; (b) item whose column-A name at xlsx_row differs from the catalog name → row untouched, reason row_mismatch; (c) item with xlsx_row 0 → reason no_row; (d) fully placeable order → empty unplaced_lines and placed_lines count correct

### Implementation for User Story 2

- [X] T010 [US2] Ensure the writer from T006 fully implements the unplaced-report semantics to make T009 pass (skip-and-report on discontinued/no_row/mismatch; placed_lines counter)
- [X] T011 [US2] Register GET /events/{eventID}/rental-export/report in backend/internal/api/rental.go returning the JSON report per contracts/export-api.md; extend backend/internal/api/rental_export_test.go with a report contract test (unplaced discontinued line appears with reason; [] when clean)

**Checkpoint**: Export is trustworthy — everything is either in the file or in the report.

---

## Phase 5: User Story 3 — Export from the Rental Order tab (Priority: P3)

**Goal**: The Export button downloads the file and surfaces notices.

**Independent Test**: quickstart.md US1/US2 UI steps — click Export, file downloads with event filename; unplaced notices render; failure shows an error.

### Implementation for User Story 3

- [X] T012 [P] [US3] Export API_BASE from frontend/src/api/client.ts; add getRentalExportReport(eventId) and rentalExportUrl(eventId) to frontend/src/api/rentals.ts; mirror RentalExportReport/UnplacedLine in frontend/src/types/index.ts
- [X] T013 [US3] Wire the Export button in frontend/src/components/event/RentalTab.tsx: on click fetch the report, store notices in state, render unplaced-line notices (amber box listing name, quantities, reason) and errors, then trigger the download via a hidden anchor to rentalExportUrl; replace the "coming soon" toast
- [X] T014 [US3] Verify the UI flow in the running app per quickstart.md (download, notices, error case)

**Checkpoint**: All stories functional end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 [P] Update README.md: API table rows for the two new endpoints; Rental Order feature bullet mentions the export; PROJECT.md §3.1 marked implemented
- [X] T016 Run full quickstart.md validation end-to-end against the real LL.xlsx (submit-ready diff, omissions, failure, round-trip)
- [X] T017 Gate check: cd backend && go vet ./... && go test ./... && golangci-lint run ./...; cd frontend && npm run lint && npm run typecheck && npm test && npm run build

---

## Dependencies & Execution Order

- **Setup (T001)** and **Foundational (T002–T003)**: first; T002 ∥ T003 after T001
- **US1 (T004–T008)**: after Phase 2; T004 ∥ T005; T006 makes them pass; T007→T008
- **US2 (T009–T011)**: after T006 (same writer file); mostly report-shaping on top of US1
- **US3 (T012–T014)**: after T011 (needs the report endpoint); T012 parallel with backend work
- **Polish (T015–T017)**: last; T015 parallel with T016

### Parallel Opportunities

- T002 ∥ T003; T004 ∥ T005; T012 ∥ (T009–T011)

---

## Implementation Strategy

MVP is Phases 1–3 (T001–T008): a correct, submit-ready file via curl. US2
hardens trust, US3 makes it one click. The writer (T006) is deliberately one
function shared by both endpoints — the report is just the writer with the
bytes discarded.

**Total**: 17 tasks (Setup 1, Foundational 2, US1 5, US2 3, US3 3, Polish 3).
