# Data Model: Mixer Buses — Groups & DCAs

## New tables (migration `021_groups_dcas`)

### `mixer_groups`

| Column       | Type    | Constraints                                        |
|--------------|---------|----------------------------------------------------|
| `id`         | INTEGER | PRIMARY KEY AUTOINCREMENT                          |
| `event_id`   | INTEGER | NOT NULL, REFERENCES `events(id)` ON DELETE CASCADE |
| `name`       | TEXT    | NOT NULL COLLATE NOCASE                            |
| `is_builtin` | INTEGER | NOT NULL DEFAULT 0 (1 only for LR)                 |

`UNIQUE(event_id, name)` — NOCASE collation makes uniqueness
case-insensitive (ASCII folding; see research R2).

### `mixer_dcas`

| Column     | Type    | Constraints                                        |
|------------|---------|----------------------------------------------------|
| `id`       | INTEGER | PRIMARY KEY AUTOINCREMENT                          |
| `event_id` | INTEGER | NOT NULL, REFERENCES `events(id)` ON DELETE CASCADE |
| `name`     | TEXT    | NOT NULL COLLATE NOCASE                            |

`UNIQUE(event_id, name)`.

### `audio_input_groups`

| Column     | Type    | Constraints                                                     |
|------------|---------|------------------------------------------------------------------|
| `input_id` | INTEGER | NOT NULL, REFERENCES `audio_patch_inputs(id)` ON DELETE CASCADE |
| `group_id` | INTEGER | NOT NULL, REFERENCES `mixer_groups(id)` ON DELETE CASCADE       |

`PRIMARY KEY (input_id, group_id)` (WITHOUT ROWID). Deleting a group, a
channel, or an event clears assignments in the engine — FK enforcement is
already on for every pooled connection (slice 0).

### `audio_input_dcas`

Same shape: `input_id` → `audio_patch_inputs`, `dca_id` → `mixer_dcas`,
`PRIMARY KEY (input_id, dca_id)`, both FKs ON DELETE CASCADE.

## Migration data steps (in order, after table creation)

1. **LR seed** — `INSERT INTO mixer_groups (event_id, name, is_builtin)
   SELECT id, 'LR', 1 FROM events;`
2. **LR routing backfill (FR-010)** — every existing input gets an
   `audio_input_groups` row pointing at its event's LR group.
3. **DCA conversion (FR-009)** — recursive-CTE comma split of
   `dca_groups`, trimmed; `INSERT OR IGNORE` into `mixer_dcas` (NOCASE
   unique dedupes, first-seen casing wins), then the same split joined back
   by event + NOCASE name into `audio_input_dcas`.
4. **Column removal** — `ALTER TABLE audio_patch_inputs DROP COLUMN
   dca_groups;`

Down migration: drop the four tables, re-add `dca_groups TEXT` (empty —
lossy, consistent with the repo's other down migrations).

## Changed table

### `audio_patch_inputs`

- `dca_groups` column **removed** (step 4 above). No other change — group
  and DCA membership live exclusively in the join tables.

## Domain structs (`backend/internal/domain/audio.go`)

```go
type MixerGroup struct {
    ID        int64  `json:"id"`
    EventID   int64  `json:"event_id"`
    Name      string `json:"name"`
    IsBuiltin bool   `json:"is_builtin"`
}

type MixerDCA struct {
    ID      int64  `json:"id"`
    EventID int64  `json:"event_id"`
    Name    string `json:"name"`
}
```

`AudioPatchInput` changes:

- `DCAGroups string` — **deleted** (field, JSON tag, scanner, INSERT/UPDATE
  column, frontend type, UI cell, print column).
- `GroupIDs []int64 json:"group_ids"` — added. On create: JSON-absent (nil)
  → server assigns the event's LR group; present (even empty) → stored
  verbatim. On update: always the full replacement set.
- `DCAIDs []int64 json:"dca_ids"` — added. Same replacement semantics; no
  default.

Responses always carry both arrays (empty arrays, never null — initialize
before marshalling).

## Validation rules

| Rule | Where | Failure |
|------|-------|---------|
| Group/DCA name non-empty after trim | handler | 400 |
| Group/DCA name unique per event (case-insensitive) | UNIQUE index, surfaced by handler | 409 |
| Built-in (LR) rename/delete rejected | handler | 400 |
| Every `group_ids` entry is a group of the input's event | handler (single query) | 400 |
| Every `dca_ids` entry is a DCA of the input's event | handler (single query) | 400 |
| Duplicate ids within an array | db layer dedupes (join-table PK would reject) | silently deduped |

## Relationships

```text
events 1 ──∞ mixer_groups     (CASCADE)
events 1 ──∞ mixer_dcas       (CASCADE)
audio_patch_inputs ∞ ──∞ mixer_groups  via audio_input_groups (CASCADE both sides)
audio_patch_inputs ∞ ──∞ mixer_dcas    via audio_input_dcas   (CASCADE both sides)
```

Loading: `ListAudioPatchInputs` gains two companion queries (all join rows
for the event, ordered by `input_id`) merged into the input structs in Go —
two queries per audio-patch GET regardless of channel count.

## State transitions

- **Event created** → LR group row created in the same transaction.
- **Input created without `group_ids`** → LR assignment row created in the
  same transaction.
- **Group/DCA deleted** → its assignment rows cascade away; channels
  otherwise untouched.
- **Group/DCA renamed** → assignments unaffected (id-based), every display
  follows.
