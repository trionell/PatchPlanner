# Data Model: Audio Patch Shell — the Console

**Feature**: `023-audio-patch-shell` | **Date**: 2026-07-26

Passes 1, 2 and 4 add no data. Everything below belongs to pass 3.

## New entity: Console

`event_consoles` — one row per mixing desk booked for an event. Structurally a
sibling of `stageboxes` and `stage_multis`: event-scoped, optionally linked to a
catalog or owned item, with per-event typed port counts (research.md R5) and a
position on each of the two canvases.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `event_id` | INTEGER NOT NULL | `REFERENCES events(id) ON DELETE CASCADE` |
| `name` | TEXT NOT NULL DEFAULT `''` | Display name, e.g. `FOH · SD10`. Empty renders as "Console"; nothing keys off it, so duplicates are allowed |
| `role` | TEXT NOT NULL DEFAULT `'foh'` | One of `foh` / `monitor` / `broadcast`, validated in Go (research.md R7). No CHECK constraint — this project removed its CHECK constraints in migrations 016/017 |
| `inventory_item_id` | INTEGER NULL | `REFERENCES inventory_items(id)` |
| `owned_item_id` | INTEGER NULL | `REFERENCES owned_items(id)`. At most one of the two is set, enforced in Go as `OutputDevice` already does |
| `input_count` | INTEGER NOT NULL DEFAULT 0 | Addressable input channels. `0` = not declared (research.md R15) |
| `output_count` | INTEGER NOT NULL DEFAULT 0 | Addressable outputs. `0` = not declared |
| `local_input_count` | INTEGER NOT NULL DEFAULT 0 | Jacks on the desk itself; sizes the `console_local` in-side |
| `local_output_count` | INTEGER NOT NULL DEFAULT 0 | Sizes the `console_local` out-side |
| `position_x` / `position_y` | REAL NOT NULL DEFAULT 0 | Output-graph canvas placement |
| `input_position_x` / `input_position_y` | REAL NOT NULL DEFAULT 0 | Input-graph canvas placement. Same two-graph naming convention as `stageboxes` (migration 031) |

**Validation** (API boundary, `internal/api/audio_patch.go`):

- `role` ∈ `domain.ConsoleRoles`.
- All four counts ≥ 0.
- `inventory_item_id` and `owned_item_id` not both set; a referenced catalog item
  must belong to the event's bound inventory (the existing cross-inventory guard,
  `cross_inventory_test.go`).
- A count may not be reduced below the highest patched port index that depends on
  it (FR-024) — see *Guards* below.

**Rental behaviour** (research.md R6): one line, quantity 1, `quantity_audio`,
counted from either item id. Never doubled by width, channel count or cable
count — the same per-row rule every other arm follows.

## New port kind: `console_local`

No table. A jack is addressed the way every other port is: `(kind, id, port)`
where `kind = 'console_local'`, `id` = the console's id, `port` = the zero-based
jack index. Direction distinguishes the two sides, and the counts size them.

| Graph | Valid as | Sized by | Cableless? |
|-------|----------|----------|------------|
| Input | `from_kind` (jack → channel) and `to_kind` (source/device → jack) | `local_input_count` | the `console_local → channel` hop only |
| Output | `from_kind` (jack → device) and `to_kind` (mixer → jack) | `local_output_count` | the `mixer → console_local` hop only |

This is the stagebox's own shape on each graph, reversed per graph as usual
(research.md R3). Concretely:

```go
// domain/audio.go — four slices gain one member each
ValidInputCableFromKinds = []string{"source", "stagebox", "stage_multi", "device", "console_local"}
ValidInputCableToKinds   = []string{"stagebox", "stage_multi", "device", "channel", "console_local"}
ValidPortFromKinds       = []string{"mixer", "stagebox", "stage_multi", "device", "device_link", "console_local"}
ValidPortToKinds         = []string{"stagebox", "stage_multi", "device", "console_local"}
```

The existing uniqueness rules need no change and already do the right thing:

- `UNIQUE(to_kind, to_id, to_port)` on both cable tables → one cable per jack
  inbound, and one output per local out jack.
- `ux_input_cables_from_port … WHERE from_kind != 'source'` → a local in jack
  feeds exactly one channel.
- `ux_output_cables_from_port … WHERE from_kind != 'mixer'` → a local out jack
  feeds exactly one destination.

Rental counting also needs no change: the cableless hops carry
`cable_item_id IS NULL`, and `NULL` never joins to `inventory_items`, so they are
excluded structurally rather than by a `WHERE` clause — the property the comment
block above `rentalSummaryQuery` already documents.

## Modified entities

| Table | Change | On console delete |
|-------|--------|-------------------|
| `input_channels` | `+ console_id INTEGER NULL REFERENCES event_consoles(id) ON DELETE SET NULL` | channel survives, unassigned |
| `audio_patch_outputs` | `+ console_id INTEGER NULL REFERENCES event_consoles(id) ON DELETE SET NULL` | output survives, unassigned |
| `events` | `- output_mixer_position_y` (value carried into the console row, research.md R8) | — |

`NULL console_id` is a legal, non-warning state: it is what an event looks like
after its only desk is deleted, and it is why FR-025's backfilled events raise
nothing.

## Migration 042

`042_event_consoles.up.sql`, in this order:

```sql
CREATE TABLE IF NOT EXISTS event_consoles ( … as above … );

-- One console per existing event, carrying its canvas position across, with
-- no item and no declared capacity, so nothing starts warning and the rental
-- order is byte-identical (specs/013-stage-plots/rental-baseline.json).
INSERT INTO event_consoles (event_id, name, role, position_y)
SELECT id, '', 'foh', output_mixer_position_y FROM events;

ALTER TABLE input_channels ADD COLUMN console_id INTEGER REFERENCES event_consoles(id) ON DELETE SET NULL;
ALTER TABLE audio_patch_outputs ADD COLUMN console_id INTEGER REFERENCES event_consoles(id) ON DELETE SET NULL;

UPDATE input_channels SET console_id =
  (SELECT c.id FROM event_consoles c WHERE c.event_id = input_channels.event_id);
UPDATE audio_patch_outputs SET console_id =
  (SELECT c.id FROM event_consoles c WHERE c.event_id = audio_patch_outputs.event_id);

-- Superseded by event_consoles.position_y. No CHECK constraint on it, so a
-- plain DROP COLUMN suffices (same as migration 030).
ALTER TABLE events DROP COLUMN output_mixer_position_y;
```

The backfill's subselect is unambiguous because it runs before any second
console can exist. Down migration re-adds `events.output_mixer_position_y`,
copies the value back from the lowest-id console of each event, drops both
`console_id` columns and drops the table.

**Verification** (never against `backend/patchplanner.db`): copy the live DB to
`/tmp`, run the binary with `PATCHPLANNER_DB` pointed at the copy, and assert
one console per event, every channel and output assigned, positions preserved,
and an unchanged rental summary.

## Derived values — not stored

Everything the status rail and the Rig drawer display is computed, never
persisted, in keeping with how `used` counts already work for stageboxes:

| Value | Derivation |
|-------|-----------|
| Console inputs used | `COUNT(input_channels WHERE console_id = c)`, summed over width |
| Console outputs used | `COUNT(audio_patch_outputs WHERE console_id = c)`, summed over width |
| Local jacks used | cables whose `console_local` end names this console |
| Over capacity | `count > declared AND declared > 0` (research.md R15) |
| Box usage (`8/32 in`) | cables landing on that box's ports, as today |
| Cables picked | `cable_item_id IS NOT NULL` count |
| Gaps | channels with a port no cable reaches — already `InputChannelFlow.hasGap` |
| Chain string | `buildInputChannelFlow` / `buildOutputChannelFlow` → `lib/patchSheet.ts` segments |
| Run colour | `derivedPortColor` / `derivedSourceColor`, unchanged |

## Guards

1. **Reducing a count below what is patched** → `409` naming the conflicting
   hops. Mirrors the existing stagebox/device count guards in
   `UpdateStagebox`/`UpdateOutputDevice`.
2. **Deleting a console** → clears its `console_local` cables in the same
   transaction and reports how many, mirroring `DeleteStagebox`; `console_id`
   references null out via the FK.
3. **Cross-inventory item** → the existing `RequireEventAccess` + bound-inventory
   check, reused verbatim.
4. **A cable to a jack index ≥ the declared count** → `400`, exactly as an
   out-of-range stagebox port already is.
