# Feature Specification: The phone's panel

**Feature Branch**: `034-phone-panel`

**Created**: 2026-07-29

**Status**: Draft

**Input**: Wave 6b of the design convergence — `ui/MobilePanel`, the phone's frame
(bar, rows, strip); the row that stops being a card; and the status strip in the
hand. Closes audit findings **M1**, **M2** and **M3**. Approved mockup at
`specs/034-phone-panel/mockup.html`, revision 2.

---

## Context

Wave 6 is the phone, and it is one finding wearing twelve names: `components/mobile/`
was written in Slice 21, two slices before the design language existed, and Waves 0–5
converged nine tabs and five pages around it without touching it.

**6a (Slice 33) built the overlay and deliberately touched no surface.** 6b builds
the frame every surface sits in. After it, the phone is P1-compliant: one bordered
thing per surface, rows inside it rather than cards on a page ground, and a foot that
states whether the plan holds.

Almost every value this slice needs is already written down — `patterns.md` §7b draws
the panel, §7c tables the row, `tokens.md` §7 states the geometry, and
`design-language.html` §8 draws it at a true 375 px. The mockup exists for the places
where that was **not** true, and the review settled all of them:

| | Settled |
|---|---|
| The bar's icon targets — 36 px drawn, 44 px stated | **44 px.** One icon-target size on the phone, shared with the sheet's close control 6a built. |
| Search — an always-open field, or a target | **A target**, opening the bar's second row. |
| The strip's `h-6` controls | **The strip is the target.** 375 × 44 at the bottom edge, filtering to what it just reported. |
| **F3** — `tokens.md` §7 states `px-3 py-2.5` *and* "44 px tall" for the same row | **The row states a height, not a padding.** The padding as written makes a 56 px row and would cost two rows of data on a 667 px handset. |

### Three findings, all of them in documents

- **F1** — `design-language.html` §8 draws a per-section count on all nine rows of the
  section switcher, captioned *"each carrying its own count"*, while `patterns.md` §7e
  says the switcher *"lists sections and nothing else"*. The prose wins: a count on a
  destination is the strip's sentence moved into a menu, and all nine at once is
  Overview's job (§4b, `M9`).
- **F2** — Dashboard, Events and Inventories hold **four of the nine phone lists** and
  are assigned to no wave phase; 6c is *"the nine surfaces"*, meaning the nine event
  sections. This is 6a's finding repeating — *a finding with no phase is a finding
  nobody has agreed to close* — and the resolution is the same: this slice takes them,
  because they live inside the component it is already rewriting.
- **F3** — `tokens.md` §7's row line states `px-3 py-2.5`, `text-sm` over `text-xs`,
  and "44 px tall" together. At the framework's default line boxes that is
  20 + 20 + 16 = **56 px**. The drawn specimen (`min-height: 44px`, 5 px padding, a 1.3
  line box) and the shipped code (`py-1.5`, `leading-tight`, smaller type) independently
  reach 44 px and independently disagree with the table. The table is wrong.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The list is a panel (Priority: P1)

A technician opens Audio Inputs on a phone during load-in. Instead of a column of
free-standing cards floating on the page, they see **one bordered panel**: the surface's
name in a bar with an add control at the end of it, the channels as rows inside the
frame separated by hairlines, and a strip closing it that says `3 gaps · 16 channels ·
SD10`.

**Why this priority**: It is the whole of `M1` and most of `M3`, on the three surfaces
that carry the most rows. It is also the only story that must exist before any other can
be built — the frame is what the remaining six lists are put into.

**Independent Test**: Open Audio Inputs, Audio Outputs and Lighting Rig at 375 px. Each
is one bordered frame with a titled bar, rows, and its own status strip. Nothing else in
the application needs to have changed.

**Acceptance Scenarios**:

1. **Given** a phone-width viewport and an event with sixteen input channels, **When**
   Audio Inputs is opened, **Then** the channels render as rows inside a single bordered
   frame, and no row draws a border, radius or raised ground of its own.
2. **Given** that panel, **When** the list is scrolled to its end, **Then** the bar and
   the strip are both still on screen — only the rows scrolled.
3. **Given** a patch with three unlinked channels, **When** the surface is opened,
   **Then** the strip states `3 gaps` in the amber state, above the bottom nav.
4. **Given** a viewer-role user, **When** the surface is opened, **Then** the add control
   is absent rather than disabled, and the strip states the same verdict without a
   control.

---

### User Story 2 - The row is on the ladder (Priority: P1)

The same technician can read a row at arm's length. The title is the application's
navigation-tier `text-sm`, the subtitle `text-xs`, and the row is 44 px tall — **the
same height it is today**, because the card's own border and the gap to the next card
pay for the larger type.

**Why this priority**: It is `M2` and `F3`, and it is P1 alongside US1 because the two
are the same edit — a row cannot lose its card without a frame to be inside, and a frame
full of card-shaped rows is the finding unclosed.

**Independent Test**: Measure any phone list row. 44 px tall, 45 px of pitch, with
`text-sm` over `text-xs`. Count the rows visible at 375 × 667: eight, the same as before
the change.

**Acceptance Scenarios**:

1. **Given** a phone list, **When** a row is measured, **Then** its height is 44 px and
   its title and subtitle are the navigation tier's two sizes.
2. **Given** a 375 × 667 viewport, **When** a list of sixteen items is opened, **Then**
   at least eight rows are visible — no fewer than before this slice.
3. **Given** a channel with a tape colour, **When** its row renders, **Then** the colour
   is a 3 px leading edge with a `1a` tint, and the same hex the desktop sheet uses.
4. **Given** a row whose subtitle does not fit, **When** it renders, **Then** it
   truncates on one line rather than wrapping the row taller.

---

### User Story 3 - The strip states, and the strip acts (Priority: P2)

The strip says `3 gaps`. The technician taps it, and the list shows only those three
channels; the strip now reads `3 of 16 channels · show all`. Tapping again restores the
list.

**Why this priority**: The reading half of `M3` ships with US1. This is the acting half,
and it is what keeps a strip from being a place you read a problem you cannot then look
at — on a 56-channel patch, `3 gaps` with no way to see which three is an instruction to
start scrolling.

**Independent Test**: On a patch with gaps, tap the strip; the rows filter to the gaps.
On a complete patch, the strip draws no chevron and does not respond.

**Acceptance Scenarios**:

1. **Given** a strip reporting gaps, **When** it is tapped, **Then** the rows filter to
   exactly the rows it is reporting, and the strip says so.
2. **Given** a filtered list, **When** the strip is tapped again, **Then** all rows
   return.
3. **Given** a strip in a state with nothing to filter to — *complete*, *addressed*,
   *all covered* — **Then** it draws no chevron and is not a control.
4. **Given** a viewer-role user, **When** any strip renders, **Then** it is a sentence
   with no chevron, because the desktop rails already omit their control for that role.
5. **Given** a strip on a phone, **When** it is measured, **Then** its tappable height is
   at least 44 px.

---

### User Story 4 - Every phone list is a panel (Priority: P3)

Equipment, the rental order, the events timeline, the dashboard's event list and both of
the Inventories lists are the same shape as Audio Inputs: a bar, rows, and — where the
desktop surface has one — a strip.

**Why this priority**: It closes `M1` and `M2` everywhere rather than on three surfaces
out of nine, and it is what makes the shared row safe to have changed. It is P3 because
each of the six is mechanical once US1 and US2 exist.

**Independent Test**: Visit all nine phone lists. None renders a free-standing row card;
each is one bordered frame.

**Acceptance Scenarios**:

1. **Given** the rental order on a phone, **When** it is opened, **Then** the hand-built
   *Total* row is gone and `RentalStatusRail` closes the panel, stating the same total
   and whether the order can be sent.
2. **Given** the events timeline on a phone, **When** it is opened, **Then** the month
   headings and the *today* rule are inside the frame as headings over runs of rows.
3. **Given** a surface whose desktop form has no status rail — the events timeline, the
   dashboard, both Inventories lists — **When** its panel renders, **Then** the panel
   closes on its last row with no strip.

---

### Edge Cases

- **An empty list.** The panel renders its bar and its strip and states the empty case
  inside the rows region, at the surface's existing wording (`patterns.md` §5). A frame
  with a bar and no rows is not a broken panel.
- **A search that matches nothing.** The rows region says so; the strip continues to
  state the whole surface's verdict, because the verdict is about the patch and not about
  the query.
- **A strip that wraps.** A 56-channel patch's strip is two lines at 375 px. The rails
  already order most-urgent-first, so the verdict is always on the first line and only
  the tail wraps. Three lines would be a finding about the sentence, not about the phone.
- **A very long title or subtitle.** Truncates on one line. A row that grows to fit its
  content breaks the pitch the list is read at.
- **A list long enough to scroll while the strip is a control.** The strip is fixed at
  the panel's foot, so it is reachable without scrolling to the end.
- **Search open on a short screen.** The second bar row costs one row of list while it is
  open, which is the one moment nobody is scanning the list.

---

## Requirements *(mandatory)*

### The panel

- **FR-001**: A phone surface MUST render as **one bordered frame** containing a bar, a
  rows region and — conditionally — a strip. No part of a phone list may render as a
  free-standing card on the page ground.
- **FR-002**: The bar MUST keep §1's order: **title first**, then the flexible gap, then
  secondary controls, then the one primary action last. The title repeats the section
  name above it, deliberately, as it does on the desktop.
- **FR-003**: Every control in the bar MUST be at least **44 × 44 px**, at the same value
  `ui/Sheet`'s close control uses.
- **FR-004**: The bar MUST **wrap to a second row** rather than scroll or silently drop
  controls.
- **FR-005**: The panel MUST **fill the body**, with only the rows region scrolling, so
  the bar and the strip are on screen at every scroll position.
- **FR-006**: The rows region MUST own no padding and no inter-row gap — rows are
  separated by a hairline rule, not by air.
- **FR-007**: The strip MUST be **optional**, present exactly where the surface's desktop
  form has one, and absent where it does not.
- **FR-008**: Controls a restricted role cannot use MUST be **absent**, not disabled
  (P7).
- **FR-009**: The panel MUST NOT decide anything about the contents of its rows region —
  no field layout, no row shape, no data knowledge.

### Search

- **FR-010**: Search MUST be a **target in the bar** which opens a second bar row holding
  the field, not a permanently open field.
- **FR-011**: Opening search MUST focus the field.
- **FR-012**: `Escape`, the clear control, or an emptied field MUST close the row.
- **FR-013**: A **non-empty query MUST keep the row open**, so a filter never applies
  invisibly.
- **FR-014**: A search control MUST be absent where there is nothing to filter, as on the
  desktop.

### The row

- **FR-015**: The row MUST carry **no border, radius or raised ground of its own**.
- **FR-016**: The row's stated value MUST be a **minimum height of 44 px** with
  `leading-tight` on both lines; its padding is derived from that and is not the stated
  value (**F3**).
- **FR-017**: The row's title MUST be the navigation tier's `text-sm` and its subtitle
  `text-xs`. No value outside the two density tiers may remain in
  `components/mobile/`.
- **FR-018**: A row MUST NOT exceed 44 px because of its content: a title or subtitle
  that does not fit **truncates on one line**.
- **FR-019**: Where the entity has a derived colour, the row MUST draw it as a 3 px
  leading edge with a `1a` tint — the same hex the desktop sheet draws, in the geometry a
  phone row has.
- **FR-020**: The row's trailing slot MUST hold **one state or one affordance, never
  both**, and MUST NOT become a second tap target inside the row.
- **FR-021**: A heading over a run of rows MUST be a micro-label with a rule, inside the
  frame — the application's one label voice, at every width.

### The strip

- **FR-022**: The four existing status rails MUST acquire their phone form **inside
  themselves**, so that no surface rendering one needs to know the viewport.
- **FR-023**: On a phone the rail MUST render at the phone's `text-xs` and MUST NOT
  render its desktop `h-6` controls.
- **FR-024**: Where a rail offers a filter, **the strip itself MUST become the control**,
  with a tappable height of at least 44 px, filtering the rows to exactly what the strip
  is reporting and restoring them when tapped again.
- **FR-025**: A strip with nothing to filter to MUST draw no chevron and MUST NOT be a
  control.
- **FR-026**: A rail given no filter handler — a read-only role — MUST render as a
  sentence with no chevron.
- **FR-027**: The rental tab's hand-built total row MUST be **deleted** and replaced by
  `RentalStatusRail`.
- **FR-028**: A rail MUST NOT change what it says, how it derives it, or which of its
  states tints, at either width (P9).

### Scope

- **FR-029**: All **nine phone lists** MUST render in a panel: Audio Inputs, Audio
  Outputs, Lighting Rig, Equipment, Rental Order, the events timeline, the dashboard's
  event list, and both Inventories lists.
- **FR-030**: The desktop MUST be unchanged, with one declared exception recorded in the
  plan if any arises.
- **FR-031**: `!isMobile` used as a permission (`M4`), the unmounted drawers (`M5`), the
  two tabs with no phone branch (`M9`), the blank print (`M11`) and the canvases (`M6`)
  MUST NOT be touched. They are 6c and 6d.

### The documents

- **FR-032**: `tokens.md` §7's row line MUST state a **height** and drop its padding
  (**F3**), and `tokens.md` §7's off-ladder list and `audit.md` `M2` MUST **withdraw
  `py-1.5`**, naming the two type sizes as the defect it actually was.
- **FR-033**: `tokens.md` §7 MUST state the bar's control target at 44 px.
- **FR-034**: `components.md` §5's **`MobilePanel` gap MUST close**, replaced by the
  component's description.
- **FR-035**: `patterns.md` §7b MUST record the search behaviour and the strip-as-control
  rule; §7e MUST stand, with `design-language.html` §8's per-section counts **removed**
  (**F1**).
- **FR-036**: `design-language.html` §8's panel specimen MUST be redrawn at the 44 px bar
  target.
- **FR-037**: `audit.md` MUST move `M1`, `M2` and `M3` to Part 1b, record **F2** as a
  correction to the wave table the way 6a's was recorded, and update the Wave 6 phase
  table.
- **FR-038**: `ROADMAP.md` MUST gain this slice.

### Key entities

None. This slice adds no endpoint, no migration and no field; it is a frontend
composition change over data that already exists.

---

## Success Criteria *(mandatory)*

- **SC-001**: **No phone list renders a free-standing row card.** Every one of the nine
  is a single bordered frame.
- **SC-002**: **At 375 × 667 a list shows at least as many rows as it does today** — eight
  — so the frame and the strip cost no data on the smallest screen the application is
  drawn for.
- **SC-003**: **No value outside the two density tiers remains in `components/mobile/`.**
  The five named in `M2` are gone, and the withdrawal of `py-1.5` is recorded rather than
  silently ignored.
- **SC-004**: **Five phone surfaces state whether the plan holds** — Audio Inputs, Audio
  Outputs, Lighting Rig, Equipment and the rental order — where today none does.
- **SC-005**: **Every control a finger presses on a phone is at least 44 px**, including
  the strip when it is one.
- **SC-006**: A technician on a 56-channel patch can go from *"is this finished?"* to
  *"which three are missing?"* in **one tap**, without scrolling.
- **SC-007**: The desktop is byte-identical except where the plan declares otherwise, and
  the declaration is made before the change rather than found after it.
- **SC-008**: Type-check, lint, unit tests, frontend build, `go vet` and `go test` all
  pass.

---

## Assumptions

- **The mockup is the visual source of truth**, at revision 2, including its three
  settled decisions and its three findings. Where the mockup and an existing document
  disagree, the mockup's resolution is what this slice implements and the document is
  what this slice corrects.
- **`useIsMobile()` remains the one reach question**, and the rails branch on it
  internally — the precedent `ui/Drawer` set in 6a, chosen so that four rails acquire a
  phone form without five tabs being edited for it.
- **The row is one component.** Two row components differing only in whether they draw
  their own border would be `A1`'s synonym failure with a fresh coat, and the second one
  would be what every new list copies.
- **Nothing here is visually verified.** There is no browser in this toolchain, so every
  height in this document is computed from stated values rather than measured, and the
  handset pass belongs to `quickstart.md`.
- **The row's height arithmetic assumes the framework's default line boxes** and the
  project's unmodified type scale, which the plan verifies against the config rather than
  assuming.
