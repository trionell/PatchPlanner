# Data Model: Configurable Reference Data

## New table: `reference_values` (migration 013)

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| vocabulary | TEXT | NOT NULL |
| value | TEXT | NOT NULL |
| label | TEXT | NOT NULL |
| | | UNIQUE(vocabulary, value) |

- `vocabulary` is one of the eight fixed names below (validated in the API
  layer against a domain constant; not a CHECK, so no future rebuild).
- `value` is the stable token stored on planning rows; immutable after
  creation (rename edits `label` only).
- `label` is the human-facing text shown in dropdowns and the settings page.
- Listing order: `ORDER BY label COLLATE NOCASE` (spec: no manual ordering).

### Vocabularies and seed values (migration 014, single multi-row INSERT)

| vocabulary | value → label |
|---|---|
| signal_types | mic → Mic, line → Line, di → DI, return → Return, aux → Aux |
| preamp_connectors | xlr → XLR, jack_ts → Jack TS, jack_trs → Jack TRS, rca → RCA, combo → Combo, usb → USB |
| signal_cable_types | xlr → XLR, jack_ts → Jack TS, jack_trs → Jack TRS, rca → RCA, combo → Combo |
| speaker_cable_types | xlr → XLR, nl4 → NL4 (Speakon), nl8 → NL8 (Speakon), jack_ts → Jack TS |
| output_types | foh → FOH, monitor → Monitor, sub → Sub, aux → Aux, matrix → Matrix, stereo → Stereo, iem → IEM |
| mic_stands | straight → Straight, boom → Boom, low → Low, desk → Desk, clip → Clip, none → None |
| power_connectors | schuko → Schuko, cee16 → CEE 16A (1-fas), cee32 → CEE 32A (1-fas), cee16_3ph → CEE 16A (3-fas), cee32_3ph → CEE 32A (3-fas), powercon → PowerCon, powercon_true1 → PowerCon TRUE1, iec → IEC C13 |
| truss_types | box → Box, ladder → Ladder, circle → Circle, straight → Straight, none → None |

Seeds mirror `frontend/src/lib/constants.ts` exactly (labels included), so
the upgrade is invisible (FR-002). The empty-string entry in the current
`stands` array is **not** seeded: it represents "no stand selected", which
remains the field being empty/NULL, not a vocabulary value.

## New table: `fixture_modes` (migration 015)

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| inventory_item_id | INTEGER | NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| channel_count | INTEGER | NOT NULL |
| | | UNIQUE(inventory_item_id, name) |

- API validates `name` non-empty and `channel_count >= 1` (FR-008); no CHECK
  constraints (Principle II lesson — keep schema constraint-light).
- No FK from `lighting_fixtures`: picking a mode copies `name` →
  `dmx_channel_mode` and `channel_count` → `dmx_channel_count` (R4,
  FR-009/FR-010).
- CASCADE fires only on explicit inventory-item deletion; `UpsertInventory`
  never deletes items on re-import (FR-011).

## Rebuilt tables (migrations 016–018) — schema deltas only

Each rebuild recreates the table **identically except** for the removed
CHECKs, copies all rows column-for-column, drops the old table, renames the
new one. First statement in each file: `PRAGMA defer_foreign_keys = ON` (R1).

| Migration | Table | Removed | Kept |
|---|---|---|---|
| 016 | audio_patch_inputs | CHECK on `signal_type`, CHECK on `mic_stand` | all columns, defaults, FKs (events, stageboxes, stage_multis, inventory_items via mic_item_id) |
| 017 | audio_patch_outputs | CHECK on `output_type` | CHECK on `destination_type` (structural), all columns, defaults, FKs |
| 018 | truss_sections | CHECK on `truss_type` | all columns, defaults, FK to lighting_rigs |

Note: 016/017 must reproduce the tables' *current* schema including columns
added later (`mic_item_id` from 008); copy lists are written explicitly, not
`SELECT *`.

## Usage map (delete protection, R3)

| Vocabulary | Consuming columns |
|---|---|
| signal_types | audio_patch_inputs.signal_type |
| preamp_connectors | audio_patch_inputs.preamp_connector |
| signal_cable_types | audio_patch_inputs.cable_type |
| speaker_cable_types | audio_patch_outputs.cable_type |
| output_types | audio_patch_outputs.output_type |
| mic_stands | audio_patch_inputs.mic_stand |
| power_connectors | lighting_fixtures.power_connector_in, lighting_fixtures.power_connector_out |
| truss_types | truss_sections.truss_type |

## Domain types (backend/internal/domain/reference.go)

```go
type ReferenceValue struct {
    ID         int64  `json:"id"`
    Vocabulary string `json:"vocabulary"`
    Value      string `json:"value"`
    Label      string `json:"label"`
}

// ReferenceData maps vocabulary name -> values, label-sorted.
type ReferenceData map[string][]ReferenceValue

type ReferenceValueRequest struct { // POST (value+label) / PATCH (label only)
    Value string `json:"value"`
    Label string `json:"label"`
}

type FixtureMode struct {
    ID              int64  `json:"id"`
    InventoryItemID int64  `json:"inventory_item_id"`
    Name            string `json:"name"`
    ChannelCount    int    `json:"channel_count"`
}

type FixtureModeRequest struct {
    Name         string `json:"name"`
    ChannelCount int    `json:"channel_count"`
}
```

`domain.Vocabularies` — ordered slice of the eight vocabulary names, single
source of truth for API validation, the usage map, and the GET response
shape.

## Frontend types (frontend/src/types/index.ts)

```ts
export interface ReferenceValue { id: number; vocabulary: string; value: string; label: string }
export type ReferenceData = Record<string, ReferenceValue[]>
export interface FixtureMode { id: number; inventory_item_id: number; name: string; channel_count: number }
```

## Validation rules

- Vocabulary path segment must be in `domain.Vocabularies` → else 404.
- POST value: `value` and `label` non-empty after trim → else 400; duplicate
  (vocabulary, value) → 409.
- PATCH value: `label` non-empty → else 400; `value` immutable (ignored if sent).
- DELETE value: any usage-map hit → 409 with message naming the vocabulary and
  count of referencing rows.
- Fixture mode: `name` non-empty, `channel_count >= 1` → else 400; unknown
  inventory item → 404; duplicate (item, name) → 409.
- Planning-row writes (inputs/outputs/fixtures/truss) accept any text for
  vocabulary-backed fields — validation lives in the dropdowns (R2, FR-007).
