# Research: Lighting Rig Workflow — Fixture IDs, Mode Picking & Bulk-Add

## R1: Naming and storage of the console fixture ID

**Decision**: New nullable column `fixture_number INTEGER` on `lighting_fixtures`
(migration 020, plain `ALTER TABLE ADD COLUMN`, no default, no backfill —
FR-011 says existing fixtures simply have no ID). JSON field `fixture_number`;
UI label "Fixture ID" / column header "FID".

**Rationale**: `fixture_id` as a column name would read as a foreign key to
`lighting_fixtures.id` — the repo's `*_id` suffix consistently means FK
(`truss_section_id`, `power_chain_parent_id`). `fixture_number` matches the
established human-number convention (`channel_number`, `output_number`) while
the UI keeps the industry term.

**Alternatives considered**: `console_id` (reads like a device FK), `fid`
(opaque in the schema), a NOT NULL column with auto-numbering (violates FR-011
and the optionality decision).

## R2: Duplicate fixture-ID flagging

**Decision**: Frontend-derived only. A small pure helper
`duplicateFixtureNumbers(fixtures): Set<number>` in `lib/` (unit-tested)
feeds an amber highlight + warning badge on affected FID cells in the rig
table. No backend validation, no constraint (FR-003: flag, never block).

**Rationale**: Uniqueness is a per-rig display concern; the whole rig is
always loaded on the tab, so deriving duplicates client-side is exact and
free. A DB constraint would block legitimate mid-renumbering states.

**Alternatives considered**: UNIQUE index (blocks renumbering), backend
validation warnings in responses (state duplicated across layers for no gain).

## R3: Offering catalog modes in the Add Fixture dialog

**Decision**: The dialog reuses the exact cached query the table's mode cell
uses (`['fixture-modes', itemId]` → `listFixtureModes`). When the selected
model has modes, a mode `<Select>` appears above the free-text mode/channel
inputs; picking one writes both draft fields (copy-on-pick, same semantics as
the table cell). The free-text inputs remain for override, for models without
modes, and for custom fixtures. Changing the model resets the draft's mode
name/count to the defaults so stale picks never leak (FR-004).

**Rationale**: Same data source and copy-on-pick behavior as the shipped
`FixtureModeCell` keeps one mental model; the cache means zero extra requests
when the same model is then shown in the table.

**Alternatives considered**: Reusing `FixtureModeCell` directly (it is bound
to a persisted fixture row and persists on change — wrong lifecycle for a
draft); auto-picking the first mode on model select (surprising; the spec
only requires offering).

## R4: Bulk-add as one transactional endpoint

**Decision**: `POST /api/v1/events/{eventID}/lighting-rigs/{rigID}/fixtures/bulk`
with payload `{inventory_item_id, quantity, fixture_number_start?,
dmx_channel_mode?, dmx_channel_count, truss_section_id?, dmx_universe,
power_connection, power_connector_in}`. The handler validates (quantity 1–100
→ 400, unknown item/section → 400), then a single transaction: positions
continue after `MAX(position_index)`; DMX start addresses continue after the
highest occupied address on the chosen universe
(`MAX(dmx_start_address + dmx_channel_count)` over that universe, starting at
1 when empty); if the batch's last unit would end past 512 → 409 reusing
`ErrUniverseFull`, nothing inserted (FR-008); fixture numbers increment from
`fixture_number_start` (omitted → created without IDs). Response: the complete
updated fixtures list, mirroring the auto-assign endpoint.

**Rationale**: All-or-nothing demands a server-side transaction — N frontend
POSTs cannot roll back. **Append** semantics (not the auto-assign repack) is
deliberate: bulk-add must not renumber addresses the planner already fixed;
re-running Auto-assign afterwards remains available and unchanged. The
`ErrUniverseFull`/409 contract is reused as-is.

**Alternatives considered**: Frontend loop of single POSTs (partial batches on
failure, racy numbering); running the full auto-assign repack inside bulk-add
(mutates existing fixtures as a side effect); a generic batch-create API for
all resources (YAGNI).

## R5: Suggested start fixture ID

**Decision**: Computed in the frontend from the loaded rig: highest existing
`fixture_number` + 1; when the rig has no numbers at all, suggest 101 (the
common console starting block). Always editable (FR-006).

**Rationale**: The whole rig is in memory on the tab; no endpoint needed.
101 beats 1 as an empty-rig default because desks group fixtures in
hundred-blocks, and the value is a suggestion either way.

**Alternatives considered**: Server-side suggestion endpoint (a GET for one
integer the client already knows); filling gaps in the numbering (surprising
— "next free" after the max is what consoles do).

## R6: Testing approach

**Decision**: Go `httptest` in a new `internal/api/lighting_test.go`: bulk
happy path (count, incrementing fixture numbers, shared mode/truss/universe,
addresses appended after an existing fixture), universe overflow → 409 with
zero rows created, quantity 0 and 101 → 400, and `fixture_number` round-trip
through create/update. Vitest: `duplicateFixtureNumbers` unit test;
`printSheets.test.tsx` asserts the FID column on the lighting sheet. Manual
quickstart pass for dialog UX (mode picking, bulk form, duplicate highlight).

**Rationale**: The only new logic is batch placement and duplicate detection —
both cheap to cover at the layer where they live; per the pragmatic tier.
