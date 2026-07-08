# Data Model: Lighting Rig Workflow — Fixture IDs, Mode Picking & Bulk-Add

## Schema changes (migration 020)

### `lighting_fixtures`

| Column | Type | Notes |
|---|---|---|
| `fixture_number` | INTEGER NULL | The console (GrandMA) fixture ID. Optional; no default, no backfill, no uniqueness constraint (duplicates are a UI flag, FR-003). Positive integer enforced at the API (400 on ≤ 0). |

No other schema changes — modes-in-dialog and bulk-add operate on existing
tables.

## API/domain model changes

### `LightingFixture` (JSON)

- New: `fixture_number?: number` (omitempty). Round-trips through the existing
  create/update/list endpoints like any other fixture field.

### `POST /events/{eventID}/lighting-rigs/{rigID}/fixtures/bulk` (new)

Request:

| Field | Type | Rules |
|---|---|---|
| `inventory_item_id` | number, required | Must resolve to a catalog item → else 400 |
| `quantity` | number, required | 1–100 → else 400 |
| `fixture_number_start` | number, optional | > 0; unit *i* (0-based) gets `start + i`; omitted → units created without IDs |
| `dmx_channel_mode` | string, optional | Applied to every unit |
| `dmx_channel_count` | number, required | ≥ 1 → else 400; used for address packing |
| `truss_section_id` | number, optional | Must belong to the rig → else 400; omitted → unassigned group |
| `dmx_universe` | number | Default 1 |
| `power_connection` | 'grid' \| 'chain' | Default 'grid'; no per-unit chain parents (per-row edit afterwards) |
| `power_connector_in` | string | Default 'schuko' |

Response: `200` with the rig's **complete** updated fixtures array (same shape
as auto-assign). Errors: `400` (validation), `404` (rig), `409`
(`dmx universe exceeds 512 channels`, nothing created).

## Derivation rules

| Value | Rule |
|---|---|
| Positions | Batch appended after `MAX(position_index)` of the rig, incrementing by 1 in batch order. |
| DMX start addresses | First unit starts at `MAX(dmx_start_address + dmx_channel_count)` over the chosen universe's already-addressed fixtures (1 when none); each next unit starts after the previous; last unit ending past 512 → 409, transaction rolled back. |
| Fixture numbers | `fixture_number_start + i` per unit; absent start → NULL. |
| Suggested start (frontend) | `max(fixture_number) + 1` over the loaded rig; 101 when the rig has no numbers. |
| Duplicate flag (frontend) | `duplicateFixtureNumbers(fixtures)` = set of numbers appearing more than once (NULLs never count); FID cells with a duplicate number render the warning state. |
| Print sheet | New `FID` column, first data column; empty when unset. |

## Lifecycle & invariants

- Bulk-created fixtures are ordinary rows — individually editable/deletable,
  no batch linkage stored (FR-009).
- Bulk-add never modifies existing fixtures (append semantics); the existing
  Auto-assign DMX repack remains a separate, unchanged operation.
- Existing rigs upgrade with all `fixture_number` NULL (FR-011).
- The Add Fixture dialog's mode pick is copy-on-pick (writes name + count into
  the draft); switching the model resets both to defaults.
