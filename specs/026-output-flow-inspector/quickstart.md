# Quickstart: An inspector for the audio outputs flow graph

**Feature**: `026-output-flow-inspector` | **Date**: 2026-07-27

Four passes. A and B are the feature; C is the boundary; D is the promise that
nothing on the inputs side moved. Needs a signed-in browser session on an event
with at least one console, some outputs, and at least one stagebox or output
device — and, for pass A step 9, an event with two consoles.

Run the app the usual way: `make dev` (backend on :8080, Vite on :5173).

---

## Pass A — Edit an output from the Flow view (US1)

1. Open an event → **Audio Outputs** → switch to **Flow**.
2. Click the **label** of an output row in the desk's bus list.
   → The rail opens on the right. Header reads `OUTPUT`, then a pill with the
     output's type. The row is tinted amber on the canvas.
3. Change the name in the top field, then click away.
   → The row's label on the canvas changes to match.
4. Change **Type**.
   → The header pill's wording and tint follow it.
5. Change **Tape** to a colour.
   → The row's port dot and every cable leaving that output take the new colour,
     immediately, with no reload.
6. Change **Width** mono → stereo.
   → The bus list gains a second row for this output (L and R). Both rows are
     tinted; clicking either label keeps the rail on the same output.
7. Read **Lands on**.
   → It names the destination each run reaches, in the output's colour. Compare it
     against the same row's Chain column in the Sheet view — the last hop must be
     the same text.
8. Type into **Notes**, click away, switch to **Sheet**.
   → The row shows the new name, type, width, tape and notes. Nothing was lost.
9. *(Two-desk event)* Change **Desk**.
   → The row moves to the other desk's bus list on the canvas, and the rail stays
     on it. On a one-desk event, confirm the Desk field is **absent**.
10. Click **Duplicate**.
    → A new row appears at the next free output number, on the same desk, unpatched.
      The rail moves to the copy.
11. Click **Delete**, confirm.
    → The row and any cable leaving it are gone. The rail closes and the canvas
      reclaims the width.
12. Click an output's **port dot** (not its label).
    → A cable connection starts, exactly as before. The rail does **not** change
      what it is showing.

## Pass B — The rail for every other box (US2)

13. Click a **stagebox**'s header.
    → The rail opens headed `STAGEBOX`, naming it, with the note that rig gear is
      declared in the Rig drawer. No editable fields.
14. Do the same for a **stage multi**, an **output device**, and a desk's **LOCAL**
    jack panel.
    → All four open the rail. Four for four; none silently marks a box and shows
      nothing.
15. Click the desk box's own header.
    → Nothing is selected and no rail opens — the desk's fields are in the Rig
      drawer and its rows have rails of their own. Confirm the desk keeps its amber
      border regardless.
16. Read the **Legend** with a box selected.
    → Three rows: solid cable, dashed network hop, dashed unpatched. **No 48 V
      row** — no output carries phantom power.
17. Close the rail with the **✕**.
    → Rail gone, box no longer marked, canvas full width again.

## Pass C — Boundaries

18. Select an output, then delete that same output from the **Sheet** view in a
    second browser tab and return.
    → After the refetch the rail closes rather than showing a stale row.
19. Type a search term that matches nothing in the toolbar, then click a dimmed
    output row's label.
    → It still selects. A dimmed row is a row that exists.
20. Narrow the browser window to ~900px with the rail open.
    → The rail keeps its width; the canvas scrolls horizontally. The rail is not
      squeezed.
21. Open the event as a **viewer** (share it read-only with a second account, or
    switch roles) → Audio Outputs → Flow → select an output.
    → Every field renders disabled. **Duplicate and Delete are absent**, not merely
      disabled. The rail still reads and still shows Lands on.

## Pass D — The inputs side did not move (FR-015, SC-006)

22. Open **Audio Inputs** → **Flow** → select a source in the sources rail.
    → The rail is the one that was there before: same width, same 44px label
      column, same Reaches and Legend boxes, same Duplicate/Delete at the bottom,
      and the Legend still has its **48 V** row.
23. Hold the two tabs' rails side by side (two windows).
    → Frame, spacing, label column, note boxes and typography are identical.
24. Click a **channel** row's label in the console rail on the inputs canvas.
    → Nothing happens — channel rows are not selectable in this slice. Clicking a
      channel's **dot** still starts a cable.
25. In both Flow views, at 50%, 100% and 150% zoom, check that cables still meet
    their port dots.
    → The row markup changed; the dots did not move.

---

## Gates

```bash
cd frontend && npx tsc -b && npx eslint . && npx vitest run && npm run build
cd backend  && go vet ./... && go test ./...
git diff --stat main -- backend/     # must be empty: this slice is frontend-only
```
