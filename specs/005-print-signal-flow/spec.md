# Feature Specification: Print & Signal Flow

**Feature Branch**: `005-print-signal-flow`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Go ahead with slice 5" — ROADMAP.md Slice 5: print-friendly
views for input patch, output patch, and lighting rig with a per-tab Print button
(PROJECT.md §3.7), plus a read-only per-input-channel signal-flow view to catch patching
errors before load-in (PROJECT.md §3.4).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Print the input patch sheet (Priority: P1)

A sound engineer has finished planning the input patch for an event. Before load-in they
print the input patch list (or save it as a PDF via the browser's print dialog) and hand
it to the stage crew and the FOH engineer. The printed sheet is a clean, paper-friendly
table: event name and date at the top, one row per input channel with channel number,
name, mic/DI, stand, signal type, connector, cable type, phantom power, stagebox/multi
routing, and notes — no navigation, buttons, or dark-screen styling.

**Why this priority**: Distributing the input patch to the crew is the single most common
sharing workflow (PROJECT.md §3.7) and today requires manual transcription or ugly
screenshots. It is the core value of this slice on its own.

**Independent Test**: Plan a few input channels on an event, press Print on the Inputs
tab, and inspect the browser's print preview: all planned channels appear, legible on A4,
with no interactive UI elements.

**Acceptance Scenarios**:

1. **Given** an event with planned input channels, **When** the user presses the Print
   button on the Inputs tab, **Then** the browser print dialog opens showing only the
   patch sheet (header with event name/date + channel table), with every planned channel
   present.
2. **Given** the app's dark on-screen theme, **When** the print preview is shown,
   **Then** the sheet renders dark text on a light background suitable for paper.
3. **Given** more channels than fit on one page, **When** the sheet spans multiple pages,
   **Then** the table's column headers repeat on every page and no row is cut in half.
4. **Given** an input channel using a custom or legacy vocabulary value, **When** the
   sheet is printed, **Then** the value appears exactly as shown on screen.

---

### User Story 2 - Print the output patch and lighting rig (Priority: P2)

The same engineer also prints the output patch (mixes/sends with destinations and cable
types) for the monitor world, and the lighting technician prints the rig sheet (fixtures
with universe, DMX address, mode, channel count, truss section, and power routing) to
patch the rig at the venue.

**Why this priority**: Same mechanism and workflow as User Story 1 applied to the other
two planning tabs; valuable but secondary to the input patch, which is the sheet most
often distributed.

**Independent Test**: Plan output rows and lighting fixtures on an event, press Print on
the Outputs tab and on the Lighting tab, and verify each preview shows the complete,
paper-friendly table for that tab only.

**Acceptance Scenarios**:

1. **Given** an event with planned outputs, **When** the user presses Print on the
   Outputs tab, **Then** the print preview shows a sheet with all output rows (number,
   name, type, destination, cable) and the event header.
2. **Given** an event with a planned lighting rig, **When** the user presses Print on the
   Lighting tab, **Then** the print preview shows all fixtures with universe, DMX
   address, channel mode/count, truss section, and power connections.
3. **Given** the user prints any one tab, **Then** content from the other tabs does not
   appear on the printed sheet.

---

### User Story 3 - Trace an input channel's signal flow (Priority: P3)

While reviewing the plan, the engineer opens a read-only signal-flow view that shows, for
each input channel, the complete chain: microphone/DI → cable → stagebox port or stage
multi channel → mixer channel. Incomplete links (no mic picked, no stagebox/multi
routing) are clearly flagged, so patching errors are caught before load-in instead of on
stage.

**Why this priority**: The data is already captured; this view adds a verification lens
on top of it (PROJECT.md §3.4). It prevents errors rather than enabling a new workflow,
so it ranks below the two printing stories.

**Independent Test**: Plan one fully-routed channel and one channel with a missing link,
open the signal-flow view, and verify the complete chain reads end-to-end for the first
and the gap is visibly flagged for the second.

**Acceptance Scenarios**:

1. **Given** an input channel with mic, cable, and stagebox routing assigned, **When**
   the user opens the signal-flow view, **Then** the channel's full chain (source → cable
   → stagebox/multi channel → mixer channel) is shown as one readable row/line.
2. **Given** an input channel with no stagebox or multi routing, **When** the signal-flow
   view is shown, **Then** the missing link is visibly marked as a gap rather than
   silently omitted.
3. **Given** the signal-flow view is open, **When** the user interacts with it, **Then**
   nothing can be edited from this view and no stored data changes.
4. **Given** the signal-flow view, **When** the user presses Print, **Then** a
   paper-friendly version of the flow list prints like the other sheets.

### Edge Cases

- An event with zero planned rows on a tab: the printed sheet still shows the event
  header and an explicit "no channels planned" note rather than a blank page.
- Very long free-text notes or names: rows wrap within the page width instead of being
  clipped.
- A channel routed through a stage multi (not a stagebox), or directly to the mixer:
  the signal-flow view renders whichever path applies without showing false gaps.
- Legacy/custom vocabulary values (kept from before configurable reference data): print
  and signal-flow views display them as-is.
- Printing from the browser menu (Ctrl+P) instead of the Print button on the active tab
  produces the same paper-friendly result for that tab.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a paper-friendly print rendering of the input
  patch: event name and date header plus one row per channel with channel number, name,
  source (mic/DI), stand, signal type, connector, cable type, phantom power,
  stagebox/multi routing, and notes.
- **FR-002**: The system MUST provide a paper-friendly print rendering of the output
  patch: output number, name, output type, destination, and cable type, with the same
  event header.
- **FR-003**: The system MUST provide a paper-friendly print rendering of the lighting
  rig: fixture name, universe, DMX address, channel mode and count, truss section, and
  power connections, with the same event header.
- **FR-004**: Each of the three planning tabs MUST offer a Print action that opens the
  browser's print dialog for that tab's sheet only.
- **FR-005**: Printed sheets MUST exclude navigation, buttons, form controls, and other
  interactive elements, and MUST use dark text on a light background regardless of the
  on-screen theme.
- **FR-006**: Multi-page printed tables MUST repeat their column headers on each page
  and MUST NOT split a row across a page break.
- **FR-007**: The system MUST provide a read-only signal-flow view listing, per input
  channel, the chain source → cable → stagebox port or stage multi channel → mixer
  channel.
- **FR-008**: The signal-flow view MUST visibly flag missing links in a channel's chain
  (e.g., no source picked, no routing assigned) instead of omitting them.
- **FR-009**: The signal-flow view MUST be printable in the same paper-friendly manner
  as the patch sheets.
- **FR-010**: Print and signal-flow views MUST NOT modify any stored planning data; they
  render existing data exactly as entered, including legacy or custom vocabulary values.
- **FR-011**: A tab with no planned rows MUST print a sheet stating that nothing is
  planned rather than an empty or broken page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from viewing a planning tab to a print-ready patch sheet in
  at most 2 interactions (open tab → press Print).
- **SC-002**: 100% of planned rows for the printed tab appear on the printed sheet, and
  no content from other tabs appears.
- **SC-003**: Printed sheets contain zero interactive elements (buttons, inputs,
  navigation) and are legible on standard A4 paper.
- **SC-004**: For any input channel, a user can read its complete signal chain in a
  single view without visiting other tabs, and 100% of channels with missing routing are
  visibly flagged.
- **SC-005**: Producing prints and viewing signal flow changes zero rows of stored
  planning data.

## Assumptions

- The browser's built-in print dialog covers both paper printing and save-as-PDF; no
  separate PDF-generation capability is needed for v1.
- The shareable read-only web link mentioned in PROJECT.md §3.7 is out of scope for this
  slice (post-v1), as decided in the roadmap.
- The signal-flow view is text/table-based; a graphical node diagram is explicitly out
  of scope for v1 (ROADMAP.md Slice 5).
- A4 is the default paper size; sheets should also remain legible on US Letter.
- The signal-flow view covers input channels only (that is where the multi-hop chain
  exists); outputs and lighting have no comparable chain and are served by their print
  sheets.
- The Equipment tab and rental order are not part of this slice; existing screens remain
  unchanged apart from the added Print actions and the new signal-flow view.
