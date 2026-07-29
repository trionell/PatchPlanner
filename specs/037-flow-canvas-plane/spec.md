# Feature Specification: The flow canvas as a plane

**Feature branch**: `037-flow-canvas-plane`
**Created**: 2026-07-29
**Status**: approved (mockup revision 2)
**Input**: A field report — *"On desktop I place the nodes where I want them but on mobile the
'rig' (middle) section is tighter and the nodes bunch together and overlap, making the mobile view
unusable. The 'viewport' implementation for stage plots works great. Perhaps we need to get rid of
the side rails in the flow graphs?"*

---

## Why this exists

Both audio flow canvases derive their coordinate space from the browser window. The middle lane's
bounds are `{ min: 264, max: canvasWidth − 464 }`, and `canvasWidth` is the measured panel divided
by the zoom — pinned to a constant 820 on a phone since Slice 36. So on every handset the middle
lane is **92 px wide, for nodes that are 200 px wide**, and every node in it is clamped onto
effectively one x. The desk's equivalent lane is ~1144 px. The two disagree by a factor of twelve.

The cause is that two nodes — the `Sources` rail and the `Channels`/`Destinations` rail — are
pinned to the coordinate space's left and right **edges**. Because one node must touch the right
edge, the space has to know where that edge is, so the space is sized to the window and everything
between the rails gets whatever is left.

This is not a defect Wave 6d introduced; 6d only made it visible. The same pinning has been
overwriting the position columns with window widths for as long as the canvases have existed. Event
1 currently holds four distinct window widths recorded as node coordinates (1310, 1520, 1562, 2202,
stored as x values of 1086, 1296, 1338 and 1978).

## User Scenarios & Testing

### US1 — A placement means one place (primary)

A planner arranges the rig on a desk, then opens the same event on a phone at the venue.

1. **Given** an event whose outboard is placed across the middle of the graph on a desk,
   **when** the same event's Flow view is opened on a phone,
   **then** every node appears at the same coordinate relative to its neighbours, with the same
   gaps, and no two nodes overlap that did not overlap on the desk.
2. **Given** the same event, **when** it is opened on a 1200 px laptop window,
   **then** no node moves, and dragging one node does not silently rewrite its neighbours.

### US2 — Reaching a node that is off screen

3. **Given** a graph wider than the window, **when** the planner drags the canvas,
   **then** the view pans in both axes with the platform's own momentum, and nothing is unreachable.
4. **Given** the planner has panned into empty space, **when** they tap *fit*,
   **then** the view frames the nodes that actually exist — not a nominal rectangle.

### US3 — Placing a node where it belongs

5. **Given** a node dragged to the far right of the rig, **when** it is released,
   **then** it stays there on every screen it is subsequently opened on.
6. **Given** a node dragged above or to the left of everything else,
   **when** it is released, **then** it stays there and the plane grows to include it — there is no
   floor at zero and no ceiling at the old canvas width.

### US4 — Coming back to a surface

7. **Given** the planner left the Inputs Flow view zoomed to 70 % on a particular desk,
   **when** they return to that event's Inputs Flow view on the same device,
   **then** it opens at that zoom and that position.
8. **Given** they open the same event on a different device,
   **then** that device opens at *fit* and its own view is remembered separately.

### Edge cases

- An event with no nodes at all: the plane has no content bounding box, so *fit* is 1 and the
  origin is 0,0.
- A node dragged far enough to change the plane's origin **during** the drag: the view must not
  jump. The scroll offset is compensated in the same frame the origin changes.
- The first frame, before the viewport has been measured: no scale of `0`, no `NaN` offsets
  (Slice 36's `fitScale` floor still applies).
- A viewer (read-only role): pans and zooms freely, persists their own view locally, moves nothing.

## Requirements

### Functional — the coordinate space

- **FR-001** A node's stored coordinates MUST be interpreted identically at every window size and
  every zoom level.
- **FR-002** No value used to place a node MUST be derived from the measured panel width. The
  helpers `zoneChannelsX`, `zoneDestinationsX` and `zoneProcessingBounds` are removed from both
  canvases, and `canvasWidth` ceases to exist as a layout input.
- **FR-003** `clampProcessingX` is removed. A node is rendered at the coordinates it holds.
- **FR-004** Both rails are ordinary nodes rendered at their stored coordinates, draggable and
  persisted like any other node, in both canvases. They remain *consolidated* — one node listing
  every source / channel / bus, not a card each.
- **FR-005** Negative coordinates MUST be supported in both axes. A node may be placed above or to
  the left of every other node.
- **FR-006** The plane's extent MUST be the bounding box of the nodes that exist, expanded by a
  fixed margin, in all four directions.
- **FR-007** When the plane's origin changes, the scroll offset MUST be compensated in the same
  frame so that the content under the viewport does not appear to move.

### Functional — the view

- **FR-008** Panning is the platform's own scrolling on both reaches. No pan gesture handler is
  added to the canvas (Slice 36 §7g's withholding is what makes this available and stays in force).
- **FR-009** Zoom and pan MUST be remembered per event and per surface, **device-local**, and
  restored when that surface is next opened on that device.
- **FR-010** Stored pan MUST be in logical coordinates, not scroll pixels, so that it survives a
  zoom change, a resize and an origin shift.
- **FR-011** *Fit* MUST be computed from the content's bounding box. It remains a control, not the
  opening state, whenever a remembered view exists.
- **FR-012** A surface with no remembered view opens at *fit*.

### Functional — what is removed

- **FR-013** The lane bands and their labels are removed from both canvases. `LaneBands.tsx` is
  deleted.
- **FR-014** The Sources rail's internal scroll cap is removed, along with the `railScroll`
  machinery that existed only to keep cables attached while it scrolled. The rail is as tall as its
  contents and the plane scrolls instead.

### Functional — the data tidy

- **FR-015** A one-time migration MUST normalise the x of every node whose x was previously ignored,
  because those values are records of window widths rather than placements:
  - `event_consoles.input_position_x` → 1400 · `event_consoles.position_x` → 24
  - `output_devices.position_x` → 1400 where `output_port_count = 0` (destinations)
  - `output_devices.position_x` → 24 where `input_port_count = 0` (sources)
  - Processing devices, stageboxes and stage multis keep their x: it was clamped, but it was chosen.

### Unchanged, and stated so it is not lost

- **FR-016** Which gestures a phone withholds is unchanged from Slice 36: no node drag, no port
  drag, no port click. A reach check remains never a permission (P9, §7g).
- **FR-017** No node's appearance changes. This slice is the coordinate space and the view.

## Success Criteria

- **SC-001** Opening the same event on a phone and on a desk shows the same arrangement: for every
  pair of nodes, the sign and rough magnitude of their x separation agree.
- **SC-002** No node overlaps another that did not overlap when placed.
- **SC-003** Every node can be reached on a phone, at a scale where its header is legible.
- **SC-004** Opening an event on a 1200 px window and dragging one node leaves every other node's
  stored position untouched.
- **SC-005** Returning to a surface on the same device restores the view within a pixel.
- **SC-006** Grepping either canvas for `canvasWidth` returns nothing.

## Assumptions

- **A1** The `Sources` rail (inputs) and the two orphan pseudo-nodes (`channel:0`, `mixer:0`) have
  no column to store an x in, so they keep a constant default of 24, 24 and are not persisted. Every
  node that *has* storage becomes freely placeable. Giving them storage is a migration and a Go
  change, which the approved scope excludes; recorded as a follow-up rather than done quietly.
- **A2** Device-local view storage means a new device opens at *fit*. Accepted at approval.
- **A3** The migration's `down` cannot restore the overwritten values, because they were never
  meaningful. It is a documented no-op.
- **A4** The desktop's canvas region keeps its fixed 640 px height. The plane inside it is
  content-sized; the region is not.

## Out of scope

- **D2** (roadmap): the flow inspectors still delete through `window.confirm`.
- The stage plot's own shared `zoom/pan_x_cm/pan_y_cm`, which has the cross-device issue this slice
  declined for the flow canvases. Recorded as a new defect, not fixed here.
