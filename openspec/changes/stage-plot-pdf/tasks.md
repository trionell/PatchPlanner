## 1. The colour crossing

- [x] 1.1 Write `backend/internal/service/paper_ink.go`: hex → HSL, WCAG relative luminance and contrast against white, and the crossing itself — unset returns the document ink, an already-legible colour returns unchanged, otherwise lightness is searched downward at constant hue and saturation to the contrast floor, clamped at the lightness floor.
- [x] 1.2 Quantise the result to 8 bits downward and step one unit darker until the contrast floor is genuinely met, so rounding cannot land just under it.
- [x] 1.3 Test with the real layer colours from the `Kyrkan` plot — `#a1a1aa`, `#5e5c64`, `#62a0ea`, `#ffa348` — asserting the exact resulting inks, that `#5e5c64` comes back untouched, and that every result clears the floor. Add a table case asserting a very dark colour stops at the lightness floor rather than becoming the ink.
- [x] 1.4 Test that an unset colour returns the document ink and never the canvas default.

## 2. The glyphs become data

- [x] 2.1 Write `frontend/src/lib/stagePlotGlyphs.json` from the 17 icons × 3 views currently in `stagePlotIcons.tsx`, using the mark schema in `design.md` decision 2. Transcribe path data verbatim; do not redraw anything.
- [x] 2.2 Rewrite `stagePlotIcons.tsx` as a renderer of that file, keeping `STAGE_PLOT_ICONS`, `getStagePlotIcon`, `iconGlyph` and `iconViewBox` and their exact signatures.
- [x] 2.3 Run the existing frontend tests unedited. If any assertion has to change, stop — the refactor was not behaviour-preserving.
- [x] 2.4 Mirror the file to `backend/internal/service/plotglyph/glyphs.json`, embed it with `//go:embed`, and add `make sync-glyphs`.
- [x] 2.5 Add a Go test that reads the frontend file and fails if the two copies differ.
- [x] 2.6 Add a Go test that every icon in the file parses, every view resolves, and no mark uses a command outside the supported subset.

## 3. The glyph renderer in Go

- [x] 3.1 Write `plotglyph`'s path parser for the subset `M L C A Z` (absolute), emitting points in glyph coordinates.
- [x] 3.2 Convert `A` from SVG's endpoint parameterisation to centre form and emit it as cubic Béziers.
- [x] 3.3 Express `rect` (with optional `rx` and `rotate`) and `circle` as paths, so a non-uniform stretch has one code path — a circle becomes four cubics at κ = 0.5523.
- [x] 3.4 Apply the glyph→element affine to every point in Go and emit through `MoveTo`/`LineTo`/`CurveBezierCubicTo`/`ClosePath`/`DrawPath`, setting line width explicitly so the stroke stays a constant hairline under a non-uniform stretch.
- [x] 3.5 Test that a stretched glyph's extremes land on the element's footprint, and that a parse failure is an error rather than a silently missing mark.

## 4. The projection, ported

- [x] 4.1 Port `localAxes`, `screenDirection`, `projectElement`, `projectedAxes`, `projectedOutline` (with its convex hull), `projectedBounds`, `trussLaneLocalV` and `clampFixtureOffset` to `backend/internal/service/stage_plot_geometry.go`. Do not port snapping, drag or zoom — they are editor behaviour.
- [x] 4.2 Port the assertions from `frontend/src/lib/stagePlot.test.ts` that cover those functions, so the Go answers are held to the TypeScript ones.
- [x] 4.3 Add a case for the `Kyrkan` truss — 600 cm, yaw 32°, rake 31° — asserting the outline is the six-sided silhouette a combined yaw and rake produces, not a rectangle.
- [x] 4.4 Apply the editor's derived truss geometry (length from its pieces, fixed depth, hung at the truss height, name falling back to the truss's) so the document and the canvas agree about what a truss is.

## 5. Shared page furniture

- [x] 5.1 Extract the masthead, running head and footer from `audio_pdf.go` into `service/paperdoc.go`, parameterised by page width and by the word that stands opposite the event name.
- [x] 5.2 Point `audio_pdf.go` at the extracted furniture and run `audio_pdf_test.go` unedited. If it cannot stay green, duplicate the furniture instead and record why in `design.md`.

## 6. The document

- [x] 6.1 Load one plot with its layers, elements, trusses and truss fixtures, filtering to visible layers.
- [x] 6.2 Compute the three world windows (X, Y, Z) from the union of projected bounds, with the height window starting at the floor.
- [x] 6.3 Walk the scale ladder and choose the largest scale at which all three views fit the common frame; centre each window in the frame and stand the elevations on the floor pad.
- [x] 6.4 Draw the shared frame, the stepped-up grid, and the axis names; state the plot's grid size and the interval actually drawn.
- [x] 6.5 Draw elements: shapes, icons through `plotglyph`, and the truss as its projected outline, each in its layer's paper ink.
- [x] 6.6 Draw the floor datum on the elevations — solid rule, hatching beneath, labelled zero.
- [x] 6.7 Label every named element in the top view; in the elevations label only elements above the floor.
- [x] 6.8 Draw truss fixtures as numbered marks at their true point on the bar, hanging below the underside in the elevations.
- [x] 6.9 Draw the title block on all three drawing sheets: scale in figures, the graduated bar, the grid statement, the layer key with inks and counts, the truss schedule, the conventions.
- [x] 6.10 Draw the element schedule sheet: grouped by layer under its paper ink, with the repeating column header, unnamed elements listed by what they are, and the truss's bar and fixtures as continuation lines.
- [x] 6.11 Handle the empty plot — all four sheets, each drawing sheet stating in words that the plot is empty.
- [x] 6.12 Divide a view that will not fit at the smallest scale across sheets, cutting between elements, each part stating its position in the set.

## 7. The endpoint

- [x] 7.1 Register `GET /stage-plots/{plotID}/export/pdf` inside the existing plot router so `RequireEventAccess` already covers it, and return the document as an attachment named for the event and the plot.
- [x] 7.2 Test access: an owner, a contributor and a viewer all receive the document; a user without access does not.
- [x] 7.3 Test that a plot id belonging to another event is refused as not found.
- [x] 7.4 Test that two plots on one event produce two documents, each holding only its own plot.
- [x] 7.5 Test that the document does not vary with the plot's stored active view.

## 8. The frontend

- [x] 8.1 Give `StagePlotTab` the download in place of `PrintButton`, naming the plot it exports.
- [x] 8.2 Delete `components/print/StagePlotSheet.tsx` and its cases in `printSheets.test.tsx`. Leave `PrintSheet` — Lighting and Signal Flow still use it.
- [x] 8.3 Confirm `LightingTab` still reaches browser print unchanged.

## 9. The design language

- [x] 9.1 Amend `design/patterns.md` §8: replace the claim that paper is black on white with nothing depending on a hue, state when colour carries and when it is merely repeated, and give the contrast floor and lightness floor their numbers.
- [x] 9.2 Add the dark-ground-to-paper crossing to §8 as a rule of the language, applying beyond this one document.
- [x] 9.3 Check §8's two-mechanism table still reads correctly now that the stage plot has moved to a server-written document and only Lighting remains on browser print.

## 10. Verification

- [x] 10.1 Run the gates: `gofmt -l .`, `go vet ./...`, `go test ./...`, then `npx tsc -b`, `npx eslint src`, `npx vitest run`, `npx vite build`.
- [x] 10.2 Generate the document from a copy of the real database against the `Kyrkan` plot, and check it against the approved mockup: 1:100, the grid drawn every fourth line, the truss registered between sheets 1 and 2, the four inks, four sheets.
- [x] 10.3 Review the implementation against `specs/stage-plot-document-export/spec.md` scenario by scenario, and fix what review finds.
- [x] 10.4 Update `ROADMAP.md` — mark Slice 41 done with the date, and record the decisions worth keeping, including the correction to the inversion rule.
