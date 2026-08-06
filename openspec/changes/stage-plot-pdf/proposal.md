# The stage plot becomes one generated document

## Why

The stage plot reaches paper through the browser, and what comes out is one drawing of
whichever view the editor happened to be left on. `StagePlotSheet.tsx:16` reads
`plot.active_view` and renders that and nothing else, so the printed sheet depends on editor
state — a plot printed on Tuesday and the same plot printed on Wednesday are different
documents. The drawing is framed to its own content with a 60 cm margin and capped at
`160mm`, which gives each view a different scale, and the caption says *drawn to scale*
without ever saying what the scale is. A crew that measures off a printout cannot use it.

The user asked for the rest in one sentence: *"Stage plots I just want to make prettier with
layout and color and have all three angles."* Colour is the part that is not a preference.
Layer colour is the plot's entire palette — elements carry none of their own
(`types/index.ts:734-755`) — and every layer colour was picked to read on a near-black canvas
(`StagePlotCanvas.tsx:474`, default `#a1a1aa`). On white paper those values wash out: the
`Kyrkan` plot's own layers measure 2.56:1, 2.71:1 and 1.98:1 against white. How a value chosen
for the dark ground crosses onto paper is a rule about the design language, not a detail of a
renderer, which is what makes this a slice.

Slice 40 built the machinery a week ago. This is the second, cheaper use of it.

## What Changes

- **New endpoint** `GET /api/v1/events/{eventId}/stage-plots/{plotId}/export/pdf` returns one
  A4 **landscape** PDF of **one plot** — not one event. An event holds several plots, and the
  document is of the plot the user is looking at.
- **Four sheets, always, in order**: top view, front view, side view, element schedule. The
  three views are drawn whether or not the editor was showing them, which removes the
  dependence on `active_view` entirely.
- **One scale for the whole document**, chosen from the ladder 1:20, 1:25, 1:50, 1:100,
  1:200, 1:250, 1:500 as the largest at which every view fits the common frame, and **stated
  in figures and drawn as a bar**. A bar survives a photocopier's resizing; the figure does
  not.
- **The three views register.** Three world windows — stage width, stage depth, height — are
  computed once and shared between the views that use them, so a vertical dropped from the
  plan meets its element in the front elevation, and the two elevations stand on one floor
  datum. This is what a fixed scale buys and what fit-to-content framing destroys.
- **Colour, with the crossing stated as a rule.** A layer colour keeps its hue and saturation
  and has its lightness lowered until the ink clears a contrast floor against white — and no
  further, so a colour already dark enough is untouched. A layer with no colour set prints as
  the document's ink rather than as the screen's default grey. **This corrects the mechanism
  the roadmap named:** inverting a near-grey's lightness would take the `Kyrkan` plot's Venue
  layer from 6.58:1 to 2.74:1, breaking the one layer that needed no help.
- **A title block on every drawing sheet** — scale and bar, grid, the layer key, the truss
  schedule, the conventions — because a rigger pulls out one sheet and it has to still read.
- **A truss fixture is a numbered balloon on the drawing and a named row in the schedule.**
  At 1:100 a fixture is 3 mm across and its label is 22 mm of type; the number is the join.
- **The floor becomes a datum** on the elevations — a solid rule with hatching beneath, not a
  dashed line. Dashes stay reserved for what is unresolved.
- **An elevation labels only what is off the floor.** Naming every element in an elevation
  piles the whole floor-standing rig into one illegible line along the datum; the plan is
  where a thing is identified, the elevation is where its height is read.
- **The icon glyphs move to one data file both sides read.** **BREAKING** for anything
  importing the glyph JSX out of `lib/stagePlotIcons.tsx`. 627 lines of SVG for 17 icons ×
  3 views cannot be called from Go, and duplicating the path data guarantees a glyph edited
  for the screen silently stops matching the paper. The path data becomes data; the TSX
  becomes a renderer of it, and Go grows a renderer of the same subset onto the page.
- **A plot too large for 1:500 tiles across pages** rather than refusing, cut between
  elements and never through one, each tile stating its position in the set — the mechanism
  Slice 40 already built for the flow drawing.
- **`design/patterns.md` §8 is amended.** It states *black on white… nothing that depends on
  a hue*, and *colour on paper is carried and never load-bearing*. That was true of a browser
  print of a table. It is not true of a scale drawing where colour is how a layer is told
  from a layer, and §8 has to say when colour carries and how a dark-ground value crosses.
- **`components/print/StagePlotSheet.tsx` is deleted** once it has no caller, and
  `StagePlotTab`'s `PrintButton` becomes the download. `PrintSheet` stays — Lighting and
  Signal Flow still use it.

The design was mocked up and **approved by the user** before this proposal:
`openspec/changes/stage-plot-pdf/mockup.html`, drawn from the live `Kyrkan` plot with
`lib/stagePlot.ts` ported verbatim. Its decisions D1–D13 are the source of the requirements
in `specs/`.

## Capabilities

### New Capabilities

- `stage-plot-document-export`: What the application produces when asked for a stage plot on
  paper — one document per plot, which sheets it holds and in what order, how one scale is
  chosen and stated, how the views are registered to each other, how a colour chosen for the
  dark canvas crosses onto white paper, and what happens when the plot will not fit.

### Modified Capabilities

None. `audio-document-export`'s requirements are scoped to that document and are untouched;
`destructive-confirmation` is unrelated. The paper rule that both documents share lives in
`design/patterns.md` §8, which is the design authority and deliberately not duplicated here.

## Impact

**Backend**

- New: `internal/service/stage_plot_pdf.go` (the document and its page furniture),
  `stage_plot_geometry.go` (the projection ported from `lib/stagePlot.ts` — pure, and the
  only part of that file paper needs), `plotglyph/` (the shared glyph data plus the SVG path
  subset renderer onto `fpdf`), and `paper_ink.go` (the dark-ground-to-paper colour crossing,
  kept separate because it is a rule about the design language and will have a second
  caller).
- New route registered inside the existing `/stage-plots/{plotID}` router in
  `api/stage_plots.go`, so `RequireEventAccess` already covers it — an export reads, and a
  viewer may read.
- Reads existing tables only. **No migration.**
- Inherits Slice 40's constraint verbatim: built-in Helvetica through a cp1252 translator, no
  embedded font file. Every mark that carries meaning is drawn.

**Frontend**

- `lib/stagePlotIcons.tsx` keeps its registry and its API (`iconGlyph`, `iconViewBox`,
  `STAGE_PLOT_ICONS`) but reads its path data from the shared file instead of holding it as
  JSX. Its 453-line test suite covers the API, not the literals, so it should survive.
- `StagePlotTab` swaps `PrintButton` for the download. `LightingTab` keeps `PrintButton`.
- Deletions: `print/StagePlotSheet.tsx` and its cases in `print/printSheets.test.tsx`. That
  coverage moves to Go tests against the generated document.

**Design**

- `design/patterns.md` §8 amended in the same commit as the code. This is the edit that made
  a mockup mandatory.

**Dependencies**

None new. `go-pdf/fpdf` is already a direct dependency.

## Constitution Check

- **I · Domain-First Data Model** — Upheld. The document is a second reader of the stored
  plot: it walks elements, layers, trusses, truss fixtures and their resolved links, and
  projects them through the same orthographic model the editor uses. It invents no
  representation of its own — the schedule states the stored centres, dimensions, yaw and
  rake in the units they are stored in, and the truss's derived geometry is the editor's,
  not a second opinion.
- **II · Extensibility by Design** — Upheld, and improved. Moving the glyphs to data means a
  new icon is a data entry rather than two hand-written renderers. Nothing branches on an
  icon id, a layer name or a shape kind; an unknown icon falls back to the existing labelled
  placeholder on paper exactly as it does on screen.
- **III · Full-Stack Monorepo Architecture** — Upheld. New code lands in `internal/service/`
  and one handler in `internal/api/`, under `/api/v1/...`. No migration. The shared glyph
  file is the one structural novelty and is handled in `design.md` with a drift gate rather
  than a build step.
- **IV · Inventory-Driven Rental Workflow** — Not engaged. This is planning documentation and
  makes no claim about stock. The rental export is untouched.
- **V · Pragmatic Simplicity** — Upheld, with one judgment recorded. Porting the projection
  to Go is a second implementation of maths that already exists in TypeScript, which reads
  like duplication. It is not avoidable: the alternative is posting client-computed geometry,
  which fails outright when the export is requested from a surface where the canvas is not
  mounted, and which would make a document's contents depend on the browser that asked for
  it. The projection is 150 lines of pure functions with an existing 453-line test suite to
  port assertions from. The glyphs, which are the bulk, are explicitly *not* duplicated —
  that is what the shared data file is for.

**Deviations:** none.
