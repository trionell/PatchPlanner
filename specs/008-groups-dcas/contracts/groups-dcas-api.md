# API Contract: Mixer Buses — Groups & DCAs

Base path: `/api/v1`. All bodies JSON. Groups and DCAs expose identical
contracts; only the path segment and the built-in rule differ. There is no
standalone list endpoint — both collections ride on the audio-patch GET.

## Groups

### POST `/events/{eventId}/groups`

Request:

```json
{ "name": "Trummor" }
```

Responses:

- `201` — created group: `{ "id": 7, "event_id": 3, "name": "Trummor", "is_builtin": false }`
- `400` — name empty/whitespace-only
- `404` — unknown event
- `409` — name already used on this event (case-insensitive; includes "lr")

### PATCH `/events/{eventId}/groups/{groupId}`

Request: `{ "name": "Drums" }`

Responses:

- `200` — updated group object
- `400` — empty name, or the group is built-in (LR)
- `404` — unknown event or group, or group belongs to another event
- `409` — new name collides on this event

### DELETE `/events/{eventId}/groups/{groupId}`

Responses:

- `204` — deleted; channel assignments cascade away
- `400` — the group is built-in (LR)
- `404` — unknown event or group, or group belongs to another event

## DCAs

Same three endpoints under `/events/{eventId}/dcas[/{dcaId}]`, same status
matrix, minus the built-in rule (no DCA is built-in, so no 400-on-builtin
case).

## Changed: audio-patch read

### GET `/events/{eventId}/audio-patch`

Response gains two arrays, and each input gains two id arrays (always
present, `[]` when empty):

```json
{
  "stageboxes": [...],
  "stage_multis": [...],
  "groups": [
    { "id": 1, "event_id": 3, "name": "LR", "is_builtin": true },
    { "id": 7, "event_id": 3, "name": "Trummor", "is_builtin": false }
  ],
  "dcas": [
    { "id": 2, "event_id": 3, "name": "Trummor" }
  ],
  "inputs": [
    { "id": 11, "channel_number": 1, "group_ids": [1, 7], "dca_ids": [2], ... }
  ],
  "outputs": [...]
}
```

`dca_groups` no longer appears on inputs.

## Changed: input create/update

### POST `/events/{eventId}/audio-patch/inputs`

- `group_ids` **omitted** → the server routes the channel to the event's LR
  group (response shows `"group_ids": [<LR id>]`).
- `group_ids` **present** (including `[]`) → stored verbatim.
- `dca_ids` — optional, stored verbatim, no default.
- Any id not belonging to a group/DCA of this event → `400`, nothing
  written.

### PATCH `/events/{eventId}/audio-patch/inputs/{inputId}`

- `group_ids` / `dca_ids` are the full replacement sets for the channel
  (row update + join replacement in one transaction).
- Same `400` on foreign/unknown ids.
- `dca_groups` in a request body is unknown and ignored (Go's default
  lenient decoding — consistent with every other endpoint).

## Unchanged surfaces (asserted by existing tests)

- `GET /events/{id}/rental-summary` — groups/DCAs reference no inventory;
  the aggregation query is untouched.
- Rental Excel export, reference-data endpoints, output patch endpoints.
