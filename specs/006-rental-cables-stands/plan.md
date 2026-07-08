# Implementation Plan: Rental Completeness — Cables & Stands from Inventory

**Branch**: `006-rental-cables-stands` | **Date**: 2026-07-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-rental-cables-stands/spec.md`

## Summary

Cable and stand choices on audio patch rows become picks of concrete inventory
items (FK columns `cable_item_id` / `stand_item_id`), replacing the vocabulary
cable-type + free-typed length and the disconnected stand vocabulary. Which
catalog categories feed the pickers is data (`picker_role` on
`inventory_categories`, seeded by migration, editable via a small PATCH). The
rental summary CTE gains three arms so every pick is counted, priced,
stock-validated, and exported to LL.xlsx through the existing pipeline with
zero writer changes. Existing rows are backfilled conservatively (only the
unambiguous XLR + exact-length case converts); everything else keeps its old
values as read-only legacy display, following the shipped `mic_item_id` /
`mic_model` pattern.

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi router, `modernc.org/sqlite`, golang-migrate,
excelize (existing); TanStack Query, Tailwind (existing). **No new dependencies.**

**Storage**: SQLite — migration 019 (`ALTER TABLE ADD COLUMN` ×4 + role seed +
conservative backfill; no table rebuilds)

**Testing**: Go `httptest` (rental aggregation, role filter/PATCH, patch CRUD
legacy-clearing), one focused backfill test on a temp DB; Vitest updates for
sheet/signal-flow label rules

**Target Platform**: Local web app (Linux dev), backend :7331 / Vite :5173

**Project Type**: Web application (Go REST API + React SPA monorepo)

**Performance Goals**: Rental summary stays a single query; pickers are two
cached list queries — no measurable change

**Constraints**: Never touch the user's live dev DB (migration verified on a
copy); LL.xlsx source file is read-only; export round-trip guarantee must hold

**Scale/Scope**: 1 migration, ~4 backend files touched + tests, ~8 frontend
files touched + 2 test files; no new endpoints (one query param + one PATCH
on an existing resource)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Data Model — PASS.** The cable run and stand become
  first-class references to catalog items (mic → **cable item** → stagebox →
  console), replacing free-text/number fields; exactly the traversable-
  connection requirement.
- **II. Extensibility by Design — PASS.** Which categories are cables/stands
  is a data attribute (`picker_role`), seeded and user-editable — no
  hard-coded category names in logic. Vocabulary management from slice 4 is
  untouched; the demoted vocabularies remain configurable data.
- **III. Full-Stack Monorepo Architecture — PASS.** Versioned migration,
  REST JSON on existing resources, no layout changes. (Pre-existing layout
  deviation noted in Complexity Tracking.)
- **IV. Inventory-Driven Rental Workflow — PASS (this slice is Principle IV).**
  Cables/stands become inventory references, validated against stock, exported
  into the unmodified LL.xlsx template via existing placement.
- **V. Pragmatic Simplicity — PASS.** No new dependencies or endpoints; three
  CTE arms, one query param, reuse of the proven legacy-label pattern;
  conservative backfill instead of clever matching.

**Post-design re-check (after Phase 1): PASS** — design artifacts introduce no
new violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-rental-cables-stands/
├── plan.md              # This file
├── research.md          # R1 roles, R2 row columns, R3 backfill, R4 rental CTE, R5 API/UI, R6 testing
├── data-model.md        # Schema changes, JSON changes, derivation rules
├── quickstart.md        # Manual verification §1–§3 + automated gates
├── contracts/
│   └── cables-stands-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 019_cable_stand_items.up.sql      # NEW: picker_role, item FK columns, seed, backfill
│   └── 019_cable_stand_items.down.sql    # NEW
└── internal/
    ├── domain/
    │   ├── inventory.go                  # InventoryCategory.PickerRole
    │   └── audio.go                      # CableItemID/StandItemID on input & output
    ├── db/
    │   ├── inventory.go                  # role filter in ListInventoryItems; UpdateCategoryPickerRole; category listing incl. role
    │   ├── audio_patch.go                # new columns in CRUD; clear-legacy-on-pick CASE
    │   └── rental.go                     # three new CTE arms
    └── api/
        ├── inventory.go                  # ?role= param; PATCH /inventory/categories/{id}
        ├── inventory_test.go             # role filter + PATCH tests
        ├── audio_patch_test.go           # new-field round-trip, legacy clearing
        └── rental_test.go                # cable/stand aggregation cases
        (+ focused backfill test on a temp DB)

frontend/src/
├── types/index.ts                        # new fields; picker_role on category
├── api/inventory.ts                      # role param; PATCH category
├── components/
│   ├── event/
│   │   ├── AudioInputsTab.tsx            # cable + stand pickers, legacy display
│   │   └── AudioOutputsTab.tsx           # cable picker, legacy display
│   ├── print/
│   │   ├── InputPatchSheet.tsx           # Cable/Stand columns show item labels
│   │   ├── OutputPatchSheet.tsx          # Cable column shows item label
│   │   └── printSheets.test.tsx          # updated expectations
│   └── event/SignalFlowTab.tsx           # cable hop from item label
├── lib/
│   ├── signalFlow.ts                     # cable hop: pick > legacy > absent
│   └── signalFlow.test.ts               # updated cases
└── pages/Inventory.tsx                   # per-category role selector
```

**Structure Decision**: Existing monorepo layout; all changes land in the
files above. One new migration pair; no new packages, routes files, or
frontend directories.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Pre-existing: Go packages live under `backend/internal/{api,db,domain,service}` instead of the constitution's `backend/{api,db}` + `internal/` split | Layout predates the constitution check and is consistent across the codebase; this slice follows it | Relocating packages mid-feature churns every import for zero behavior change; a dedicated restructuring was descoped with the dropped packaging slice — deviation stays documented here |
