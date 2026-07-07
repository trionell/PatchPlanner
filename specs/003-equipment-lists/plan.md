# Implementation Plan: Equipment Lists — Owned Gear & Event Extras

**Branch**: `003-equipment-lists` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-equipment-lists/spec.md`

## Summary

Two new tables (`owned_items` catalog, `event_owned_equipment` lines with
`UNIQUE(event, item)` and cascade deletes), CRUD + item-addressed upsert APIs
mirroring the manual-rental-line pattern, an Owned gear tab on the Inventory
page, and an Equipment tab on the event page combining the owned-gear editor
with the existing rented extras (manual rental lines — same storage, second
view). The rental order and export are untouched by construction: owned gear
lives in separate tables the summary CTE never reads.

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5.7 / React 18 (frontend)

**Primary Dependencies**: chi v5, modernc SQLite, golang-migrate; TanStack Query — no new dependencies

**Storage**: SQLite; migrations 011 (owned_items) and 012 (event_owned_equipment), one statement per file

**Testing**: Go `testing`/`httptest` on the existing harness (owned CRUD, event lines, isolation from rental order/export/import); no new frontend logic worth Vitest

**Target Platform / Project Type**: Locally hosted web app, monorepo

**Performance Goals / Constraints**: Trivial data volumes (tens of owned items); no new dependencies (Principle V)

**Scale/Scope**: 2 migrations, 1 new db file, 1 new api file, 2 domain types, 1 new event tab, 1 Inventory-page tab

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Domain-First Data Model | ✅ PASS | Owned gear and event lines are first-class entities with real references — no free-text gear. |
| II. Extensibility by Design | ✅ PASS | Equipment type reuses the existing category-type vocabulary (CHECK mirrors `inventory_categories`); no new hard-coded enums beyond it. Full reference-data migration remains Slice 4. |
| III. Full-Stack Monorepo Architecture | ✅ PASS | Versioned migrations, REST JSON, established package layout (deviation already tracked). |
| IV. Inventory-Driven Rental Workflow | ✅ PASS | Implements the constitution's carve-out: "Owned or generic equipment MAY be tracked outside the rental catalog without export constraints." Rental order/export provably unaffected (tested). |
| V. Pragmatic Simplicity | ✅ PASS | Mirrors existing patterns (upsert-by-item API, reference-clearing deletes); no speculative availability engine. |

**Post-design re-check**: all gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/003-equipment-lists/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/owned-gear-api.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── migrations/011_owned_items.{up,down}.sql
├── migrations/012_event_owned_equipment.{up,down}.sql
├── internal/
│   ├── domain/owned.go            # NEW: OwnedItem, EventOwnedEquipment
│   ├── db/owned.go                # NEW: catalog CRUD + event line upsert/list/delete
│   ├── db/owned_test.go           # NEW
│   ├── api/owned.go               # NEW: /owned-items + /events/{id}/owned-equipment
│   ├── api/owned_test.go          # NEW
│   └── api/router.go              # register OwnedHandler

frontend/src/
├── types/index.ts                 # OwnedItem, EventOwnedEquipment
├── api/owned.ts                   # NEW: typed calls
├── pages/Inventory.tsx            # tabs: Rental catalog | Owned gear
├── components/OwnedGearManager.tsx# NEW: catalog CRUD UI
├── components/event/EquipmentTab.tsx # NEW: owned lines + rented extras
└── pages/EventDetail.tsx          # add Equipment tab
```

**Structure Decision**: One new resource follows the exact conventions of the
existing ones (handler struct + Register, db functions, domain structs).

## Complexity Tracking

No new violations; pre-existing `internal/` layout deviation carries over
(tracked in ROADMAP.md).
