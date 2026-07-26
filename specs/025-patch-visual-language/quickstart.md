# Quickstart: verifying Slice 25

**Feature**: `025-patch-visual-language` | **Date**: 2026-07-26

Four walkthroughs, one per pass. Passes C and D are judged **side by side with the
mockup** — open it in a second window rather than checking from memory:
`https://claude.ai/code/artifact/f90ed9ba-5dff-49de-b9ad-3cf9ca555d2e`, sections
two (Sheet) and three (Flow).

## Setup

```bash
cd backend && go run ./cmd
cd frontend && npm run dev
```

Nothing to migrate — this slice touches no schema. Sign in, open an event with a
declared desk, a stagebox, a few sources and a few coloured channels.

---

## Pass A — Edit in Flow lands on the source (US1)

1. **Audio Inputs → Sheet.** Click a channel that has a source. In its row editor,
   press **Edit in Flow →**.
2. The tab switches to Flow, that source's row in the rail is **marked**, and the
   inspector on the right is **open on it**, showing its mic. → FR-001, FR-003,
   SC-001
3. Switch back to **Sheet**, then to **Flow** again. Still selected. → FR-002,
   SC-010
4. Type something in the search box, switch view twice. The search term survives
   too. → SC-010
5. Add sources until the rail scrolls. Select the *last* one from the sheet: the
   rail scrolls it into view rather than leaving it below the fold. → FR-004,
   SC-002
6. With that source selected, delete it from the inspector. The inspector closes
   rather than showing fields for a row that is gone. → FR-005
7. Click a channel with **no** source. Its row editor offers no Edit in Flow.
   → FR-006
8. In the sheet, click a **middle hop** of a chain and choose Edit in Flow from the
   hop picker. The graph opens with *that box* selected, not the source. → FR-003
9. **Audio Outputs → Sheet.** Press Edit in Flow on a patched output. The graph
   opens with that run's first box marked. No inspector here, by design. → FR-001

---

## Pass B — colour runs end to end on the outputs graph (US2)

1. **Audio Outputs → Sheet.** Give three outputs distinct tape colours.
2. Patch each: desk → stagebox jack → a device.
3. **Flow.** Every port along each run wears that output's colour — the desk's
   port, *both* of the stagebox's ports for that jack, and the device's port. Not
   just the cables. → FR-007, SC-003
4. Clear one output's colour. Its run's ports go neutral; the others do not.
   → FR-008
5. Add a cable between two devices with nothing upstream. Its ports stay neutral.
   → FR-008
6. Put the two graphs side by side. Colour means the same thing and is drawn the
   same way. → FR-009, SC-004

---

## Pass C — one panel, the sheet, the canvas chrome, the inspector (US3, US4)

**With the mockup open beside you.**

1. **Audio Inputs.** The toolbar, the table and the status strip are **one bordered
   panel**: the bar closes onto the table, the strip closes the bottom, no gaps and
   no card inside a card. → FR-010, SC-006
2. Toggle to **Flow**. The same panel, different content. Nothing about the frame
   moves. → FR-011, SC-006
3. Column headings: mono, uppercase, letter-spaced, quiet, on a ground darker than
   the rows. → FR-012
4. Row height: one line at the mockup's density, hairline separators, striping you
   have to look for. → FR-013, SC-005
5. Tape colour: a short bar immediately before the name. Nothing on the number
   cell. → FR-014
6. Ch / W / 48 V columns: digits line up vertically down the column. → FR-015,
   SC-007
7. A chain cell: mono, each hop dotted-underlined and clickable, arrows quieter
   than the hops. Find a channel patched through the **desk's own socket** — that
   hop is **amber**, the rented-gear hops are grey. → FR-016
8. Buses column: small tinted pills, noticeably smaller than the badges on, say,
   the Equipment tab. → FR-017
9. Status strip: state, counts, warnings, one quiet line. Introduce a gap → the
   strip's ground and top border go amber. Push the patch over the desk's declared
   count → red. → FR-018
10. **Flow.** Three tinted vertical bands with their names in quiet mono **inside**
    the canvas. No dashed lane edges. → FR-019
11. The zoom control is **in the toolbar**. Nothing sits between the toolbar and
    the canvas. → FR-020
12. Select a source. The inspector is a rail with a left border — not a floating
    card — and every field sits **beside** a short label in one narrow column, not
    under it. → FR-021, FR-022
13. **Reaches** and **Legend** are each a bordered note. The legend shows four
    actual line samples; no sentences. → FR-023, FR-024, SC-008
14. **Duplicate** and **Delete** are at the bottom of the rail, Delete red.
    → FR-025
15. Open the event as a **viewer**: every field, Reaches and the Legend still read;
    nothing can be changed or deleted. → FR-026

---

## Pass D — the nodes and the sources rail (US5)

**With the mockup open beside you.**

1. Compare a **desk** box, a **stagebox**, a **device** and the **rail** against
   the mockup: radius, border, background, shadow, header size and weight, badge,
   footer. → FR-027
2. Put the Inputs desk box beside the Outputs desk box. Same chrome. → FR-027,
   SC-004
3. A **stagebox**: each jack is **one row**, in port hard left, out port hard
   right, so a pair reads across. Not two columns. → FR-028
4. The desk's **local jack panel**: the same one-row-per-jack shape. → FR-028
5. Give the stagebox 32 outputs. The box shows 8 rows then **⋯ 24 more**, and takes
   no more height than the mockup's. → FR-029, SC-009
6. Set it to exactly 8. No `more` row. Set it to 9. The row says **1**. → FR-029
7. Ports: small, hollow when unpatched, filled amber when patched, in the run's
   colour when the run reaches a channel. Click one — the hit area is bigger than
   the dot. → FR-030
8. The desk box is distinguished from every other box, and its own sockets are
   separated from its channel rows. → FR-031
9. **The sources rail**, row by row against the mockup: full-height colour tape,
   name, model in quiet mono, red 48 V bar when on, port flush right, at the
   mockup's row height. → FR-032
10. A **stereo** source: two slots tall, `L` above `R`, each side separately
    patchable — cable one side only and confirm the other stays hollow. → FR-033
11. The rail's header states the count; its footer holds **+ Source**. → FR-034
12. Select a source: its row is tinted and its name reads stronger. → FR-035
13. **Cables still land on their ports.** Zoom to 50%, 100% and 150% and confirm
    every run meets its port dot — the split rows changed which element the
    geometry measures. → the plan's third flag
14. Drag a box; drag the rail's scrollbar. Cables stay attached. → regression

---

## What must not have changed

1. Resize to a phone width, reload: the mobile channel list, exactly as before.
   → FR-038, SC-011
2. Print preview both audio tabs: the paper sheets, exactly as before. → FR-038
3. Open **Overview**, **Lighting Rig**, **Stage Plots**, **Equipment**, **Rental
   Order**, **Settings**: unchanged. In particular their tables and badges, which
   share components this slice deliberately did not touch. → FR-039, SC-011
4. **Rental Order**: the same totals as before this slice. → FR-037

## Gates

```bash
cd backend  && go vet ./... && go test ./...
cd frontend && npx tsc -b && npx eslint . && npx vitest run && npm run build
```

`tsc -b`, not `tsc --noEmit` — the root tsconfig is references-only.
