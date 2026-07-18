# Tasks: Stage Plots

**Input**: Design documents from `/specs/013-stage-plots/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/stage-plots-api.md, quickstart.md

**Tests**: Included — this project's convention (Go `httptest` for handlers/rental/migrations, Vitest for non-trivial pure logic) and the spec's byte-for-byte rental criteria require them.

**Organization**: Grouped by user story; each phase is an independently testable increment. US1 alone is the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup

**Purpose**: Baseline capture so every later rental assertion has ground truth. No project scaffolding needed — the feature lands in the existing trees.

- [x] T001 Copy the dev DB per quickstart.md (never run against the live file) and save the reference event's `GET /api/v1/events/{id}/rental-summary` response to `specs/013-stage-plots/rental-baseline.json` for the SC-004/SC-008 byte-for-byte diffs in T031/T036

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, domain types, and the plot/element plumbing every story builds on. No UI yet.

- [x] T002 Migration `backend/migrations/032_stage_plots.up.sql` + `.down.sql`: create all seven tables exactly per data-model.md (stage_plots, stage_plot_layers, stage_plot_elements, stage_plot_trusses, stage_plot_truss_pieces, stage_plot_truss_fixtures, stage_plot_element_links) and seed `inventory_categories.picker_role = 'truss'` where name = 'Tross'; leave `truss_sections` untouched (dropped later in T032)
- [x] T003 [P] Domain structs in `backend/internal/domain/stageplot.go`: StagePlot, StagePlotLayer, StagePlotElement, PlotTruss, TrussPiece, TrussFixture, ElementLink, StagePlotResponse (aggregate) — pure structs, no DB tags, matching contracts/stage-plots-api.md field names
- [x] T004 [P] Frontend types in `frontend/src/types/index.ts`: StagePlot, StagePlotLayer, StagePlotElement, PlotTruss, TrussPiece, TrussFixture, ElementLink, StagePlotResponse; element `kind`/`shape_kind`/view unions
- [x] T005 DB layer in `backend/internal/db/stage_plots.go`: plot CRUD (create makes plot + default "Layer 1" in one transaction), plot settings update, layer CRUD (delete rejects the plot's last layer), element CRUD with kind-field validation helpers, and the aggregate read returning plot + layers + elements (links/trusses arrays empty until T024/T027)
- [x] T006 API handlers in `backend/internal/api/stage_plots.go` for plots, layers, elements per contracts/stage-plots-api.md (400 kind/field validation, 409 last-layer and duplicate-truss-placement, 404s); register `StagePlotsHandler` in `backend/internal/api/router.go`
- [x] T007 httptest suite `backend/internal/api/stage_plots_test.go`: plot create makes default layer, settings PATCH round-trip, last-layer delete 409, element kind validation (exactly one of shape_kind/icon/truss_id/fixture_id), element spatial PATCH, plot delete cascades
- [x] T008 [P] API client module `frontend/src/api/stagePlots.ts` (the per-domain module pattern, e.g. `api/lighting.ts`): typed functions for every route in contracts/stage-plots-api.md

**Checkpoint**: `go test ./...` green; plots/layers/elements fully manipulable via curl — no UI yet.

---

## Phase 3: User Story 1 — Draw a to-scale stage plot (P1) 🎯 MVP

**Goal**: A planner creates named plots on a new Stage Plots tab, draws exact-cm shapes, places named/icon resources, and edits everything by drag or by inspector numbers — all rendered true to scale.

**Independent Test**: Quickstart step 1 — create a plot, draw a 600×400 cm stage, place a 46 cm speaker, verify proportions at any zoom, reload, everything persists.

- [x] T009 [P] [US1] Pure geometry module `frontend/src/lib/stagePlot.ts`: `projectElement(element, view)` mapping x/y/z + w/d/h to the three orthographic views (research.md R7; only 'top' consumed until US6), px↔cm conversion for a given zoom, rotation-aware element bounds, min-size clamping
- [x] T010 [P] [US1] Vitest suite `frontend/src/lib/stagePlot.test.ts`: projection round-trips for all three views, bounds under rotation, SC-002 ratio check (200 cm element measures exactly half a 400 cm element in every view)
- [x] T011 [P] [US1] Icon registry `frontend/src/lib/stagePlotIcons.tsx` — core set, **top-down variants** with default cm dimensions (research.md R9): person, mic, speaker, monitor, rack, truss, fixture; registry API keyed by id with per-view lookup and labeled-placeholder fallback for unknown ids
- [x] T012 [P] [US1] Icon registry — instrument set, **top-down variants**: drums, piano_grand, piano_upright, keyboard, guitar_acoustic, guitar_electric, bass, cello, trumpet, saxophone (FR-008's distinct-per-instrument minimum) in `frontend/src/lib/stagePlotIcons.tsx`
- [x] T013 [US1] `frontend/src/components/event/StagePlotTab.tsx`: plot tabs bar (list/create/rename/delete/switch, React Query on `api/stagePlots.ts`), toolbar shell (zoom −/100 %/+ readout), three-column editor layout hosting palette/canvas/inspector
- [x] T014 [US1] `frontend/src/components/event/StagePlotCanvas.tsx`: cm-native SVG viewBox (research.md R1), zoom/pan (wheel + drag, persisted via plot settings PATCH), selection, drag-move/resize handles/rotate with save-on-drop element PATCH, name labels beside icons (legible outside the footprint — spec edge case)
- [x] T015 [P] [US1] `frontend/src/components/event/StagePlotPalette.tsx`: Shapes (rect/ellipse/line/text), Resources (core icons), Instruments, Lighting sections; clicking/dragging places an element with the icon's default cm dimensions on the active layer
- [x] T016 [P] [US1] `frontend/src/components/event/StagePlotInspector.tsx`: numeric editing (name, icon picker, x/y, width/depth, rotation) applying immediately via element PATCH; duplicate + delete actions
- [x] T017 [US1] Add the "Stage Plots" tab to `frontend/src/pages/EventDetail.tsx` (after "Lighting Rig")

**Checkpoint**: US1 fully usable and persistent — the MVP ships here.

---

## Phase 4: User Story 2 — Grid and snapping (P2)

**Goal**: Toggleable, cm-configurable grid; independent snap-to-grid and snap-to-objects with alignment guides; settings persist per plot.

**Independent Test**: Quickstart step 2 — dragged positions land on exact grid multiples or exact neighbour alignments; toggles restore on reload.

- [x] T018 [P] [US2] `snapPosition(dragged, neighbors, settings, pxPerCm)` in `frontend/src/lib/stagePlot.ts` per research.md R8: per-axis candidates, object edge/centre alignment beats grid within an 8-screen-px threshold converted to cm, returns snapped cm values + guide descriptors
- [x] T019 [P] [US2] Extend `frontend/src/lib/stagePlot.test.ts`: SC-003 exactness (snapped results are exact grid multiples / exact neighbour coordinates, no epsilon), object-over-grid precedence, threshold respects zoom, disabled toggles bypass
- [x] T020 [US2] Grid + snapping in `frontend/src/components/event/StagePlotCanvas.tsx`: adaptive grid rendering (thin line density per zoom band — 40×60 m venue edge case), snapPosition wired into drag, alignment guide overlay; toolbar controls in `StagePlotTab.tsx` (grid toggle, size input in cm, two snap checkboxes) persisted via plot settings PATCH

**Checkpoint**: US1 + US2 — accurate layout is now fast.

---

## Phase 5: User Story 3 — Layers (P2)

**Goal**: User-defined layers with color, hide, lock, reorder, active-layer placement, and per-element layer moves.

**Independent Test**: Quickstart step 3 — hidden layers unselectable, locked layers uneditable, new elements join the active layer, last-layer delete blocked.

- [x] T021 [US3] Layers panel in `frontend/src/components/event/StagePlotInspector.tsx` sidebar: list with color dot, visibility eye, lock, active-layer highlight; create/rename/reorder/delete-with-confirmation (elements deleted with it; 409 on last layer surfaced as a disabled action)
- [x] T022 [US3] Layer semantics in `frontend/src/components/event/StagePlotCanvas.tsx` + `StagePlotInspector.tsx`: hidden layers skipped from render and hit-testing, locked layers rendered but inert, layer color tints element strokes, new elements target the active layer, inspector "Layer" select moves elements between layers

**Checkpoint**: Mixed audio/lighting plots stay workable.

---

## Phase 6: User Story 4 — Resources linked to planned data, stacking (P2)

**Goal**: Assign the event's existing planned entities to resources; speaker/rack stacks share one footprint with a visible count; deletions elsewhere degrade gracefully; rental untouched.

**Independent Test**: Quickstart step 4 — assign, verify display, delete the underlying entity in its own tab, link vanishes, element stays, rental diff empty.

- [x] T023 [US4] Link CRUD in `backend/internal/db/stage_plots.go` + `backend/internal/api/stage_plots.go`: POST/PATCH/DELETE element links per contract (Go-validated entity_kind enum, target-existence 404, duplicate 409, stack sort_order)
- [x] T024 [US4] Aggregate-read link resolution in `backend/internal/db/stage_plots.go`: per-kind JOINs producing `display_name` (+ FID/DMX fields for lighting_fixture links), dangling targets dropped and opportunistically deleted (research.md R6)
- [x] T025 [US4] Delete-path cleanup — add `DELETE FROM stage_plot_element_links WHERE entity_kind = ? AND entity_id = ?` to the delete functions for input_sources/input_channels (`backend/internal/db/audio_patch.go`), output_devices/input_devices (`audio_patch.go`), stageboxes/stage_multis (`backend/internal/db/buses.go`), lighting_fixtures (`backend/internal/db/lighting.go`)
- [x] T026 [US4] Extend `backend/internal/api/stage_plots_test.go`: link kind/target validation, duplicate 409, entity delete clears links, aggregate read drops dangling rows, and rental summary is byte-identical before/after adding assignments + stack entries (FR-015)
- [x] T027 [US4] Assignments + stack UI in `frontend/src/components/event/StagePlotInspector.tsx`: per-kind pickers over existing event data (React Query caches already used by the patch tabs), assignment chips with remove, stack entry list with add/reorder/remove; `StagePlotCanvas.tsx` draws assignment-count badge and stack ×N badge

**Checkpoint**: Plots now document who/what is where against real planned data.

---

## Phase 7: User Story 5 — Truss rigs from inventory, counted on the rental order (P2)

**Goal**: Event-scoped trusses assembled from inventory pieces (exact summed length), fixtures attached at offsets and moving with the truss, configurable fixture labels, read-only truss display on the Lighting tab, truss pieces on the rental order/export, legacy truss sections converted losslessly.

**Independent Test**: Quickstart step 5 + the T031/T036 rental diffs.

- [x] T028 [US5] Truss backend in `backend/internal/db/stage_plots.go` + `backend/internal/api/stage_plots.go`: plot-trusses CRUD, pieces CRUD (`length_cm > 0`), fixture attach/detach (PUT upsert honouring UNIQUE fixture_id, offset_cm), trusses included in the aggregate read with `total_length_cm`, pieces, and fixture FID/DMX fields; extend `backend/internal/api/stage_plots_test.go` for all of it
- [x] T029 [P] [US5] Pure helpers + tests in `frontend/src/lib/stagePlot.ts` / `stagePlot.test.ts`: `parseLengthFromName` ("2m" → 200, "0,5m" → 50, no-match → null; research.md R3), `trussLength(pieces)`, `fixtureLabel(fixture, settings)` composing name · FID · U.addr with missing parts omitted (FR-029), offset clamping flag for out-of-range fixtures
- [x] T030 [US5] Rental CTE arm in `backend/internal/db/rental.go` (truss pieces via event-scoped join, lighting column, param count 11 → 12; research.md R10); extend `backend/internal/db/rental_test.go`: pieces counted with price/stock/discontinued flags, truss placed on two plots counts once, NULL-item legacy pieces contribute nothing, no-truss event totals unchanged
- [x] T031 [US5] One-time Go conversion `backend/internal/db/stage_plot_truss_migration.go` per research.md R5 (guarded by `truss_sections` existence, per-rig transactions, resumable) + sequencing in `backend/internal/db/db.go` (migrate to 032 → convert → Up()); test `backend/internal/db/stage_plot_truss_migration_test.go`: per-legacy-shape conversion, idempotence, and rental byte-for-byte vs T001 baseline on a copy of the real dev DB
- [x] T032 [US5] Migration `backend/migrations/033_drop_truss_sections.up.sql` + `.down.sql`: drop `truss_sections`; rebuild `lighting_fixtures` without `truss_section_id` (the established table-rebuild recipe, FK-safe)
- [x] T033 [US5] Lighting surface rework: `backend/internal/db/lighting.go` + `backend/internal/api/lighting.go` — remove truss-section CRUD/routes, fixture reads join `truss_name`/`truss_offset_cm` from stage_plot_truss_fixtures, payloads drop truss fields; update `backend/internal/api/lighting_test.go`
- [x] T034 [US5] `frontend/src/components/event/PlotTrussManager.tsx`: event truss list (create/rename/height/delete), pieces editor with inventory picker filtered by `picker_role = 'truss'` and length auto-fill from T029's parser, fixture attach/detach with offset input; surfaced from `StagePlotTab.tsx`
- [x] T035 [US5] Truss rendering in `frontend/src/components/event/StagePlotCanvas.tsx`: kind='truss' elements draw at derived summed length with section dividers, attached fixtures at offsets (clamped + flagged when out of range), whole-truss drag/rotate moves fixtures as one; fixture-label checkboxes (Name/FID/DMX) in `StagePlotInspector.tsx` persisted on the plot and rendered via `fixtureLabel`
- [x] T036 [US5] `frontend/src/components/event/LightingTab.tsx`: remove the truss-section manager panel and per-fixture truss dropdown; add the read-only Truss column ("name · offset cm", empty when unattached); rental diff against T001's baseline on the real DB copy ran clean (byte-for-byte identical, "Bakre truss" + 2 fixtures converted; verified 2026-07-18)

**Checkpoint**: The lighting half is complete and the standing rental invariant is closed.

---

## Phase 8: User Story 6 — Three linked projections (P3)

**Goal**: Top/front/side views of the same model, edits visible across views instantly, heights to true scale, per-view icon variants, grid/snap on each view's axes.

**Independent Test**: Quickstart step 6.

- [x] T037 [P] [US6] Icon registry front + side variants — core set (person, mic, speaker, monitor, rack, truss, fixture) in `frontend/src/lib/stagePlotIcons.tsx`
- [x] T038 [P] [US6] Icon registry front + side variants — instrument set (drums, both pianos, keyboard, both guitars, bass, cello, trumpet, saxophone) in `frontend/src/lib/stagePlotIcons.tsx`
- [x] T039 [US6] View switching in `frontend/src/components/event/StagePlotTab.tsx` + `StagePlotCanvas.tsx`: Top/Front/Side segmented control (persisted `active_view`), canvas renders via `projectElement` for the active view (trusses at `height_cm`, floor line at z = 0), drag edits the projected axes only (vertical drag in front/side writes `z_cm`), rotation restricted to top view (research.md R7), grid + snapPosition operating on the view's axis pair
- [x] T040 [US6] Height editing in `frontend/src/components/event/StagePlotInspector.tsx`: z (height above floor) and height_cm fields; truss hang-height field in `PlotTrussManager.tsx`; extend `frontend/src/lib/stagePlot.test.ts` cross-view consistency (edit in one view, other projections agree — SC-006's pure-logic core)

**Checkpoint**: Vertical rigging is truthful; all six stories done.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T041 [P] Print sheet `frontend/src/components/print/StagePlotSheet.tsx`: active view via the shared projection/label helpers inside the `.print-sheet` pattern with scale caption ("1 square = N cm") + PrintButton wiring in `StagePlotTab.tsx`; extend `frontend/src/components/print/printSheets.test.tsx`
- [ ] T042 [P] Update `ROADMAP.md`: add Slice 13 summary with checked deliverables and the dependency-graph line
- [ ] T043 Full gates + walkthrough: `go vet ./... && go test ./... && golangci-lint run` (backend), `npx tsc --noEmit && npx eslint . && npx vitest run` (frontend), then the complete quickstart.md manual walkthrough on the DB copy; fix anything found

---

## Dependencies & Execution Order

- **Phase 2 ← Phase 1**; all story phases ← Phase 2.
- **US1 (Phase 3)**: independent MVP once Phase 2 lands.
- **US2, US3 (Phases 4–5)**: depend only on US1's canvas/tab; independent of each other.
- **US4 (Phase 6)**: depends on US1 (inspector/canvas); independent of US2/US3.
- **US5 (Phase 7)**: depends on US1; T035 benefits from US3 (layer tinting) but does not require it. Internal order: T028 → {T029, T030} → T031 → T032 → T033; T034/T035/T036 after T028/T029.
- **US6 (Phase 8)**: depends on US1 (projectElement, canvas) and touches US2's snapping if present; T037/T038 anytime after T011/T012.
- **Phase 9** last (T041 needs US6's view rendering for "active view" printing; degrade to top-only if US6 is deferred).

### Story completion order

```
Setup → Foundational → US1 (MVP) → US2 → US3 → US4 → US5 → US6 → Polish
```

US2–US5 may be reordered or interleaved; US5 is the highest-value P2 (closes the rental gap).

## Parallel Opportunities

- Phase 2: T003, T004 together after T002; T008 after T003/T004.
- Phase 3: T009+T010, T011, T012 all parallel; T015, T016 parallel after T013.
- Phase 4: T018+T019 parallel with each other before T020.
- Phase 7: T029 parallel with T028; T030 parallel with T029.
- Phase 8: T037, T038 parallel with each other and with T039.
- Phase 9: T041, T042 parallel.

## Implementation Strategy

Ship US1 first (T001–T017): a real, persistent, to-scale plot editor with the full top-down icon set — demonstrable value on its own. Then add stories in priority order; each checkpoint leaves the app releasable. The riskiest work is deliberately late but not last: T031's legacy conversion runs against a copy of the real dev DB with T001's baseline diff before anything depends on it. The icon workload (~51 glyphs) is split into four parallelizable content tasks (T011, T012, T037, T038) so it never blocks logic work.
