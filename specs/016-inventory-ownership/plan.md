# Implementation Plan: Inventory Ownership & Duplication

**Branch**: `016-inventory-ownership` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-inventory-ownership/spec.md`

## Summary

Every user gets their own `inventories` (a personal catalog of equipment,
prices, and stock), auto-provisioned on first sign-in via one idempotent
function that also handles claiming the single pre-existing global catalog
for whoever logs in first after this ships (research.md R4). Events pick
one inventory at creation, permanently. Direct catalog management
(create/rename/delete/duplicate/import/edit items) is owner-only, behind a
new `RequireInventoryOwner` middleware; reading an inventory's contents
*through* an event — what every existing planning picker actually does —
needs **no new authorization code at all**, since Slice 15's
`RequireEventAccess` already grants any role a GET, and the picker read
path is just a new pair of event-scoped routes that resolve the event's
bound inventory server-side (research.md R3). None of the 11 existing
tables that reference `inventory_items(id)` need a schema change — item
ids stay globally unique regardless of which inventory owns them — but
every one of their create/update handlers gains one call to a new,
reusable cross-inventory validation helper (research.md R6), closing the
one new integrity gap this slice introduces (an event picking equipment
from an inventory it isn't bound to). The biggest hidden discovery: the
existing import/export mechanism reads a single fixed server-side file
path (`INVENTORY_PATH`/`../LL.xlsx`) with no per-request upload at all —
fundamentally incompatible with per-user catalogs — so import becomes a
multipart upload storing the file's bytes as a BLOB on the `inventories`
row itself, and export resolves the correct template from there instead
of a disk path (research.md R1/R2).

## Technical Context

**Language/Version**: Go 1.25.0 (backend), TypeScript 5 / React 18
(frontend) — unchanged.

**Primary Dependencies**: none new. `excelize.OpenReader` (an existing
function in the already-used `github.com/xuri/excelize/v2` library) replaces
`excelize.OpenFile` for both import and export — no new package.

**Storage**: SQLite — migration `038_inventory_ownership` adds the
`inventories` table (including a `source_xlsx BLOB` column for the
uploaded price-list file — keeps Principle V's "SQLite is the only
database" intact rather than introducing a file-storage layer) and two FK
columns (`inventory_categories.inventory_id`, `inventory_items.inventory_id`
— both NOT NULL, backfilled to one deterministic bootstrap row —
`events.inventory_id`, nullable, same backfill). See data-model.md.

**Testing**: Go `testing` + `httptest`, matching project convention —
new `db/inventories_test.go`, `api/middleware/inventory_access_test.go`,
`api/inventories_test.go`, extended `service/inventory_import_test.go`
(now testing the `io.Reader` signature) and `internal/api/rental_export_test.go`
(export resolving the event's bound inventory's stored template instead of
a disk path). Vitest for the frontend "my inventories" page and the
picker-source-swap (existing components now call the event-scoped
endpoint) — mostly covered by existing component tests continuing to
pass once their data source changes shape-compatibly.

**Target Platform**: unchanged.

**Project Type**: Web application (backend + frontend).

**Constraints**: Never touch the live dev DB ([[db-safety-rule]]) — the
legacy-inventory bootstrap (creating the one `inventories` row, backfilling
every existing category/item/event, and reading the current `INVENTORY_PATH`
file into `source_xlsx`) must be verified against a copy first, confirming
byte-for-byte unchanged catalog contents and unchanged rental totals for
every existing event. `UpsertInventory` and every other previously-global
query in `internal/db/inventory.go` must gain an `inventory_id` filter —
verified by a test asserting one user's re-import never discontinues
another user's items.

**Scale/Scope**: 1 SQL migration (1 new table + 2 new FK columns) + 1
one-time Go conversion (reading the legacy template file into the
bootstrap row, sequenced in `db.go` per the Slices 11–13 pattern); 1 new
middleware (`RequireInventoryOwner`, owner-only, no role gradient); 2 new
event-scoped read-only routes reusing the existing `RequireEventAccess`
gate; ~11 existing handler files each gain one call to a new shared
validation helper (research.md R6) — mechanical, bounded, no schema
change; import/export change from fixed-path to per-inventory-blob
(research.md R1/R2); frontend gains a "My Inventories" management page
and an inventory picker in event creation, and every existing picker
component switches its data source from the old global endpoint to the
new event-scoped one.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No amendment needed (confirmed in research.md).

- **I. Domain-First Data Model** — PASS. `inventories` is a first-class
  entity with a real relationship to its categories/items/events, not a
  bolted-on field.
- **II. Extensibility by Design** — PASS, unaffected — new inventory
  *categories* from a re-imported price list still require no code
  change, exactly as before; this slice changes *who owns* a catalog, not
  how catalog data is structured.
- **III. Full-Stack Monorepo Architecture** — PASS. New code lands in the
  existing `backend/internal/{api,db,domain,service}` and
  `frontend/src/{pages,components,api}` trees;
  `api/middleware/inventory_access.go` is a second/third file in the
  `middleware` subpackage the Slice 14 constitution amendment already
  canonicalized.
- **IV. Inventory-Driven Rental Workflow** — PASS. "Every piece of rented
  equipment MUST reference an inventory item" and "the export feature
  MUST write quantities back into the LL.xlsx template" both hold
  unchanged — now per-owner-inventory instead of one global catalog, an
  extension of the principle's intent, not a violation of its text.
- **V. Pragmatic Simplicity** — PASS. Storing the uploaded template as a
  BLOB column (not a new file-storage service) keeps "SQLite is the only
  database" intact; the cross-inventory validation helper (research.md
  R6) is a single reusable function, not a new abstraction layer.

**Post-design re-check (Phase 1)**: PASS — data-model.md and the API
contract introduce nothing beyond the one table, two columns, and the
`excelize.OpenReader` swap already justified above.

## Project Structure

### Documentation (this feature)

```text
specs/016-inventory-ownership/
├── plan.md                        # This file
├── research.md                    # Phase 0 output
├── data-model.md                  # Phase 1 output
├── contracts/
│   └── inventory-api.md           # Phase 1 output
├── checklists/requirements.md     # Spec quality checklist (passing)
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 038_inventory_ownership.up.sql    # NEW — inventories table,
│   │                                      #      inventory_categories/items/events FK columns,
│   │                                      #      deterministic legacy backfill (research.md R5)
│   └── 038_inventory_ownership.down.sql
└── internal/
    ├── domain/
    │   └── inventory.go                  # EDITED — + Inventory struct;
    │                                      #          InventoryCategory/Item gain InventoryID
    ├── db/
    │   ├── inventories.go                # NEW — CreateInventory, ListInventoriesForOwner,
    │   │                                  #       GetInventory, RenameInventory, DeleteInventory
    │   │                                  #       (blocks if in use), DuplicateInventory
    │   │                                  #       (categories+items+fixture_modes+source file),
    │   │                                  #       EnsureUserHasInventory (research.md R4),
    │   │                                  #       ItemBelongsToInventory (research.md R6)
    │   ├── inventories_test.go            # NEW
    │   ├── inventory.go                   # EDITED — every query gains inventory_id scoping;
    │   │                                  #          UpsertInventory only discontinues/matches
    │   │                                  #          within its own inventory_id
    │   ├── inventory_legacy_migration.go  # NEW — one-time Go conversion: reads INVENTORY_PATH
    │   │                                  #       into the bootstrap row's source_xlsx (research.md R5)
    │   ├── inventory_legacy_migration_test.go  # NEW
    │   ├── db.go                          # sequence conversion at version 038
    │   ├── events.go                      # EDITED — CreateEvent takes inventoryID; validates ownership
    │   └── rental.go                      # unchanged (research.md — item ids stay globally
    │                                      #  unique, no CTE change needed; R6's validation is
    │                                      #  a write-time check elsewhere, not a read-time join fix)
    └── api/
        ├── middleware/
        │   ├── inventory_access.go        # NEW — RequireInventoryOwner (owner-only, no role gradient)
        │   └── inventory_access_test.go    # NEW
        ├── router.go                       # EDITED — /inventories/{inventoryID} group behind
        │                                  #          RequireInventoryOwner; two new
        │                                  #          /events/{eventID}/inventory/... GETs behind
        │                                  #          the existing RequireEventAccess group
        ├── inventories.go                  # NEW — InventoriesHandler: CRUD, duplicate,
        │                                  #        import-xlsx (multipart), fixture-modes
        ├── inventories_test.go             # NEW
        ├── inventory.go                    # EDITED — old global handler removed/replaced;
        │                                  #          new EventInventoryHandler for the
        │                                  #          two read-only /events/{id}/inventory/... routes
        ├── auth.go                         # EDITED — callback also calls
        │                                  #          db.EnsureUserHasInventory after
        │                                  #          db.ClaimOwnerlessEvents
        ├── events.go                       # EDITED — create requires+validates inventoryId
        └── rental.go                       # EDITED — export handlers resolve the event's
                                            #          bound inventory's source_xlsx instead
                                            #          of inventoryFilePath() (research.md R2)

    service/
    ├── inventory_import.go                # EDITED — ImportFromXLSX(io.Reader) not (path string)
    └── inventory_import_test.go           # EDITED — exercises the new signature

    # Cross-cutting, mechanical (research.md R6) — one call added to each:
    api/audio_patch.go        # stagebox/stage-multi/input-source/input-device/input-cable create+update
    api/lighting.go           # fixture create+update
    api/rental.go             # manual rental line create+update (in addition to the export change above)
    api/stage_plots.go        # (via plot_trusses.go) truss piece create+update

frontend/src/
├── types/index.ts                     # + Inventory type; Event gains inventoryId
├── api/
│   ├── inventories.ts                  # NEW — list/create/rename/delete/duplicate mine,
│   │                                  #        category/item CRUD, import (FormData upload)
│   └── events.ts                      # EDITED — createEvent requires inventoryId
├── pages/
│   ├── Inventories.tsx                 # NEW — "My Inventories": list/create/duplicate/rename
│   │                                  #        (existing Inventory.tsx's item/category UI
│   │                                  #        moves here, scoped to a selected inventory)
│   └── Events.tsx / Dashboard.tsx      # EDITED — event creation dialog gains inventory picker
└── components/event/                   # EDITED (data-source swap only, no new UI logic) —
                                        # every picker component (StageboxMultiManager,
                                        # SourceSection, InputDeviceSection, ProcessingDeviceSection,
                                        # TrueOutputDeviceSection, LightingTab, PlotTrussManager,
                                        # RentalTab/EquipmentTab) switches its item-list query
                                        # from the old global endpoint to
                                        # GET /events/{eventId}/inventory/items
```

**Structure Decision**: Web application layout per constitution — all
changes land in the existing `backend/` and `frontend/` trees, confirmed
against the actual current inventory code (`internal/db/inventory.go`,
`internal/api/inventory.go`, `internal/service/inventory_import.go`) and
the full FK blast-radius map (11 existing tables, none needing schema
changes). `api/middleware/inventory_access.go` follows the `RequireAuth`/
`RequireEventAccess` precedent exactly; the event-scoped read-only
inventory routes deliberately reuse `RequireEventAccess` rather than
inventing a second access-control mechanism for the same data.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Storing the uploaded XLSX as a BLOB column on `inventories` | The existing import/export mechanism reads one fixed disk path; multi-tenant catalogs need each inventory's own source file, and `xlsx_row` values are only meaningful relative to the exact file they came from | A per-inventory file on disk — rejected: adds a file-storage/backup/cleanup concern for no benefit over a BLOB column, when SQLite already holds everything else and the file is small (a spreadsheet, not a media asset) |
| One reusable cross-inventory validation helper called from ~11 existing handler files, rather than a schema-level constraint | SQLite can't declaratively express "this FK's target must share a property with a value reached via a different table's FK"; a Go-level check at the point of assignment is this project's established pattern for comparable cross-entity invariants (e.g. Slice 9's width-consistency checks) | A trigger-based or composite-FK constraint — rejected: not cleanly expressible in SQLite for this shape of invariant, and would be far harder to give a clear 400 error message from than an explicit application-level check |
| Reusing `RequireEventAccess` (Slice 15) for the event-scoped inventory-read routes instead of a unified inventory-access middleware | The picker-facing read path's authorization rule ("any role on the event") is already exactly what `RequireEventAccess` grants for GET — inventing a second mechanism to express the same rule would be pure duplication | A single `RequireInventoryAccess` deriving role-through-events itself — rejected: more code to express a rule the existing middleware already enforces correctly one layer up |
