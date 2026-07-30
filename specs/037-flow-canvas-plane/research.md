# Research — the flow canvas as a plane

## R1 · Why the middle lane is 92 px, exactly

`zoneProcessingBounds(w) = { min: 264, max: w − NODE_WIDTH − 264 }` with `NODE_WIDTH = 200`, and on
a phone `canvasWidth` is the constant `CANVAS_MIN_WIDTH = 820`. So `max = 820 − 200 − 264 = 356`,
and the lane is `264 → 356`. A node is 200 px wide. Five of event 1's nodes clamp onto 356.

The desk's width is recoverable from the data: `console_local` at 1208 survived a clamp, so that
window's `canvasWidth ≥ 1208 + 464 = 1672`, giving a lane of `264 → 1408`.

**Decision:** the fix is not to widen the phone's constant. Any constant reproduces the bug at a
different size, because the *lane* is derived rather than the *space*.

## R2 · What the position columns actually contain

Nodes whose x is pinned (`canvasWidth − 224`) are re-saved at that value by the next drag, so the
column records a window width. Inverting `x + 224`:

| stored x | node | implied canvas |
|---|---|---|
| 1086 | Speaker L, Sub L 1 | 1310 |
| 1296 | Sub L 2 | 1520 |
| 1338 | Speaker R | 1562 |
| 1978 | M23R channel rail | 2202 |

**Decision:** these cannot be adopted as placements; migration 047 normalises them (FR-015).
Gathered from a **copy** of the database in the scratchpad, never `backend/patchplanner.db`.

## R3 · Why native scroll rather than the stage plot's drag-pan

`StagePlotCanvas` pans by moving an SVG `viewBox`, which is unbounded and negative-capable for free.
The flow canvas is real DOM — absolutely-positioned nodes containing scrollable regions, inputs and
port elements — so a `viewBox` is not available to it.

The two candidates were a pointer-drag transform (stage-plot parity) and native `overflow: auto`.

**Decision: native scroll**, on three grounds. It is what Slice 36 already built and field-tested;
it gives the phone momentum, rubber-banding and two-axis panning that a hand-written pan will not
match; and it does not compete with the node-drag and port-drag gestures the desk still needs.
§7g's withholding of gestures on the phone is what makes one finger free for it — the restriction
is also the enabling condition.

**Consequence to handle:** a scroll container has no negative side. See R4.

## R4 · Negative coordinates on a container that cannot scroll negative

The approved answer to Q4 was *allow negative space, less arbitrary limitation*. The resolution is
that the **origin is ours to choose**: render a node at `x − planeMin` where `planeMin` is the
minimum x over all nodes, minus a margin. Negative logical coordinates become non-negative DOM
offsets, and the plane grows leftward instead of refusing.

**The hazard this creates** is that `planeMin` is derived from the content, so dragging a node past
the current left edge changes the origin, which moves every *other* node's DOM offset by the same
delta. Without compensation the view jumps by that delta.

**Decision:** compensate in a `useLayoutEffect` keyed on the origin — when `planeMin` changes by
`d`, add `d × zoom` to `scrollLeft` in the same frame. Same for `planeMinY`/`scrollTop`. This is the
one genuinely new piece of arithmetic in the slice, so it gets a named test and a named comment.

**Alternative rejected:** a fixed large negative origin (say −2000). Simpler, no compensation, but
it is exactly the arbitrary limit the approval rejected, only hidden, and it makes the scrollbar
meaningless.

## R5 · Where the remembered view lives

Proposed at revision 1 as six columns on `events`, following `stage_plots`. Reversed at revision 2.

`hooks/usePatchView.ts:19` already answers this question for these same two tabs, in writing:

> *Deliberately localStorage rather than event_settings: it's one user's viewing preference with no
> meaning to anyone else sharing the event, so it needs neither a migration nor a round trip.*

Zoom and pan are the same class of state as which view a tab last showed — more so, since a zoom
that suits a 27″ monitor is wrong on a phone by construction.

**Decision:** `localStorage`, key `patchplanner.flowView.{eventId}.{inputs|outputs}`, value
`{ zoom, panX, panY }`, wrapped in `try/catch` (private-mode Safari throws, as `usePatchView`
records). Pan in logical units so it survives zoom, resize and origin shift (FR-010).

**What the database version would have cost:** a collaborator's phone deciding where your desk
opens; two of your own devices overwriting each other on an 800 ms debounce; a write on every pan.

**Recorded, not fixed:** `stage_plots` has this shape today. Its failure is milder — the local
override wins for the session, so the other device adopts the foreign view only on next load — but
it is the same defect. New roadmap entry D3.

## R6 · Fit, recomputed

Slice 36's `fitScale(viewportW, viewportH, graphW, graphH)` is unchanged and still correct; what
changes is what is passed to it. It was `820 × 640`, a nominal rectangle. It becomes the content's
bounding box, so *fit* frames the graph that exists.

**Consequence:** for a real graph (~1500 logical px wide) *fit* on a 341 px phone is ~21 %, which is
not a usable opening state — a 200 px node draws 42 px wide. This is why FR-011/FR-012 make the
remembered view the opening state and *fit* a control. It also retires Slice 36's approved decision
that "fit is the opening state", and the §A question of 036's unrun handset pass is answered by
arithmetic rather than a thumb: **the whole graph at fit is not worth having; it is just small.**

## R7 · Why the lane bands go

`LaneBands` takes three `{x, width}` regions, all computed from `canvasWidth`. Under a plane they
have no width to be computed from. The three candidates were fixed regions, labels-only, and
removal.

**Decision: removal** (approved). A band that says *Rig* is a claim about where nodes are, and once
nothing constrains where nodes are, the claim is decoration that can be false. The cables already
carry direction. `LaneBands.tsx` is deleted rather than left unused.

## R8 · Why the Sources rail stops scrolling inside itself

The rail caps at `max-h-[420px] overflow-y-auto` and bumps a `railScroll` counter on scroll, whose
only purpose is to re-run the cable-path effect so the SVG stays attached to ports that moved.

On a fixed-height canvas that cap earned its place. On a plane it is a second, nested viewport
inside a viewport — the user scrolls the rail when they meant to pan, and cables need re-attaching
for a movement the plane could have expressed directly.

**Decision:** remove the cap and the `railScroll` state, effect dependency and `onScroll` prop. A
32-source rail becomes a ~700 px node, which is what a plane is for. This *deletes* the cable
re-attachment path rather than adding one.

## R9 · What must not change

Slice 36's withheld gestures (FR-016). The three desktop byte-identical captures from 036
(`ZoomControl`, `InputFlowInspector`, `OutputFlowInspector`) are **not** re-usable as regression
proof here, because this slice deliberately changes the desktop canvas. The captures that still
apply are the inspectors and the zoom control, which this slice does not touch.

## R10 · Two canvases, one rule, and the shape of the change

`InputGraphCanvas.tsx` and `AudioOutputsTab.tsx`'s `OutputGraphCanvas` are near-mirrors that have
diverged in detail (Slice 36's review found a search-and-replace that matched one and not the
other). Every change here lands in both.

**Decision:** the new arithmetic goes in **one shared module** (`lib/canvasPlane.ts`), not in each
canvas, precisely so the two cannot drift on the part that is hard to get right. What stays
per-canvas is only the mapping from that canvas's own entities to `{id, x, y, w, h}`.
