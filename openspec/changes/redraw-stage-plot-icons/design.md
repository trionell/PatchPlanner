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

*Consequence to respect while drawing.* A hole must be big enough to survive.
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
- **Trumpet** is already horizontal in every box (55×20, 55×15, 20×15), so top
  and front share one drawing and side is the bell end-on.

### What each icon becomes

Read as: what identifies it, and what is a hole. Views listed together share one
drawing.

| Icon | Top | Front / Side |
|---|---|---|
| person | shoulder mass, head a filled disc inside a ring gap | filled figure, the accepted stick-figure pose given a body |
| mic | capsule disc, three tapered legs at 120° | front = side (boxes are both 30×160): tripod feet, stroked shaft, capsule angled at the top |
| speaker | trapezoid narrowing to the back, driver hole on the wide front edge — so the plan says which way it aims | front: cabinet, big driver hole low, horn slot high. side: cabinet profile with the baffle edge |
| monitor | wedge plan, the low front edge banded | front: the tilted baffle, trapezoid, driver hole. side: the wedge profile — the shape that names it |
| rack | square, ball corners and a handle slot | front: rack ears and unit slots. side: flight case, corners and handle |
| truss | two chords with diagonal bracing between them, gaps as the lattice | front = top. side: the end-on square — four corner tubes and the cross brace |
| fixture | lens disc between two yoke arms | front: lens disc in a yoke. side: barrel tilted in a yoke |
| drums | accepted plan, filled | front: accepted elevation, filled. side: bass drum, tom above, cymbal on a stroked stand |
| piano_grand | the wing — straight keyboard edge, curved bent side, keys as a hole comb | front: body slab, three legs, raised lid triangle. side: profile with the lid up on its stick |
| piano_upright | cabinet rectangle, keyboard band projecting from the front edge with a black-key comb | front: tall cabinet, fallboard, keyboard band, music desk. side: tall cabinet with the keyboard shelf jutting forward |
| keyboard | slab, black-key comb along the front edge, control panel band behind it — the band is what separates it from the upright's plan | front: slab on an X-stand. side: accepted, filled |
| guitar_acoustic | itself, diagonal | body with waist, soundhole and bridge as holes, slotted headstock. front = side |
| guitar_electric | itself, diagonal | double cutaway, pickguard as a hole, six-in-line headstock, no soundhole. front = side |
| bass | itself, diagonal | offset body with the long horn, one pickup hole, four-in-line headstock, neck longer against the body than the guitars' |
| cello | itself, diagonal | C-bouts, two f-holes, scroll, stroked endpin. front = side |
| saxophone | itself, diagonal | the J — flared bell low, body rising, crook and mouthpiece at the top, a few key touches as holes |
| trumpet | top = front: bell flare right, valve block with three pistons, wrap loop, mouthpiece left | side: the bell end-on, a ring with the valve block below |

The four accepted glyphs (person front/side, drums top/front, keyboard side)
keep their composition exactly and change only from outline to fill. They were
accepted for what they show, not for how they were drawn, and a set that is
half outline is not a set.

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
