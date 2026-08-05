# Feature Specification: The Trusses overlay

**Feature Branch**: `039-plot-trusses-drawer`

**Created**: 2026-07-31

**Status**: Draft — design approved 2026-07-31 (`mockup.html`)

**Input**: ROADMAP.md § *Slice 39 — The Trusses overlay*, reported from use:
*"In the stage plot there is a Trusses modal to manage trusses. It should be a
drawer according to the design language."*

## Why this slice exists

The event's truss manager is a `ui/Dialog` — `PlotTrussManager.tsx:78` — holding
an inline-committing name and hang height per truss, rotation and rake when the
truss is on the current plot, a piece picker, an attach-fixture picker, and a row
of controls per piece and per fixture. Nothing in it is a sentence and two buttons.

Slice 38 wrote the rule that sorts it: **a `Dialog` interrupts, a `Drawer`
accompanies**. Nothing waits on the truss manager. You assemble a truss, hang a
fixture, go back to the canvas, come back — the plot is what you are working on
and the truss list is the bench beside it. It is a `Drawer`.

This slice **applies** that rule. It changes no file in `design/`: every rule it
needs — *interrupts / accompanies*, `flush`, `noteId`, tokens §7's 44 px minimum,
§7b's overflow split, `MicroLabel` over a run of rows — is already written.

Moving to `ui/Drawer` also gives the surface a phone form for free, because
`ui/Drawer` **is** `ui/Sheet` below 768 px. That form is the second half of the
slice, and it is a read.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The bench beside the plot (Priority: P1)

Someone building a stage plot at a desk opens Trusses, assembles a truss from
catalog pieces, hangs two fixtures on it, places it, goes back to the canvas to
see where it landed, and comes back to adjust the rake — without the plot ever
being replaced by the overlay or the overlay ever being dismissed to see it.

**Why this priority**: It is the reported defect and the rule being applied. The
rest of the slice follows from the surface having the right shape.

**Independent Test**: At desktop width, open Trusses over a plot with elements on
it and confirm the canvas is still visible beside the panel, that the panel is
anchored to the right edge, and that the plot behind it is neither displaced nor
resized.

**Acceptance Scenarios**:

1. **Given** a plot is open at desktop width, **When** the toolbar's *Trusses…*
   button is pressed, **Then** a right-anchored panel opens over the canvas and the
   canvas is not displaced or resized.
2. **Given** the panel is open, **When** a truss is placed on the current plot,
   **Then** its state in the list changes to say so and the panel stays open.
3. **Given** a truss is on the current plot, **When** its rotation or rake is
   changed, **Then** the canvas behind the panel redraws and the panel keeps its
   scroll position.
4. **Given** the panel is open, **When** it is dismissed by the backdrop, the close
   control or `Escape`, **Then** it closes and nothing else changes.

---

### User Story 2 — Reading a truss on a phone (Priority: P1)

Someone in a venue with the plot open on a phone needs to know what a truss is
made of — its pieces, its total length, how high it hangs, and which rig fixtures
hang at which offset on which lane. The canvas cannot show any of it.

**Why this priority**: It is what the phone gains from the slice, and it is the
*see more* case the rule names. It is P1 alongside US1 because a drawer that had
no phone form would be the defect again one width down.

**Independent Test**: On a 375 px viewport, reach the truss list from the stage
plot panel and read every value above, without any control appearing that would
change one.

**Acceptance Scenarios**:

1. **Given** a phone viewport with a plot open, **When** the panel's overflow is
   opened, **Then** a *Trusses* entry is there, its touch target is at least 44 px,
   and it opens the truss list as a bottom sheet.
2. **Given** that sheet is open, **When** it renders, **Then** each truss states its
   name, its total length, its hang height and whether it is on this plot, and each
   piece and each attached fixture is listed with its length or its offset and lane.
3. **Given** that sheet is open, **When** it renders, **Then** it contains no text
   input, no select, no add form and no delete control — for any role.
4. **Given** that sheet is open, **When** its explanation is opened, **Then** the
   last sentence describes reading rather than a drag-and-drop gesture the surface
   withholds.

---

### User Story 3 — Three controls that destroy something (Priority: P2)

Deleting a truss asks the browser's own question. Removing a piece and detaching a
fixture ask nothing at all, from a 14 px unlabelled `✕`. Each should cost what
being wrong costs.

**Why this priority**: The surface is being rebuilt anyway, and one of the three is
the worked example for defect D6.

**Independent Test**: Trigger each of the three, cancel where a confirm exists, and
confirm nothing changed; then complete each and confirm exactly the intended thing
changed.

**Acceptance Scenarios**:

1. **Given** a truss is deleted, **When** the confirmation appears, **Then** it is
   the application's own dialog, it names that truss, states what goes with it, and
   states that the rig's fixtures stay.
2. **Given** a piece is removed, **When** the confirmation appears, **Then** it names
   the truss's resulting length and states that every plot showing it redraws.
3. **Given** either confirmation is open, **When** it is dismissed by cancel, the
   backdrop or `Escape`, **Then** nothing is deleted and the drawer is exactly as it
   was, with its scroll position intact.
4. **Given** either confirmation is raised from inside the drawer or the phone
   sheet, **When** it renders, **Then** it is drawn above that surface, not beneath
   it.
5. **Given** a fixture is detached, **When** the control is pressed, **Then** it
   detaches with no confirmation, and the control carries an accessible name naming
   that fixture.

---

### Edge Cases

- **No trusses yet.** The list is empty and the new-truss form is the only thing in
  the body; on a phone, which has no form, the sheet states that there are none.
- **A truss with no pieces.** Its total length is 0 cm; it can still be placed, and
  the plot draws what it draws today. Nothing about this changes in this slice.
- **A truss with nothing hung on it.** The Fixtures band states that, rather than
  rendering an empty run of rows.
- **Every rig fixture already hung.** The attach picker has nothing to offer and
  says so in place of its options.
- **A legacy piece** — one with no `inventory_item_id`, from before pieces came
  from the catalog. It is not on the rental order, and removing it cannot be undone
  by re-adding, because it can only be re-added from the catalog.
- **A viewer.** Every control that would change something is absent at both widths,
  and the list, the pieces and the attached fixtures are all still readable.
- **A truss placed on a plot that is not the one being viewed.** It is not "on this
  plot", so it offers placement here and carries no rotation or rake — those live
  on the placement.
- **A phone with exactly one action in the panel's overflow.** It renders as its own
  target rather than as a menu of one.

## Requirements *(mandatory)*

### Functional Requirements

**The shape**

- **FR-001**: `PlotTrussManager` MUST render a `ui/Drawer` in place of its
  `ui/Dialog`. **One component** MUST serve both widths, not a second overlay — the
  drawer's own phone branch supplies the bottom sheet. (The stage plot's mobile early
  return means two *mounts* of that one component, as the canvas and the inspector
  already are; what must not exist is a second surface.)
- **FR-002**: The drawer MUST be `wide` (`max-w-3xl`). The fixture row runs four
  controls across and the piece form three; at the dialog's `max-w-2xl` the truss
  name field is 190 px and fixture names truncate.
- **FR-003**: The drawer MUST use `flush`. Its body is one construction — a run of
  truss bands over hairlines — not a stack of `DrawerSection`s. A section per truss
  would put a record's name in a `MicroLabel` heading, which is a category voice; a
  card per truss keeps today's boxes inside boxes.
- **FR-004**: Each truss MUST render as a header band (name, total length, hang
  height, its placement state or the affordance to place it, delete) followed by a
  `Pieces` band and a `Fixtures` band, each a `MicroLabel` over full-bleed rows
  separated by a hairline. The new-truss form MUST come last, under its own band.
- **FR-005**: The drawer MUST take the truss count as its `subtitle` — *N trusses,
  shared by every plot in this event*. It MUST NOT take a `footer`: the count is the
  subtitle, the model fact is the explanation, and on a phone a drawer's footer is
  the sheet's footer, which patterns.md §7d reserves for a confirm this drawer has
  not got.
- **FR-006**: No file in `design/` changes in this slice.

**The explanation**

- **FR-007**: The sentences currently opening the body (`PlotTrussManager.tsx:79-84`)
  MUST become the drawer's `info`, with `noteId="event-trusses"` — kebab-case, named
  after what the drawer is. The title *Trusses* MUST NOT be the identity (ROADMAP D5).
- **FR-008**: The desktop explanation MUST be three sentences: that a truss belongs
  to the event and is one line on the rental order however many plots show it; that
  its drawn length is the sum of its pieces, so removing one shortens it on every
  plot at once; and that a fixture can also be hung by dropping it from the palette's
  Rig fixtures onto a truss bar.
- **FR-009**: The mobile mount MUST pass a different last sentence — that assembling
  a truss and hanging fixtures are desk jobs, and that this is where you read what
  each one is. The first two sentences MUST be identical at both widths. This is
  composition by width, not permission: `isMobile` MUST NOT appear in any expression
  that decides what a *role* may do.

**The read view**

- **FR-010**: On a phone the drawer MUST be read-only, forced at the mount
  independently of role, for the reason Slice 36 gave the canvas: placement is a desk
  job, and a truss you cannot put anywhere is not worth assembling.
- **FR-011**: A read-only view MUST state values as values. `disabled` inputs and
  selects MUST NOT be used to express read-only anywhere in this surface, at either
  width, for either reason (phone or role).
- **FR-012**: A truss that is on the current plot MUST state so as a `Pill`. Today it
  renders a `disabled` button reading *On plot* — a control that cannot be pressed
  pretending to be a fact.
- **FR-013**: In a read-only view the 44 px minimum binds only what remains tappable
  — the way in, the way out, and the explanation toggle.

**The way in**

- **FR-014**: The stage plot's mobile `MobilePanel` MUST carry a *Trusses* entry in
  its `overflow`, opening the drawer. As the only entry it renders as its own target,
  at least 44 px.
- **FR-015**: The mobile status strip's truss count MUST remain a count and MUST NOT
  become the trigger. It can filter to none of its three facts, and §7b's chevron
  already means *filter to what I just said*.
- **FR-016**: The desktop *Trusses…* button MUST lose its `!readOnly` guard, so a
  viewer can open the drawer at either width. What is inside stays gated by the
  drawer's own `readOnly`.

**The destructive controls**

- **FR-017**: Deleting a truss MUST use `ui/ConfirmDialog` in place of
  `window.confirm` (`PlotTrussManager.tsx:227`). It MUST name the truss, state that
  its pieces and its placement on every plot go with it, and state that the fixtures
  hung on it stay in the rig. **This slice converts this call site and no others** —
  every other call site is defect D6, and this is its worked example. (D6's own
  section counts eight; the live count is **fifteen** — see the note under Out of
  Scope.)
- **FR-018**: Removing a piece MUST gain a `ui/ConfirmDialog` it does not have today.
  Its damage is silent and elsewhere: the truss's drawn length is the sum of its
  pieces, so every plot showing it redraws while the user is looking at a list of
  near-identical rows, and a legacy piece cannot be re-added. The sentence MUST name
  the truss's resulting length.
- **FR-019**: Detaching a fixture MUST NOT gain a confirmation. It is reversible by
  the picker in the same row and nothing is redrawn elsewhere; a confirm on a
  reversible act is what teaches people to dismiss confirms.
- **FR-020**: Both bare `✕` controls (remove piece, detach fixture) MUST gain an
  accessible name naming their subject, and MUST be a `Button` at `ghost`/`xs` with
  an `h-4` icon rather than a 14 px glyph.
- **FR-021**: Any `ConfirmDialog` raised from the drawer or the phone sheet MUST be
  rendered as a sibling *after* it, never inside its scrolling body. Both are `z-50`,
  so DOM order decides which is on top.

**The legacy piece**

- **FR-022**: The amber *(legacy)* parenthesis and its `title` attribute MUST both be
  replaced by a spec line in the warning tone on the piece's row, stating the
  consequence and the fix: that it is not from the catalog, is not on the rental
  order, and must be re-picked to count. A tooltip has no target on a touch screen.
- **FR-023**: On a phone the line MUST shorten to the consequence alone — the fix
  needs the catalog, which is a desk job.

**What is preserved**

- **FR-024**: Role-based `readOnly` MUST continue to gate every control at both
  widths, independently of the phone's forced read-only.
- **FR-025**: Every existing behaviour of the surface MUST survive the move: inline
  commit on blur for name, height, rotation, rake and fixture offset; the length
  auto-suggested from a catalog piece's name; lane selection; placement; and the
  query invalidations that keep the Lighting tab's truss column and the rental
  summary current.

### Key Entities

No schema change. The slice touches `PlotTruss`, `PlotTrussPiece` and
`PlotTrussFixture` only as they are already returned by the stage-plot endpoints.

## Success Criteria *(mandatory)*

- **SC-001**: The truss manager is reachable and readable at 375 px, where it did
  not exist before.
- **SC-002**: At desktop width the plot canvas remains visible and unresized while
  the truss list is open.
- **SC-003**: No `window.confirm` remains in `PlotTrussManager.tsx`.
- **SC-004**: No `disabled` prop expresses read-only in `PlotTrussManager.tsx`.
- **SC-005**: `git diff design/` is empty for this slice.
- **SC-006**: Every gate in CLAUDE.md passes.

## Out of Scope

- **Editing trusses on a phone.** Withheld, and **provisional**: it is tied to the
  single fact that a phone cannot place a plot element. If the phone ever gets
  placement, this is the decision that reverses.
- **Every other `window.confirm` call site** — defect D6. Its roadmap section names
  eight; the live count after this slice is **fifteen**, verified 2026-08-05. The
  seven it does not list are `StagePlotTab.tsx` (delete a stage plot),
  `LightingSheet.tsx`, `LightingTab.tsx`, `InputSheet.tsx`, `InputDeviceSection.tsx`,
  `TrueOutputDeviceSection.tsx` and `StageMultiSection.tsx`. Correcting D6's brief is
  the user's call, not this slice's — it is reported, not amended.
- **Grouping the list by placement.** A card that jumps when you press *Place* is a
  list reordering under the hand.
- **Reordering pieces** (the length is a sum), **searching the list** (a handful of
  trusses), **the rental order**, and **the plot's missing phone Print** — named in
  the mockup, not fixed here.
