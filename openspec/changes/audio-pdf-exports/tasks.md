## 1. Reading the graph server-side

- [ ] 1.1 Add `db` queries that load one event's input graph whole — sources, channels, input
      devices, stageboxes, stage-multis, consoles and every `input_cable` — in the shape the
      renderer needs, using the input-graph position columns (`input_position_*` where a node
      has both). Table test against a seeded event.
- [ ] 1.2 The same for the output graph — outputs, output devices, stageboxes, stage-multis,
      consoles, `output_cables` — using the output-graph position columns.
- [ ] 1.3 Derive each node's port list (count, order, and which ports a cable reaches) from
      the loaded graph, so a jack can be drawn as patched or free. Assert the port counts
      match the boxes' installed counts.
- [ ] 1.4 Derive the rig figures: per box, installed and patched jacks in and out, spare by
      subtraction, and a console's local panel separately. Test a partly-patched stagebox and
      a desk with a local panel.

## 2. The flow layout — `flow_layout.go`

- [ ] 2.1 Node paper geometry: box size from port count using the mockup's metrics (52 mm
      wide, 5 mm header, 4 mm port row, 3 mm footer), and a port's centre y from its index.
      Table test that height is `header + rows × rowHeight + footer` for 0, 1 and 32 ports.
- [ ] 2.2 Stage 1 fit — scale node positions by the largest `s` for which every scaled origin
      plus its box fits the text block, with channel widths reserving room for lane demand.
      Test that the arrangement is preserved: a node left of another stays left of it.
- [ ] 2.3 Stage 2 shrink — a uniform factor on sizes and fonts when boxes would collide,
      recomputing the fit, down to the 5 pt label floor. The floor is one named constant.
- [ ] 2.4 Stage 3 tile — at the floor and still not fitting, cut the plane into page-sized
      tiles along gaps between boxes. Test that no box is cut and that the tiles cover the
      whole plane.
- [ ] 2.5 Report the scale reached, for the page to state.

## 3. The routing — `flow_route.go`

- [ ] 3.1 Write the invariant check first: given a segment list, report any two segments
      collinear over a shared length, allowing only the shared stub of two edges leaving one
      port. This is the function every later test calls.
- [ ] 3.2 Group nodes into columns by overlapping x-extent and derive the channels between
      them.
- [ ] 3.3 Assign each vertical run a lane by greedy interval colouring over y-spans (R2, R3).
- [ ] 3.4 Horizontal runs at their own port's y, with R5's staggered stub for two edges off
      one jack.
- [ ] 3.5 Bypass routing (R6) — an edge whose route would cross a box goes to the nearer
      gutter, its gutter run taking a lane by the same colouring on x-spans.
- [ ] 3.6 Fixture tests: the mockup's own graph, a single cable, a full 32-in stagebox fan,
      one jack feeding two destinations, and a cable that must bypass a box. Each asserts the
      3.1 invariant.
- [ ] 3.7 A generated sweep over randomly placed graphs asserting the same invariant, aimed
      at the dense-channel case named in design.md Risks.
- [ ] 3.8 Assert edge-count parity — every cable the graph query returns is drawn exactly
      once — so a dropped cable fails a test rather than being noticed by eye.

## 4. Drawing the flow — `flow_draw.go`

- [ ] 4.1 Draw a node: border, header with name and kind badge, port rows with a filled or
      hollow jack mark, footer with its counts. Jack state legible without colour.
- [ ] 4.2 Draw a cable line from its routed segments, with a vector arrowhead at the
      destination. No character is used for any mark.
- [ ] 4.3 Draw the colour swatch on a port from the derived channel/output colour, carrying
      no meaning colour alone carries.
- [ ] 4.4 The page's title line and key — section number, name, stated scale, counts, and the
      legend for colour and jack state.

## 5. The document — `audio_pdf.go`

- [ ] 5.1 Page furniture: masthead (event, venue, dates, inventory, generated date, counts),
      running head on later pages, footer with `page / total`, and a `SetHeaderFunc` that
      repeats the current section's column header after an automatic break — the rental
      order's mechanism.
- [ ] 5.2 Section 1, the input patch: nine columns at
      `Ch 9 · Name 33 · W 6 · Source 27 · Microphone/DI 40 · Stand 23 · 48 V 9 · Conn 16 · Buses 23`,
      groups upright and DCAs italic, colour stripe, phantom drawn as a square.
- [ ] 5.3 The continuation line — a note, or a statement that a channel has no source, as an
      italic second line spanning the text block. A row without one costs no height.
- [ ] 5.4 Section 2, the output patch: seven columns at
      `Out 9 · Name 33 · Type 21 · W 6 · Destination 57 · Via 43 · Conn 17`, with the same
      continuation line for notes and for an output that reaches nothing.
- [ ] 5.5 Section 3, the stage rig: seven columns, the local-panel line, and the totals line.
- [ ] 5.6 Sections 4 and 5 — the two flow drawings, each starting a landscape page, inputs
      then outputs.
- [ ] 5.7 Empty sections state that they hold nothing rather than being omitted; an event
      with nothing planned still produces a document.
- [ ] 5.8 Correct `rental_pdf.go`'s cp1252 comment: `–` and `·` *are* representable
      (`96`, `B7`); what is not is `→`, and it substitutes silently to `.` rather than
      rendering as garbage.

## 6. The endpoint

- [ ] 6.1 `GET /api/v1/events/{id}/audio-export/pdf` on the existing event router, so
      `RequireEventAccess` applies without new code. Content type and disposition as
      `exportPDF` does.
- [ ] 6.2 `httptest` cases: a member gets a PDF, a non-member is refused, an unknown event
      404s, an event with nothing planned still returns a document.
- [ ] 6.3 Assert the document is identical whichever surface asked — one endpoint, so this is
      a test that the response depends only on event and data.

## 7. The frontend

- [ ] 7.1 A download action beside `PrintButton` that hits the new endpoint and saves the
      file. `PrintButton` itself is untouched — Lighting and the stage plot still use it.
- [ ] 7.2 Point `AudioPatchShell` and `SignalFlowTab`'s desktop bar at it.
- [ ] 7.3 The phone: `SignalFlowTab`'s `MobilePanel` overflow item becomes *Export PDF* in
      place of *Print signal flow*, with a ≥ 44 px target.
- [ ] 7.4 Vitest cover the new action's render on both branches.

## 8. Design and close-out

- [ ] 8.1 Amend `design/patterns.md` §8: two print mechanisms, which surface uses which and
      why, and the routing rules R1–R7 as the language for a drawn signal path. Same commit
      as the code it describes.
- [ ] 8.2 Run the document against a copy of real data (`/tmp` copy, `PATCHPLANNER_DB` —
      never `backend/patchplanner.db`) and confirm the 5 pt floor and the tiling cut against
      a real patch. Record what the numbers turned out to be.
- [ ] 8.3 Delete `print/InputPatchSheet.tsx`, `print/OutputPatchSheet.tsx`,
      `print/ChainText.tsx` and their call sites, and remove the cases in
      `printSheets.test.tsx` that covered them. Last, after 5–7 are green.
- [ ] 8.4 Run the Gates: `cd backend && gofmt -l . && go vet ./... && go test ./...`;
      `cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build`.
- [ ] 8.5 Review against `specs/audio-document-export/spec.md` and fix what review finds.
- [ ] 8.6 Write the outcome into `ROADMAP.md`'s Slice 40 section — manual, `openspec archive`
      does not know about it.
