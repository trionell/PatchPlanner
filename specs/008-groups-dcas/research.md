# Research: Mixer Buses — Groups & DCAs

All decisions grounded in the existing codebase (slices 0–7 patterns) and a
read-only look at the production database (2026-07-09): `dca_groups` holds
exactly one distinct value, "Trummor", on 4 channels; 3 channels are NULL.

## R1 — Separate tables for groups and DCAs (not one table with a `kind` column)

**Decision**: Two entity tables, `mixer_groups` (with `is_builtin`) and
`mixer_dcas`, plus two join tables, `audio_input_groups` and
`audio_input_dcas`.

**Rationale**: Principle I (domain-first): a group is a mix bus, a DCA is a
control assignment — distinct console concepts that will diverge (slice 10
routes group buses to outputs; DCAs never carry audio). `is_builtin` only
applies to groups. Separate join tables give each FK a precise target and
make `ON DELETE CASCADE` trivially correct.

**Alternatives considered**: Single `mixer_buses(kind, …)` table + single
join table — fewer statements, but every query grows a `kind` filter, the
LR flag dangles meaninglessly on DCA rows, and a slice-10 FK "to a group"
could silently point at a DCA. Rejected.

## R2 — Case-insensitive per-event name uniqueness via `COLLATE NOCASE`

**Decision**: `name TEXT NOT NULL COLLATE NOCASE` with
`UNIQUE(event_id, name)` on both entity tables. Handlers surface the
constraint violation as 409, plus an explicit empty/whitespace-name 400.

**Rationale**: FR-007 requires case-insensitive uniqueness; declaring it in
the schema makes the migration's `INSERT OR IGNORE` conversion dedupe
correctly for free (first-seen casing wins) and protects every future write
path, not just the handlers.

**Limitation accepted**: SQLite's NOCASE folds ASCII only — "trummor" =
"Trummor" but "åsa" ≠ "ÅSA". Good enough for bus names; same trade-off the
rest of the app already makes.

**Alternatives considered**: handler-only checks (racy, and the migration
would need its own dedupe logic); a separate `name_lower` column (needless
duplication).

## R3 — LR is a seeded row with `is_builtin = 1`, guaranteed in three places

**Decision**: LR is an ordinary `mixer_groups` row flagged `is_builtin = 1`.
Guaranteed present by: (a) migration 021 inserting it for every existing
event, (b) `db.CreateEvent` inserting it for new events in the same
transaction, (c) handlers rejecting rename/delete of built-in rows with 400.

**Rationale**: The join table needs a real row id to reference for LR
routing, so a virtual/implied LR doesn't work. Seeding at event creation
keeps every read path simple (no lazy-create branches). Handler-level
protection suffices — there is no other write path to these tables.

**Alternatives considered**: lazy-create on first audio-patch GET (the
lighting-rig pattern) — rejected because inputs can be created before any
GET and their LR default (R4) needs the row to exist.

## R4 — Default LR routing: `group_ids` absent → LR; present → verbatim

**Decision**: `GroupIDs []int64` on the input create request. JSON-absent
(nil slice) means "no opinion" → the server assigns LR. An explicit array —
including `[]` — is stored verbatim. Updates always treat the arrays as the
full replacement set. Migration 021 backfills LR routing for all existing
inputs (FR-010).

**Rationale**: FR-004 wants LR-by-default with zero client cooperation
(acceptance: API-created channels get it too), while scenario 5 requires
that deliberately routing to nothing sticks. Go's nil-vs-empty slice
distinction expresses exactly this without an extra flag field.

**Alternatives considered**: client sends `[LR.id]` on Add Row — breaks the
"zero additional user actions" criterion for other API clients and races
the groups query on first load. Rejected.

## R5 — DCA text conversion: recursive-CTE comma split inside migration 021, then `DROP COLUMN`

**Decision**: Pure-SQL one-time conversion in `021_groups_dcas.up.sql`:

1. `INSERT OR IGNORE INTO mixer_dcas (event_id, name)` from a recursive CTE
   that splits `dca_groups` on `','` and trims each token (NOCASE unique
   index dedupes, first-seen casing wins).
2. `INSERT OR IGNORE INTO audio_input_dcas` joining the same split back to
   the created DCAs on `event_id` + name (NOCASE).
3. `ALTER TABLE audio_patch_inputs DROP COLUMN dca_groups`.

**Rationale**: Any trimmed non-empty token is a valid DCA name, so the
conversion is total — no legacy-label fallback column needed (unlike
slice 6's cable backfill, which had to match a catalog). Dropping the
column enforces FR-009's "no free text remains" at the schema level and
lets the domain struct, queries, and UI delete the field outright.
`dca_groups` carries no index or CHECK, so SQLite's `DROP COLUMN`
(3.35+; modernc ships far newer) applies without a table rebuild.
Migrations run exactly once by golang-migrate — satisfies the
"conversion runs once" edge case.

**Testing**: the 019-style "replay the shipped SQL" trick can't work here —
after 021 the column is gone. Instead the migration test builds a scratch
DB, migrates to version 20, seeds inputs with legacy `dca_groups` text
("Trummor", " Trummor ", "Trummor, Keys", "", NULL), steps to 21, and
asserts the resulting DCAs and assignments. golang-migrate's
`Migrate(20)` / `Up()` supports stepping natively.

**Down migration**: re-add the column (empty) and drop the four tables —
lossy like every other down in this repo.

## R6 — API shape: stagebox-pattern CRUD + assignment arrays on the input payload

**Decision**:

- `POST/PATCH/DELETE /api/v1/events/{eventId}/groups[/{groupId}]` and the
  same under `/dcas` — exactly the stagebox handler pattern (201/200/204;
  404 unknown; 400 empty name or built-in mutation; 409 duplicate name).
- No standalone GET: groups and DCAs ride along on the existing
  `GET /events/{id}/audio-patch` response (`groups`, `dcas` arrays), which
  every consumer already loads.
- Assignments are `group_ids` / `dca_ids` arrays on the input
  create/update payload and response — not sub-resources. The db layer
  replaces join rows (delete + insert) together with the row UPDATE in one
  transaction. Handlers validate every referenced id belongs to the input's
  event (400 otherwise).

**Rationale**: Channels are edited row-at-a-time with persist-on-blur; the
assignment set is part of the row, so it should travel with the row's
payload — separate assignment endpoints would fragment one user action into
multiple non-atomic calls. Loading assignments for the whole event costs two
extra queries merged in Go (no N+1), same technique as fixtures'
`truss_section_name`.

**Delete-affected-count**: the confirmation dialog's "N channels affected"
is computed client-side from the already-loaded inputs — no dedicated
endpoint (Principle V).

## R7 — Frontend multi-select: badges + add-select from existing primitives

**Decision**: New `BusMultiSelect` cell component: selected entities render
as removable `Badge`s (× click removes), plus a compact `Select` whose
options are the not-yet-assigned entities ("+ add…"); choosing one appends
and persists immediately. Used for both the Groups and DCA columns. The
managers (`BusSection`) copy the `StageboxMultiSection` layout: two cards —
add form, inline rename input, delete button with `confirm()` including the
affected-channel count; LR renders without rename/delete controls.

**Rationale**: The UI kit has no popover/combobox and Principle V forbids
adding one for this; native `<select>` + badges is the established idiom
(signal-type cell already stacks Badge over Select). Persist-on-change
matches the row's persist-on-blur semantics closely enough since each
add/remove is one discrete action.

**Signal Flow**: groups/DCAs are memberships, not hops — `signalFlow.ts`
and its `ChannelFlow` chain model stay untouched; `SignalFlowTab` renders
the names in each channel's header from `group_ids`/`dca_ids` + the maps it
already has access to.

**Print sheet**: the DCA column becomes two columns, Groups and DCA,
comma-joined names resolved via id→name maps passed as props (the
`itemLabelById` pattern from slice 6).
