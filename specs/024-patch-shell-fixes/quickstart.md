# Quickstart: verifying Slice 24

**Feature**: `024-patch-shell-fixes` | **Date**: 2026-07-26

Four walkthroughs, one per pass. Each is independent — a pass can be verified as
soon as it is committed.

## Setup

```bash
# Backend on :8080, frontend on :5173 with the /api proxy
cd backend && go run ./cmd
cd frontend && npm run dev
```

Sign in, open an event, and go to **Audio Inputs**.

### Verifying the migration against real data — never against the live file

```bash
cp backend/patchplanner.db /tmp/pp-slice24.db
PATCHPLANNER_DB=/tmp/pp-slice24.db go run ./cmd     # applies 043 on startup
sqlite3 /tmp/pp-slice24.db \
  "SELECT id, name, local_position_x, local_position_y,
          local_input_position_x, local_input_position_y FROM event_consoles;
   SELECT * FROM schema_migrations;"
```

Expect every desk at `260 / 320` on both graphs, `schema_migrations = (43, 0)`,
and — the point of the check — the same desks, channels, outputs, cables and
positions as before (SC-012). `backend/patchplanner.db` is never opened by any of
this.

---

## Pass A — a channel keeps its desk (US1)

1. **Rig → Consoles**, give the event's desk a name and an input count. Close the
   drawer.
2. In the sheet, click any channel, change its name, press **Save channel**.
3. Switch to **Flow**. The channel is still listed on the desk's box, and there is
   **exactly one** destination box on the canvas. → SC-001, SC-002
4. Repeat on three more channels, then count boxes again. Still one. → SC-001
5. Go back to **Sheet**, add a channel from **+ Channel**, name it, save. Still on
   the desk, still one box. → FR-002
6. **Rig → Consoles → Edit → + Console**, add a second desk. The row editor now
   shows a **Desk** field. Set a channel to the second desk and **Save channel**.
   Then reopen that row, change only its notes, and save. The desk is still the
   second one. → FR-004
7. Delete both desks (confirming the cable-clearing prompt). In Flow the channels
   are in one box titled **Channels**. **Drag it.** It moves. → FR-005, FR-006,
   SC-003
8. Reload. The channels are still there and still patchable; the box is back at
   its default place, which is expected — that box has nothing to store a
   position on.
9. Repeat steps 2–6 on **Audio Outputs** with an output row. → FR-001 for outputs

---

## Pass B — the desk's sockets are a real destination (US2)

Declare one desk with `local in 8` and `local out 4`, and no stage box at all.

**On Audio Inputs → Flow:**

1. A second box appears in the middle lane, titled with the desk's name and
   badged **LOCAL**. It has two columns: `Local in 1…8` on the left,
   `To desk 1…8` on the right. → FR-008, FR-009, FR-015
2. Drag it. It moves anywhere in the middle lane and stays put after a reload.
   → FR-013
3. **+ Source**, name it *Talkback*, pick an SM58. From its port, drag a cable to
   **Local in 1**. Accepted, and drawn as a solid run (a real cable).
4. From **To desk 1**, drag to a channel's port. Accepted, and drawn dashed (the
   desk's own routing). → FR-010
5. Switch to **Sheet**. That channel's chain reads
   `SM58 → {desk} local in 1 → ch N`, on one line, with no stage box anywhere.
   → SC-004, FR-016
6. Click the middle hop. The picker offers the cable pick for the *cabled* hop and
   states "network routing" for the desk hop. → FR-012

**On Audio Outputs → Flow:**

7. The desk's box holds the bus ports; a separate **LOCAL** box holds
   `From desk 1…4` and `Local out 1…4`. Its position is its own — dragging it here
   does not move the one on the Inputs canvas. → SC-006
8. Drag from a bus port to **From desk 1**. **Accepted** — this is the connection
   that was impossible before. → FR-011
9. **Rig → Processing & destinations**, add an amp with 1 in. Drag from
   **Local out 1** to its input. Accepted.
10. **Sheet**: the output's chain reads `{desk} local out 1 → Amp in 1`. → FR-016
11. **Rental Order**: exactly one cable line for this run. Now build the same run
    through a stage box instead and compare: also one. → FR-012, SC-005
12. Set the desk's `local out` to `0`. The LOCAL box on the Outputs canvas
    disappears; the one on Inputs stays. → FR-014
13. Set it back to `4`, patch `Local out 3`, then try to set the count to `2`.
    Refused, naming the jack. → FR-024

---

## Pass C — the drawers are one design (US3)

1. **Rig**. Sections read top to bottom: **Consoles**, **Stageboxes**, **Stage
   multis**, **Processing & destinations**. Every one is full width. Nothing is
   beside anything. → FR-018, SC-008
2. Each section: a mono uppercase heading with a count, an add button on the same
   line, then one card per item. No form control is visible on any card.
   → FR-017, FR-019
3. Read the desk's card without clicking: name, item and `· rental` or `· owned`,
   then `in 96 out 48 local 8 in / 4 out used 15 in · 10 out`, then a meter. It
   answers "is this big enough?" → FR-019, SC-009
4. Press **Edit** on a stage box. Its fields open beneath it, each wide enough for
   a full name — **type the longest model name in the catalogue into the name
   field and read it back without scrolling inside it**. → FR-021, SC-007
5. Press **Edit** on a second stage box. The first one closes. → FR-020
6. **+ Stagebox**. The add form looks exactly like the edit form. Add one, then
   delete it from its open form: the confirmation names how many cables it would
   clear. → FR-023
7. Push the desk over its declared input count by adding channels. The desk's
   `used` figure and meter turn red. Set `input_count` to `0`: the meter goes and
   nothing warns. → FR-022
8. **Buses** drawer: Groups and DCAs read in the same language, with a colour
   swatch and a channel count per bus. → FR-017, SC-008
9. Footer: `Every row here is one line on the rental order · N items`. → FR-026
10. Open the event as a **viewer**. Both drawers open, every card and spec reads,
    and there is no add button and no Edit anywhere. → FR-025
11. Nothing above needs the window resized. → SC-007
12. Open **Lighting Rig**, **Stage Plots**, **Equipment**, **Rental Order** and
    **Settings**: unchanged from before this slice. → out of scope, deliberately

---

## Pass D — the row editor matches the mockup (US4)

1. Click a channel row. The editor opens as a strip hanging off that row, with an
   amber left rail, and the row above it is tinted to match with no border between
   them. → FR-028
2. Its fields run across the sheet's width and wrap only at the end. Narrow the
   window and watch them wrap rather than compress. → FR-027
3. **Save channel** and **Delete** are both words. Neither label touches its own
   edge. Delete is red and sits apart from Save. → FR-029, SC-010
4. Press **Edit in Flow →**. The tab switches to Flow with that channel's own
   source selected in the inspector. One click. → FR-030, SC-011
5. Reopen the editor, press **Esc** — changes discarded. Reopen, edit, press
   **⌘↵** — saved, and the next row opens. → FR-031
6. Do all of 1–5 on **Audio Outputs**. Identical, with `Save output`. → FR-032
7. Resize to a phone width and reload: the mobile channel list appears, exactly as
   before this slice. → FR-033

---

## Gates

```bash
cd backend  && go vet ./... && go test ./...
cd frontend && npx tsc -b && npx eslint . && npx vitest run && npm run build
```

`tsc -b`, not `tsc --noEmit` — the root tsconfig is references-only, so
`--noEmit` checks nothing and passes unconditionally.
