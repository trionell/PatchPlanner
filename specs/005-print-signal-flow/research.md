# Research: Print & Signal Flow

## R1 — Print mechanism: print-only sheet components + `window.print()`

**Decision**: Each planning tab renders, next to its editing UI, a dedicated *sheet*
component — a static HTML table with no form controls — that is hidden on screen
(`hidden print:block` via Tailwind's built-in `print:` variant) and becomes the only
visible content in print. The per-tab Print button simply calls `window.print()`.
Global `@media print` rules in `index.css` hide the app chrome (sidebar, header, tab
bar, editing UI) and force dark-on-light colors.

**Rationale**:
- The editing tables hold their data inside `<input>`/`<select>` elements; printing them
  directly would violate FR-005 (no form controls) and print poorly (clipped values,
  dark theme). A parallel static rendering is the only way to control the paper output
  fully.
- `TabPanel` returns `null` for inactive tabs (see `frontend/src/components/ui/Tabs.tsx`),
  so exactly one sheet exists in the DOM at a time. FR-004 ("that tab's sheet only") and
  the Ctrl+P edge case fall out of the component structure for free — no bookkeeping of
  "which sheet should print".
- `window.print()` opens the native dialog, which covers both paper and save-as-PDF
  (spec assumption), and needs no dependency.

**Alternatives considered**:
- *`@media print` restyling of the existing editing tables*: rejected — cannot remove
  the form controls without duplicating the render logic anyway, and the editor columns
  (action buttons, pickers) don't match the sheet columns.
- *`react-to-print` or a PDF library (jsPDF, pdfmake)*: rejected — new runtime
  dependencies for something CSS does natively (Constitution Principle V).
- *Separate print route (`/events/{id}/print/inputs`) opened in a new window*: rejected —
  duplicates data loading and navigation state, breaks the "2 interactions" success
  criterion, and still needs the same print CSS.

## R2 — Paper behavior: native table pagination

**Decision**: Rely on native browser print behavior for pagination: `<thead>` repeats on
every printed page in Chromium and Firefox; `tr { break-inside: avoid }` prevents rows
splitting across pages (FR-006). Set `@page { margin: 12mm }` only — do **not** force
`size: A4`, so the user's printer/paper choice (A4 or Letter) is respected while the
layout stays within both widths. Sheets use black text on white with thin borders and a
compact font size (~9–10pt equivalent) so 48-channel patches stay readable.

**Rationale**: Zero-dependency, standards-based, and matches the spec's requirement that
sheets remain legible on both A4 and Letter.

**Alternatives considered**: forcing `@page size: A4` (rejected — breaks Letter users);
manual page-slicing in JS (rejected — fragile, unnecessary).

## R3 — Signal-flow view: new event tab, chain built client-side

**Decision**: Add a **Signal Flow** tab to the event detail page. It reuses the existing
`['audio-patch', eventId]` query (the response already contains inputs, stageboxes, and
stage multis) plus the inventory items query already used by the inputs tab for mic
names. A pure function `buildChannelFlow()` in `frontend/src/lib/signalFlow.ts` maps each
input row to a view-model of chain hops with per-hop "missing" flags; the tab renders one
row per channel (screen and print use the same rendering — the flow view is readable
on-screen and printable via the shared PrintSheet mechanism, FR-009).

**Rationale**:
- No new API: the data is already delivered in one response; deriving the chain
  server-side would duplicate presentation logic behind an endpoint nobody else needs
  (Principle V).
- A separate tab keeps `AudioInputsTab` (176 lines) focused on editing, gives the
  read-only view its own obvious home, and satisfies "read its complete signal chain in
  a single view" (SC-004).
- A pure builder function makes the missing-link rules unit-testable in Vitest without
  rendering components.

**Alternatives considered**: a toggle/overlay inside the inputs tab (rejected — crowds
the editor and complicates printing "that tab only"); a backend
`/events/{id}/signal-flow` endpoint (rejected — YAGNI); a graph library (explicitly out
of scope per roadmap).

## R4 — Missing-link semantics (FR-008 + "no false gaps" edge case)

**Decision**: For each input channel the builder classifies:
- **Source**: mic item name (via `mic_item_id` → inventory), else legacy `mic_label`,
  else **flagged missing** ("no source picked").
- **Cable**: `cable_type` (+ length when > 0); cable type is required by the schema so it
  is never flagged.
- **Path**: `stagebox_id` set → stagebox hop (name + port channel); `stage_multi_id` set
  → multi hop (name + channel); **neither set → "direct to console"**, rendered as a
  normal hop, *not* a gap (matches the spec edge case: direct-to-mixer channels show no
  false gaps). A hop is **flagged incomplete** when the box/multi is chosen but its
  channel number is missing/0, or when a channel number exists without a box/multi.
- **Console**: the input's `channel_number` (always present).

A channel with any flagged hop is counted and summarized at the top of the view
("N channels have gaps") so SC-004's "100% of channels with missing routing are visibly
flagged" is checkable at a glance.

**Rationale**: Encodes exactly the distinctions the spec draws (missing vs. legitimately
direct), and nothing more.

**Alternatives considered**: flagging "no mic" only for mic-type signal types (rejected —
guesses intent; a line-input DI is still worth an explicit source, and the flag is a
warning, not an error); validating vocabulary membership (rejected — FR-010 requires
rendering values as entered, consistent with slice 4's legacy-display rule).

## R5 — Event header on sheets

**Decision**: `PrintSheet` (the shared wrapper) reads the event via
`useQuery(['event', eventId])` — already cached by the event detail page — and prints
"event name · venue · date" plus the sheet title (e.g., "Input Patch"). Empty tabs render
the header plus an explicit "Nothing planned on this sheet." line (FR-011).

**Rationale**: No prop drilling through the tab components; the query cache makes it
free.

## R6 — Testing split

**Decision**: Vitest unit tests cover `buildChannelFlow()` (complete chain, missing
source, direct-to-console, incomplete stagebox routing, multi routing, legacy mic label).
Print output is validated manually per quickstart.md (browser print preview) — CSS print
behavior cannot be asserted meaningfully in jsdom. Existing frontend gates (tsc, ESLint,
Vitest) plus backend gates (unchanged code must still pass vet/lint/tests) close the
slice.

**Rationale**: Matches the roadmap's pragmatic-testing tier: unit-test the logic, eyeball
the CSS.
