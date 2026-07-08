# Research: Configurable Reference Data

All Technical Context unknowns resolved. Decisions below carry IDs referenced
from plan.md.

## R1 — How to drop SQLite CHECK constraints safely

**Decision**: Rebuild each affected table inside its migration file using the
documented SQLite procedure (CREATE new table without CHECKs → `INSERT INTO …
SELECT` → `DROP TABLE` old → `ALTER TABLE … RENAME TO` original name), with
`PRAGMA defer_foreign_keys = ON` as the first statement.

**Rationale**: SQLite has no `ALTER TABLE … DROP CONSTRAINT`. The rebuild is
the only way to remove `CHECK(signal_type IN (…))`, `CHECK(mic_stand IN (…))`,
`CHECK(output_type IN (…))`, and `CHECK(truss_type IN (…))`.

Two environment facts constrain how:

1. Migrations run on the *application's* pooled connection, whose DSN sets
   `_pragma=foreign_keys(1)` (`backend/internal/db/db.go` passes the live
   `*sql.DB` to `migratesqlite.WithInstance`). FK enforcement is ON during
   migrations.
2. golang-migrate's sqlite driver wraps each migration in a transaction by
   default (verified in the module source: `Run()` → `m.db.Begin()` unless
   `NoTxWrap`). `PRAGMA foreign_keys=OFF` is a **silent no-op inside a
   transaction**, so the classic "FKs off, rebuild, FKs on" recipe cannot
   work here.

`PRAGMA defer_foreign_keys = ON` is explicitly designed to be used inside a
transaction: it defers all FK checking to COMMIT and resets itself
automatically. For `audio_patch_inputs`/`audio_patch_outputs` (no inbound
FKs) the plain create→copy→drop→rename sequence then works as-is.

**Amendment (found by the T005 stepwise test)**: for `truss_sections`
(referenced by `lighting_fixtures.truss_section_id`) deferral is *not*
enough. Dropping a referenced parent increments SQLite's deferred FK
violation counter once per referencing row, and renaming a replacement
table into place never unwinds the counter — COMMIT fails with
`FOREIGN KEY constraint failed`. The `legacy_alter_table` rename idiom also
fails inside the tx-wrapped migration (the old table's rename drags the
fixtures' FK clause along). Migration 018 therefore uses a rename-free
sequence: stash `truss_sections` and `lighting_fixtures` rows in plain
backup tables (`CREATE TABLE … AS SELECT` carries no FK clauses), drop child
then parent (no FK reference survives to be violated), recreate both under
their final names (fixtures with their original DDL, truss without the
CHECK), copy back, drop the backups. Ids are copied explicitly, so
`truss_section_id`/chain-parent references stay valid; the T005 test
asserts row fidelity plus a clean `PRAGMA foreign_key_check`.

Rename direction matters in 016/017: only the *new* table is ever renamed
(`…_new` → original). The original is dropped, never renamed, so SQLite's
rename-time rewriting of FK references in other tables' schemas can never
retarget anything at a `…_new` name.

Down migrations rebuild in reverse (re-adding the CHECKs); rows with custom
values added since would violate the CHECK on downgrade — acceptable and
inherent (downgrades are best-effort, consistent with 009's down).

**Alternatives considered**:
- `NoTxWrap: true` on the migrate driver + `PRAGMA foreign_keys=OFF` in the
  file — changes behavior for *all* migrations, and a failure mid-file could
  return a connection with FKs off to the pool. Rejected.
- Keeping the CHECKs and validating in the API instead — impossible: the
  CHECKs live in the existing schema and reject any user-added value at
  INSERT time regardless of API logic.
- FK-id columns referencing the lookup table (rewrite data to ids) — larger
  rebuild of the same tables *plus* a data rewrite, breaks FR-007 (legacy
  values), forces JOINs everywhere. Rejected.

## R2 — Lookup schema: one generic table vs. per-vocabulary tables

**Decision**: Single table
`reference_values(id, vocabulary TEXT, value TEXT, label TEXT,
UNIQUE(vocabulary, value))`; the eight vocabulary names are a fixed list in
code (domain constant). Planning rows keep storing the text `value`.

**Rationale**: All eight vocabularies have the identical shape (value +
label). One table means one CRUD implementation, one endpoint family, one
settings UI component — Principle V. The vocabulary list itself is fixed by
the schema's columns (a ninth vocabulary only matters when some column
consumes it, which is a code change anyway), so it stays a constant.
Storing text values on planning rows (a) requires zero data migration,
(b) satisfies FR-007 by construction — a row's value renders even if absent
from the vocabulary, (c) matches the existing untyped columns
(`preamp_connector`, `cable_type`, `power_connector_in/out` never had
CHECKs).

**Alternatives considered**:
- Eight tables — 8× boilerplate for identical shape. Rejected (YAGNI).
- Editable vocabulary registry (vocabularies themselves as rows) — meta-model
  with no consumer; new vocabularies need code anyway. Rejected.
- FK ids on planning rows — see R1 alternatives. Rejected.

## R3 — Delete protection (in-use check)

**Decision**: A hard-coded usage map from vocabulary → list of
(table, column) pairs, probed with `SELECT EXISTS` per pair at delete time;
any hit → HTTP 409 with a message naming where the value is used. Duplicate
inserts rely on `UNIQUE(vocabulary, value)` → 409.

**Usage map** (authoritative copy in data-model.md):

| Vocabulary | Columns |
|---|---|
| signal_types | audio_patch_inputs.signal_type |
| preamp_connectors | audio_patch_inputs.preamp_connector |
| signal_cable_types | audio_patch_inputs.cable_type |
| speaker_cable_types | audio_patch_outputs.cable_type |
| output_types | audio_patch_outputs.output_type |
| mic_stands | audio_patch_inputs.mic_stand |
| power_connectors | lighting_fixtures.power_connector_in, lighting_fixtures.power_connector_out |
| truss_types | truss_sections.truss_type |

**Rationale**: With text values there is no FK to enforce RESTRICT; explicit
probes are simple, testable, and the map documents exactly which column
consumes which vocabulary (useful for tasks and tests).

**Alternatives considered**: triggers (opaque, migration-heavy); allowing
delete and orphaning rows (contradicts FR-006). Rejected.

## R4 — Fixture modes: linked live or copied on pick?

**Decision**: `fixture_modes(id, inventory_item_id FK ON DELETE CASCADE,
name, channel_count, UNIQUE(inventory_item_id, name))`. Picking a mode in the
UI copies name → `lighting_fixtures.dmx_channel_mode` and count →
`dmx_channel_count`. No FK from fixtures to modes.

**Rationale**: FR-010 mandates that editing/deleting a mode never rewrites
patched rigs — copy-on-pick makes that true by construction, and the existing
fixture columns already hold exactly the copied shape, so rigs, DMX
auto-assign (`AutoAssignDMX` reads `dmx_channel_count`), and older events
work unchanged. Manual entry (FR-009) is simply the same two fields typed by
hand. Re-import safety (FR-011): `UpsertInventory` revives/updates matched
items and only flags unmatched ones discontinued — it never deletes items on
import, so the CASCADE can only fire on explicit catalog deletion.

**Alternatives considered**: `mode_id` FK on fixtures with SET NULL — live
link violates FR-010 (count edits would desync or rewrite rigs), requires a
fixture-table rebuild. Rejected.

## R5 — Frontend consumption pattern

**Decision**: One `GET /api/v1/reference-data` response,
`{ "<vocabulary>": [{value, label}, …], … }`, cached under TanStack key
`['reference-data']`. A `useReferenceData()` hook exposes the raw map plus
`options(vocab, currentValue?)` that appends `{value: currentValue, label:
currentValue}` when a row's stored value is missing from the list (FR-007).
Settings-page mutations invalidate `['reference-data']`. `lib/constants.ts`
keeps only structural enums (`destinationTypes`, category types) — the eight
vocabulary arrays are deleted (SC-003).

**Rationale**: Dropdowns need all vocabularies on every planning tab; one
fetch, cached and shared, is simpler than per-vocabulary queries. The
option-merging helper centralizes the legacy-value rule instead of
re-implementing it per tab.

**Alternatives considered**: per-vocabulary endpoints/queries (8× chatter);
embedding reference data in each planning payload (duplication, cache
invalidation pain). Rejected.

## R6 — Scope check: remaining hard-coded lists

**Decision**: `stage_multis.connector_type` (free-text input today, default
'xlr', no CHECK, no dropdown) stays as-is; noted as a future candidate for
the signal-cable vocabulary. `destination_type`, `power_connection`
(grid/chain), and `category_type` CHECKs stay — they select code paths, not
terminology (per spec Assumptions). `connection_type` on stageboxes
(analog/digital free text) likewise untouched.

**Rationale**: Spec bounds the slice to the eight vocabularies; widening it
here would grow the rebuild surface for no user-visible gain.
