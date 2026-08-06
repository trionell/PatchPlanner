# Audio exports become one generated document

## Why

The audio exports are browser print. Every planning tab renders a hidden React sheet that
`@media print` reveals, and *PDF* means whatever the browser makes of it — `PrintButton.tsx`
is eleven lines around `window.print()`. That mechanism cannot repeat a column header across
a page break, cannot put a landscape page inside a portrait document, cannot state a scale,
and cannot be told how to route a line so two cables stay distinguishable. All four are
needed here.

Underneath the mechanism sits the diagnosis the user gave: *"the long strings of steps are
not easy to read."* One column on each sheet — `Chain` — was carrying an entire signal path
as an arrow-joined string, squeezing every other column to do it, and still failing to be
readable. Meanwhile the fields a crew actually needs at load-in (which microphone, which
stand, phantom on or off, which connector) were on the entity all along and never reached
paper.

The application already produces one real document: the rental order, written by Go with
`go-pdf/fpdf` at `service/rental_pdf.go`. That is the pattern this follows.

## What Changes

- **New endpoint** `GET /api/v1/events/{id}/audio-export/pdf` returns one A4 PDF, *Audio
  documentation*, containing five sections in order: input patch, output patch, stage rig,
  signal flow (inputs), signal flow (outputs). One document, whichever audio surface asked
  for it.
- **The `Chain` column is deleted from both patch sheets.** **BREAKING** for anyone relying
  on the printed sheets' current shape. Input becomes nine columns across the 186 mm text
  block (`Ch · Name · W · Source · Microphone/DI · Stand · 48 V · Conn · Buses`); output
  becomes seven (`Out · Name · Type · W · Destination · Via · Conn`). The path itself is now
  drawn, in sections 4 and 5.
- **A row may grow a continuation line.** Notes — and the statement that a channel has no
  source or an output reaches nothing — print as an italic second line spanning the text
  block, rather than as a column that is empty on most rows.
- **A new stage rig section** lists every stagebox, stage multi, device and console with
  installed and patched jack counts and spare capacity by subtraction. No location column:
  `position_x/position_y` is canvas placement, not where a box physically stands.
- **The signal flow prints as the graph, drawn server-side in Go** from the same stored node
  positions the canvas reads, in paper metrics rather than screen pixels, on landscape pages
  inside the portrait document.
- **Edge routing is a stated constraint, not a matter of taste.** Every cable on paper is the
  same black hairline, so two parallel runs that touch stop being two runs. Seven routing
  rules govern the drawing; collinear overlap is a defect.
- **The phone reaches the same export.** `MobilePanel`'s overflow item stops saying *Print
  signal flow* and calling `window.print()`; it becomes *Export PDF*.
- **`design/patterns.md` §8 is amended.** It currently describes browser print as though it
  were the only print mechanism. After this change two mechanisms coexist — Lighting was not
  in the request and stays on browser print — so §8 must say which surface uses which and
  why, and give the routing rules a home.
- **Three React print components are deleted** once they have no caller: `InputPatchSheet`,
  `OutputPatchSheet`, `ChainText`. `PrintSheet` and `StagePlotSheet` stay; Slice 41 takes
  them.

A mockup of the document was built and **approved by the user** before this proposal:
`openspec/changes/audio-pdf-exports/mockup.html`. Its decisions D1–D12 and routing rules
R1–R7 are the source of the requirements below and in `specs/`.

## Capabilities

### New Capabilities

- `audio-document-export`: What the application produces when asked for the audio plan on
  paper — one generated document, its sections, what each table states, how a signal-flow
  graph is drawn so every cable can be followed, and how it behaves when the graph does not
  fit a page.

### Modified Capabilities

None. `openspec/specs/` currently holds only `destructive-confirmation`, whose requirements
are untouched.

## Impact

**Backend**

- New: `internal/service/audio_pdf.go` (document), and a graph-drawing unit — node geometry
  in mm, lane-assigned orthogonal routing — kept separate from the document so it is
  testable on its own.
- New: `internal/api/audio_export.go` + one route registration. Owner/contributor/viewer
  access follows the rental export's existing rule; an export reads, so a viewer may have it.
- Reads existing tables only. **No migration** — every field the document prints is already
  stored.
- `service/rental_pdf.go` is not modified, but its cp1252 constraint is inherited verbatim:
  built-in Helvetica, no embedded font file, so `→` is unavailable and every mark that was a
  glyph becomes a drawn vector.

**Frontend**

- `PrintButton.tsx` gains a second form (or a sibling) that downloads rather than prints;
  the three audio surfaces — `AudioPatchShell`, `SignalFlowTab` desktop, `SignalFlowTab`
  phone overflow — point at it. `LightingTab` and `StagePlotTab` keep `window.print()`.
- Deletions: `print/InputPatchSheet.tsx`, `print/OutputPatchSheet.tsx`, `print/ChainText.tsx`
  and their call sites. `print/printSheets.test.tsx` (306 lines) loses the cases that covered
  them; that coverage moves to Go table tests against the generated document rather than
  being dropped.

**Design**

- `design/patterns.md` §8 amended in the same commit as the code, per the design authority
  rule. This is the edit that made a mockup mandatory.

**Dependencies**

No new modules. `go-pdf/fpdf` is already a direct dependency.

## Constitution Check

- **I · Domain-First Data Model** — Upheld, and strengthened. The document is a second
  reader of the existing port-and-cable graph: it walks `input_cables`/`output_cables` and
  the `PortRef` convention rather than inventing a flat representation, and the diagram is
  drawn *from* that traversal. The rig section's counts are derived from the same graph. The
  sheets now name sources, microphones, stands and connectors in industry terms instead of
  compressing them into one string.
- **II · Extensibility by Design** — Upheld. Connector types, output types and categories are
  printed as the reference-data values they are; nothing branches on a category name or a
  connector string. A new node kind added to a graph later appears in the diagram through the
  same node/port abstraction the renderer already takes.
- **III · Full-Stack Monorepo Architecture** — Upheld. New code lands in `internal/service/`
  (document generation, the same home as `rental_pdf.go` and the OAuth and import services)
  and `internal/api/` (one handler), under `/api/v1/...`. No migration, so nothing to apply
  on startup.
- **IV · Inventory-Driven Rental Workflow** — Not engaged. This export is planning
  documentation, not a rental order; it makes no claim about stock and offers no
  supplier-specific format. The rule that no inventory is a dead end is unaffected — the
  rental export still stands alone.
- **V · Pragmatic Simplicity** — Upheld, with one judgment recorded. Drawing the graph in Go
  is a second renderer of a picture the canvas already draws, which reads at first like the
  abstraction YAGNI warns about. It is not: the canvas draws one coloured curve per cable
  onto a scrolling plane and paper can do neither, so the paper drawing has requirements
  (lane routing, page fitting, monochrome legibility) with no on-screen counterpart. The two
  alternatives — posting client-computed geometry, or splitting the derivation — were
  considered and rejected in `design.md`, the first because it fails outright when the export
  is triggered from a tab where the canvas is not mounted. No new dependency, no new service,
  no new state library.

**Deviations:** none.
