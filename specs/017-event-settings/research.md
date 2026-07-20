# Research: Per-Event Settings from a Personal Template (Slice 17)

All items below were resolved through direct reading of the current
codebase (`internal/db/reference.go`, `internal/domain/reference.go`,
`internal/api/reference.go`, the migration history, and every frontend
consumer of `useReferenceData`), cross-referenced against the just-shipped
Slice 16 (inventory ownership), which solved the structurally similar
problem for the equipment catalog. No unknowns remain in the Technical
Context.

## R1 — `reference_values` has no id-based foreign keys pointing into it — the copy is simpler than Slice 16's

**Decision**: Planning tables store a vocabulary's `value` as a raw string
column (e.g. `input_sources.connector_type TEXT NOT NULL`), never a
foreign key to `reference_values.id`. Copying a template's rows into a
new event's scope (or a new user's template) is therefore a flat
`INSERT ... SELECT` with no id-remapping step — unlike Slice 16's
`DuplicateInventory`, which had to build an old-id→new-id map for
categories and items because `inventory_items.id` *is* referenced by
foreign keys elsewhere.

**Rationale**: Confirmed by reading every `CREATE TABLE`/`ALTER TABLE`
that adds a vocabulary-backed column (`input_sources.connector_type`,
`output_devices.input_connector_type`/`output_connector_type`,
`audio_patch_outputs.output_type`, `lighting_fixtures.power_connector_in`/
`power_connector_out`) — all `TEXT`, none `INTEGER REFERENCES
reference_values(id)`. This also means the eventual per-event copy at
event creation, and the per-user copy at first login, need no
transaction-scoped id bookkeeping at all.

## R2 — Reuse the existing `reference_values` table for event scope; add a new table for personal templates

**Decision**: `reference_values` gains an `event_id INTEGER REFERENCES
events(id)` column and its unique constraint changes from
`UNIQUE(vocabulary, value)` to `UNIQUE(event_id, vocabulary, value)` — a
table rebuild (SQLite can't `ALTER TABLE` a constraint), using the exact
`PRAGMA defer_foreign_keys = ON` / `CREATE ... _new` / `INSERT ... SELECT`
/ `DROP` / `RENAME` pattern already established in migrations 017, 018,
and 023. A brand-new `reference_templates` table (`owner_user_id`,
`vocabulary`, `value`, `label`, `UNIQUE(owner_user_id, vocabulary,
value)`) holds personal templates — there's no existing table to extend
for a concept ("a user's own vocabulary defaults") that didn't exist
before this slice.

**Rationale**: Mirrors Slice 16's own split exactly — a new "ownership"
table (`inventories` there, `reference_templates` here) plus an added
scoping column on the existing scoped-content table (`inventory_id` on
`inventory_categories`/`inventory_items` there, `event_id` on
`reference_values` here). Reusing `reference_values` rather than inventing
`event_reference_values` keeps every existing column, index-naming, and
Go struct (`domain.ReferenceValue`) unchanged except for the one added
field — less churn than a parallel table with identical shape.

**Alternatives considered**:
- A brand-new `event_reference_values` table, leaving `reference_values`
  as a permanent read-only "factory defaults" table — rejected: doubles
  the number of near-identical tables/structs/queries for no behavioral
  difference from option chosen; the rows that stay `event_id IS NULL`
  after migration (R4 below) already serve the "factory defaults" role
  without a second table.

## R3 — Two independent access surfaces, mirroring Slice 16's split, but with different gates

**Decision**: Two route groups:

1. **Personal template** (`/reference-templates/...`) — no path param at
   all (unlike `/inventories/{id}/...`), since a template is *singular*
   per user (the spec's Assumptions explicitly rule out multiple
   templates, unlike Slice 16's multiple-inventories-per-owner). Every
   route resolves the owner from the authenticated request context, the
   same way `InventoriesHandler.Register`'s list-mine/create routes do
   before an `{inventoryID}` ever enters the URL — no new middleware
   needed, `RequireAuth` alone is sufficient.
2. **Event vocabulary** (`/events/{eventID}/reference-data/...`) —
   registered inside the existing `/events/{eventID}` group, gated by the
   *already-existing* `RequireEventAccess` (GET for any role, mutating
   methods for owner/contributor only — confirmed this is exactly the
   rule the spec's FR-011 asks for). No new middleware at all, unlike
   Slice 16's `RequireInventoryOwner` (which had to introduce a *stricter*
   owner-only-for-every-method rule because direct inventory management
   has no role gradient). Event vocabulary is different: it's an
   event-owned resource with the event's normal role gradient, not a
   personal-resource-reached-through-an-event like inventory management
   is.

**Rationale**: `RequireInventoryOwner` exists because inventory management
is *never* something a contributor should reach, only the owner. Event
vocabulary is the opposite case — the spec (FR-011, mirroring
ROADMAP.md's explicit "an owner/contributor concern, per Slice 15's
roles") wants contributors to edit it, just not viewers. That's precisely
what `RequireEventAccess` already enforces for every other mutating
event-scoped resource (audio patch, lighting, etc.) — no new
authorization code, only new handlers registered into the existing group.

## R4 — Pre-existing events: a pure-SQL fan-out in the migration itself, not a Go conversion

**Decision**: The migration inserts one full copy of the pre-migration
global vocabulary into every event that exists *at migration time*:

```sql
INSERT INTO reference_values (event_id, vocabulary, value, label)
SELECT e.id, r.vocabulary, r.value, r.label
FROM events e
CROSS JOIN reference_values r
WHERE r.event_id IS NULL;
```

run directly in `039_event_settings.up.sql`, immediately after the table
rebuild. The original 48 `event_id IS NULL` rows are **not deleted** —
they remain permanently as the shared "starter defaults" seed, read (never
written) by both this one-time fan-out and by `EnsureUserHasReferenceTemplate`
(R5) for every future first-login.

**Rationale**: ROADMAP.md's own text suggests "its own one-time Go
conversion sequenced in `db.go`, following the established pattern from
Slices 11–13," reasoning that (unlike Slice 15/16's claim pattern) this
doesn't depend on login order. That reasoning is correct, but the
conclusion undersells it: since it doesn't depend on login order *or* on
any other runtime state, it doesn't need Go at all — a plain
migration-time `INSERT ... SELECT` is simpler, gets exercised by the
existing migration-test harness (`openMigratedTo`/`execMigrationFile`
helpers already used throughout `internal/db/*_migration_test.go`) the
same way, and has direct precedent in this exact codebase:
`021_groups_dcas.up.sql` seeds every existing event's built-in LR mixer
group with `INSERT INTO mixer_groups (event_id, name, is_builtin) SELECT
id, 'LR', 1 FROM events` — the same "one row per existing event, straight
from a migration file" shape this needs. Slices 11–13's Go-conversion
precedent (and Slice 16's `convertLegacyInventoryTemplate`) exists
specifically for conversions that need Go-only capability (reading an
on-disk file, or being safely re-run against runtime login order) —
neither applies here, so following that pattern anyway would be
unjustified extra surface, not consistency for its own sake.

**Deviation flagged for the user**: this is a deliberate, reasoned
departure from ROADMAP.md's literal wording ("needs its own one-time Go
conversion"). Flagging it explicitly here rather than silently
picking a different approach.

## R5 — Personal template bootstrap: idempotent copy-from-seed, not claim-one-row

**Decision**: `EnsureUserHasReferenceTemplate(db, userID)` — a no-op if
the user already has any `reference_templates` rows; otherwise copies
every `event_id IS NULL` `reference_values` row (the same permanent seed
set from R4) into fresh `reference_templates` rows owned by that user.
Called once at login, immediately after `EnsureUserHasInventory` in
`internal/api/auth.go`.

**Rationale**: Slice 16's `EnsureUserHasInventory` *claims* a single
pre-existing ownerless row because there was only ever one physical
inventory to hand to exactly one first claimant. There is no equivalent
single shared resource here — the seed rows are immutable reference
content, safe to copy to as many users as need a starting point, so every
user (first login or the millionth) gets an identical fresh copy from the
same never-mutated seed rows, not a one-time exclusive claim. This also
sidesteps a real bug class Slice 16 didn't have to worry about: if
templates were claimed exclusively, only the very first post-migration
user would get pre-populated defaults and everyone else would start
empty, directly contradicting spec.md's FR-004 ("already fully populated
the first time they access it").

**Alternatives considered**:
- Ship a hardcoded Go slice of default vocabulary values (bypassing the
  DB seed rows entirely) — rejected: the seed rows already exist,
  correctly reflect the actual current global defaults (including any
  values a real user may have already added to the global list before
  this migration ran), and reusing them costs nothing; a hardcoded Go
  list would silently drift from the DB the moment someone edits the
  global list between migration-authoring and migration-running time.

## R6 — Delete-protection ("in use") must scope by event, and one table needs a join to reach it

**Decision**: `countReferenceUsage` gains an `eventID` parameter. For
three of the four currently-tracked vocabularies the generated query
becomes `SELECT COUNT(*) FROM <table> WHERE <column> = ? AND event_id =
?`, since `input_sources`, `output_devices`, and `audio_patch_outputs`
all carry `event_id` directly. `lighting_fixtures` (backing
`power_connectors`) does **not** have an `event_id` column — it only has
`rig_id REFERENCES lighting_rigs(id)`, and `lighting_rigs` is what
actually carries `event_id`. That one entry needs a join:
`SELECT COUNT(*) FROM lighting_fixtures f JOIN lighting_rigs g ON g.id =
f.rig_id WHERE f.<column> = ? AND g.event_id = ?`.

**Rationale**: Confirmed by reading every relevant `CREATE TABLE`
statement directly (migrations 023, 025, 029 for the three direct
columns; migrations 004 and 018 for `lighting_rigs`/`lighting_fixtures`).
This is the one place Slice 17's mirroring of Slice 16 isn't a pure
copy-paste: Slice 16's equivalent in-use check (`DeleteInventory`) is a
single flat `COUNT(*) FROM events WHERE inventory_id = ?`, no fan-out, no
join, because it only ever had one table to check. `vocabularyUsage`'s
map value gains an optional join clause per entry so
`countReferenceUsage` can build either shape from the same data
structure, rather than special-casing `lighting_fixtures` in code with an
if-branch.

**Personal templates never need this check at all** — spec.md's FR-009 is
unconditional (a template row is never referenced by any planning table),
so `DeleteReferenceTemplateValue` has no usage-count step, unlike
`DeleteReferenceValue`.

## R7 — Frontend: `useReferenceData` becomes event-scoped; every existing consumer already has an `eventID` in scope

**Decision**: `useReferenceData(eventID: number)` replaces the current
zero-argument hook; its query key becomes `['reference-data', eventID]`.
`getReferenceData` becomes `getReferenceData(eventId)`, hitting
`GET /events/{eventId}/reference-data`. A separate, new
`useReferenceTemplate()` (no `eventID` argument) hits
`GET /reference-templates` for the "My defaults" page.

**Rationale**: Every current consumer of `useReferenceData` outside
`Settings.tsx` (`ColorSelect`, `ProcessingDeviceSection`,
`InputDeviceSection`, `SourceSection`, `TrueOutputDeviceSection`,
`AudioOutputsTab`, `LightingTab`, `LightingRigSheet`, `OutputPatchSheet`)
lives under the event-detail component tree and already receives
`eventId` as a prop from its parent — confirmed by direct inspection of
each file. No prop-drilling redesign is needed, only adding one parameter
to an existing hook call at each of those ten call sites.
`Settings.tsx` itself is the only file needing a structural split, into a
"My defaults" page (personal template, no `eventID`) and a new
event-scoped Settings tab living alongside `AudioInputsTab`/`LightingTab`
in the event-detail tab set — gated the same way those tabs already are
(`readOnly` prop driven by the viewer-hiding convention established after
Slice 15's field feedback).

**Pre-existing gap noted, not introduced by this slice**: `Settings.tsx`'s
hardcoded `vocabularyTitles` map is missing `channel_colors` (it has
titles for only 8 of the 9 entries in `domain.Vocabularies`), so today's
global Settings page silently never renders a channel-colors editor
section at all. Since the personal-template and event-settings pages
being built here supersede this component, this is the natural point to
fix the gap (add the missing title) rather than carry the omission
forward into two new surfaces.
