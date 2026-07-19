# Research: Stage Plots (013)

Decisions resolving every open question in plan.md's Technical Context.
Format per decision: what was chosen, why, and what else was considered.

## R1 — Canvas technique: hand-rolled SVG in cm-native user units

**Decision**: The editor canvas is a plain SVG element rendered by React,
exactly the technique Slices 11/12 established for the signal-graph
canvases (`InputGraphCanvas.tsx`), extended with zoom/pan. The SVG user
coordinate system is **1 unit = 1 cm**: every element renders at its
stored real-world size, and zoom is purely a `viewBox` transform. Scale
correctness (FR-004, SC-002) is therefore structural — there is no
per-element scale math that could drift.

**Rationale**: The project already has a proven drag-interaction SVG
canvas with local React drag state and save-on-drop mutations; the same
technique carries rotation (SVG `transform="rotate(...)"`), selection
handles, and alignment guides without any new dependency (Constitution V).
Zoom/pan via `viewBox` means hit-testing and snapping run in cm space,
with a single px↔cm conversion factor derived from the current zoom.

**Alternatives considered**: react-konva / fabric.js / tldraw (new
runtime dependencies for capabilities the SVG approach already covers;
each brings its own coordinate model that would sit *between* us and the
cm-exactness the spec demands); HTML5 `<canvas>` (loses DOM hit-testing,
free text rendering, and print/SVG reuse).

## R2 — Schema: seven new tables, plot-scoped except trusses

**Decision**: New tables `stage_plots`, `stage_plot_layers`,
`stage_plot_elements`, `stage_plot_trusses`, `stage_plot_truss_pieces`,
`stage_plot_truss_fixtures`, `stage_plot_element_links` (full shapes in
data-model.md). Everything is plot-scoped (cascade from `stage_plots`)
**except** trusses and their pieces/fixture attachments, which are
event-scoped — see R4.

**Rationale**: Layers and elements exist only within one drawing;
cascade deletion of a plot then satisfies FR-003 with zero cleanup code.
Elements carry the shared spatial core (position x/y/z, size w/d/h,
rotation, layer) with a `kind` discriminator (`shape` / `resource` /
`truss` / `fixture`), matching how `output_cables.from_kind` etc. already
discriminate node kinds in Go-validated enums.

**Alternatives considered**: One JSON blob per plot (drawing apps often
do this) — rejected: it would make the truss rental arm (R10), the
Lighting-tab join (R5), and referential cleanup (R6) opaque string
surgery instead of SQL, and violates the spirit of Constitution I
(first-class, traversable relationships).

## R3 — Truss piece length: stored per piece, suggested from the catalog name

**Decision**: `stage_plot_truss_pieces.length_cm` is a stored REAL,
required. When the user picks an inventory item from the truss category
(`inventory_categories.picker_role = 'truss'`, a new seeded role
following the Slice 6 `cable`/`stand` precedent), the UI pre-fills
`length_cm` by parsing the item name (e.g. "Tross F34 2m" → 200,
"0,5m" → 50; Swedish decimal comma handled); the user can correct it.
The parse lives in `lib/stagePlot.ts` as a pure, unit-tested function.

**Rationale**: The catalog (LL.xlsx) has no structured dimension column —
cable lengths already live in item names (Slice 6), so trusses follow
the same convention. Storing the resolved number on the piece keeps FR-023
("length equals the sum of the pieces' real lengths") exact and stable
even if an item is later renamed.

**Alternatives considered**: Adding a `length_cm` column to
`inventory_items` — rejected: the import (`service/inventory_import.go`)
would need to preserve it across re-imports for one category's benefit,
and every non-truss item would carry a meaningless column. A
`truss_lengths` side table keyed by item (the `fixture_modes` pattern) —
viable, but heavier than needed: fixture modes are picked repeatedly per
rig; a piece's length is resolved once at pick time and the copy-on-pick
number is what the spec's sum rule needs anyway.

## R4 — Trusses are event-scoped; plots hold placements

**Decision**: A truss (name, hang height, pieces, attached fixtures)
belongs to the **event**. A plot shows a truss via an element row of
`kind = 'truss'` referencing `truss_id` plus that plot's placement
(x/y, rotation). The rental arm (R10) counts pieces from
`stage_plot_trusses` by `event_id` — never through placements — so a
truss placed on three plots counts once, and a truss placed on zero
plots (e.g. freshly converted from legacy data, R5) still exists and is
manageable.

**Rationale**: This is the "shared output devices" pattern from Slice 10
(declared once, referenced by position from many places, counted exactly
once), reused for the exact same de-duplication problem the spec calls
out (FR-026, edge case "same truss on two plots").

**Alternatives considered**: Plot-scoped trusses with a DISTINCT-by-name
rental de-dup — rejected: name collisions/renames silently change rental
totals, exactly the class of fragility Slice 6's id-based picks removed.

## R5 — Legacy truss sections: one-time Go conversion, then drop

**Decision**: Migration `032_stage_plots` creates the new tables and
leaves `truss_sections` untouched. A one-time Go conversion —
`stage_plot_truss_migration.go`, the third of its kind after
`output_graph_migration.go` and `input_signal_graph_migration.go` —
then converts each existing truss section into an event-scoped
`stage_plot_trusses` row: name kept; `length_m` becomes a single piece
with `inventory_item_id = NULL`, `label` = the section's name/type text,
and `length_cm` = `length_m × 100`; every fixture's `truss_section_id`
becomes a `stage_plot_truss_fixtures` row with `offset_cm = NULL`
(position unknown → Lighting tab shows the truss name without a
position, per FR-030's "where it can be inferred"). Migration
`033_drop_truss_sections` then drops `truss_sections` and rebuilds
`lighting_fixtures` without `truss_section_id`. Startup sequencing uses
the established `runMigrations` pattern in `db.go`: migrate to 032, run
the conversion, continue `Up()` to 033 — guarded by `truss_sections`
existence so it can never run twice.

**Rationale**: Conservative by construction (the Slice 6 backfill
discipline): a NULL `inventory_item_id` contributes nothing to the
rental CTE, so converting legacy sections cannot change any rental total
(SC-004/SC-008) — legacy trusses start billing only when the user
re-picks real catalog pieces. Truss-section CRUD endpoints and the
Lighting-tab manager panel are removed in the same slice (single-user
tool, no external API consumers); fixtures' truss display becomes the
read-only derived join the spec requires.

**Alternatives considered**: Keeping `truss_sections` as parallel
display-only data — rejected: two places to answer "which truss is this
fixture on" is precisely the double-management FR-030 forbids. Pure-SQL
conversion — needs per-rig event lookup, row fan-out, and piece
synthesis; same unreviewable-branching reason R5/R7 of the previous two
slices chose Go.

## R6 — Assignments & stacks: one polymorphic links table, cleared on entity delete

**Decision**: `stage_plot_element_links` holds both inspector
assignments and stack entries, discriminated by `role`
(`'assignment'` | `'stack'`), with `entity_kind` (Go-validated enum:
`input_source`, `input_channel`, `output_device`, `input_device`,
`stagebox`, `stage_multi`, `lighting_fixture`) + `entity_id`, and
`sort_order` for stack ordering. There is no SQL FK (the target table
varies); instead (a) every entity's existing delete path gains a
`DELETE FROM stage_plot_element_links WHERE entity_kind = ? AND
entity_id = ?` statement — the project's established "deletes clear
referencing rows first" discipline from Slice 0 — and (b) the plot GET
resolves links per kind with JOINs and silently drops rows whose target
no longer exists, as defense in depth (FR-014, SC-007).

**Rationale**: Assignments and stack entries have identical shape
(element → planned entity + order); one table with a role column beats
two identical tables. Polymorphism is contained: exactly one write path
validates `entity_kind`+existence, one read path resolves names.

**Alternatives considered**: Seven typed link tables with real FKs —
rejected: 7× the CRUD surface for the same behavior; the graph tables
already accept Go-validated kind enums over SQL FKs for polymorphic
endpoints (`from_kind`/`to_kind` precedent). ON DELETE CASCADE via a
shadow FK per kind — not expressible in SQLite across a discriminated
column.

## R7 — Projections: x/y/z model, three pure orthographic mappings

**Decision**: Elements store position `x_cm` (stage-left→right),
`y_cm` (upstage→downstage depth), `z_cm` (height above floor) and size
`width_cm`/`depth_cm`/`height_cm`. The three views are pure projections
of the same rows: top-down draws (x, y) × (width, depth); front draws
(x, z) × (width, height); side draws (y, z) × (depth, height). The
mapping lives in `lib/stagePlot.ts` as `projectElement(element, view)` —
one function both the editor and the print sheet call, so the views can
never disagree (FR-027, SC-006 follows from shared state + shared math,
no sync mechanism needed). Grid and snapping operate on the projected
pair of axes identically in every view (US6-AC5). Editing in front/side
moves the projected axes only (dragging vertically in front view changes
`z_cm`); rotation is top-view-only (rotation is about the vertical axis;
front/side render the axis-aligned bounding footprint).

**Rationale**: "Linked views" falls out for free when the views are
projections of one model — there is nothing to synchronize. Restricting
rotation to the plan view keeps front/side rendering honest without
full 3D transforms, which nothing in the spec requires.

**Alternatives considered**: Per-view stored positions with sync logic —
rejected outright: it manufactures the consistency problem the spec's
FR-027 exists to prevent. A 3D scene library — wildly out of proportion
(Constitution V) for three orthographic rectangles-and-icons views.

## R8 — Snapping: pure function, object-over-grid precedence

**Decision**: `snapPosition(dragged, neighbors, settings, pxPerCm)` in
`lib/stagePlot.ts`: candidate snaps are computed for the two active axes
independently — object edge/center alignments against visible, unlocked
neighbors within a threshold of 8 screen px (converted to cm via the
current zoom), then grid multiples if grid snapping is on. Object
alignment wins over grid within its threshold (the spec's determinism
edge case); nearest candidate wins per axis; the function also returns
which guides to draw. Unit-tested with exact-value cases (SC-003).

**Alternatives considered**: Snapping in screen space — rejected: stored
positions must land on exact cm values (SC-003 "no near-miss offsets"),
so the math runs in cm and only the *threshold* is screen-derived.

## R9 — Icon set: in-repo TSX registry, 3 variants × 17+ ids

**Decision**: `lib/stagePlotIcons.tsx` exports a registry keyed by icon
id (`person`, `mic`, `speaker`, `monitor`, `rack`, `truss`, `fixture`,
`drums`, `piano_grand`, `piano_upright`, `keyboard`, `guitar_acoustic`,
`guitar_electric`, `bass`, `cello`, `trumpet`, `saxophone` — the spec's
minimum set), each entry holding three SVG glyph components (`top`,
`front`, `side`) drawn in a normalized 0–100 box and stretched to the
element's cm footprint, plus sensible default real-world dimensions
applied when the icon is first placed (person ≈ 50×50×180 cm, etc.).
Glyphs are monochrome `currentColor` strokes so the layer color tints
them (spec assumption). `stage_plot_elements.icon` stores the id string;
unknown ids render a labeled placeholder box rather than breaking.

**Rationale**: Icons are UI assets, not equipment vocabulary — they are
not the kind of "type defined as data" Constitution II governs (the
analogy is the existing node glyphs in the graph canvases, which live in
code). A registry keyed by string id means adding an icon is one
registry entry and zero schema/API changes.

**Alternatives considered**: DB-stored SVG (Constitution II
over-application) — rejected: nothing selects behavior from icons, users
don't author them (spec: "not user-supplied"), and shipping ~51 glyphs
as data rows buys nothing but an upload/XSS surface.

## R10 — Rental: one new CTE arm, lighting column, once per event

**Decision**: `rentalSummaryQuery` gains one arm (event id param count
11 → 12):

```sql
SELECT p.inventory_item_id, 0, 1
FROM stage_plot_truss_pieces p
JOIN stage_plot_trusses t ON t.id = p.truss_id
WHERE t.event_id = ? AND p.inventory_item_id IS NOT NULL
```

Counted under **Antal Ljus** (lighting), like fixtures. Because trusses
are event-scoped (R4) the arm never sees placements, so multi-plot
display cannot double-count; because legacy pieces have NULL item ids
(R5) conversion cannot change totals. Pricing, over-stock and
discontinued flagging, manual-line merging, and the Excel export all
apply unchanged — the standing invariant is closed in-slice.

**Alternatives considered**: none seriously; this is the Slice 6/9/10/11
pattern applied verbatim.

## R11 — Fixture labels: three booleans on the plot, composed client-side

**Decision**: `stage_plots.show_fixture_name` / `show_fixture_fid` /
`show_fixture_dmx` (defaults: name on, FID off, DMX off). A pure
`fixtureLabel(fixture, settings)` helper composes the drawn string
(e.g. `Spot 1 · FID 11 · 1.001`), omitting any part whose value is
missing (FR-029), shared by canvas and print sheet.

## R12 — Print: a StagePlotSheet reusing the projection renderer

**Decision**: `components/print/StagePlotSheet.tsx` renders the plot's
current view through the same projection/label functions inside the
established `.print-sheet` pattern (black-on-white overrides,
`PrintButton`), with a scale bar and "1 square = N cm" caption. No new
print infrastructure.

## R13 — API shape: aggregate GET per plot, granular writes

**Decision**: Everything under `/api/v1/events/{eventID}/...` (existing
convention): `stage-plots` CRUD; one aggregate
`GET .../stage-plots/{plotID}` returning settings + layers + elements
with links resolved to display names; granular POST/PATCH/DELETE for
layers, elements, and links; event-level `plot-trusses` CRUD with nested
pieces and fixture attach/detach. Position/size PATCHes are the
save-on-drop writes the graph canvases already do. Full contract in
`contracts/stage-plots-api.md`.

**Rationale**: One aggregate read keeps the editor to a single query +
React Query cache entry (the `AudioPatchResponse` precedent); granular
writes keep drag-end saves small and conflict-free.
