## Context

See `proposal.md` — Why. The machinery this needs mostly exists: Slice 40 landed
`service/audio_pdf.go`, its page furniture, the cp1252 constraint and a drawing that tiles
when it will not fit. What is new here is that the thing being drawn is a *scale* drawing —
so the scale is load-bearing rather than incidental — and that colour carries meaning for the
first time on paper.

Three constraints shape everything below.

- **The drawing logic is TypeScript and the backend cannot call it.** `lib/stagePlot.ts` is
  520 lines of projection maths; `lib/stagePlotIcons.tsx` is 627 lines of SVG glyphs. These
  two are very different problems and get different answers.
- **cp1252, no embedded font.** An unrepresentable character renders as `.` — punctuation,
  not visible damage. Anything carrying meaning is drawn.
- **`design/` is the design authority.** The colour crossing is a rule about the language,
  not a renderer detail, so its numbers live in `design/patterns.md` §8 and the code reads
  as an implementation of a stated rule.

## Goals / Non-Goals

**Goals**

- One document per plot, reproducible from a URL, testable without a browser.
- One scale across the document, chosen mechanically and stated twice — in figures and as a
  drawn bar.
- Screen and paper structurally unable to disagree about what an icon looks like.
- A colour crossing that is a named, tested function with one caller today and an obvious
  second caller tomorrow.

**Non-Goals**

- Changing anything the canvas draws. The editor is untouched apart from the glyph
  refactor, which is behaviour-preserving.
- Generalising the audio document. Its sections, tables and routing rules stay as they are.
- A print stylesheet. `StagePlotSheet` goes; browser print keeps Lighting only.
- Making the plot's stored `active_view` mean anything to the export. It stops mattering.

## Decisions

### 1. The projection is ported to Go; the glyphs are not

These look like one problem and are two.

**The projection** (`localAxes`, `screenDirection`, `projectElement`, `projectedAxes`,
`projectedOutline`, `projectedBounds`, `trussLaneLocalV`, `clampFixtureOffset`) is ~150 lines
of pure functions over numbers. It ports mechanically, and `lib/stagePlot.test.ts` gives 453
lines of assertions to port alongside it, so the Go version can be held to the TypeScript
one's answers rather than to a reviewer's judgment. The rest of `stagePlot.ts` — snapping,
drag, zoom clamping — is editor behaviour and is not ported.

**The glyphs** are 51 drawings. Porting them means maintaining two hand-written descriptions
of the same seventeen shapes, which is the arrangement that guarantees a glyph edited for the
screen quietly stops matching the paper. They become data instead (decision 2).

*Alternative rejected: post client-computed geometry with the export request.* It fails
outright when the export is asked for from a surface where the canvas is not mounted, it makes
a document's contents depend on which browser asked for it, and it puts an unvalidated
geometry payload on a `GET`. Slice 40 rejected the same alternative for the same first reason.

### 2. Glyphs become data, mirrored, with a drift gate

The path data moves out of `stagePlotIcons.tsx` into a JSON file. Each glyph is a list of
marks in the icon's own coordinate box:

```json
{ "id": "person", "label": "Person", "group": "resource",
  "defaults": { "width_cm": 60, "depth_cm": 40, "height_cm": 180 },
  "glyphs": {
    "top": [
      { "kind": "path", "d": "M6 16 C6 8 16 6 30 6 …", "fill": false },
      { "kind": "circle", "cx": 30, "cy": 22, "r": 8, "fill": true },
      { "kind": "rect", "x": 11, "y": 2, "w": 8, "h": 16, "rx": 4, "rotate": [35, 23, 11] }
    ]
  }
}
```

`stagePlotIcons.tsx` keeps its exported API — `STAGE_PLOT_ICONS`, `getStagePlotIcon`,
`iconGlyph`, `iconViewBox` — and becomes a renderer of this file into the JSX it returns
today. Its callers do not change, and its existing tests exercise the API rather than the
literals, so they should survive the refactor unedited. That is the check that the refactor
was behaviour-preserving.

**Where it lives.** Canonical at `frontend/src/lib/stagePlotGlyphs.json`, because that is
where the glyphs are authored and visually reviewed. Mirrored at
`backend/internal/service/plotglyph/glyphs.json`, embedded with `//go:embed`. A Go test reads
the frontend file through a relative path and fails if the two differ; `make sync-glyphs`
copies one over the other. `go test ./...` is a merge gate, so the two cannot drift through a
merge.

*Alternative rejected: one file imported across the boundary.* `//go:embed` cannot reach
outside the Go module, so the single file would have to sit inside `backend/` and be imported
from `frontend/src` with a `../../../backend/...` specifier plus a widened `server.fs.allow`.
That trades an enforced two-file invariant for an unenforced build-config dependency and puts
a visual asset in the backend tree. The mirror is duller and the gate is airtight.

*Alternative rejected: generate the Go from the TSX.* A generator is a third artifact to keep
working, and the drift it prevents is already prevented by a test.

### 3. The glyph renderer flattens to device-space paths

Go builds every mark as an explicit path in millimetres and strokes it at a fixed width,
rather than pushing an affine onto fpdf's transform stack.

The reason is stroke weight. An icon is stretched non-uniformly into the element's real
footprint — that is what `preserveAspectRatio="none"` does on screen, and the canvas
compensates with `vector-effect: non-scaling-stroke`. A PDF transform has no such escape: it
scales the pen with the geometry, so a wide-and-short element would be drawn with a fat
horizontal stroke and a thin vertical one. Flattening the geometry and setting
`SetLineWidth` explicitly gives a constant hairline, which is what a drawing needs.

It also collapses the renderer to one pipeline. Under a general affine a circle is not a
circle and a rounded rect is not a rect, so both become Béziers anyway — the standard
four-cubic circle at κ = 0.5523. `A` appears twice in the whole icon set (the fixture's lens
in two views); it is converted from SVG's endpoint parameterisation to centre form and then
emitted as cubics through the same path. The subset the parser must handle is therefore
`M L C A Z` plus `rect` (with optional `rx` and `rotate`) and `circle` — everything the file
actually contains, and it is validated: a mark the parser does not understand fails a test,
it does not silently vanish from the page.

fpdf supplies `MoveTo`, `LineTo`, `CurveBezierCubicTo`, `ClosePath` and `DrawPath`, so no new
dependency is needed.

### 4. The colour crossing is its own unit, and it is a clamp, not an inversion

`service/paper_ink.go`, one exported function, no knowledge of plots or PDFs:

1. No colour set → the document's ink.
2. Convert to HSL. If the colour already meets the contrast floor against white, return it
   unchanged.
3. Otherwise binary-search lightness downward, holding hue and saturation, for the highest
   lightness that meets the floor; clamp at the lightness floor.
4. Quantise to 8 bits **downward** and re-check, stepping one step darker until the floor is
   genuinely met. Without this the rounding lands a hair under — the mockup measures 4.48:1
   where it intends 4.5:1 — and a floor that is not quite met is not a floor.

The floor values live in `design/patterns.md` §8 and the code cites them. It is separate from
the document because it is a statement about the design language crossing media, and the
plot is simply its first caller.

**Why not the inversion the roadmap named.** Inverting a near-grey's lightness was the stated
mechanism, and it is wrong in a way real data exposes immediately. The `Kyrkan` plot's Venue
layer is `#5e5c64` — 4% saturation, L 37.6%, and already legible on white at 6.58:1.
Inverting gives L 62.4%, `#9d9ba3`, **2.74:1**. The rule would have degraded the only layer
that needed no help. A downward clamp does what the inversion was reaching for on the light
end — a pale grey still comes out dark — and correctly does nothing on the dark end.

### 5. Three world windows and one shared frame

The scale and the framing are computed once for the document, not per view:

- Take the union of all visible elements' projected bounds and derive three windows — X
  (stage width), Y (stage depth), Z (height, starting at the floor).
- The top view draws X × Y, the front X × Z, the side Y × Z. Two views sharing a world axis
  share its window, which is what registers them.
- Walk the scale ladder from largest to smallest and take the first at which all three fit
  the common frame.
- Each window is centred in the frame; the elevations instead stand on a floor pad, so they
  share a datum. Because two views sharing a window share its span, centring is stable —
  registration survives it.

This is the whole of the "prettier layout" ask, expressed as an invariant rather than as
spacing. The current sheet's fit-to-content framing is what has to go: it gives each view its
own scale and its own origin, so nothing can be read across views.

### 6. Page furniture is extracted from the audio document, not copied

`audio_pdf.go`'s masthead already carries the comment that it exists so "the same block serves
a plot document with one word changed." The masthead, running head and footer move to
`service/paperdoc.go`, parameterised by page width — the audio document is portrait at 210 mm
and this one is landscape at 297 mm, which is the only real difference between them.

The risk is churn in a file merged this week; the mitigation is that `audio_pdf_test.go`
asserts against the audio document's output and is not modified, so a regression in the
extraction fails the gate rather than reaching a user. Two hand-maintained mastheads would
drift the same way two hand-maintained glyph sets would.

### 7. Tiling reuses the rule, not the code

§8a already states the behaviour: divide rather than shrink, cut between objects and never
through one, state the scale on every part. Slice 40's tiler works over a laid-out graph's
boxes; this one divides a fixed-scale drawing frame in two axes. The rule is shared and the
implementations are separate, because forcing one abstraction over a graph layout and a scale
drawing would serve neither.

No plot in this database comes close to needing it — `Kyrkan` lands at 1:100 with room to
spare — so it is covered by a synthetic test rather than by real data, and that limitation is
recorded rather than papered over.

## Risks / Trade-offs

- **The glyph refactor touches the canvas.** → `stagePlotIcons.tsx` keeps its exported API
  and its 453-line test suite unedited; if those tests need changing, the refactor was not
  behaviour-preserving and that is the signal to stop and look.
- **Extracting the audio document's furniture could regress a shipped document.** → The audio
  tests are the guard and are not touched. If the extraction cannot keep them green, the
  furniture is duplicated instead and the duplication is recorded.
- **The projection is now implemented twice.** → Mitigated, not eliminated. The Go port is
  held to the TypeScript suite's assertions, so the two agree today; nothing stops them
  diverging later. The alternative was worse (decision 1).
- **A synthetic tiling test is weaker than real data.** → Accepted and recorded. Slice 40
  left the same gap, and its legibility floor is still a guess. This slice does not close it.
- **Fixture balloons could collide on a densely hung bar.** → The mockup's plot has three
  fixtures on a 6 m bar. Marks at a shared point are a legibility problem the drawing should
  detect rather than draw over; if collision handling proves necessary it is a follow-up, not
  a silent overlap.

## Migration Plan

No migration — the document reads existing tables. Deployment is the single binary. The one
user-visible removal is `StagePlotSheet`: after this change the stage plot's toolbar downloads
a document instead of opening the browser's print dialog, and the browser-print path for the
plot is gone. Lighting keeps `PrintButton`, so both mechanisms still coexist and §8's table
still has two rows.

## Open Questions

- Whether the element schedule should also state each element's resolved links (the inventory
  items and people attached to it). It is stored and it is useful, but it is a column set
  nobody asked for, and it can be added later without changing any requirement here.
