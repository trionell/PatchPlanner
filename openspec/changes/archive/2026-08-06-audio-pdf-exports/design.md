# Design — the audio documentation PDF

## Context

See `proposal.md` — Why. The constraints that shape the approach:

- **The rental order is the precedent.** `service/rental_pdf.go` + `api/rental.go` already
  do this: `go-pdf/fpdf`, a `SetHeaderFunc` that repeats a table header after each automatic
  break, a footer with `AliasNbPages`, and a handler that writes bytes with a
  `Content-Disposition`. This change is a second document in that shape, not a new mechanism.
- **Access control is already on the route.** `router.go:31` mounts every event route behind
  `middleware.RequireEventAccess(db)`. A new `r.Get("/audio-export/pdf", …)` registered on
  the same router inherits it; there is nothing to write.
- **The positions are trustworthy and server-side.** Migrations 025–043 put
  `position_x/position_y` (and the input-graph and console-local variants) on devices,
  stageboxes, stage-multis and desks. Slice 37 is why they mean something — until it landed
  they held browser-window widths.
- **Everything the document prints is already stored.** No migration.
- **The canvas is not a layout the browser computed.** `graph/tokens.ts:41` is
  `PORT_ROW = 'flex h-[18px] …'`; `InputGraphCanvas.tsx:63` is `NODE_WIDTH = 200`;
  `tokens.ts:58` is `SOURCE_ROW_HEIGHT = 20`. Header, body padding and footer are fixed
  classes. The `getBoundingClientRect()` calls at `InputGraphCanvas.tsx:465-472` serve
  dragging and the live ghost cable, not the box geometry.

The approved mockup is `mockup.html` in this directory. Its D1–D12 and R1–R7 are the
requirements in `specs/audio-document-export/spec.md`; this document says how they are built.

## Goals / Non-Goals

**Goals:**

- One document, one `GET`, reproducible from a URL and testable without a browser.
- A signal-flow drawing in which every cable can be traced — the routing invariant is
  machine-checkable, not a matter of review.
- Paper metrics that are the mockup's numbers, so the drawing can be held against it.
- The graph renderer separable from the document, so Slice 41 can reuse the page furniture
  without inheriting the graph code.

**Non-Goals:**

- Pixel fidelity with the canvas. The document is a second rendering of one model, as the
  table already is.
- Any change to the canvas. This slice reads the same constants; it does not refactor the
  frontend graph.
- Lighting, and the stage plot. Lighting stays on browser print; the plot is Slice 41.
- A physical stage-location field. Wanted, but a schema change and a different slice.

## Decisions

### D-1 · The graph is drawn in Go from the data, not sent by the client

The roadmap offered three routes and asked the plan to pick one with reasons.

**Chosen: port the geometry.** The canvas's geometry is constants and multiplication, so a
box's height is `header + rows × rowHeight + footer` in Go exactly as it is in the browser,
and a port's centre is `top + header + index × rowHeight + rowHeight/2`. Nothing is measured.

Two things make this less of a duplication than it looks. First, the drawing does not have to
match the canvas pixel for pixel to be correct — both are renderings of one port-and-cable
graph, which is the relationship the table already has to the on-screen sheet. Second, and
decisively, **the paper drawing has requirements with no on-screen counterpart at all**: the
canvas draws one bezier per cable in the cable's own colour onto a plane that scrolls, and
paper has neither colour to spare nor room to scroll. R1–R7 could not have been ported from
anywhere because they do not exist on the canvas.

**Rejected: the client posts its computed geometry.** It buys one layout implementation at
the price of an export that cannot be produced from a URL — and it fails outright in the
common case, because the export is offered from the Inputs and Outputs tabs where the canvas
is not mounted and there is no geometry to send. It also would not have supplied routing,
which is the part that actually needed writing.

**Rejected: split it — sizes derived, routing sent.** Inherits the mounting problem for the
half it sends and adds a seam through the middle of one drawing.

**Drift guard.** The Go paper metrics are *not* the canvas's pixel values, so they cannot
drift out of agreement with them — there is no shared number to disagree about. What must
stay true is the *shape* of the formula (a box's height is a function of its port count),
and that is covered by the layout tests below rather than by a constant kept in two places.

### D-2 · The routing invariant is a function, and the tests call it

R1–R7 reduce to one post-condition over the segment list a layout produces:

> No two segments are collinear over a shared length, except a pair leaving the same port,
> which may share only their common stub.

`flow_route.go` exports that check. Every layout test — the fixtures, and a generated sweep
over randomly placed graphs — asserts it. This is why the rule is worth stating as seven
rules rather than one: R1–R6 are how the router achieves the invariant, R7 is what it must
*not* do about the crossings that remain, and the invariant is what the tests assert.

Routing itself:

1. **Columns and channels.** Nodes are grouped into columns by overlapping x-extent; the gaps
   between consecutive columns are channels. Node positions are user-placed and arbitrary, so
   this is derived per graph, not assumed.
2. **Lanes.** Each edge's vertical run in a channel takes a lane. Lane assignment is greedy
   interval-graph colouring over the runs' y-spans, so a lane is reused only when two runs
   cannot touch (R3). Lane count sets lane spacing; spacing is an input to the fit in D-3.
3. **Horizontals** sit at their own port's y and are naturally distinct, since two ports on
   one box have different y. The one exception is R5's shared stub, staggered by lane index.
4. **Bypass.** An edge whose straight route would cross a box (R6) is routed to the gutter
   above or below that column's boxes, whichever is nearer, and the gutter run takes a lane
   of its own by the same colouring on its x-span.

### D-3 · Fit, then shrink, then tile — in that order

Three stages, each tried only when the previous one fails:

1. **Fit.** Nodes get paper sizes from their port counts using fixed metrics (52 mm wide,
   5 mm header, 4 mm port row, 3 mm footer). Positions are scaled by the largest `s` for
   which every scaled origin plus its box fits the text block, with lane demand included in
   the channel widths so routing has room.
2. **Shrink.** If `s` is small enough that boxes would collide, a uniform factor is applied
   to sizes and font sizes and the fit recomputed, down to the floor where a port label
   would fall below 5 pt.
3. **Tile.** At the floor and still not fitting, `s` stays at the floor and the plane is cut
   into page-sized tiles along gaps between boxes — never through one — each page stating
   which part of the whole it shows.

The scale reached is printed on the page in every case, because a drawing whose scale is not
stated is a drawing that cannot be measured.

The 5 pt floor and the tiling cut are the two numbers this design is least sure of; see
Risks.

### D-4 · Helvetica and cp1252 stay — and the constraint's *shape* was checked, not assumed

`rental_pdf.go:36-43` records the constraint. Probing the translator directly rather than
trusting the comment:

| glyph | cp1252 | | glyph | cp1252 |
|---|---|---|---|---|
| `·` | `B7` ✓ | | `→` | `2E` ✗ |
| `–` | `96` ✓ | | `≥` | `2E` ✗ |
| `—` | `97` ✓ | | `×` | `D7` ✓ |
| `•` | `95` ✓ | | `°` | `B0` ✓ |
| `å ä ö` | ✓ | | `’` | `92` ✓ |

Two conclusions.

**The failure mode is silent substitution, not garbage.** An unrepresentable character
becomes `.` — a plausible-looking full stop, not a visible defect. That is worse than the
comment implies and is the real argument for D7: every mark that carries meaning is a drawn
vector (arrowhead, port dot, phantom square, colour stripe), so nothing depends on a
character surviving.

**The existing comment is wrong about `–` and `·`.** Both are representable; `rental_pdf.go`
has been avoiding them unnecessarily. That comment is corrected in this change — it is the
constraint this document inherits, and leaving a wrong statement of it in place would mislead
Slice 41 next.

No embedded font. `AddUTF8Font` was the alternative and is rejected: it would grow the binary
for one arrow that the diagram needs as a vector regardless.

### D-5 · File layout

All in `internal/service/`, no new package — the constitution names `service/` as the home
for cross-cutting business logic and this is a sibling of `rental_pdf.go`:

| file | holds |
|---|---|
| `audio_pdf.go` | the document: masthead, running heads, footer, the three tables, section order |
| `flow_layout.go` | node paper geometry, the fit/shrink/tile decision |
| `flow_route.go` | columns, channels, lanes, bypass, and the invariant check |
| `flow_draw.go` | putting layout + routes onto an `*fpdf.Fpdf` |

The split exists so the routing invariant can be tested without producing a PDF, and so
Slice 41 can take `audio_pdf.go`'s page furniture without `flow_*`.

### D-6 · The frontend loses three components and gains a download

`PrintButton.tsx` is eleven lines around `window.print()` and stays that way for Lighting and
the stage plot. The audio surfaces get a sibling that hits the new endpoint. The deletion of
`InputPatchSheet`, `OutputPatchSheet` and `ChainText` happens in the same change as their
last caller's removal, not in a later cleanup — a zero-caller component is a second answer
sitting where the first one goes.

`printSheets.test.tsx` loses the cases covering those three. That is a real loss of coverage
at the point of deletion, so the Go table tests that replace it are written *before* the
components are deleted, not after.

## Risks / Trade-offs

- **The 5 pt legibility floor is a guess.** → It is one named constant, and the tiling path
  below it is implemented rather than deferred, so being wrong about the number changes a
  value and not a code path. Confirmed against a real event before the change closes.
- **A dense channel defeats R2.** Thirty cables between two boxes 8 mm apart gives quarter-
  millimetre lanes. → Lane demand is an input to the fit in D-3 stage 1, so the channel is
  widened before the lanes are thinned; the shrink and tile stages are the fallback. The
  generated-graph sweep in D-2 is aimed squarely at this case.
- **Two renderings of one graph can disagree in ways no test catches** — a cable the canvas
  shows and the document omits. → Both read the same cable rows through the same `db` layer;
  the tests assert edge *count* parity between the graph query and the drawn segment set, so
  a dropped cable fails rather than being noticed by eye.
- **The document could grow past what anyone prints.** Eight pages for a 24-channel event;
  a festival patch will be longer. → Accepted. It is one file and a printer can be given a
  page range; splitting into per-section downloads would undo D1, which the user chose.
- **Deleting the React sheets removes the only current audio print path** if the endpoint has
  a defect in production. → The deletion is the last task, after the Gates and after the
  document has been checked against a real event's data.

## Migration Plan

No database migration and no data change. The endpoint is additive; the frontend switch and
the component deletions are the only user-visible cutover, and both are reversible by revert.

Order: Go document and renderer with tests → endpoint → frontend export action → `design/`
§8 amendment → delete the three components and their test cases.

## Open Questions

None blocking. The two numbers flagged in Risks (the 5 pt floor, the tiling cut) are found by
running the document against a real event during implementation; neither changes the specs,
the approach, or the task breakdown.
