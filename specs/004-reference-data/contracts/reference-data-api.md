# API Contract: Reference Data & Fixture Modes

Base path: `/api/v1`. JSON throughout. Error body: `{"error": "<message>"}`
(matches existing handlers).

## Reference data

### GET /reference-data

Returns every vocabulary with its values, label-sorted (case-insensitive).
All eight keys always present (empty array if a vocabulary has no values).

```json
200 OK
{
  "signal_types":        [ {"id": 1, "vocabulary": "signal_types", "value": "di", "label": "DI"}, … ],
  "preamp_connectors":   [ … ],
  "signal_cable_types":  [ … ],
  "speaker_cable_types": [ … ],
  "output_types":        [ … ],
  "mic_stands":          [ … ],
  "power_connectors":    [ … ],
  "truss_types":         [ … ]
}
```

### POST /reference-data/{vocabulary}/values

Add a value to a vocabulary.

Request: `{"value": "dmx5", "label": "DMX 5-pin"}`

| Status | When |
|---|---|
| 201 + created ReferenceValue | success |
| 400 | empty `value` or `label` (after trim) |
| 404 | `{vocabulary}` not one of the eight |
| 409 | duplicate `value` in this vocabulary |

### PATCH /reference-data/{vocabulary}/values/{valueID}

Rename the display label. `value` is immutable; if present in the body it is
ignored.

Request: `{"label": "DMX 5-pin (110 Ω)"}`

| Status | When |
|---|---|
| 200 + updated ReferenceValue | success |
| 400 | empty `label` |
| 404 | unknown vocabulary, or id not in this vocabulary |

### DELETE /reference-data/{vocabulary}/values/{valueID}

| Status | When |
|---|---|
| 204 | deleted |
| 404 | unknown vocabulary or id |
| 409 | value in use — body names usage, e.g. `{"error": "value \"xlr\" is in use by 12 planning row(s)"}` |

## Fixture modes

### GET /inventory/items/{itemID}/fixture-modes

List modes for one catalog item, name-sorted. `[]` when none.

| Status | When |
|---|---|
| 200 + `[FixtureMode]` | success (item exists) |
| 404 | unknown inventory item |

### POST /inventory/items/{itemID}/fixture-modes

Request: `{"name": "Extended", "channel_count": 39}`

| Status | When |
|---|---|
| 201 + created FixtureMode | success |
| 400 | empty `name` or `channel_count < 1` |
| 404 | unknown inventory item |
| 409 | duplicate mode name on this item |

### PATCH /fixture-modes/{modeID}

Request: `{"name": "Extended", "channel_count": 40}` (both fields required)

| Status | When |
|---|---|
| 200 + updated FixtureMode | success |
| 400 | empty `name` or `channel_count < 1` |
| 404 | unknown mode |
| 409 | rename collides with another mode on the same item |

### DELETE /fixture-modes/{modeID}

| Status | When |
|---|---|
| 204 | deleted (never touches lighting_fixtures rows — copy-on-pick) |
| 404 | unknown mode |

## Unchanged surfaces (contract guarantees)

- Planning-row endpoints (inputs, outputs, fixtures, truss sections) accept
  the same payloads as today; vocabulary-backed text fields are not validated
  against `reference_values` (FR-007).
- `GET /events/{id}/rental-summary`, rental export, and inventory import are
  untouched by this feature; re-import leaves `reference_values` and
  `fixture_modes` unchanged (FR-011 — covered by tests).
