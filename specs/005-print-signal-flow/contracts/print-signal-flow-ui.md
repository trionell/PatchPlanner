# UI Contract: Print Sheets & Signal Flow

No new REST endpoints. This contract fixes the user-facing behavior of the print system
and the signal-flow view so the implementation and quickstart verification agree.

## Print behavior (all tabs)

| Aspect | Contract |
|--------|----------|
| Trigger | A "Print" button on each of: Audio Inputs, Audio Outputs, Lighting Rig, Signal Flow. Clicking it calls the browser print dialog. |
| Scope | Exactly the active tab's sheet prints. Inactive tabs are unmounted, so browser-menu printing (Ctrl+P) prints the same sheet as the button. |
| Chrome | Sidebar, page header, tab bar, buttons, forms, and all interactive elements are absent from print output (FR-005). |
| Colors | Dark text on white background in print, regardless of the dark screen theme. |
| Header | Every sheet starts with: sheet title (e.g. "Input Patch"), event name, venue, date. |
| Pagination | Table column headers repeat on every printed page; no row is split across a page break (FR-006). `@page` margin 12mm; paper size follows the user's printer settings (A4 default, Letter supported). |
| Empty tab | Sheet prints the header plus "Nothing planned on this sheet." (FR-011). |
| Data fidelity | Values print exactly as shown on screen, including legacy/custom vocabulary values (FR-010). No network writes occur. |

## Sheet columns

### Input Patch sheet (FR-001)

`Ch# | Name | Type | Connector | Source | Stand | Cable | Length | 48V | Routing | DCA | Notes`

- **Source**: mic/DI inventory item name, else legacy `mic_label`, else "—".
- **Routing**: `SB <name> ch <n>` / `Multi <name> ch <n>` / "direct".
- **48V**: "✓" or blank.

### Output Patch sheet (FR-002)

`Out# | Name | Type | Destination | Amp | Speaker | Cable | Length | Notes`

- **Destination**: `local` / `SB <name> ch <n>` / `Multi <name> ch <n>` per
  `destination_type`.

### Lighting Rig sheet (FR-003)

`# | Fixture | Truss | Universe | Address | Mode | Ch | Power | Notes`

- **Fixture**: inventory item name or custom name.
- **Power**: `grid <connector-in>` or `chain ← <parent #>` (+ connector-out when set).

### Signal Flow sheet (FR-007/FR-009)

One row per input channel, sorted by channel number:

`Ch# | Name | Source → Cable → Path → Console`

- Hops render left-to-right with arrows; each hop shows its label (and detail line where
  present, e.g. cable length).
- A missing hop renders as a visually flagged gap (e.g. "⚠ No source picked" /
  "⚠ SB <name> — no channel") — never silently omitted (FR-008).
- "Direct to console" is a normal, unflagged hop.
- A summary line above the table states either "All channels fully routed" or
  "N channel(s) have gaps" (SC-004).

## Signal Flow screen view

- Lives as a new "Signal Flow" tab on the event detail page.
- Read-only: contains no inputs, selects, or mutation calls (FR-010); its only button is
  Print.
- Uses the same data queries as the Audio Inputs tab (`audio-patch` + inventory items);
  no new API calls.
