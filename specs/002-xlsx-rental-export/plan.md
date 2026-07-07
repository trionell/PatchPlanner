# Implementation Plan: Excel Rental Order Export

**Branch**: `002-xlsx-rental-export` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-xlsx-rental-export/spec.md`

## Summary

Generate a per-event copy of the renter's `LL.xlsx` with the event's rental
quantities written into the *Antal Ljud* / *Antal Ljus* columns at each item's
recorded sheet row. The writer locates the quantity columns by header text,
clears all stale values in those two columns, verifies the equipment name at
every target row before writing (drift protection), and reports unplaceable
lines (discontinued items, mismatched rows) instead of dropping them silently.
Delivered as two endpoints — a JSON "report" preflight and the file download —
plus wiring the existing Export button on the Rental Order tab.

Everything the writer needs already exists from Slice 1: complete quantities,
real prices, per-item `xlsx_row` positions, and the `discontinued` flag.

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5.7 / React 18 (frontend)

**Primary Dependencies**: excelize v2 (already a dependency, used by the importer), chi v5; no new dependencies

**Storage**: SQLite (read-only for this feature — the export derives everything from the existing rental summary); the source `.xlsx` on disk is read-only input (`INVENTORY_PATH`, default `../LL.xlsx`)

**Testing**: Go `testing` + `httptest` on the established temp-DB harness; fixture workbooks built with excelize in-test (pattern from `inventory_import_test.go`)

**Target Platform**: Locally hosted web app; file downloaded through the browser

**Project Type**: Web application (Go REST backend + React frontend monorepo)

**Performance Goals**: Export of the ~340-row workbook with a 50-line order streams in well under 5 s (SC-004); excelize handles this in milliseconds

**Constraints**: The source file must never be modified (FR-007); only the two quantity columns may differ from the source (FR-002); no new runtime dependencies (Principle V)

**Scale/Scope**: 1 new service file, 1 extended handler, ~3 new endpoints/functions, 2 frontend files touched; single user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Domain-First Data Model | ✅ PASS | Export derives from the existing rental order model; "placement" ties order lines to catalog items' sheet positions — no free-text mapping. |
| II. Extensibility by Design | ✅ PASS | Column positions are discovered from header text, not hard-coded letters; no new enums. |
| III. Full-Stack Monorepo Architecture | ✅ PASS | REST JSON + file response under `/api/v1`; logic in `internal/service`, data access in `internal/db`. Pre-existing `internal/` layout deviation already tracked (Slice 1 plan). |
| IV. Inventory-Driven Rental Workflow | ✅ PASS | This feature *is* the export mandate: same row layout, *Antal Ljud*/*Antal Ljus* columns, submit-unmodified. |
| V. Pragmatic Simplicity | ✅ PASS | Zero new dependencies; two small endpoints; no background jobs or caching. |

**Post-design re-check (after Phase 1)**: all gates still pass.

## Project Structure

### Documentation (this feature)

```text
specs/002-xlsx-rental-export/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── export-api.md    # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── internal/
│   ├── api/
│   │   ├── rental.go              # + GET rental-export, GET rental-export/report
│   │   ├── inventory.go           # extract shared inventoryFilePath() helper
│   │   └── rental_export_test.go  # NEW: endpoint contract tests
│   ├── service/
│   │   ├── rental_export.go       # NEW: the workbook writer + report
│   │   └── rental_export_test.go  # NEW: writer round-trip / drift / stale tests
│   └── domain/
│       └── rental.go              # + RentalExportReport, UnplacedLine

frontend/
└── src/
    ├── api/
    │   ├── client.ts              # export API_BASE for the download URL
    │   └── rentals.ts             # + getRentalExportReport, rentalExportUrl
    └── components/event/
        └── RentalTab.tsx          # Export button: report → notices → download
```

**Structure Decision**: Existing layout unchanged; the writer is a sibling of
the importer in `internal/service`, sharing its fixture-workbook test pattern.

## Complexity Tracking

No new violations. The pre-existing `backend/internal/{api,db}` vs.
constitution `backend/{api,db}` layout deviation carries over from Slice 1's
plan and remains tracked in ROADMAP.md (Slice 6 / constitution amendment).
