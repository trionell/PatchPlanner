# Feature Specification: Mobile-Friendly Redesign

**Feature Branch**: `021-mobile-friendly-redesign`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "Patch Planner works great on desktop but it's quite bad on mobile. Go over the entire app and make it mobile friendly. The app is desktop-first, so don't compromise that for mobile. Some parts of the app should perhaps not be enabled on mobile, like the stage plot. But perhaps on mobile we could have a stage plot viewer? Consider what parts of the app should be simplified for mobile. Create mockups before writing the spec."

Mockups reviewed and approved before this spec was written: https://claude.ai/code/artifact/eefc373d-1eb7-4c5e-9a10-b51e0aafae8f

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Make on-site patch and rig changes from a phone (Priority: P1)

An engineer rigging a show at the venue, phone in hand, needs to fix a mic assignment, move a DI to a cleaner stagebox input, relabel or recolor a channel, or bump a lighting fixture's DMX address/universe/ID — the kind of small correction that always comes up while focusing a rig or patching in. They open the event on their phone, find the exact channel or fixture in a condensed list, and edit it directly, without needing a laptop on site. They can also add a channel or fixture that was discovered on site but wasn't in the original plan.

**Why this priority**: This is the core problem statement — the desktop app already covers planning at a desk; the gap is real edits at the venue. Without this, mobile support is read-only and doesn't solve the actual on-site pain point.

**Independent Test**: On a phone-width viewport, open an event's Audio Inputs tab, search for a channel, edit its source and stagebox input, save, and confirm the change persists and matches what desktop shows for the same channel. Repeat for a Lighting Rig fixture's DMX address. Add one new channel and one new fixture from mobile and confirm both appear on desktop.

**Acceptance Scenarios**:

1. **Given** an event with existing audio input channels, **When** a contributor opens Audio Inputs on a phone-width viewport, **Then** they see a searchable, condensed list of channels, each shaded with its assigned console channel color.
2. **Given** the mobile Audio Inputs list, **When** the user taps a channel, **Then** an edit form opens allowing changes to the channel's name, color, source/mic assignment, stagebox/input routing, and notes.
3. **Given** the mobile Audio Inputs list, **When** the user taps an "add channel" action and fills in the required fields, **Then** a new channel is created and appears in both the mobile list and the desktop patch editor.
4. **Given** the mobile Lighting Rig list, **When** the user taps a fixture, **Then** an edit form opens allowing changes to the fixture's ID/label, DMX universe, DMX start address, and mode.
5. **Given** the mobile Lighting Rig list, **When** the user taps an "add fixture" action and fills in the required fields, **Then** a new fixture is created and appears in both the mobile list and the desktop lighting table.
6. **Given** the same edits described above, **When** performed on Audio Outputs instead of Audio Inputs, **Then** the same list-and-edit-sheet pattern applies.

---

### User Story 2 - Navigate the whole app from a phone (Priority: P2)

Any signed-in user opens Patch Planner on a phone and needs to get around: check the dashboard, browse their events, open an event, and move between that event's sections. Today the fixed desktop sidebar and the nine-tab strip either don't fit or force awkward horizontal scrolling. They need a navigation pattern that fits a phone screen and makes it obvious, before tapping in, which sections they can edit and which are view-only.

**Why this priority**: Without usable navigation, none of the other mobile capabilities are reachable — this is the structural prerequisite, but it delivers no value by itself if editing is still impossible, hence P2 rather than P1.

**Independent Test**: On a phone-width viewport, sign in, reach the dashboard, open an event from the events list, switch between at least three different event sections using the section switcher, and confirm the switcher's list shows each section's mobile capability (editable, view-only, or viewer) before it's opened.

**Acceptance Scenarios**:

1. **Given** a phone-width viewport, **When** the user is signed in, **Then** the four primary destinations (Dashboard, Events, Inventories, and an overflow entry containing My Defaults and sign-out) are reachable from a persistent bottom navigation bar instead of the desktop sidebar.
2. **Given** an open event on a phone-width viewport, **When** the user taps the current section indicator, **Then** a list of all nine event sections opens, each labeled with its mobile capability.
3. **Given** the section list is open, **When** the user taps a different section, **Then** that section's mobile view loads and becomes the current selection.
4. **Given** the Overview section on a phone-width viewport, **When** the user edits the event name, venue, date, or notes, **Then** the change saves the same as it does on desktop.
5. **Given** a direct link to a specific event section, **When** opened on a phone-width viewport, **Then** the app lands on that section already selected, not defaulted back to Overview.

---

### User Story 3 - Check the stage plot and signal flow on site without risking a change (Priority: P3)

A stagehand or engineer wants to double check where a monitor or fixture goes, or confirm a signal path, by looking at the stage plot or signal-flow diagram on their phone. These diagrams are edited with precise drag, resize, and rotate gestures on desktop, which don't translate to a touchscreen — attempting them on a phone would risk nudging something out of place. On mobile they only need to look, pan, and zoom.

**Why this priority**: Valuable for on-site reference, but the app remains usable without it (the read-only lists in User Story 1/4 already cover most lookup needs) — lower priority than making real edits possible.

**Independent Test**: On a phone-width viewport, open a Stage Plot with existing elements, pan and zoom the view, and confirm no drag/resize/rotate/add/delete control is present or triggerable. Repeat for Signal Flow.

**Acceptance Scenarios**:

1. **Given** an event's Stage Plots section on a phone-width viewport, **When** the user opens a plot, **Then** they can pan and zoom the diagram but see no palette, inspector, or drag/resize/rotate handles.
2. **Given** the mobile stage plot viewer, **When** the user touches and moves a finger over a placed element, **Then** the element does not move, resize, or rotate — only the view pans.
3. **Given** an event's Signal Flow section on a phone-width viewport, **When** the user opens it, **Then** they can pan and zoom the node/cable diagram with no editing controls present.

---

### User Story 4 - Check equipment and rental order lists on a phone (Priority: P4)

Someone loading a van or double-checking a rental pull wants to glance at what equipment is assigned to an event, or what's on the rental order, from their phone — without the risk of accidentally changing a quantity while scrolling on a small screen.

**Why this priority**: Useful reference, but the least critical of the four — these lists change during planning, not on site, so read access on mobile is nice-to-have rather than essential.

**Independent Test**: On a phone-width viewport, open Equipment and Rental Order for an event with existing items and confirm both render as grouped, condensed, read-only lists with no add/edit/delete affordance.

**Acceptance Scenarios**:

1. **Given** an event with equipment assigned, **When** a user opens Equipment on a phone-width viewport, **Then** items render as a condensed list grouped by category, with no controls to add, edit, or remove items.
2. **Given** the same event, **When** the user opens Rental Order on a phone-width viewport, **Then** the rental line items render the same condensed, read-only way.

---

### User Story 5 - Manage simple vocabulary lists from a phone (Priority: P5)

A user wants to add, rename, or delete a connector type, cable type, signal type, or DMX mode — either their own reusable defaults or an event's own copy — while away from a desktop. These are simple, low-risk list edits, not precision editing, so they should work exactly as well on mobile as on desktop.

**Why this priority**: Least urgent — these edits are rarely time-sensitive or venue-bound, but they're simple enough that restricting them on mobile would be an arbitrary limitation rather than a real usability constraint.

**Independent Test**: On a phone-width viewport, open My Defaults, add a new connector type, rename an existing cable type, and delete a signal type; confirm each change persists. Repeat inside an event's Settings tab.

**Acceptance Scenarios**:

1. **Given** the My Defaults page on a phone-width viewport, **When** the user adds, renames, or deletes a vocabulary row, **Then** the change saves the same as it does on desktop.
2. **Given** an event's Settings tab on a phone-width viewport, **When** the user adds, renames, or deletes a vocabulary row, **Then** the change saves the same as it does on desktop and does not affect the user's My Defaults template.

---

### Edge Cases

- A user with the **viewer** role sees every mobile section as read-only — including Audio Inputs/Outputs, Lighting Rig, Overview, and Settings, which are otherwise editable on mobile — exactly matching their existing desktop restriction, with edit controls hidden rather than merely blocked.
- Resizing or rotating a device past the mobile/desktop breakpoint while an edit sheet is open does not silently discard unsaved input.
- A channel or fixture list with a large number of items (50+) stays searchable and responsive on mobile rather than degrading to an unusable long scroll.
- A save from a mobile edit sheet that fails (e.g., poor venue connectivity) shows a clear error and leaves the edit recoverable rather than silently discarding it.
- Adding a channel or fixture on mobile when the event has no matching inventory/reference data configured yet shows the same validation and guidance as the desktop add flow, not a broken or empty form.
- Touching and dragging within the stage plot or signal-flow viewer only pans the view — it never moves, resizes, or deletes an element, even by accident.
- Tablet-width and larger viewports continue to use the existing desktop layout; only phone-width viewports switch to the mobile layout described here.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST present a mobile-adapted layout on phone-width viewports and MUST NOT change existing layout, density, or interactions at desktop widths.
- **FR-002**: On phone-width viewports, primary navigation (Dashboard, Events, Inventories, and an overflow destination containing My Defaults and sign-out) MUST be reachable from a persistent bottom navigation bar, replacing the fixed sidebar.
- **FR-003**: On phone-width viewports, an event's nine sections (Overview, Audio Inputs, Audio Outputs, Lighting Rig, Stage Plots, Signal Flow, Equipment, Rental Order, Settings) MUST be reachable through a single section switcher that, when opened, lists every section labeled with its mobile capability (editable, view-only, or viewer).
- **FR-004**: The Overview section MUST be fully editable on phone-width viewports, using the same fields as desktop in a single-column form.
- **FR-005**: Audio Inputs and Audio Outputs MUST be editable on phone-width viewports via a condensed, searchable channel list that replaces desktop's multi-section editors and patch graph; each row MUST be visually shaded with its assigned console channel color.
- **FR-006**: Selecting a channel in the mobile Audio Inputs/Outputs list MUST open an edit form supporting, at minimum, changes to the channel's name, color, source/mic or output-device assignment, stagebox/input (or equivalent output) routing, and notes.
- **FR-007**: The mobile Audio Inputs/Outputs list MUST provide a visible action to add a new channel.
- **FR-008**: Lighting Rig MUST be editable on phone-width viewports via a condensed, searchable fixture list that replaces desktop's fixture table.
- **FR-009**: Selecting a fixture in the mobile Lighting Rig list MUST open an edit form supporting, at minimum, changes to the fixture's ID/label, DMX universe, DMX start address, and mode.
- **FR-010**: The mobile Lighting Rig list MUST provide a visible action to add a new fixture.
- **FR-011**: The stage plot canvas and the signal-flow graph MUST render on phone-width viewports as pan/zoom-only viewers, with no drag, resize, rotate, add, or delete controls present or reachable.
- **FR-012**: Equipment and Rental Order MUST render on phone-width viewports as grouped, read-only lists with no add/edit/delete controls.
- **FR-013**: Settings (per-event vocabulary) and My Defaults MUST remain fully editable on phone-width viewports, supporting add/rename/delete of vocabulary rows exactly as on desktop.
- **FR-014**: Mobile list views (channel lists, fixture lists, equipment/rental lists, event lists) MUST use a condensed row layout — denser than a naive one-to-one copy of the desktop table row — while remaining legible, applied consistently across every list-based mobile view.
- **FR-015**: Every mobile edit and add action MUST continue to respect the signed-in user's existing event role; a viewer-role user MUST see all mobile sections as read-only, matching desktop's existing restriction, with edit controls hidden rather than left visible-but-blocked.
- **FR-016**: Direct links to a specific event section MUST land the user on that section already selected on phone-width viewports, consistent with existing routing behavior.
- **FR-017**: Mobile edit forms MUST report save failures clearly and MUST NOT silently discard a user's in-progress edit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can locate a specific audio channel or lighting fixture and save an edit to it in under 30 seconds from opening the event on a phone.
- **SC-002**: At least 8 audio channels or lighting fixtures are visible at once on a standard phone screen without scrolling, versus needing to scroll after roughly half as many with a naive desktop-row copy.
- **SC-003**: Every one of an event's nine sections is reachable within 2 taps from the event detail screen on a phone.
- **SC-004**: Desktop-width page layouts are pixel-for-pixel unchanged after this feature ships, verified across every page touched by this work.
- **SC-005**: No sequence of touch gestures on the mobile stage-plot or signal-flow viewer, or on the Equipment/Rental Order lists, can alter stored data.
- **SC-006**: In an unmoderated usability check, at least 90% of participants can find and open a specific event section on a phone within 3 taps without being told how.

## Assumptions

- "Phone-width viewport" follows the codebase's existing responsive convention (the same breakpoint already used for the Dashboard's stat-card grid) — roughly phones in both orientations; tablets and larger keep the existing desktop layout unchanged. Exact pixel value is an implementation detail for the planning phase, not fixed here.
- "Console channel color" refers to the existing per-channel color field already editable on desktop via the channel color picker (audio inputs, outputs, buses, and sources); no new color concept is introduced.
- Mobile edit forms cover the same underlying data and validation rules as their desktop counterparts — this feature changes presentation and interaction, not the underlying patch, lighting, equipment, or vocabulary data model.
- The mobile section switcher's capability labels (editable / view-only / viewer) are informational; they do not change what the user's role otherwise permits, per FR-015.
- No offline mode is introduced — mobile edits still require connectivity to save, per the existing app architecture; this feature only ensures failures are reported clearly (FR-017), not that edits queue offline.
- Stage Plots and Signal Flow keep their existing desktop editing behavior entirely unchanged; only their mobile presentation is new.
