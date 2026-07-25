# Implementation Plan: Generic Inventory Formats, Manual Entry & PDF Rental Order

**Branch**: `022-generic-inventory-formats` | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-generic-inventory-formats/spec.md`

## Summary

PatchPlanner can only populate a catalog from one supplier's `LL.xlsx` price list, and can
only export a rental order back into that same file. This slice makes both ends
supplier-neutral without disturbing the LL path.

Three additions, in priority order:

1. **Generic spreadsheet import** — a flat one-item-per-row format
   (`Category | Type | Name | Description | Quantity | Price`), parsed by header text rather
   than column position, plus a server-generated blank template with a Type drop-list and a
   worked example sheet. A round-trip test binds the template to the parser.
2. **Manual inventory management** — owner-only CRUD for categories and items on any
   inventory, with hand-entered items protected from the import's discontinue sweep and
   delete refused while an item is referenced by a plan.
3. **Format-aware export** — the LL export is gated on a new `source_format = 'll'`
   discriminator (hidden in the UI, refused by the API otherwise), and every inventory gains
   a category-grouped PDF order and a plain spreadsheet order.

The design leans almost entirely on existing machinery: `UpsertInventory` for non-destructive
catalog updates, `normalizeHeader`/`atoi`/`atof` for tolerant parsing, `RequireInventoryOwner`
and `RequireEventAccess` for permissions, and the rental summary's UNION arms for both
category grouping and delete safety. The only genuinely new capability is PDF rendering.

## Technical Context

**Language/Version**: Go 1.25 (backend), TypeScript 5.7 + React 18 (frontend)

**Primary Dependencies**: Existing — chi, `modernc.org/sqlite`, `golang-migrate`,
`xuri/excelize/v2`, TanStack Query, Tailwind, `lucide-react`. **One new**:
`github.com/go-pdf/fpdf v0.9.0` (see Complexity Tracking).

**Storage**: SQLite. Two additive migrations — `040` adds `inventories.source_format`,
`041` adds `inventory_items.is_manual`. Both are `ALTER TABLE ... ADD COLUMN` plus a
deterministic backfill; no data is moved or destroyed.

**Testing**: Go standard `testing` + `httptest` (backend, tests beside the code in-package);
Vitest for pure frontend logic. Both gates run in CI (`.github/workflows/ci.yml`).

**Target Platform**: Linux server, single embedded binary; modern browsers.

**Project Type**: Web application in the existing `backend/` + `frontend/` monorepo.

**Performance Goals**: An import of a few hundred rows and a PDF of at least 100 lines
(SC-008) must feel instant — both are single-pass, in-memory operations. The rental summary
gains three columns from one extra join, not a second query.

**Constraints**:

- The LL import and LL export must be behaviourally unchanged (FR-023, SC-005). The generic
  importer is a *separate* service function and a *separate* route; the LL parser is not
  touched.
- The PDF uses built-in Helvetica with a cp1252 translator, so **every glyph drawn must be
  cp1252-representable** — ASCII markers only (`*`), no `▲`, no en dashes, no `·`.
- New editing UI is desktop-only, matching the mobile contract's treatment of rare setup
  actions; mobile inventory browsing stays read-only. No desktop code path may be modified
  in place where a mobile branch exists (Slice 21 rule).
- The rental summary's `ORDER BY` must not change (regression baseline
  `specs/013-stage-plots/rental-baseline.json`).

**Scale/Scope**: Catalogs of a few hundred items; orders up to a few hundred lines. Two
migrations, ~4 new backend service files, 8 new routes, 2 modified frontend files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against constitution **v0.4.0**, which was amended as part of this slice — Principles
I, II and IV previously hardcoded `LL.xlsx` as *the* inventory source and *the* export target,
which this feature necessarily contradicts. The amendment generalizes them and, in
Principle IV, adds the negative half of the rule (an inventory not populated from a
supplier's file MUST NOT offer that supplier's export), which is precisely this slice's new
invariant. See the SYNC IMPACT REPORT at the top of `.specify/memory/constitution.md`.

| Principle | Assessment | Status |
|---|---|---|
| **I. Domain-First Data Model** | Categories and items remain the same domain entities; nothing new is introduced. `source_format` and `is_manual` describe provenance and are read by exactly two places (the export gate and the import sweep) — no planning, aggregation, or validation logic branches on item origin, as I now requires. | PASS |
| **II. Extensibility by Design** | User-created categories flow through the same `category_id`/`category_type` references as imported ones. No new endpoint or component is needed per category, and nothing branches on a category *name*. Equipment *types* stay the existing fixed set because planning dropdowns are keyed on them — II explicitly scopes itself to categories, not to structural node kinds. | PASS |
| **III. Full-Stack Monorepo Architecture** | New code sits in the documented packages: parsing and document generation in `internal/service/`, queries in `internal/db/`, handlers in `internal/api/`, pure structs in `internal/domain/`. Routes are REST JSON under `/api/v1/...`. Schema changes ship as versioned migrations applied at startup — no `ALTER TABLE` in application code. | PASS |
| **IV. Inventory-Driven Rental Workflow** | Directly advances it. Every event becomes exportable in a supplier-neutral form (PDF + spreadsheet), satisfying "no inventory may be a dead end"; the LL export keeps its exact fidelity where earned and is now actively withheld where not. Stock validation and unplaced-line reporting are untouched. | PASS |
| **V. Pragmatic Simplicity** | SQLite only; no new services; server state via TanStack Query; the manual-entry forms use the project's dominant `useState` draft pattern rather than pulling in more form machinery. **One new runtime dependency** (`go-pdf/fpdf`) — the sole deviation, justified below. | PASS with documented deviation |

**Post-Phase-1 re-check**: no drift. The design added no entities, no permission concepts, and
no endpoints beyond those listed in R7. The dependency in Complexity Tracking remains the only
deviation, and the spike (R3) reduced its real weight from "six modules" to "one linked
library".

## Project Structure

### Documentation (this feature)

```text
specs/022-generic-inventory-formats/
├── spec.md              # Phase -1 output (/speckit.specify)
├── plan.md              # This file
├── research.md          # Phase 0 output — R1..R8
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── inventory-api.md         # manual CRUD + generic import + template
│   ├── rental-export-api.md     # PDF / generic xlsx / LL gating
│   └── generic-xlsx-format.md   # the user-facing file format + PDF layout
├── checklists/
│   └── requirements.md  # spec quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 040_inventory_source_format.{up,down}.sql   # NEW
│   └── 041_inventory_items_manual.{up,down}.sql    # NEW
└── internal/
    ├── domain/
    │   └── inventory.go            # MODIFIED — SourceFormat, IsManual, import warnings
    ├── db/
    │   ├── inventory.go            # MODIFIED — manual-safe upsert; category/item CRUD
    │   ├── inventories.go          # MODIFIED — source_format read/write; duplicate copies it
    │   └── rental.go               # MODIFIED — category columns on the projection
    ├── service/
    │   ├── inventory_import.go     # MODIFIED — records source_format 'll'
    │   ├── inventory_import_generic.go  # NEW — generic parser
    │   ├── inventory_template.go        # NEW — template generator
    │   ├── rental_export.go        # MODIFIED — gate on source_format; filename by extension
    │   ├── rental_pdf.go           # NEW — PDF builder
    │   └── rental_xlsx.go          # NEW — generic spreadsheet builder
    └── api/
        ├── inventories.go          # MODIFIED — CRUD + generic import routes
        ├── inventory.go            # MODIFIED (trivial) — nothing beyond the domain field
        ├── rental.go               # MODIFIED — /rental-export/pdf and /xlsx
        └── router.go               # MODIFIED — template download route

frontend/src/
├── api/
│   ├── inventories.ts   # MODIFIED — CRUD, generic import, template URL
│   └── rentals.ts       # MODIFIED — pdf/xlsx export URLs
├── types/index.ts       # MODIFIED — sourceFormat, is_manual
├── pages/Inventories.tsx            # MODIFIED — import UI, error handling, CRUD (desktop)
└── components/event/RentalTab.tsx   # MODIFIED — gated export button group
```

**Structure Decision**: The existing web-app layout is reused unchanged; this slice adds no
new directory on either side. Backend work concentrates in `internal/service/` because both
new capabilities (parsing a foreign file format, rendering a document) are exactly what the
constitution designates that package for. Frontend work is confined to two existing screens —
the inventory detail page and the rental order tab — so no new route or page is introduced.

## Complexity Tracking

> Filled because the Constitution Check records one deviation from Principle V.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New runtime dependency `github.com/go-pdf/fpdf v0.9.0` (Principle V "avoid speculative infrastructure"; Governance requires new runtime dependencies be documented here) | FR-024 through FR-030 require a PDF the system produces itself: paginated with repeating headers, page numbers, category subtotals, and correct Swedish glyphs. Go's standard library cannot write PDF, and this is the first document format in the project that excelize cannot cover. Verified by spike (research R3): CGO-free build, valid `%PDF-1.3`, 3-page pagination with repeating headers, and `Högtalare & rökmaskin ä ö å É` round-tripping byte-correct. Although `go get` adds six modules to the graph, `go list -deps` confirms only `fpdf` itself is linked — the rest back optional barcode/template subpackages this feature never imports. | **Browser print-to-PDF** (reusing `components/print/` + `window.print()`, zero dependencies) was the leading alternative and was put to the user explicitly. Rejected because the order is sent to a third party: layout would vary by browser, browsers inject their own headers/footers unless manually disabled, and the user must perform a save step rather than receiving a file. **`maroto/v2`** was rejected as a layout DSL wrapping the same engine. **Embedding a Unicode TTF** was rejected under YAGNI — cp1252 covers Swedish and English equipment names, and font files would bloat the single deployed binary. `phpdave11/gofpdf` is retained as an API-compatible fallback. |
