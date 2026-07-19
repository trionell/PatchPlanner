# Feature Specification: Stage Plots

**Feature Branch**: `013-stage-plots`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "A new per-event Stage Plots section: multiple to-scale, layered stage plots per event, built draw.io-style. Resources (people, instruments, speakers, racks…) carry icons and display names, can stack multiple items at one location, and are assigned the event's planned sources/outputs/devices. Generic shapes model the stage and venue. A toggleable, configurable grid with snap-to-grid and snap-to-adjacent-resources. An inspector panel for exact numeric editing. Truss rigs are assembled from inventory truss pieces at accurate size, own the fixtures placed on them, and move as one unit. Mockup approved 2026-07-18; clarifications resolved: trusses are parents of their fixtures; assignments link to existing planned data; only truss pieces feed the rental order; one plot model renders in three linked projections (top-down, front, side) with per-projection icon variants."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Draw a to-scale stage plot (Priority: P1)

A planner opens an event, goes to the new Stage Plots section, creates a plot named "Main stage", draws a 600 × 400 cm rectangle for the stage, a 150 × 100 cm rectangle for the drum riser, and places resources — a person icon named "Anna — Drums", speaker icons at the PA positions, a rack at stage right — each with a real-world footprint in centimetres. Everything is drawn true to scale: the riser visibly occupies a quarter of the stage depth, and a 46 cm-wide speaker is drawn 46/600ths of the stage's width. The planner moves, resizes, and rotates elements by dragging, or types exact values in the inspector.

**Why this priority**: This is the core of the feature — a to-scale drawing surface with named, icon-carrying resources. Every other story builds on it, and it alone already produces a usable stage plot.

**Independent Test**: Create one plot, add shapes and resources with known dimensions, verify their rendered proportions match the stated centimetre values at any zoom, reload the event and verify everything persisted.

**Acceptance Scenarios**:

1. **Given** an event, **When** the planner creates a stage plot and gives it a name, **Then** it appears in the event's Stage Plots section and can be reopened later with all content intact.
2. **Given** a plot, **When** the planner creates a second plot on the same event, **Then** both plots exist independently and switching between them loses no content.
3. **Given** an empty plot, **When** the planner draws a rectangle and sets its size to 600 × 400 cm, **Then** the rectangle's rendered size corresponds exactly to 600 × 400 cm at the current zoom, and every other element is rendered against the same scale.
4. **Given** a placed resource, **When** the planner sets its footprint to 46 × 38 cm in the inspector, **Then** the canvas immediately reflects the exact size, and the drawn size relative to the stage rectangle is dimensionally correct.
5. **Given** a placed resource, **When** the planner types a display name, **Then** the name is shown on the plot next to the resource's icon.
6. **Given** a selected element, **When** the planner drags, rotates, or edits position/size/rotation numerically, **Then** the stored values change accordingly and persist.
7. **Given** a resource, **When** the planner picks a different icon from the built-in icon set (person, microphone, speaker, monitor wedge, rack, truss, fixture, and the distinct per-instrument icons listed in FR-008), **Then** the plot shows the new icon.
8. **Given** any element, **When** the planner deletes it, **Then** it disappears from the plot without affecting any other planning data.

---

### User Story 2 - Grid and snapping (Priority: P2)

While laying out the plot, the planner toggles on a background grid, sets its spacing to 25 cm, and enables snap-to-grid so dragged elements land on grid lines. When nudging a monitor wedge next to another, they enable snap-to-adjacent-resources and the wedge clicks into alignment with its neighbour's edge, with a visual guide showing the alignment.

**Why this priority**: Snapping is what makes accurate layout fast; without it the to-scale promise of Story 1 is tedious to honour by hand.

**Independent Test**: With grid and snapping enabled, drag elements and verify their stored positions land on grid multiples or exactly on a neighbour's edge/centre line; toggle everything off and verify free placement.

**Acceptance Scenarios**:

1. **Given** a plot, **When** the planner toggles the grid on or off, **Then** the background grid appears/disappears without changing any element's position.
2. **Given** a visible grid, **When** the planner changes the grid spacing (in centimetres), **Then** the grid redraws at the new spacing and existing elements stay where they are.
3. **Given** snap-to-grid enabled, **When** the planner drags an element, **Then** its position lands on the nearest grid line; with it disabled placement is free.
4. **Given** snap-to-objects enabled, **When** a dragged element's edge or centre comes near a neighbouring element's edge or centre, **Then** an alignment guide appears and the element snaps to that alignment.
5. **Given** both snap modes and the grid toggled per plot, **When** the planner reopens the plot, **Then** the last-used grid and snap settings for that plot are restored.

---

### User Story 3 - Layers (Priority: P2)

The planner organises the plot into layers: "Stage & venue" for the shapes, "Audio" for people/speakers/racks, "Lighting" for trusses and fixtures — and adds more layers freely (e.g. "Monitors" split out from "Audio"). While patching audio they hide the Lighting layer to reduce clutter, and lock the venue layer so the stage outline can't be dragged by accident.

**Why this priority**: Layers are the requested organising principle for mixed audio/lighting plots; hiding and locking make bigger plots workable.

**Independent Test**: Create layers, distribute elements across them, verify hide/lock/reorder behaviour and that new elements land on the active layer.

**Acceptance Scenarios**:

1. **Given** a plot, **When** the planner creates, renames, or reorders layers, **Then** the changes persist, and each element belongs to exactly one layer.
2. **Given** several layers, **When** the planner marks one active and places a new element, **Then** the element joins the active layer.
3. **Given** a hidden layer, **When** viewing the plot, **Then** its elements are neither visible nor selectable, and unhiding restores them unchanged.
4. **Given** a locked layer, **When** the planner clicks or drags its elements, **Then** the elements are visible but cannot be moved or edited until unlocked.
5. **Given** an element, **When** the planner moves it to another layer via the inspector, **Then** it adopts that layer's visibility/lock state.
6. **Given** a layer with elements, **When** the planner deletes the layer, **Then** they are warned and, on confirmation, the layer's elements are deleted with it; a plot always retains at least one layer.

---

### User Story 4 - Resources linked to planned data, stacking (Priority: P2)

The drummer resource "Anna — Drums" gets assigned the four input sources she generates (kick, snare, overheads); the PA-right speaker resource represents a stack of two planned speakers at one footprint and is assigned the output devices that feed it; the side rack holds four of the event's planned processing devices. The plot thereby documents *who and what is where* using the data already planned in the patch tabs, without any duplicate bookkeeping.

**Why this priority**: Linking is what turns a drawing into a stage *plot* — the connection between the physical layout and the event's existing signal planning. It requires Story 1 to exist first.

**Independent Test**: Assign existing planned entities to resources, verify the plot displays the links, then delete one of the underlying entities in its own tab and verify the plot updates gracefully.

**Acceptance Scenarios**:

1. **Given** a resource and an event with planned data, **When** the planner opens the resource's assignments in the inspector, **Then** they can pick from the event's existing input sources, input channels, output devices, stageboxes/stage multis, and lighting fixtures — and assign any number of them.
2. **Given** assigned entities, **When** viewing the plot, **Then** the resource shows an indication of its assignments (e.g. a count such as "4 sources"), and the inspector lists each one by its existing name.
3. **Given** an assignment, **When** the underlying planned entity is deleted from its own tab, **Then** the assignment disappears from the resource without breaking the plot, and the resource itself remains.
4. **Given** a speaker or rack resource, **When** the planner adds several stack entries (each referencing one of the event's planned devices/speakers), **Then** all entries share the resource's single footprint, the plot shows the stack count, and the inspector lists and reorders the entries.
5. **Given** a stacked resource, **When** it is moved or rotated, **Then** the whole stack moves as one element.
6. **Given** any resource assignment or stack change, **When** the rental order is inspected, **Then** it is unchanged — plot resources only reference equipment already counted elsewhere.

---

### User Story 5 - Truss rigs from inventory, counted on the rental order (Priority: P2)

The planner builds the front truss by picking truss pieces from the inventory's truss category — three 2 m F34 sections — and the resulting truss is exactly 6 m on the plot. They set its height above the stage floor, then attach five of the event's lighting-rig fixtures at positions along it. Dragging the truss moves the whole rig — pieces and fixtures together. Checkbox display options control what is drawn beside each fixture: any combination of its name, its fixture ID (FID), and its DMX universe + address. Back on the Lighting tab, each fixture's row now simply shows which truss it hangs on (and where along it), read-only — or nothing if it isn't rigged. Because truss pieces are planned nowhere else, they now appear on the rental order and in the Excel export like any other rented equipment; everything else on the plot stays visual-only.

**Why this priority**: Truss rigs are the lighting half of the request and close a real gap — trusses currently never reach the rental order. Depends on Story 1 (placement) and pairs with Story 4 (linking fixtures).

**Independent Test**: Assemble a truss from inventory pieces, attach fixtures, move the truss, and verify the rental order and export gain exactly the truss pieces (correct quantities, stock validation) and nothing else.

**Acceptance Scenarios**:

1. **Given** the inventory's truss category, **When** the planner assembles a truss from selected pieces, **Then** the truss's length is the exact sum of the pieces' lengths and it is drawn to scale on the plot.
2. **Given** a placed truss, **When** the planner attaches fixtures from the event's lighting rig at chosen positions along the truss, **Then** each fixture is drawn at its position on the truss and remains the same fixture shown on the Lighting tab.
3. **Given** a truss with attached fixtures, **When** the planner moves or rotates the truss, **Then** all its pieces and fixtures move as one unit, preserving each fixture's position along the truss.
4. **Given** a fixture on a truss, **When** the planner detaches it or deletes the truss, **Then** the fixture's placement leaves the truss (or is removed from the plot) while the fixture itself remains untouched in the lighting rig.
5. **Given** trusses on the event's plots, **When** the rental order is viewed, **Then** each truss's constituent pieces are counted (with pricing, over-stock and discontinued flagging like all rented items) and appear in the Excel export; a truss shown on more than one of the event's plots is counted once.
6. **Given** an event with no stage plots or no trusses, **When** the rental order is viewed, **Then** its totals are exactly what they were before this feature existed.
7. **Given** fixtures on a plot, **When** the planner toggles the fixture label options — fixture name, fixture ID (FID), DMX universe + address — **Then** each fixture is drawn with exactly the selected combination of labels (any one, some, or all), and the choice persists with the plot.
8. **Given** a fixture attached to a plot truss, **When** viewing the Lighting tab, **Then** the fixture's row shows that truss's name (and its position along the truss where it can be inferred) as read-only information; a fixture attached to no truss shows an empty truss field.

---

### User Story 6 - Three linked projections: top, front, side (Priority: P3)

The plot so far has been edited top-down. Switching the same plot to the front view, the planner sees the stage from the audience's perspective: the truss hanging at its set height with its fixtures, the PA stacks standing on the floor at their real heights. The side view shows the same rig in profile — stage depth against height. Raising the truss in the front view raises it in the side view too; moving a speaker across the stage in the top view moves it in the front view. Icons render with a projection-appropriate variant in each view (a person seen from above vs. from the front vs. in profile).

**Why this priority**: The linked front and side views make vertical rigging (truss heights, speaker stacks) truthful, but the top-down plot is complete and useful on its own — so this lands after the plan view is solid.

**Independent Test**: Place elements with known horizontal positions and heights, then verify each of the three views renders the same model consistently and that an edit in any one view is immediately reflected in the other two.

**Acceptance Scenarios**:

1. **Given** a plot, **When** the planner switches between top-down, front, and side views, **Then** all three render the same elements from one shared model — nothing exists in only one view.
2. **Given** an element, **When** its position or size is edited in any view, **Then** the other two views reflect the change without reloading; dimensions shared between two views (e.g. an element's width in top and front) always agree.
3. **Given** elements with heights (a truss hung at 400 cm, a 180 cm speaker stack, a person), **When** viewing front or side, **Then** vertical placement and heights are drawn to the same true scale as horizontal distances.
4. **Given** the built-in icon set, **When** an element renders in each view, **Then** it uses that icon's top-down, front, or side variant respectively.
5. **Given** grid and snapping, **When** working in the front or side view, **Then** they operate on that view's axes the same way they do top-down.

---

### Edge Cases

- Deleting a planned entity (input source, output device, fixture) that a resource references: the assignment vanishes, the plot element stays (Story 4, scenario 3).
- Deleting an inventory truss item that is part of a placed truss: follow the existing inventory pattern — the placed piece keeps its identity and is flagged as discontinued/unavailable on the rental order rather than silently disappearing.
- The same truss visible on two plots of one event must not double its rental count.
- Deleting a whole stage plot: removes its layers, elements, and truss placements; the underlying planned data (sources, channels, devices, rig fixtures) and — via the once-per-event rule — the rental contribution of trusses still placed on other plots are unaffected.
- A plot's last remaining layer cannot be deleted.
- Elements with zero or negative dimensions are rejected; there is a sane minimum size.
- Changing grid spacing never moves existing elements.
- Snap-to-grid and snap-to-objects both enabled: object alignment wins within its threshold, otherwise the grid — the behaviour is deterministic.
- An element dragged on a hidden or locked layer: impossible (not selectable / not editable).
- Very large plots (a full venue at 40 × 60 m) with a fine grid must stay usable — grid rendering adapts rather than drawing thousands of lines at far zoom.
- A fixture attached at a position beyond the truss's length (e.g. after removing a truss piece shortens it): the fixture is clamped to the truss's new extent and visibly flagged.
- Names longer than the icon's footprint: labels remain legible (placed beside/below the icon) rather than being clipped to the icon's width.

## Requirements *(mandatory)*

### Functional Requirements

**Plots**

- **FR-001**: Users MUST be able to create, rename, and delete any number of named stage plots per event, and switch between them.
- **FR-002**: All plot content (elements, layers, settings, view positions) MUST persist with the event and survive reload.
- **FR-003**: Deleting a plot MUST NOT alter any planning data outside the Stage Plots section, except removing that plot's truss contribution to the rental order.

**Scale & canvas**

- **FR-004**: Every element's position and dimensions MUST be stored in real-world centimetres; the canvas MUST render all elements at one consistent scale, so on-screen proportions always match real-world proportions, at every zoom level.
- **FR-005**: Users MUST be able to zoom and pan the canvas; zooming MUST NOT change any stored dimension.
- **FR-006**: The current scale MUST be visible to the user (e.g. grid square size or a scale indicator).

**Shapes**

- **FR-007**: Users MUST be able to draw generic shapes — at minimum rectangle, circle/ellipse, line, and text label — with exact real-world dimensions, to model the stage, risers, venue outline, and any other context.

**Resources**

- **FR-008**: Users MUST be able to place resources with an icon chosen from a built-in icon set that ships with the tool, covering at minimum: person, microphone, speaker, monitor wedge, rack, truss, and lighting fixture — plus a **distinct icon per instrument**, never a single generic "instrument" glyph. The instrument set MUST include at minimum: drums, upright piano, grand piano, keyboard, acoustic guitar, electric guitar, bass, cello, trumpet, and saxophone; a broader set is preferred.
- **FR-009**: Each icon MUST provide three projection variants — top-down, front, and side — used by the corresponding view.
- **FR-010**: Each resource MUST have an optional display name rendered on the plot, and a real-world footprint (width/depth) plus height that the user can set to depict reality accurately.
- **FR-011**: Users MUST be able to move, rotate, resize, duplicate, and delete elements directly on the canvas.
- **FR-012**: Speaker- and rack-style resources MUST support stacking: multiple entries sharing one footprint/location, with the stack size visible on the plot and the entries listed and re-orderable in the inspector.

**Assignments (linking to planned data)**

- **FR-013**: Users MUST be able to assign to a resource any number of the event's existing planned entities — input sources, input channels, output devices, stageboxes/stage multis, and lighting-rig fixtures — selected by reference, not typed as free text.
- **FR-014**: Assignments MUST display the referenced entity's current name; when the underlying entity is deleted elsewhere, the assignment MUST be removed automatically without corrupting the plot.
- **FR-015**: Assignments and stack entries MUST NOT create rental lines; they reference equipment already counted by the existing planning features.

**Layers**

- **FR-016**: Each plot MUST support multiple user-defined layers (create, rename, reorder, delete-with-confirmation); every element belongs to exactly one layer; a plot always has at least one layer.
- **FR-017**: Layers MUST be individually hideable and lockable: hidden layers are invisible and unselectable; locked layers are visible but uneditable.
- **FR-018**: New elements MUST join the currently active layer, and an element's layer MUST be changeable afterwards.

**Grid & snapping**

- **FR-019**: Each plot MUST offer a toggleable background grid with user-configurable spacing expressed in centimetres.
- **FR-020**: Snap-to-grid and snap-to-adjacent-elements MUST be independently toggleable; object snapping MUST show alignment guides against neighbouring elements' edges and centres while dragging.
- **FR-021**: Grid and snap settings MUST persist per plot; changing them MUST never move existing elements.

**Inspector**

- **FR-022**: A selected element's name, icon, layer, position, size, rotation, stack entries, and assignments MUST be viewable and editable in an inspector panel with exact numeric input; changes apply immediately to the canvas.

**Truss rigs**

- **FR-023**: Users MUST be able to assemble a truss from pieces picked from the inventory's truss category; the truss's drawn length MUST equal the sum of its pieces' real lengths.
- **FR-024**: A truss MUST act as the parent of fixtures attached to it: fixtures from the event's lighting rig attach at positions along the truss, and moving or rotating the truss moves all attached fixtures with it.
- **FR-025**: A truss MUST have a height-above-floor property used by the front and side views; fixtures MUST be able to detach from a truss without being removed from the lighting rig.
- **FR-026**: Truss pieces placed on an event's plots MUST be counted on the rental order and in the Excel export exactly like other rented equipment — priced, stock-validated, and flagged when discontinued — with each truss counted once per event even if shown on several plots. No other plot content affects the rental order.
- **FR-029**: Users MUST be able to choose which labels are drawn beside each fixture on a plot — any combination (one, some, or all) of fixture name, fixture ID (FID), and DMX universe + address — via checkbox options stored with the plot's settings. A fixture missing a value for a selected label (e.g. no DMX address yet) simply omits that label.
- **FR-030**: The Lighting tab's fixture list MUST display, read-only, the name of the plot truss each fixture is attached to — plus the fixture's position along that truss where it can be inferred — and MUST leave the field empty for fixtures not attached to any truss. Plot trusses supersede the Lighting tab's separate truss-section management as the way fixtures are organised onto trusses.

**Projections**

- **FR-027**: Each plot MUST be viewable and editable in three linked projections — top-down (default), front, and side — all rendering the same single model; an edit in any projection MUST be reflected in the others.
- **FR-028**: Front and side views MUST render heights (truss hang height, stacked speaker height, element heights) to the same true scale as horizontal distances, and MUST use the icon set's matching projection variants.

### Key Entities

- **Stage Plot**: A named, to-scale drawing belonging to one event; an event has many. Holds layers, elements, and per-plot grid/snap/view settings.
- **Layer**: An ordered, named grouping within one plot with visibility and lock state; owns elements.
- **Plot Element**: Anything placed on a plot — a shape or a resource — with layer membership, position (across/depth/height in cm), real-world dimensions (width/depth/height), and rotation.
- **Shape**: A generic element (rectangle, circle/ellipse, line, text) used for stage, risers, and venue geometry.
- **Resource**: An element representing a person or piece of equipment; has an icon (from the built-in set), an optional display name, optional stack entries, and any number of assignments.
- **Stack Entry**: One item within a stacked resource (e.g. one speaker of a stack, one device in a rack), referencing planned equipment, ordered within the stack.
- **Assignment**: A reference from a resource to one existing planned entity of the event (input source, input channel, output device, stagebox/stage multi, or lighting-rig fixture).
- **Truss**: A parent element assembled from inventory truss pieces, with total length derived from its pieces, a hang height, and attached fixtures; contributes its pieces to the rental order once per event.
- **Truss Piece**: One inventory truss item within a truss, in order, with its real length.
- **Fixture Placement**: The attachment of one lighting-rig fixture to a truss at a position along it (or a free-standing placement on the plot).
- **Icon**: A built-in glyph with top-down, front, and side variants; includes one distinct glyph per instrument (FR-008); not user-supplied in this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A planner can create a new plot containing a to-scale stage outline, a riser, five named resources, and a 6 m truss with four fixtures in under 10 minutes without documentation.
- **SC-002**: Dimensional accuracy is exact: for any two elements, the ratio of their rendered sizes equals the ratio of their stored centimetre dimensions in every projection and at every zoom level (verified with known values, e.g. a 200 cm element renders at exactly half the length of a 400 cm element).
- **SC-003**: With snapping enabled, 100% of drag operations land elements exactly on a grid multiple or exactly aligned with a neighbour — no near-miss offsets.
- **SC-004**: Truss pieces placed on plots appear on the rental order and in the Excel export with correct quantities and prices; for an event whose plots contain no trusses, rental totals are byte-for-byte identical to before the feature.
- **SC-005**: Moving a truss with attached fixtures preserves every fixture's offset along the truss exactly, in a single drag.
- **SC-006**: An edit made in any one projection is visible in the other two projections immediately (same editing session, no reload).
- **SC-007**: Deleting planned entities referenced by plot assignments never leaves a broken reference on any plot — 100% of such deletions degrade gracefully.
- **SC-008**: Existing events open unchanged: the feature is purely additive, and no pre-existing view, print sheet, or rental figure differs for an event with no stage plots.

## Assumptions

- The top-down view is the default and primary editing view; front and side views are secondary and may land later than the plan view (Story 6 is P3).
- Stage plots are printable/exportable like the app's other planning views (print sheets exist for patch lists and rigs); a printed plot states its scale. Print fidelity beyond the existing print-sheet pattern is not in scope.
- The icon set is monochrome and tinted by layer colour, matching the approved mockup; users cannot upload custom icons in this feature.
- Fixtures shown on plots are the event's existing lighting-rig fixtures (Lighting tab); the plot adds placement, not new fixture rows, and fixtures' rental treatment is unchanged.
- Trusses assembled on plots are event-level objects: placing the same truss on several plots references one truss, which is how the once-per-event rental count is achieved — mirroring the existing "shared output devices" pattern.
- Plot trusses replace the Lighting tab's truss-section management: fixtures are organised onto trusses only on the stage plot, and the Lighting tab shows the resulting attachment (truss name, inferred position) read-only. How pre-existing truss-section rows are carried over (retained as display text vs. migrated into plot trusses) is a design decision for planning; fixtures must never be double-managed.
- Coordinates use centimetres, consistent with the inventory's existing metric data (truss lengths in metres convert exactly).
- Multi-user concurrent editing of one plot is out of scope, consistent with the rest of the app.
- Video/AV equipment resources are out of scope (PROJECT.md §3.3 remains post-v1); nothing prevents representing them with generic shapes.
- Mockup reference: https://claude.ai/code/artifact/9f21adb3-98c0-4d5f-b730-3c4f0c0262f3 (approved direction, 2026-07-18).
