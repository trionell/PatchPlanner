# Quickstart: Lighting becomes a sheet

How to run it, how to check it, and the passes no unit test can make.

---

## Running

```bash
# backend — applies migration 044 on startup
cd backend && go run ./cmd

# frontend
cd frontend && npm run dev
```

Open an event → **Lighting**.

**Never point either at `backend/patchplanner.db`.** Work against a copy:

```bash
cp backend/patchplanner.db /tmp/pp-027.db
PATCHPLANNER_DB=/tmp/pp-027.db go run ./cmd
```

## The gates

```bash
# frontend
cd frontend
npx tsc -b                 # NOT --noEmit: the root tsconfig is references-only
npx eslint src --max-warnings 0
npx vitest run
npm run build

# backend
cd backend
go vet ./...
go test ./...
```

### The gates specific to this slice

**The column is gone everywhere but history:**

```bash
grep -rn "dmx_chain_parent_id\|DMXChainParentID" \
  --include='*.go' --include='*.ts' --include='*.tsx' \
  backend/internal frontend/src
# → no output (SC-015)
```

**Nothing outside Lighting's own surface moved:**

```bash
git diff --stat main -- frontend/src/components/ui frontend/src/components/event/graph
# → only components/event/RowEditor.tsx is NOT in this list; ui/ and graph/ must be empty

git diff --stat main -- frontend/src/components/mobile frontend/src/components/print
# → empty except the fixture type's removal
```

**The migration is reversible:**

```bash
cp backend/patchplanner.db /tmp/pp-mig.db
PATCHPLANNER_DB=/tmp/pp-mig.db go run ./cmd        # up: column gone
sqlite3 /tmp/pp-mig.db "PRAGMA table_info(lighting_fixtures);" | grep dmx_chain
# → no output
```

## Building the fixture that proves it

The map's correctness is unit-tested, but one rig makes every state visible at
once. Build it in a scratch event:

| # | Name | Model | Univ | Addr | Ch | Condition |
|---|---|---|---|---|---|---|
| 101 | Wash SR 1 | any 16-ch | 1 | 1 | 16 | plain |
| 102 | Wash SR 2 | same | 1 | 17 | 16 | plain |
| 121 | Key SL | any 15-ch | 1 | 49 | 15 | **clash** with 122 |
| 121 | Key SR | same | 1 | 56 | 15 | **clash**, and a **duplicate console ID** |
| 211 | Moon SR | any 16-ch | 2 | 505 | 16 | **out of bounds** |
| 301–303 | Wall wash 1–3 | any 7-ch | 3 | 1 | 7 | **shared ×3** |
| — | Audience 1–2 | any | 2 | *none* | 7 | **unaddressed** |

Universe 1 then holds a gap (33–48), a clash and plain fixtures; universe 3 holds
only a shared group. That is SC-006's rig.

## The passes

### Pass 1 — the sheet reads (US1)

- [ ] One panel: bar, sheet, strip. No card headers, no floating toolbar.
- [ ] Nine columns. **No input, select or delete button in any closed row.**
- [ ] Addresses are zero-padded, in tabular figures, and line up as a column.
- [ ] A row's model sits beside its name in mono, not above it in a text box.
- [ ] Click a row: the editor opens directly beneath it, the row above takes the
      amber tint and loses its bottom border, and the two read as one block.
- [ ] Click a second row: the first saves and closes.
- [ ] `Esc` discards. `⌘↵` saves and opens the next row.
- [ ] Type in search: rows filter on ID, name, model, mode, truss and note.
- [ ] Count the rows visible without scrolling. **At least 25** at 900 px (SC-002).
- [ ] Nine columns fit at 1440 px with no horizontal scrollbar (SC-003).

### Pass 2 — the four conditions (US2)

- [ ] `301`, `302`, `303` show `001–007 ×3`, in **neutral grey — not amber, not
      red**. Hovering names the group.
- [ ] `121 Key SR` shows its address in red; hovering names the fixture it
      overlaps.
- [ ] `211` shows red for a different reason, and says it runs past 512.
- [ ] The two unaddressed fixtures show `—`, not blank, and are not red.
- [ ] The strip is red, counts **2 errors**, names the first in full, and offers
      the filter.
- [ ] The strip states `1 shared group` **while red** — sharing is information in
      every state.
- [ ] `U3` occupancy reads `007/512`, not `021/512` (SC-005 — counted once).
- [ ] Filter to errors: only the three error rows. Clear it: all rows back.
- [ ] Re-address `121 Key SR` to 64. Strip turns amber, `2 unaddressed`.
- [ ] Give the two Audience pars addresses. Strip turns green, `addressed`.
- [ ] **Save a clash on purpose.** It saves. Nothing is ever blocked (FR-060).

### Pass 3 — inserting (US5)

- [ ] Edit any fixture, set its address to 1 in universe 1. On confirm the prompt
      appears **in the editor**, not in a dialog.
- [ ] It names what is in the way and how many fixtures would move.
- [ ] **Share address is absent** — the channel counts differ.
- [ ] Choose `Make room`. The fixture lands at 1; the fixtures above shift; the
      gap at 33–48 **survives** if the ripple stopped before it.
- [ ] Nothing below the insertion point moved.
- [ ] Add a fourth 7-channel fixture at universe 3, address 1. The prompt now
      **does** offer `Share address`. Take it → `×4`, nothing moved.
- [ ] Set a fixture to an address where making room would exceed 512. The make
      room button is **absent** and the sentence says why; the other answers work.
- [ ] Open a row and re-save its address unchanged. **No prompt** — a fixture does
      not collide with itself.
- [ ] With the prompt showing, press `⌘↵`. Nothing saves, nothing advances.

### Pass 4 — adding (US3)

- [ ] `+ Fixtures` opens an editor at the foot of the sheet. **No dialog anywhere
      on the tab** (SC-012).
- [ ] Qty 1: the button reads `Add fixture`.
- [ ] Qty 12: it reads `Add 12 fixtures`, and the note states 12 × the channel
      count against the universe's largest free run.
- [ ] With a name stem, the twelve arrive named `Stem 1` … `Stem 12` with
      consecutive console IDs.
- [ ] No model picked → a custom fixture is created from the name alone.
- [ ] Set `Addresses` to `all share one` with Qty 20. They arrive as **one shared
      group**, the note states one fixture's width, and the universe's occupancy
      rises by that width — not twenty times it (SC-015).

### Pass 5 — the operations (US4, US6)

Do these on the scratch rig, and **look at the sheet after each**.

- [ ] `Universes` opens the drawer. Three universes, each with occupancy, a meter,
      fixture count, free, largest run and where it starts.
- [ ] A universe with nothing addressed in it **draws no meter bar**.
- [ ] Models section lists each model once with quantity and total demand.
- [ ] `Optimise channels` → confirm. Universe 1's gap closes; **the relative order
      of its fixtures is unchanged**; the unaddressed fixtures are **still
      unaddressed**.
- [ ] The shared group in universe 3 is **still `×3`, still one block**.
- [ ] `211` has been pulled back inside universe 2.
- [ ] `Auto-assign DMX` → confirm. Every universe repacks from 1 in rig order; the
      shared group is **still shared**; the unaddressed fixtures **now have
      addresses**.
- [ ] Nothing changed universe. Check `U1`, `U2`, `U3` fixture counts before and
      after (SC-008).
- [ ] Make one universe unfittable (a batch of 40 × 16 ch). Run either operation:
      **that universe is untouched and named; the others are still packed**
      (SC-009).
- [ ] Run `Optimise` twice. The second run reports there was nothing to close.

### Pass 6 — the boundaries

- [ ] Open the tab as a **viewer**. No `+ Fixtures`, no `Universes`, rows do not
      open, no delete. The read-only banner states the role once.
- [ ] Open the tab on a **phone** (or narrow the window past the mobile
      breakpoint). The list-and-sheet editor, exactly as before.
- [ ] **Print** the tab. The rig sheet is unchanged: black on white, 9 pt.
- [ ] Open **Audio Inputs**, **Audio Outputs** and **Stage Plots**. Nothing has
      moved — `RowEditor`'s hand-off button still reads `Edit in Flow` and still
      goes there.

## What can only be checked by eye

There is no headless browser in this toolchain. Everything in Pass 1's last two
items, the three-column drawer at narrow widths, and the prompt's wrapping at
1280 px are worth a human glance before this is called done.
