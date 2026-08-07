## 1. Schema and domain

- [x] 1.1 Write `backend/migrations/051_stage_plot_measurements.up.sql` and its `.down.sql`, per design D3 — plot and layer foreign keys cascading, both element references nullable and cascading, view, type, the two endpoint triples, `offset_cm`, `note`, `sort_order`.
- [x] 1.2 Add `StagePlotMeasurement` to `backend/internal/domain/stageplot.go` and a `Measurements` field to `StagePlotResponse`.
- [x] 1.3 Add the mirroring TypeScript types to `frontend/src/types/index.ts`.

## 2. Geometry, in both languages

- [x] 2.1 In `frontend/src/lib/stagePlot.ts`: resolve a stored anchor to a point in a view — `centre`, a box corner through `projectedAxes`, a face centre.
- [x] 2.2 Resolve a face anchor to its projected line, and compute the foot of a perpendicular from a point onto it, including the case where the foot falls beyond the drawn side.
- [x] 2.3 Compute the offered features for an element in a view: corners that are silhouette vertices, faces whose projected normal is non-negligible, plane mode excluded for `ellipse`.
- [x] 2.4 Compute a measurement's span and stated value for each of the three types, including a locked type against a face line (foot at the axis ray, not the perpendicular).
- [x] 2.5 Compute the drawn dimension line from the span and `offset_cm`, plus the extension lines, and the flip.
- [x] 2.6 Vitest suite over 2.1–2.5, including a raked element whose silhouette is a hexagon, a face turned face-on, and an ellipse.
- [x] 2.7 Port 2.1–2.5 into `backend/internal/service/stage_plot_geometry.go`.
- [x] 2.8 Go test asserting the ported functions against **the same cases and the same expected numbers** as 2.6, in the manner `stage_plot_geometry_test.go` already does for the projection.

## 3. Persistence and API

- [x] 3.1 CRUD for measurements in `backend/internal/db/stage_plots.go`, read as part of the existing aggregate so the plot stays one round trip.
- [x] 3.2 Routes and validation in `backend/internal/api/stage_plots.go`: view and type enums, endpoint exclusivity (element+feature XOR free point), feature string parsing, layer belongs to the plot, element belongs to the plot.
- [x] 3.3 Reject a plane-mode pair whose faces are not parallel in the measurement's view.
- [x] 3.4 `httptest` coverage: create/update/delete, each validation rejection, the aggregate read carrying measurements, and cascade — deleting an element removes measurements anchored at either end while leaving free-ended ones alone.
- [x] 3.5 Count the measurements an element delete takes with it, for the confirmation to state. Derived on the client from the aggregate read, which already carries every measurement — a second endpoint would be a second answer to a question the client can already answer. One anchored at both ends counts once.
- [x] 3.6 Client bindings in `frontend/src/api/stagePlots.ts`.

## 4. The canvas

- [x] 4.1 Render a measurement: dimension line, terminators, extension lines, right-angle mark on a plane foot with the run-out where needed, value and optional note — screen-sized furniture written `n / zoom`, geometry in cm (D5).
- [x] 4.2 Draw every measurement in one annotation ink, never in its layer's colour, so layer colour keeps meaning equipment identity alone. Cover it with a render test over measurements on layers of differing colours.
- [x] 4.3 Place the value outside the measurement when it will not fit between the terminators.
- [x] 4.4 Draw only the measurements belonging to the view being shown; switching views draws the new view's and none of the others'.
- [x] 4.5 Draw measurements above all elements, and only where their own layer is visible and every anchored element is visible.
- [x] 4.6 Paint thin, hit-test on a separate transparent stroke, desk and hand widths, elements hit-testing first.
- [x] 4.7 Anchor aiming: the three zones along a side, the offered-feature highlight, and the distinct highlight for a face's pinned point versus its plane, using `SNAP_THRESHOLD_PX`.
- [x] 4.8 The two-pick draw, with the in-progress rubber band, committing at zero offset.
- [x] 4.9 Drag the dimension line to set `offset_cm`, snapped to the plot grid, with the value not changing.
- [x] 4.10 Drag an endpoint grip to re-anchor, including onto a free point that snaps to the grid.
- [x] 4.11 Suppress every grip and drag when the measurement's layer is locked, leaving it selectable and readable.

## 5. Palette, inspector and the phone

- [x] 5.1 Measure section in `StagePlotPalette.tsx` — three tiles that arm a mode rather than place; `M` arms, `Esc` leaves, a completed measurement leaves the tool armed.
- [x] 5.2 Measurement panel in `StagePlotInspector.tsx`: value stated with no input, type as a Select, both ends stated on two lines with no control, offset with Flip, note, layer, Delete with no confirm.
- [x] 5.3 The phone's measurement sheet: both ends, type and value stated, note editable, no footer, safe-area inset on the body, **no Delete**.
- [x] 5.4 Remove the Delete from the phone's element sheet — gate `StagePlotInspector.tsx:576` on `spatial`, leaving the desk unchanged.
- [x] 5.5 Widen the plot panel's withheld-gesture sentence to name drawing measurements and to say what the phone can still do.
- [x] 5.6 Vitest render coverage for 5.2–5.4 via `renderToStaticMarkup`, asserting the phone sheet has no delete control and the desk rail does.

## 6. The document

- [x] 6.1 Draw measurements on each view's sheet in `stage_plot_draw.go`, in the document's ink, told from equipment by line weight, under the canvas's visibility rules.
- [x] 6.2 Derive every printed value server-side from the stored anchors; accept no value from the client.
- [x] 6.3 Draw a measurement that spans a tile division on every part it reaches, each stating the full value.
- [x] 6.4 Add the measurement conventions row to the sheet key; leave the element schedule alone.
- [x] 6.5 Go tests: a dimensioned plot's sheets, a hidden anchor's measurement absent, a divided drawing's measurement present on both parts, and a printed value equal to the geometry test's expected number.

## 7. Design language

- [x] 7.1 Insert the approved paragraph into `design/patterns.md` §7g, after the gesture paragraph, in the same commit as tasks 5.3 and 5.4.

## 8. Validation

- [ ] 8.1 Run the Gates: `cd backend && gofmt -l . && go vet ./... && go test ./...`, then `cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build`.
- [ ] 8.2 Verify against a copy of the real database in `/tmp` with `PATCHPLANNER_DB` pointed at it — draw each anchor kind on a real plot, produce the document, and read the same value in both.
- [ ] 8.3 Review against the specs and the approved mockup; fix what review finds.
- [ ] 8.4 Write the slice's outcome into `ROADMAP.md` as Slice 42, and add it to the **What remains** index until it lands.
