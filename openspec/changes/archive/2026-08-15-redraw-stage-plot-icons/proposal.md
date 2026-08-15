# Redraw the stage plot icon set

## Why

The seventeen built-in stage plot icons were drawn once, alongside the machinery
that renders them, and most of them do not look like the thing they name. A
saxophone reads as a quaver, a cello's plan as a jug, an electric guitar's as a
lollipop. An icon that has to be identified from its label is not doing the job
an icon exists for — and the same shapes now go onto paper, where there is no
hover, no inspector and no label to fall back on.

Only four glyphs survive review: person front and side, drums top and front, and
keyboard side. Everything else is redrawn.

## What Changes

- Every glyph in `frontend/src/lib/stagePlotGlyphs.json` is rebuilt against
  photographic and vector references, in one style.
- **The style becomes a filled one.** A glyph is a solid body in `currentColor`;
  the detail that identifies it is negative space — a reverse-wound hole inside
  the same filled path, or a gap between two filled shapes. A stroked line is
  used only where the object genuinely is a line in that view (a mic stand's
  shaft, a cymbal stand, a truss chord). The old set was stroke-only, which at
  the 30–60 px an element actually occupies at stage zoom spends most of the
  icon on its own outline.
- The four accepted glyphs keep their composition but are converted to the new
  style, because a set that is half outline and half silhouette is not a set.
- The top view is stated to be an identifying plan symbol, not a strict
  orthographic projection. A guitar seen truly from above is an unreadable
  sliver; a small guitar drawn into the footprint is what a stage plot means.
- No change to the renderers. The glyph vocabulary the two of them already
  support — `path` (absolute `M L C A Z`), `circle`, `rect`, `fill`, `dash`,
  `rotate` — is enough for the new style, because SVG's default `fill-rule` is
  nonzero and fpdf's `F` is the PDF `f` operator, also nonzero. A hole authored
  by winding its subpath the other way therefore comes out identically on screen
  and on paper.
- A render harness (`scripts/render_glyphs.py`) draws the set to a PNG contact
  sheet, so a glyph can be looked at rather than read as JSON.

## Capabilities

### New Capabilities

- `stage-plot-icon-set`: what the built-in icon set must hold — a glyph for
  every icon in every view, the mark vocabulary both renderers agree on, how a
  hole is authored so the two agree about it, and what the three views mean.

### Modified Capabilities

None. `stage-plot-document-export` already requires that screen and paper draw
an element from one definition; this change keeps that arrangement and only
changes what the definition says.

## Impact

- `frontend/src/lib/stagePlotGlyphs.json` — rewritten. It is the only file the
  shapes live in.
- `backend/internal/service/plotglyph/glyphs.json` — its verbatim mirror,
  refreshed by `make sync-glyphs`. A test in that package fails while the two
  differ.
- `scripts/render_glyphs.py` — new; the review harness.
- No API, schema, migration or component change. `frontend/src/lib/stagePlotIcons.tsx`,
  `StagePlotCanvas`, `StagePlotPalette` and the Go renderer are untouched — they
  read the JSON and none of them knows what is in it.
- `design/` is untouched. It does not describe the plot glyphs, and this change
  does not give it a reason to start.

## Constitution Check

- **I. Domain-First Data Model** — no domain change. A glyph is presentation and
  stays in the presentation layer's data file; no struct, table or migration is
  touched.
- **II. Extensibility by Design** — improved, marginally. The mark vocabulary is
  unchanged, so a future icon is added the same way it always was, and the
  fill-rule convention is written down rather than left to be rediscovered.
- **III. Full-Stack Monorepo Architecture** — respected. One description of a
  glyph, two renderers, the mirror enforced by an existing test.
- **IV. Inventory-Driven Rental Workflow** — not engaged.
- **V. Pragmatic Simplicity** — respected, and the reason no renderer changes.
  Even-odd fill, a background-colour stroke or an SVG mask would each have made
  the drawing easier and the system larger; reverse winding costs nothing
  because both renderers already do it.

No deviation to record.
