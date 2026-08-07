## Why

A stage plot is drawn to scale but reads as a picture: nothing on it states a distance, so
*how far is the delay stack from the downstage edge* can only be estimated by eye or counted
off grid squares. The user's words — **"it's not easy to see the relative positions of
things."** A plot's whole purpose is to be built from on a load-in day, and the distances a
crew needs are the ones the person drawing it already knows and currently cannot write down.

Slice 41 put the plot on paper at a stated 1:50 or 1:100. That made the drawing measurable
with a ruler; it did not let the planner say which measurements matter. Dimensioning is how
every other scale drawing solves this, and it is the missing half of the paper slice.

## What Changes

- **A new object on the plot: a measurement.** Two endpoints, an offset, and a type; its
  value is derived from its endpoints and never typed. Created from the canvas by arming a
  tool and picking twice.
- **Anchors are features of an element's box** — its centre, a corner of its projected
  silhouette, or a face — re-derived on every draw, so a measurement survives its element
  being moved, resized, rotated or raked. An endpoint may instead be a **free point** that
  snaps to the plot grid and stays where it was put.
- **A face anchor answers the request's subtle half**: the measurement meets that face at
  90° and is free to slide along it, reporting the perpendicular distance to the face's
  line. A face's midpoint marker and its plane anchor occupy the same position and are
  distinguished only by which highlights.
- **Three types**: aligned (true point-to-point distance), and locked horizontal or vertical
  (the u- or v-axis separation alone).
- **The offset is a drag**, CAD-style: the dimension line is held away from the geometry on
  extension lines, stored in centimetres, snapped to the grid, and does not change the value.
- **Measurements print.** They appear on the generated PDF's view sheets, with the value
  re-derived server-side from the stored anchors rather than carried in a payload.
- **Measurements belong to a layer**, inheriting its visibility and lock, but not its colour:
  one annotation ink, because a dimension spanning two layers cannot honestly claim either.
- **On a phone a measurement is read, its note edited, and nothing else** — no drawing, no
  re-anchoring, no offset, and **no delete**.
- **A new rule in the design language**: a surface never destroys what it cannot author.
  This is a rule and not a preference, and it makes one shipped surface non-conforming — the
  phone's stage plot element sheet offers a Delete for an element the phone cannot place.
  **That Delete is removed in this change**, so the rule and the code that obeys it land
  together.

Not in scope, deliberately: angular, radial and diameter dimensions; continued/baseline
chains; auto-dimensioning; cross-view dimensions (a height is dimensioned in an elevation
and nowhere else); a plane anchor on an ellipse, which has no straight side to be
perpendicular to at more than one point.

## Capabilities

### New Capabilities

- `plot-measurements`: what a measurement on a stage plot is, what it can anchor to, what
  its value means, how it is drawn and placed, how it survives edits to the things it
  measures, and what a phone may do with one.

### Modified Capabilities

- `stage-plot-document-export`: the document's view sheets gain the plot's measurements,
  drawn in the document's own ink and separated from equipment by weight rather than hue;
  the title block gains a conventions row; the element schedule does not gain a row.
- `destructive-confirmation`: gains the rule that a surface which cannot bring a kind of
  object into being does not offer to destroy one. This is the companion to the existing
  requirements: those govern *how* a destructive act is asked about, this one governs
  *where it is offered at all*.

## Impact

**Schema** — one migration adding `stage_plot_measurements`: plot, layer, view, type, the
two endpoints (each either an element reference plus an anchor feature, or a free point in
cm), the offset, and an optional note. Endpoint anchors reference an element by id; deleting
an element takes its measurements with it.

**Backend** — `domain/stageplot.go` gains the struct and `StagePlotResponse` the collection;
`db/stage_plots.go` gains its CRUD inside the existing aggregate read; `api/stage_plots.go`
gains the routes and their validation. The anchor and offset geometry ports into
`service/stage_plot_geometry.go` alongside the projection already there, and is held to the
TypeScript suite's own assertions so screen and paper cannot answer differently.
`service/stage_plot_draw.go` gains the drawing, including the case of a dimension crossing a
sheet boundary when a view tiles across several pages.

**Frontend** — `lib/stagePlot.ts` gains the anchor derivation, hit-testing and offset maths
as pure functions; `StagePlotCanvas.tsx` gains the rendering, the armed tool, the two picks
and the three drags; `StagePlotPalette.tsx` gains a Measure section, which is the palette's
first *mode* rather than a placement; `StagePlotInspector.tsx` gains the measurement panel
and **loses its Delete on the phone's element sheet**.

**Design** — `design/patterns.md` §7g gains one paragraph, edited in the implementation
commit. No token, component or other pattern changes. The mockup for this change is
approved.

## Constitution Check

- **I. Domain-First Data Model** — a dimension is a real object on a real technical drawing,
  and it is modelled as an explicit reference to the element and feature it anchors to, never
  as a cached number or a free-text label. Its value is always derived from that reference.
- **II. Extensibility by Design** — anchors are derived from `projectedOutline`, which every
  element kind already goes through, so anchor *derivation* is one code path for rect,
  ellipse, icon resource and raked truss. There is one branch, and it is on `shape_kind`:
  an ellipse is excluded from plane mode, because it has no straight side to be
  perpendicular to at more than one point. `shape_kind` is a fixed structural enum
  (`rect`/`ellipse`/`line`/`text`), not an inventory category, so this is the kind of
  branch Principle II's carve-out for structural domain kinds expressly permits — nothing
  here would need a new endpoint or component to add an inventory category.
- **III. Full-Stack Monorepo Architecture** — one migration, `domain/` structs with no DB
  tags, data access in `db/`, handlers in `api/`, the geometry and the document in
  `service/`. No new dependency on either side.
- **IV. Inventory-Driven Rental Workflow** — no impact. A measurement is an annotation; it
  references no inventory item and never reaches the rental order.
- **V. Pragmatic Simplicity** — no new library, service or state manager. Server state stays
  in React Query, canvas drag state stays in `useState`, both as the plot canvas already
  does. The one place this change adds a concept — a tool *mode* on a palette that has only
  ever placed — is required by the gesture: a measurement is defined by two picks, and there
  is nothing to drag onto the canvas before the first of them.

No deviations.
