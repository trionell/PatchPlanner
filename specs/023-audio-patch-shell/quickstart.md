# Quickstart: Audio Patch Shell — Sheet, Flow, Drawers & the Console

**Feature**: `023-audio-patch-shell` | **Branch**: `023-audio-patch-shell`

## Run it

```bash
# backend (port 7331)
cd backend && go run ./cmd/main.go &

# frontend (port 5173, proxies /api to 7331)
cd frontend && npm run dev
```

## Gates

```bash
cd backend  && go vet ./... && go test ./...
cd frontend && npm run typecheck && npm run lint && npm test
```

`npm run typecheck` is `tsc -b`. **Do not** substitute `tsc --noEmit` — the root
`tsconfig.json` is references-only, so `--noEmit` checks nothing and passes
unconditionally (constitution v0.4.0, Development Workflow).

## Database safety

Never run against `backend/patchplanner.db`. Migration 042 both adds and **drops**
a column, so verify against a throwaway copy:

```bash
cp backend/patchplanner.db /tmp/pp-slice23.db
cd backend && PATCHPLANNER_DB=/tmp/pp-slice23.db go run ./cmd/main.go
```

Post-migration assertions on the copy:

```bash
sqlite3 /tmp/pp-slice23.db "
  SELECT (SELECT COUNT(*) FROM events) = (SELECT COUNT(*) FROM event_consoles) AS one_each,
         (SELECT COUNT(*) FROM input_channels WHERE console_id IS NULL) AS unassigned_channels,
         (SELECT COUNT(*) FROM audio_patch_outputs WHERE console_id IS NULL) AS unassigned_outputs;
"
# expect: 1 | 0 | 0
```

Migrations apply automatically on startup (`golang-migrate`, no separate CLI in
this repo). The down migration is exercised by the Go test that drives
`migrate.Down()` against a temp file DB — the same technique
`output_graph_migration_test.go` and `input_signal_graph_migration_test.go`
already use — asserting `events.output_mixer_position_y` comes back with its
original values.

## Verify each pass

### Pass 1 — the shell

1. Open an event with stageboxes, multis, devices, buses and ≥8 channels.
2. Audio Inputs shows **one** toolbar; the first channel row is above the fold.
3. `Rig ▾` lists stageboxes, multis and input devices; every field that was
   editable in the old cards is still editable.
4. Audio Outputs' `Rig ▾` shows the same boxes — edit a stagebox name there and
   confirm it changed on the Inputs tab without a reload.
5. `Buses ▾` exists on Inputs, not on Outputs.
6. Toggle to Flow, reload the page: it opens on Flow. Switch to Sheet, open a
   second event: it opens on Sheet (the preference is per event, per tab).
7. Sign in as a contributor (or set the role via the members dialog): no `Rig`,
   no `Buses`, no `+ Channel`; Flow still pans and zooms.
8. Narrow the window below 768px: the mobile list appears, unchanged.

### Pass 2 — the sheet

1. A fully patched channel reads `Beta 91A → SB1 : 1 → ch 1` on one line.
2. A channel through a DI box shows the DI as its own hop.
3. A stereo channel is one row reading `SB1 : 6–7`.
4. A channel with no source reads `no source` in red, and the rail counts 1 gap.
5. Click `SB1 : 1` on one row → the picker opens for that hop only; confirm a
   different jack and check no other row moved.
6. Open row 3, edit the name, click row 5: row 3 saved and closed.
7. `Esc` discards; the save shortcut saves and opens the next row.
8. Type `Radial` in search: only channels through the DI remain. Switch to Flow
   with the term still set: non-matching nodes dim, none disappear.
9. `Print`: the paper sheet shows the same columns as the screen.

### Pass 3 — the console

1. `Rig ▾ → Consoles → + Console`: name `FOH · SD10`, role FOH, pick a mixer
   from the catalog, `96 / 48 / 8 / 8`.
2. Rental Order: one line, quantity 1, under audio. Export PDF and the generic
   spreadsheet and confirm it appears in both.
3. Flow (both tabs): the desk node is named `FOH · SD10`, not `Mixer`.
4. Drag a cable from a source's port to `local in 1`, then patch `local in 1`
   to channel 15. The chain reads `SM58 → SD10 local in 1 → ch 15`, with no
   stagebox involved.
5. Set `input_count` to 8 with 16 channels assigned: the rail turns to
   `over capacity`, states `8 channels have nowhere to land`, and offers
   `Open Rig`.
6. Try to set `local_input_count` to 0 with a jack patched: refused with the
   conflicting jack named.
7. Add a second console, role Monitor: the Outputs sheet grows a `Desk` column
   and can be filtered to one desk. Delete it: the column disappears again and
   its outputs survive, unassigned.
8. Open an event created before the migration: identical channel list, cables
   and graph layout, one unnamed console, no warnings.

### Pass 4 — the flow view

1. On an event with ≥24 sources, the rail scrolls inside its lane; the rig and
   desk lanes stay put.
2. A source row shows tape, name, model, 48 V and port on one 20px line.
3. A stereo source is 40px with `L` over `R`, each side cabled independently.
4. 48 V is a red bar, distinguishable from every port at a glance.
5. A run reaching ch 1 (sky) is sky along the source tape, every cable, every
   intermediate port and the desk row.
6. Cable a source into a DI whose output goes nowhere: the whole path stays grey
   and dashed.
7. Patch one source into two differently-coloured channels: it goes neutral.
8. Select a source: the inspector shows mic, stand, connector, width, 48 V and
   `Reaches SB1 : 2 → SD10 ch 3`, and can create, duplicate and delete sources —
   this is what retires `SourceSection`.

## Production build

```bash
make build   # vite build -> backend/cmd/dist -> single Go binary
```
