## Context

See proposal.md — Why. The constraints that shape the drawing:

- **The coordinate box is the footprint, and it is not negotiable.** A view's
  box comes from the icon's default real-world size: top is width×depth, front
  width×height, side depth×height. The canvas stretches the glyph into the
  element's actual footprint with `preserveAspectRatio="none"`. A guitar's top
  box is therefore 45×40 — nearly square — whatever one would rather draw in it.
- **The set is drawn small.** `pxPerCm` is the zoom, so a plan of a 12 m stage
  in an 800 px viewport is about 0.7 px/cm and a 45 cm guitar is 30 px across.
  The palette is worse: it draws the top view into a 20 px square.
- **One colour.** Marks paint in `currentColor`, the layer tint. There is no
  second ink and no background colour a glyph can name.
- **Two renderers, one description.** `stagePlotGlyphs.json` is mirrored to
  `plotglyph/glyphs.json`; a test fails while they differ.

## Goals / Non-Goals

**Goals**

- One drawing style across all seventeen icons and all three views.
- A round trip: the drawings can leave as SVG, be edited by hand, and come
  back without losing what was drawn.
- Every glyph identifiable at plan scale, from its shape alone.
- No change to either renderer, to `stagePlotIcons.tsx`, or to the canvas.
- A harness that renders the set so it can be reviewed by eye.

**Non-Goals**

- Changing an icon's default real-world size, except where a default is
  factually wrong about the object. Defaults set the footprint an element takes
  on the plan; drawing convenience is not a reason to move one.
- Adding icons. The set stays at seventeen.
- Adding a mark kind, a path command, a fill rule or a stroke colour.
- Touching `design/`. It does not describe these glyphs.

## Decisions

### Filled bodies, with detail as absence

A stroked outline at the sizes above spends most of the icon on its own line:
3.5 px of non-scaling stroke on a 30 px shape is a fifth of the width, twice
over. A filled silhouette carries the same information in the shape itself, and
that is also what every reference the user supplied is.

Because there is one colour, detail cannot be drawn *onto* a body. It is drawn
as absence, two ways:

1. **A hole** — a subpath of the same filled path, wound opposite to the body.
   SVG fills nonzero by default and fpdf's `F` emits the PDF `f` operator, also
   nonzero, so the two agree with no renderer change and no `fill-rule`
   attribute. This is the soundhole, the speaker's driver, the piano's keys.
2. **A gap** — two filled marks with background between them. This is the ring
   around the person's head in plan, and the space between a truss's chords.

*Alternatives considered.* Even-odd fill needs `F*` in Go and `fill-rule` in
the JSON — a new field, two renderer changes, and a second way to say the same
thing. A stroke in the background colour cannot work: the background is a theme
and a layer tint, not a value a glyph knows. An SVG mask has no counterpart in
fpdf at all.

*Consequence to respect while drawing.* Shapes that **overlap** go in separate
marks, never in one path: under nonzero two overlapping subpaths wound against
each other cancel, and the overlap comes out as a hole — which is how a guitar's
neck cut a wedge out of its own body. Only a shape wholly *inside* another
belongs in the same path. And a filled mark laid over a filled body in the same
colour is invisible, which is not a rule about holes but the same fact from the
other side; it swallowed a stage monitor's driver whole.

A hole must also be big enough to survive.
Below roughly 8% of the box's short side it closes up at plan scale, so a glyph
gets two to four identifying holes, never a scatter of small ones.

### Stroke survives where the object is a line

A mic stand's shaft, a cymbal stand, a hi-hat rod, a cello's endpin: filling
these makes a blob. They stay stroked, at the existing 3.5 px non-scaling
width. This is not a second style — nothing is stroked *and* filled, and no
stroke sits on top of a fill, where it would be invisible anyway.

### The top view identifies; it does not project

A guitar seen truly from above is a 45×40 sliver nobody can name. Stage plots
have always drawn plan symbols rather than projections, and the user's brief
says the same ("a guitar might be fine to be the same in all views"). So:

- **Objects with a real plan** — drums, both pianos, keyboard, truss, speaker,
  monitor, rack, fixture, mic, person — get their plan, with parts where they
  actually are. These are the ones a plan is *for*: they tell you which way a
  wedge points and where the kit's throne is.
- **Held instruments** — both guitars, bass, cello, saxophone — get a small
  drawing of themselves, laid diagonally across the near-square top box. The
  diagonal is not decoration: it fills a square box with a long object without
  the `preserveAspectRatio="none"` stretch squashing it, and an instrument on a
  stand does lean. The user's own electric guitar reference is drawn this way.
- **Trumpet** lies flat in every box (55×20, 55×15, 20×15) and carries one
  drawing in all three. The bell end-on was tried for the side and rejected: a
  ring on a foot is unnameable on its own, and a trumpet that is recognisably a
  trumpet in a view that is not quite a projection beats a correct view of
  nothing.

### The drawings are drawn by hand, and travel by SVG

Three rounds of drawing them from a description ended with the reviewer
concluding the improvement was not worth the rounds, and taking the pencil.
That is the right outcome and the workflow now supports it: `export_glyphs.py`
writes one SVG per icon per view and `import_glyphs.py` reads them back.

One file per icon per view, not one per icon. Each view has its own coordinate
box in real centimetres — a person's plan is 60×40, its front 60×180 — so three
views cannot share a canvas. One file per view makes the `viewBox` the
footprint: the artboard edge is the element's real size.

The import is not a copy. A drawing program emits relative commands,
transforms, quadratics, rounded rects, ellipses, even-odd fills and hidden
leftovers; the glyph file holds absolute M/L/C/Z in one flat space, filled
nonzero. Three things the conversion has to get right, each learned by getting
it wrong:

- **Winding is rebuilt, not trusted.** Each subpath is wound by its nesting
  depth, which makes nonzero agree with even-odd whichever the source used. The
  author never has to think about direction.
- **Hidden shapes are not shapes.** A drawing program hides an old version
  rather than deleting it. Importing one drew the previous person on top of the
  new one.
- **Paint in the background colour becomes geometry.** A white stroke over two
  overlapping black shapes is the ordinary way to hold them apart, and the
  ordinary way to draw the gap this language calls for — but one colour cannot
  carry it. Such a file is rendered exactly as the drawing program shows it and
  the black regions traced back out, so the result is what the eye was shown by
  construction. Marching squares over the raster; there is no geometry library
  on this machine and this needs none.

Every import is verified: each glyph is rasterised beside the SVG it came from
and compared. The measure discounts a pixel of edge, because two identical
drawings still disagree along every contour by about that much and an icon with
a lot of perimeter for its area would otherwise fail for no reason.

### Views of one icon are reconciled before they are fitted

A hand-drawn set disagrees with itself. A saxophone drawn to fill the width of
both elevations comes out a third taller in one than the other, because those
boxes are 30 cm and 40 cm wide but both 80 cm tall — and the canvas stretches
each glyph box onto the element's real rectangle, so that lands on paper as an
instrument two different heights in two elevations that share a floor datum.

So each view gets its own factor, chosen so the axes the views share measure
the same object: front and side share its height, top and front its width, top
and side its depth. Three views give three shared-axis equations for two free
ratios, so the fit is least-squares in log space — no drawing is taken as
correct, and each moves as little as the others allow. Only then does one
common factor scale all three into their footprints.

The exception is the icons whose three views are deliberately one drawing —
the held instruments and the mic. There the views *cannot* agree: the same
picture would have to measure 55 cm along the box that is 55 cm and along the
box that is 20 cm. Those are fitted view by view, and their disagreement is
the point of them.

### The harness is a script, not a test

`scripts/render_glyphs.py` reads the JSON and emits an SVG replicating what the
canvas builds — same marks, same box, same non-scaling stroke — then rasterises
it with `rsvg-convert` into a labelled contact sheet. It is a review tool, run
by hand; it is not wired into the gates, because "does this look like a cello"
is not a thing a gate can answer.

## Risks / Trade-offs

- **A hole closes at plan scale, and nobody notices until it is printed.** →
  The harness renders a second sheet at true plan scale, not only fitted, and
  the review covers both.
- **Reverse winding is invisible in the file.** A subpath wound the wrong way
  fills solid instead of cutting, which reads as "the detail is missing" rather
  than as an error. → A Go test asserts a known hole stays a hole, so a later
  edit that reverses it fails rather than quietly filling in.
- **Converting the four accepted glyphs risks losing what made them
  acceptable.** → Composition is held fixed; only the paint changes. Both
  versions go on the contact sheet, before and after, so the user judges the
  conversion rather than being handed it.
- **Filled bodies are heavier over a busy plan than outlines were.** Twenty
  elements on one stage is more ink than before. → Accepted: the layer tint
  still separates them, legibility at size was the problem being solved, and
  the alternative was rejected on the evidence of the references.
- **The palette draws the top view into 20 px.** Some plans will not survive
  that whatever is drawn. → Out of scope here; the glyphs are drawn for the
  canvas, and if the palette still reads badly afterwards that is a defect to
  report, not to fix inside this change.

## Open Questions

None. The remaining unknowns are per-glyph drawing judgements, and the contact
sheet review is where they are settled.
