## Context

See `proposal.md — Why`. The constraints that shape the approach are already in the code:

- The plot is **cm-native**. 1 SVG user unit = 1 cm and zoom is a pure viewBox transform
  (`lib/stagePlot.ts:1-14`), so a measurement's value needs no scale conversion anywhere. Every
  screen-sized stroke on this canvas is already written `n / zoom`.
- An element is a **3D oriented box**, not a rectangle. `projectElement` gives the drawn rect;
  `projectedOutline` gives the true silhouette as the convex hull of eight projected corners,
  which is a **hexagon** when yaw and tilt combine (`stagePlot.ts:170-187`). `projectedAxes`
  gives where the element's own axes point inside its drawn frame, which is how truss fixtures
  already project exactly like the bar they hang on.
- The projection is **already ported to Go** for the document — `service/stage_plot_geometry.go`
  is held to the TypeScript suite's own assertions so the two cannot answer differently. That
  file is the pattern this change follows, and the reason "screen and paper state the same
  distance" is achievable rather than aspirational.
- The document **tiles**: `plotDoc.tilesFor()` divides a view across sheets when it will not fit
  at the smallest scale on the ladder.

The mockup at `mockup.html` is approved and is the source for every visual decision below; the
values it uses are read out of `design/` and out of the canvas's own built values.

## Goals / Non-Goals

**Goals**

- One anchor derivation that serves rect, ellipse, icon resource and raked truss without
  branching on element kind.
- An anchor identity that is **stable under any edit to the element** — move, resize, rotate,
  rake — because that is what "the measurement still points at the same corner" means.
- One definition of a measurement's value, evaluated on both sides of the wire.

**Non-Goals**

- Constraint solving. A measurement observes geometry; it never drives it. Editing a value is
  not offered, so there is nothing to solve backwards.
- Associativity beyond the anchor. A measurement does not track *why* a distance mattered.
- Any new drawing primitive on paper. Dimensions are lines, a polygon terminator and text.

## Decisions

### D1 · An anchor is a feature of the element's 3D box, not a vertex of its drawn silhouette

**Chosen.** An anchor stores one of:

- `centre`;
- `corner` — one of the box's eight corners, as a sign triple on the element's local axes;
- `face` — one of the box's six faces, as an axis and a sign.

The **point** an anchor resolves to is that feature projected into the view: a corner projects
through `projectedAxes` exactly as a truss fixture does; a face resolves to its projected face
centre, which *is* "the middle of that straight side" in any view that shows the face edge-on.

**Why not store a hull vertex index.** The obvious alternative — "corner 2 of
`projectedOutline`" — is not stable. The hull has four vertices for a plain rect and up to six
when yaw and tilt combine, so index 2 means a different corner before and after a rake, and the
measurement would silently walk to a different point. Storing the box feature makes the identity
independent of the view, of the rotation, and of the hull's vertex count. The silhouette is then
used for two things only: deciding which features to *offer*, and drawing.

**Which features are offered**, both derived rather than enumerated:

- A **corner** is offered where its projection is a vertex of `projectedOutline`. A corner that
  projects into the interior of the silhouette is not a corner of the drawn shape and is not
  offered.
- A **face** is offered where its projected normal has non-negligible length — that is, where the
  face is seen edge-on rather than face-on. This one test removes the degenerate cases for free:
  in the top view of an unrotated element the top and bottom faces project onto the whole
  silhouette and are correctly not offered as sides.

**The ellipse falls out of the same derivation.** Its four quadrant points are the projected
centres of its four edge-on faces, so it needs no separate code path for its points. It is
excluded from **plane mode** only — one boolean on the shape kind, because a perpendicular to a
curve is different at every point and "anywhere along it" cannot be kept.

### D2 · A face anchor has two modes, and they are the same feature

A face anchor carries a `slide` flag:

- **pinned** — the anchor is the face's projected centre. This is the side-midpoint the request
  asks for, and it behaves as a point anchor in every other respect.
- **plane** — the anchor is the face's projected *line*. The measurement meets it at 90°, its
  value is the perpendicular distance from the other endpoint to that line, and the foot is
  wherever the perpendicular lands, extended past the drawn edge with a hairline run-out when it
  falls outside.

They are one feature in two modes because they are indistinguishable by position — the pinned
anchor sits on the line. Aiming therefore cannot disambiguate them by proximity, and the
disambiguation is by **zone**: along any side there are exactly three, two corner zones and one
midpoint zone, everything else being the face, with no dead ground. The aim radius is the
existing `SNAP_THRESHOLD_PX`, reused rather than re-invented.

Under a locked type the foot is where the horizontal or vertical ray meets the face's line
instead of where the perpendicular does — otherwise a locked measurement to a plane would state a
distance its own line does not span.

**Two plane anchors** are permitted only where the faces are parallel. Non-parallel faces have no
single perpendicular distance, so the second pick is declined and the element's point features
are offered instead. Parallelism is tested on the projected normals in the view plane, not in 3D:
the measurement lives in the view.

### D3 · Storage

One migration, `051_stage_plot_measurements`:

```
stage_plot_measurements
  id, plot_id → stage_plots(id) ON DELETE CASCADE
  layer_id    → stage_plot_layers(id) ON DELETE CASCADE
  view        TEXT   -- 'top' | 'front' | 'side'
  type        TEXT   -- 'aligned' | 'horizontal' | 'vertical'
  from_element_id, from_feature, from_slide, from_u_cm, from_v_cm
  to_element_id,   to_feature,   to_slide,   to_u_cm,   to_v_cm
  offset_cm   REAL
  note        TEXT
  sort_order  INTEGER
```

Each endpoint is **either** `element_id + feature` **or** `u_cm + v_cm`, never both. The split
follows the one its sibling table already draws: `stage_plot_elements` puts its enums in `CHECK`
constraints and leaves "exactly one of `shape_kind`/`icon`/`truss_id`/`fixture_id`" to Go
(migration 032). So `view` and `type` are `CHECK`ed, and the endpoint exclusivity is validated in
`internal/api`, where the message naming the offending end already lives.

`feature` is a compact text encoding of D1's triple (`centre`, `corner:+-+`, `face:+x`), so it
reads in a database dump and survives without a lookup table — Principle II is about equipment
categories, not about the element's own six faces, which are a fact of a box and not
configurable data.

**No stored value, and no stored derived point.** Both are re-derived. This is the whole reason a
measurement stays true when its element moves.

**`ON DELETE CASCADE` on `from_element_id`/`to_element_id`** (nullable, so free ends are
unaffected) gives the spec's "no dangling measurement survives" as a property of the schema
rather than of remembering to clean up on every delete path — the same defence-in-depth reasoning
Slice 13 applied to links, but reachable here because elements are a real table. The
confirmation's count is a separate `COUNT(*)` at confirm time.

`StagePlotResponse` gains `Measurements`, so the aggregate read stays one round trip.

### D4 · Geometry lives in `lib/stagePlot.ts`, ports to `stage_plot_geometry.go`, and is tested by the same assertions

The new pure functions — resolve an anchor to a point, resolve a face to a line, offered
features for an element, the measured span for a type, the offset dimension line, the foot of a
perpendicular — go in `lib/stagePlot.ts` beside the projection they build on, and port to
`stage_plot_geometry.go`.

The two are held together the way the projection already is: the Go test asserts the same cases
with the same expected numbers as the Vitest suite. This is not duplication for its own sake —
it is what makes the document's independently derived value provably the canvas's value, which
the spec requires.

**Alternative rejected:** having the client send the computed value with the export request. It
is one line of code and it makes the document a mirror of whatever the last browser believed.
The existing geometry port exists precisely because that trade was already refused once.

### D5 · Scale: geometry in centimetres, lettering in pixels, paper furniture in millimetres

Endpoints and the offset are positions on a measured drawing and are centimetres. Terminators,
the extension-line gap and overshoot, the value's type size and the grab handle are **screen**
sizes, written `n / zoom` — which is not a new convention but what `StagePlotCanvas.tsx` already
does to every stroke it draws. On paper the same furniture is fixed millimetres, so a terminator
is the same size at 1:50 and at 1:500.

A dimension paints thin and carries a **transparent hit stroke** as separate geometry — desk and
hand sizes differ, and the hand's meets the 44 px minimum. Elements hit-test first, so a
measurement lying across an element never steals its selection.

### D6 · The palette gains a mode, which is new for it

Measure is three tiles — Aligned, Horizontal, Vertical — and it **arms** rather than places.
Every other palette entry to date is a placement, so this is a genuine addition to how the
palette behaves, and it is forced: a measurement is defined by two picks and there is nothing to
drag onto the canvas before the first of them. `M` arms, `Esc` leaves, a completed measurement
leaves the tool armed for the next.

The type is a stored property picked by name in both the palette and the inspector, rather than
a Shift-to-constrain modifier — one name, two places, and it survives being changed afterwards.

Re-anchoring is a drag of the endpoint's grip **on the canvas**, not a control in the inspector:
the inspector states each end and offers nothing to click, because choosing an anchor is aiming
at geometry and a dropdown of "corner:+-+" is not aiming.

### D7 · The document, including the tile crossing

`stage_plot_draw.go` gains the dimension drawing, using the ported geometry and the existing
`plotMapper` to place it. Two document-specific decisions:

- **Ink and weight, not colour.** `patterns.md §8`'s rule is that a value nobody chose is not
  crossed onto paper at all; a measurement's ink is the document's own, and it is told from
  equipment by line weight. This also satisfies the export spec's existing "complete without
  colour" requirement without adding anything to the schedule.
- **A measurement crossing a tile boundary is drawn on every part it reaches, each stating the
  full value.** The alternative — clipping it to one part — makes the other part state a distance
  its own drawing cannot support. The existing rule that a division never cuts an element does
  not extend to measurements: a measurement is *meant* to span, and a division that avoided
  cutting them could be forced to have no valid position at all.

### D8 · The phone, and the rule it exposes

The phone draws every measurement and authors none. Its sheet states both endpoints, the type
and the value, edits the note, and has no footer — with the note committing per field there is
no confirm for a footer to hold, and `patterns.md §7d` puts Cancel at *absent*, so the header ×
is the way out and the body carries the safe-area inset.

The **Delete is withheld**, and the reason generalises: a surface that cannot bring an object
into being does not get to end one. `design/patterns.md §7g` draws its line at the *gesture*,
which says what a phone may do to an object and nothing about what it may end — so as it stands
it permits the phone to delete a dimension. One paragraph is inserted after §7g's gesture
paragraph, in this change's implementation commit, with the wording the user approved.

The consequence is that **`StagePlotInspector.tsx:576` becomes non-conforming**: it renders
Delete regardless of the `spatial` prop, so the phone can today delete a plot element it cannot
place. That Delete is removed in this change. The rule and the two surfaces that obey it land in
one commit, which is what the same-commit rule for `design/` is for.

## Risks / Trade-offs

- **A stored face feature can stop being offered.** Rake an element until a face turns
  face-on and its anchor's projected normal collapses. → The anchor is still resolvable as a
  point (the face centre still projects), so the measurement does not break; a plane-mode anchor
  whose normal collapses falls back to behaving as its pinned point, and the canvas states it.
  Nothing is deleted behind the user's back.
- **A corner anchor can stop being a silhouette vertex** after a rotation, without becoming
  invalid. → Same resolution: the point is still derivable, so the measurement holds. Only the
  *offering* of new anchors depends on the hull.
- **Two implementations of the geometry can drift.** → The mitigation is the existing one and it
  is why it exists: shared assertions, added in the same task as the port, not after.
- **The 8 px aim radius has never been used as a pick target**, only as a drag snap. The user has
  accepted it as tweakable. → It is one shared constant; raising it raises both.
- **Three zones along a side is a lot of state to convey in one hover.** → The mockup's live
  specimen is the evidence it reads; if field use disagrees the zoning is one function.
- **Cascade delete is silent if the confirmation's count is wrong.** → The count and the delete
  read the same table; the API test asserts the count against a plot with measurements on both
  ends of one element.

## Migration Plan

Forward-only, additive: one new table, no column changes to any existing table. `051_*.down.sql`
drops the table, which is a complete rollback because nothing outside it references a
measurement. No backfill — an existing plot has no measurements and is correct with none.

## Open Questions

None that change the specs, the approach or the task breakdown. The four the mockup raised were
answered by the user (centimetres; no note cap; the 8 px aim radius stands; locked-layer
measurements stay selectable and readable but lose their grips), and the fifth — the phone's
Delete — is D8.
