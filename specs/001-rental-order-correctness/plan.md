# Implementation Plan: Rental Order Correctness

**Branch**: `001-rental-order-correctness` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-rental-order-correctness/spec.md`

## Summary

Make the auto-derived rental order complete and safe: (1) turn the free-text
`mic_model` on audio input rows into a real inventory reference with a
name-match backfill; (2) extend the rental summary aggregation to count every
inventory-linked item in the plan (mics/DI/IEM, stageboxes, stage multis, amps,
speakers, fixtures) plus manual lines; (3) add a write API + UI for manual
rental lines (`event_rentals` exists but is unreachable); (4) add stock
validation flags per line; (5) replace the destructive catalog re-import
(currently deletes fixtures/outputs/rentals across all events) with an upsert
that preserves item identity by name.

Technical approach: three small SQLite migrations (mic reference column,
backfill, `discontinued` flag on inventory items), a rewritten
`ReplaceInventory` that upserts by case-insensitive name with list-position
fallback, an extended rental-summary CTE with stock joins, two new manual-line
endpoints, and frontend changes confined to the mic dropdown and the Rental
Order tab. Go `httptest` coverage for the aggregation, manual lines, and the
import round-trip.

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5.7 / React 18 (frontend)

**Primary Dependencies**: chi v5, modernc.org/sqlite (pure Go), golang-migrate v4, excelize v2; Vite, TanStack Query v5, Tailwind v3

**Storage**: SQLite single file (`patchplanner.db`), migrations applied on startup

**Testing**: Go standard `testing` + `httptest` (introduced by this feature — none exist today); frontend logic unchanged enough that no Vitest is required for this slice

**Target Platform**: Locally hosted web app (localhost:7331 API + Vite dev server), Linux/macOS/Windows

**Project Type**: Web application (Go REST backend + React frontend monorepo)

**Performance Goals**: Interactive UI feel; rental summary for a large event (100 patch rows, 100 fixtures) computed in a single query, well under 100 ms

**Constraints**: Single-user local tool, no auth; migrations must be one statement per file (established project convention for the golang-migrate sqlite driver); no new runtime dependencies

**Scale/Scope**: ~300 catalog items, tens of events, patch sheets of 40–80 rows; 3 migrations, ~6 backend files touched, 2 frontend surfaces touched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Domain-First Data Model | ✅ PASS | Strengthens it: mic/DI/IEM becomes a first-class reference to a catalog item instead of free text; rental lines become traversable to inventory. |
| II. Extensibility by Design | ✅ PASS | No new hard-coded enums introduced. (Existing enum/CHECK violations are pre-existing and scheduled for the `reference-data` feature per ROADMAP.md Slice 4 — not expanded here.) |
| III. Full-Stack Monorepo Architecture | ✅ PASS | No structural change; REST JSON under `/api/v1`; migrations versioned & auto-applied. Pre-existing deviation noted in Complexity Tracking (package layout). |
| IV. Inventory-Driven Rental Workflow | ✅ PASS | This feature *implements* the principle: every rented item referenced from the catalog, quantities validated against stock. |
| V. Pragmatic Simplicity | ✅ PASS | No new dependencies, no new layers; one new flag column instead of an item-versioning scheme. |

**Post-design re-check (after Phase 1)**: all gates still pass; no new
violations introduced by the data model or contracts.

## Project Structure

### Documentation (this feature)

```text
specs/001-rental-order-correctness/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── rental-api.md    # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── cmd/main.go
├── internal/
│   ├── api/
│   │   ├── audio_patch.go        # mic_item_id in input payloads
│   │   ├── rental.go             # + manual line endpoints
│   │   └── inventory.go          # unchanged routes; import behavior changes
│   ├── db/
│   │   ├── audio_patch.go        # scan/persist mic_item_id + legacy label
│   │   ├── rental.go             # extended aggregation CTE + stock join
│   │   ├── rental_test.go        # NEW: aggregation + manual lines tests
│   │   ├── inventory.go          # ReplaceInventory → UpsertInventory
│   │   ├── inventory_test.go     # NEW: import round-trip / preservation tests
│   │   └── testutil_test.go      # NEW: temp-DB + migrations helper
│   ├── domain/
│   │   ├── audio.go              # MicItemID, MicLabel fields
│   │   ├── inventory.go          # Discontinued field
│   │   └── rental.go             # stock/availability fields, manual quantities
│   └── service/
│       └── inventory_import.go   # unchanged parsing; calls upsert
├── migrations/
│   ├── 008_input_mic_item.up.sql / .down.sql
│   ├── 009_input_mic_backfill.up.sql / .down.sql
│   └── 010_inventory_discontinued.up.sql / .down.sql

frontend/
└── src/
    ├── api/
    │   ├── audioPatch.ts         # type updates
    │   └── rentals.ts            # manual line calls
    ├── pages/EventDetail.tsx     # mic select by id; Rental tab: manual lines,
    │                             # stock flags (split into components in Slice 0
    │                             # of ROADMAP.md if that lands first)
    └── types/index.ts            # mirror domain changes
```

**Structure Decision**: Existing web-application monorepo layout is kept
exactly as-is (`backend/` Go + `frontend/` React). All backend changes live in
the already-established `internal/{api,db,domain,service}` packages; no new
packages are needed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Package layout is `backend/internal/api` + `backend/internal/db`, while Constitution III prescribes `backend/api/` + `backend/db/` | Pre-existing layout from initial implementation; this feature follows it for consistency | Relocating packages mid-feature churns every import for zero behavior gain; a dedicated restructuring (or constitution amendment to bless `internal/`) is tracked in ROADMAP.md Slice 0/6 |
| Legacy `mic_model` text column is kept alongside the new `mic_item_id` reference | FR-002: unmatched historical names must stay visible and must not be silently discarded | Dropping the column loses user data; migrating text into `notes` pollutes an unrelated field |
