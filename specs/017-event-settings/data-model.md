# Data Model: Per-Event Settings from a Personal Template (Slice 17)

Migration `039_event_settings` — one new table, one rebuilt table
(SQLite can't `ALTER TABLE` a unique constraint, so `reference_values`
goes through the same create-copy-drop-rename dance already used in
migrations 017/018/023), plus a pure-SQL one-time fan-out for
pre-existing events (research.md R4). No changes to any of the four
planning tables that store a vocabulary's `value` as a string — they
were never foreign-keyed to `reference_values.id` in the first place
(research.md R1), so nothing about how a patch row stores its connector
type, cable type, etc. changes at all.

## `reference_templates` (new)

| Column          | Type     | Notes                                                     |
|-----------------|----------|-------------------------------------------------------------|
| `id`            | INTEGER  | PRIMARY KEY AUTOINCREMENT                                    |
| `owner_user_id` | INTEGER  | NOT NULL REFERENCES users(id) ON DELETE CASCADE — every row always belongs to exactly one user from creation (no ownerless-row bootstrap phase, unlike `inventories` — research.md R5) |
| `vocabulary`    | TEXT     | NOT NULL — one of `domain.Vocabularies`                      |
| `value`         | TEXT     | NOT NULL — the stable token                                  |
| `label`         | TEXT     | NOT NULL — the editable human-facing text                    |
|                 |          | `UNIQUE(owner_user_id, vocabulary, value)`                    |

Populated for every user via `EnsureUserHasReferenceTemplate` at login
(research.md R5) — an idempotent copy of the permanent seed rows
described below, not an exclusive claim.

## `reference_values` (rebuilt)

| Column       | Type     | Notes                                                             |
|--------------|----------|----------------------------------------------------------------------|
| `id`         | INTEGER  | PRIMARY KEY AUTOINCREMENT                                              |
| `event_id`   | INTEGER  | REFERENCES events(id) ON DELETE CASCADE — **nullable**: the 48 pre-existing rows keep `NULL` permanently as the shared seed source (research.md R4/R5); every row created from this slice onward always has one |
| `vocabulary` | TEXT     | NOT NULL — unchanged                                                   |
| `value`      | TEXT     | NOT NULL — unchanged                                                   |
| `label`      | TEXT     | NOT NULL — unchanged                                                   |
|              |          | `UNIQUE(event_id, vocabulary, value)` — was `UNIQUE(vocabulary, value)`; the old constraint would otherwise make it impossible for two different events to each have their own "xlr" row |

The migration's fan-out step (research.md R4) inserts one full copy of
every `event_id IS NULL` row for every event that exists at migration
time — so immediately after migration, every pre-existing event has its
own independent 48-row vocabulary, byte-for-byte identical in content to
what the global list had.

## `events` (unchanged)

No new column. `CreateEvent`'s existing transaction (the one that already
seeds the built-in LR `mixer_groups` row) gains one more step: copy the
creating user's current `reference_templates` rows into new
`reference_values` rows bound to the new event's id. This is the "one-time
snapshot, not a live link" moment spec.md's User Story 2 describes — from
here on the event's rows and the user's template rows are two fully
independent row sets with no stored relationship between them.

## Non-persisted concept: per-event delete-protection

Spec.md's FR-008 ("can't delete a value from an event's vocabulary while
a planning row in that event still uses it") is enforced at delete time,
not stored as a constraint — `countReferenceUsage(db, eventID, vocabulary,
value)`, extended from Slice 4's original global version to take
`eventID` and, for `power_connectors`, join through `lighting_rigs`
(research.md R6):

| Vocabulary            | Table                | Column(s)                                     | Reaches `event_id` |
|------------------------|-----------------------|------------------------------------------------|---------------------|
| `preamp_connectors`    | `input_sources`       | `connector_type`                               | directly            |
| `speaker_cable_types`  | `output_devices`      | `input_connector_type`, `output_connector_type`| directly            |
| `output_types`         | `audio_patch_outputs` | `output_type`                                  | directly            |
| `power_connectors`     | `lighting_fixtures`   | `power_connector_in`, `power_connector_out`    | via `lighting_rigs.id = lighting_fixtures.rig_id` |
| `signal_types`, `signal_cable_types`, `mic_stands`, `truss_types`, `channel_colors` | — | — | no live usage tracking (pre-existing gap — these five have never had a `vocabularyUsage` entry, unchanged by this slice) |

`reference_templates` values have **no equivalent check at all** — a
template row is never referenced by any planning table under any
circumstance, so `DeleteReferenceTemplateValue` always succeeds (spec.md
FR-009).

## Frontend types

`ReferenceValue` (existing) is unchanged in shape — the frontend never
needs to see `event_id` on a value, only which event's data it fetched.
A new `ReferenceTemplateValue` type is either an identical shape reused
under a new name, or `ReferenceValue` itself reused as-is (both are
`{ id, vocabulary, value, label }`) — a naming decision, not a data-model
one, left to implementation.
