# Implementation Plan: Stage Plots

**Branch**: `013-stage-plots` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-stage-plots/spec.md`

## Summary

A new per-event Stage Plots tab: any number of named, to-scale, layered
drawings built on a draw.io-style editor (palette / canvas / inspector +
layers). The canvas is the project's established hand-rolled SVG + React
technique from the two signal-graph slices, taken one step further: SVG
user units **are centimetres**, so scale exactness (the spec's core
demand) is structural rather than computed. Elements store a full spatial
tuple (x/y/z position, width/depth/height, rotation) and the three
required views — top-down, front, side — are pure orthographic
projections of that one model, sharing one projection function between
editor and print sheet, so "linked views" needs no synchronization code
at all. Resources carry icons from an in-repo registry (17+ ids ×
3 projection variants, including one distinct glyph per instrument) and
link to the event's existing planned entities through a single
polymorphic links table serving both inspector assignments and
speaker/rack stack entries. Trusses are **event-scoped** objects (the
Slice 10 shared-device pattern) assembled from inventory truss pieces
with copy-on-pick lengths parsed from catalog names (the Slice 6 cable
convention); plots hold placements, so the new rental CTE arm counts each
truss once per event by construction. Fixtures attach to trusses at
offsets and move with them; the Lighting tab's truss-section manager is
superseded by a read-only derived display, with existing `truss_sections`
rows carried over losslessly by the project's third one-time Go
conversion — conservative like Slice 6's backfill (legacy pieces carry no
inventory link, so converted data cannot change any rental total).

## Technical Context

**Language/Version**: Go 1.25+ (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi router, modernc.org/sqlite, golang-migrate;
Vite, TanStack Query, Tailwind. **No new dependency on either side** —
the editor extends the graph canvases' hand-rolled SVG technique
(research.md R1); no drawing/canvas library.

**Storage**: SQLite — migration `032_stage_plots` adds seven tables
(`stage_plots`, `stage_plot_layers`, `stage_plot_elements`,
`stage_plot_trusses`, `stage_plot_truss_pieces`,
`stage_plot_truss_fixtures`, `stage_plot_element_links`) and seeds
`picker_role = 'truss'`; a one-time Go conversion turns `truss_sections`
into event-scoped plot trusses; `033_drop_truss_sections` then drops
`truss_sections` and rebuilds `lighting_fixtures` without
`truss_section_id` (the 029/030 sandwich pattern, sequenced in
`db.go`'s `runMigrations`).

**Testing**: Go `testing` + `httptest` (`api/stage_plots_test.go`,
`db/stage_plot_truss_migration_test.go`, extended `db/rental_test.go`);
Vitest (`lib/stagePlot.test.ts` — projection, snapping exactness,
length parse, label composition; extended `printSheets.test.tsx`).

**Target Platform**: Linux server + browser (existing two-process dev setup)

**Project Type**: Web application (backend + frontend)

**Performance Goals**: Editor stays fluid on a realistic plot
(~100–200 SVG elements — bounded by one stage's real contents); grid
renders adaptively at far zoom (edge case: 40 × 60 m venue) by thinning
line density per zoom band rather than drawing thousands of lines.

**Constraints**: Never touch the live dev DB (verify on copies —
standing rule); never modify LL.xlsx; the reference event's rental
totals MUST be byte-for-byte unchanged after the truss-section
conversion (SC-004/SC-008); stored positions/dimensions land on exact cm
values after snapping (SC-003) — snapping math runs in cm space, only
thresholds derive from screen px.

**Scale/Scope**: 2 SQL migrations + 1 one-time Go conversion; 7 new
tables; 1 new rental CTE arm (param count 11 → 12); 1 new API handler
(`api/stage_plots.go`) + removal of truss-section endpoints; 1 new
EventDetail tab with ~6 new components (canvas, palette, inspector,
layers panel, truss manager, plot tabs bar); 2 new pure-logic frontend
modules (`lib/stagePlot.ts`, `lib/stagePlotIcons.tsx` — the icon
registry alone is ~51 glyphs: 17 ids × 3 projection variants); 1 new
print sheet; LightingTab loses its truss-section manager and gains the
read-only truss column.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Data Model** — PASS. Trusses, truss pieces, fixture
  attachments, layers, and placements are first-class rows with real
  relationships (fixture → truss → pieces → inventory item), not
  free text. Note on the port/cable bullet: it governs *signal-routing*
  features; a stage plot documents physical placement, routes no signal,
  and therefore correctly does **not** use the port/cable graph
  convention — its links to planned entities are references for display,
  not traversable signal edges.
- **II. Extensibility by Design** — PASS with two notes. (1) Element
  `kind`, `shape_kind`, link `entity_kind`, and link `role` are
  Go-validated enums selecting table/behavior — the established
  `from_kind`/`hop_kind` precedent, not reference vocabularies. (2) Icon
  ids live in a code registry, not the DB: icons are UI assets nothing
  branches domain logic on, users don't author them, and adding one is a
  registry entry with zero schema change (research.md R9). Truss pieces
  reference the catalog generically via `picker_role = 'truss'` — a new
  truss product line in LL.xlsx is addable as pure data, per the
  principle's own inventory-category clause.
- **III. Full-Stack Monorepo Architecture** — PASS. Versioned migrations
  applied on startup (with the established mid-sequence Go-conversion
  pattern); REST JSON under `/api/v1/events/{id}/stage-plots` and
  `/plot-trusses`; new code lands in the existing `internal/{api,db,domain}`
  and `frontend/src/{components,lib}` trees; no new packages.
- **IV. Inventory-Driven Rental Workflow** — PASS. Truss pieces are
  catalog picks validated like every existing pick, counted in the
  rental CTE (lighting column), stock-validated, discontinued-flagged,
  and exported via the unchanged LL.xlsx writer — closing the standing
  invariant for the one equipment type this feature newly selects.
  Everything else on a plot is a reference to already-counted equipment
  and is structurally excluded from the CTE (FR-015). Legacy conversion
  is conservative: NULL-item pieces bill nothing until re-picked
  (Slice 6 discipline).
- **V. Pragmatic Simplicity** — PASS with three notes, justified in
  Complexity Tracking: (1) one polymorphic links table instead of seven
  typed FK tables; (2) the truss-section conversion as Go code, not SQL
  (third use of the established pattern); (3) per-piece stored
  `length_cm` copied from a catalog-name parse rather than structured
  catalog dimensions. Zoom/pan/drag state is local React state;
  server state via React Query — both per the constitution's own rules.

**Post-design re-check (Phase 1)**: PASS — data-model.md and the API
contract introduce nothing beyond the three noted items; no new
dependencies, no new packages, no second database.

## Project Structure

### Documentation (this feature)

```text
specs/013-stage-plots/
├── plan.md                        # This file
├── research.md                    # Phase 0 output
├── data-model.md                  # Phase 1 output
├── quickstart.md                  # Phase 1 output
├── contracts/
│   └── stage-plots-api.md         # Phase 1 output
├── checklists/requirements.md     # Spec quality checklist (passing)
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

The approved visual mockup is the Artifact linked from spec.md's
Assumptions.

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 032_stage_plots.up.sql                # NEW — 7 tables + truss picker_role seed
│   ├── 032_stage_plots.down.sql
│   ├── 033_drop_truss_sections.up.sql        # NEW — drop truss_sections;
│   │                                          #       rebuild lighting_fixtures
│   │                                          #       without truss_section_id
│   └── 033_drop_truss_sections.down.sql
└── internal/
    ├── domain/
    │   └── stageplot.go                      # NEW: StagePlot, StagePlotLayer,
    │                                          # StagePlotElement, PlotTruss,
    │                                          # TrussPiece, TrussFixture,
    │                                          # ElementLink (+ aggregate response)
    ├── db/
    │   ├── stage_plots.go                    # NEW — CRUD + aggregate read
    │   ├── stage_plots_test.go               # NEW
    │   ├── stage_plot_truss_migration.go     # NEW — one-time truss_sections
    │   │                                      #       conversion (research R5)
    │   ├── stage_plot_truss_migration_test.go# NEW — per-legacy-shape + idempotence
    │   ├── db.go                             # sequence conversion at version 032
    │   ├── rental.go                         # 1 new CTE arm (truss pieces, lighting)
    │   ├── rental_test.go                    # extended (once-per-event, NULL pieces)
    │   ├── lighting.go                       # truss_sections CRUD removed; fixture
    │   │                                      # reads join truss name/offset
    │   └── audio_patch.go / buses.go / owned.go  # entity deletes clear
    │                                          # stage_plot_element_links (R6)
    └── api/
        ├── stage_plots.go                    # NEW — handlers + kind/link validation
        ├── stage_plots_test.go               # NEW
        ├── lighting.go                       # truss-section routes removed;
        │                                      # fixture payloads drop truss fields
        └── router.go                         # register StagePlotsHandler

frontend/src/
├── types/index.ts                            # + StagePlot* types, fixture truss_name
├── lib/
│   ├── stagePlot.ts                          # NEW — pure: projectElement(view),
│   │                                          # snapPosition (R8), trussLength,
│   │                                          # parseLengthFromName (R3),
│   │                                          # fixtureLabel (R11)
│   ├── stagePlot.test.ts                     # NEW
│   └── stagePlotIcons.tsx                    # NEW — registry: 17+ ids ×
│                                              # {top,front,side} glyphs +
│                                              # default cm dimensions (R9)
├── components/event/
│   ├── StagePlotTab.tsx                      # NEW — plot tabs bar, toolbar,
│   │                                          # editor layout (palette/canvas/side)
│   ├── StagePlotCanvas.tsx                   # NEW — cm-native SVG, zoom/pan,
│   │                                          # drag/rotate/resize, snap guides,
│   │                                          # per-view rendering
│   ├── StagePlotPalette.tsx                  # NEW — shapes, resources, instruments,
│   │                                          # lighting sections
│   ├── StagePlotInspector.tsx                # NEW — numeric editing, links
│   │                                          # (assignments/stack), fixture-label
│   │                                          # checkboxes, layers panel
│   ├── PlotTrussManager.tsx                  # NEW — event trusses: pieces picker
│   │                                          # (picker_role='truss'), fixture
│   │                                          # attach/detach with offsets
│   └── LightingTab.tsx                       # truss-section manager removed;
│                                              # read-only Truss column added
├── components/print/
│   ├── StagePlotSheet.tsx                    # NEW — current view, scale caption
│   └── printSheets.test.tsx                  # extended
└── pages/EventDetail.tsx                     # + "Stage Plots" tab
```

**Structure Decision**: Web application layout per constitution — all
changes land in the existing `backend/` and `frontend/` trees. Editor
components live under `components/event/` beside the graph canvases they
descend from; all geometry/snapping/label logic is pure and testable in
`lib/stagePlot.ts` (the `outputGraph.ts`/`inputGraph.ts` separation
pattern), keeping `StagePlotCanvas.tsx` to rendering and interaction
state. The icon registry is its own module because it is large (~51
glyphs) and content-only.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Polymorphic `stage_plot_element_links` (`entity_kind` + `entity_id`, no SQL FK) | One element links to any of 7 planned-entity kinds in two roles (assignment / stack entry); integrity is held by Go-side kind+existence validation, delete-path clearing, and read-time JOIN filtering (research.md R6) | Seven typed link tables with real FKs — 7× the CRUD/read surface for identical behavior; the codebase already accepts Go-validated kind enums for polymorphic references (`from_kind`/`to_kind`/`hop_kind` precedent) where SQLite FKs can't express the shape |
| Truss-section carry-over as one-time Go code, not `.sql` | Converting each section into an event-scoped truss + synthesized legacy piece + per-fixture attachments requires per-rig event lookup and row fan-out with conditionals; correctness against the user's real lighting rigs matters more than migration purity | Pure-SQL conversion rejected for the same unreviewable-branching reason as Slices 11/12 (this is the third use of the established, `db.go`-sequenced pattern, not a new mechanism) |
| `length_cm` stored per truss piece (denormalized; suggested by parsing the catalog item name) | The catalog has no structured dimension data — lengths live in item names ("Tross F34 2m"), per the Slice 6 cable convention; the spec's sum rule needs a stable number that survives item renames | Adding a dimension column to `inventory_items` rejected: the LL.xlsx import would have to preserve it across re-imports for one category's benefit, and every non-truss item would carry a dead column; a `fixture_modes`-style side table is heavier than copy-on-pick for a value resolved once at pick time (research.md R3) |
