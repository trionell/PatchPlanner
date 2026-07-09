# Quickstart: Mixer Buses — Groups & DCAs

Manual verification walkthrough after implementation. Prerequisite: restart
the backend so migration 021 applies.

## 1. Migration result on existing data (once, right after restart)

1. Open the event that previously had DCA text "Trummor" on its drum
   channels → Audio Inputs tab.
2. The Groups & DCAs managers show **LR** (no rename/delete controls) and a
   DCA **Trummor**.
3. The channels that had the text now show a `Trummor` badge in the DCA
   column, and **every** channel shows an `LR` badge in the Groups column.
4. The old free-text DCA input is gone from the row.

## 2. Group management (US1)

1. Create a group `Vocals` in the manager → it appears; creating `vocals`
   again is rejected with a clear message; creating `LR` is rejected.
2. Add a new input row → it comes back with the `LR` badge already set.
3. On a channel, add `Vocals` via the "+ add" select → badge appears;
   reload the page → still there.
4. Remove `LR` from one channel (× on the badge) → allowed; the Groups
   cell is empty after reload.
5. Rename `Vocals` → `Lead Vox` → every assigned channel's badge updates.
6. Delete `Lead Vox` → confirmation mentions how many channels are
   affected → badges disappear, channels otherwise untouched.

## 3. DCA management (US2)

1. Create DCAs `Keys` and `Band`; assign a channel to both → two badges,
   persisted across reload.
2. Rename and delete behave exactly like groups (no built-in protection —
   any DCA can be renamed/deleted).

## 4. Colors (US3)

1. In the Groups manager, give `LR` a color (recoloring LR is allowed —
   only rename/delete are blocked) and give a DCA a color → the badges
   tint everywhere the names appear (manager, channel cells).
2. In the inputs table, set a channel's Color from the palette select →
   the row shows the swatch; reload → persists.
3. Audio Outputs tab: set a color on an output channel the same way.
4. Open Settings → the `channel_colors` vocabulary is listed and editable
   like any other (rename a color's label, add a new one — the pickers
   follow).
5. Channel color and group color are independent: recolor the group a
   channel routes to → the channel's own color is untouched.

## 5. Print sheet & Signal Flow (US4)

1. Audio Inputs tab → Print: the sheet has **Groups** and **DCA** columns
   with comma-joined names; channels with no groups show an empty cell.
2. In the print preview (and a saved PDF), colored channels show their
   swatch next to the channel number and colored group/DCA names are
   tinted; uncolored rows look exactly like before.
3. Audio Outputs tab → Print: output rows show their color swatch.
4. Signal Flow tab: each channel card shows its group and DCA names
   (tinted when colored); the chain rendering (source → cable → path) is
   unchanged.

## 6. Guardrails

1. Rental tab and Excel export are byte-for-byte indifferent to groups/DCAs
   (compare a rental summary before/after assigning buses).
2. Delete the test event → verify no orphan rows:
   `sqlite3 <db> "SELECT COUNT(*) FROM mixer_groups WHERE event_id NOT IN (SELECT id FROM events);"` → 0
   (same for `mixer_dcas`, and the join tables against their parents).

## Automated coverage (runs in CI)

- `backend/internal/db/buses_migration_test.go` — scratch DB stepped to
  migration 20, seeded with legacy `dca_groups` values ("Trummor",
  " Trummor ", "Trummor, Keys", "", NULL), stepped to 21: asserts one
  "Trummor" DCA per event, the "Keys" split, whitespace merging, LR
  presence and LR routing backfill, and that the column is gone.
- `backend/internal/api/audio_patch_test.go` — group/DCA CRUD status
  matrix, LR protection (rename/delete blocked, recolor allowed),
  duplicate 409s, assignment round-trip, LR default on create (omitted vs
  explicit-empty `group_ids`), foreign-event id 400, cascade on delete,
  color round-trip on groups/DCAs/inputs/outputs, `channel_colors` in the
  reference-data response.
- Frontend Vitest — print sheets render the new columns and color
  swatches; multi-select helper logic.
