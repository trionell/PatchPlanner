# Contract: Console API & audio-patch payload changes

**Feature**: `023-audio-patch-shell` | **Date**: 2026-07-26

All routes are under `/api/v1` and registered on the existing `AudioPatchHandler`,
inside the `/events/{eventID}` group guarded by `RequireEventAccess`. Conventions
follow the surrounding handlers: errors are `{"error": "..."}` via `writeError`,
ids parsed with `parseID`, nil slices normalized to `[]` before encoding,
validation hand-rolled. Write routes require the owner/contributor write check
already applied to stagebox and channel writes.

Passes 1, 2 and 4 change no API surface. Everything here is pass 3.

---

## 1. `POST /events/{eventID}/consoles`

Request:

```json
{
  "name": "FOH · SD10",
  "role": "foh",
  "inventory_item_id": 412,
  "owned_item_id": null,
  "input_count": 96,
  "output_count": 48,
  "local_input_count": 8,
  "local_output_count": 8
}
```

| Field | Rules |
|---|---|
| `name` | optional, trimmed; empty is legal and renders as "Console" |
| `role` | optional, defaults `foh`; must be one of `foh`, `monitor`, `broadcast` → else `400 invalid console role` |
| `inventory_item_id` | optional; must exist and belong to the event's bound inventory → else `400`/`409` from the existing cross-inventory guard |
| `owned_item_id` | optional; mutually exclusive with `inventory_item_id` → else `400 pick either a catalog item or an owned item` |
| the four counts | optional, default `0`; negative → `400 counts must not be negative` |

`201` with the created console.

## 2. `PATCH /events/{eventID}/consoles/{consoleID}`

Partial update; every field of the create body plus the four canvas
coordinates (`position_x`, `position_y`, `input_position_x`,
`input_position_y`), which the canvases send on drag-end exactly as they do for
a stagebox.

Additional rule (FR-024) — reducing a count below what is patched:

```json
{ "error": "local_input_count 4 would orphan 2 patched jacks: local in 6, local in 8" }
```

`409`. The check runs against the highest patched index per side:

| Field reduced | Conflicts with |
|---|---|
| `input_count` | assigned `input_channels` count for this console |
| `output_count` | assigned `audio_patch_outputs` count for this console |
| `local_input_count` | `input_cables` naming `console_local` in/out at index ≥ new count |
| `local_output_count` | `output_cables` naming `console_local` at index ≥ new count |

`200` with the updated console.

## 3. `DELETE /events/{eventID}/consoles/{consoleID}`

Deletes the console, clearing in the same transaction every `input_cables` and
`output_cables` row whose `console_local` end names it. `console_id` on
channels and outputs nulls out via `ON DELETE SET NULL`. Mirrors
`DELETE /stageboxes/{sbID}`, including its response shape:

```json
{ "cleared_cables": 3 }
```

`200`.

## 4. `GET /events/{eventID}/audio-patch` — payload changes

```diff
 {
   "stageboxes": [...],
   "stage_multis": [...],
   "input_channels": [
-    { "id": 1, "channel_number": 1, "channel_name": "Kick In", "width": "mono", ... }
+    { "id": 1, "channel_number": 1, "channel_name": "Kick In", "width": "mono",
+      "console_id": 7, ... }
   ],
   "audio_outputs": [
-    { "id": 1, "output_number": 1, "output_name": "FOH L/R", ... }
+    { "id": 1, "output_number": 1, "output_name": "FOH L/R", "console_id": 7, ... }
   ],
-  "output_mixer_position_y": 120
+  "consoles": [
+    { "id": 7, "event_id": 3, "name": "FOH · SD10", "role": "foh",
+      "inventory_item_id": 412, "input_count": 96, "output_count": 48,
+      "local_input_count": 8, "local_output_count": 8,
+      "position_x": 0, "position_y": 120,
+      "input_position_x": 0, "input_position_y": 0 }
+  ]
 }
```

`consoles` is always present, `[]` only for an event whose consoles were all
deleted. `console_id` is `null` on a channel or output belonging to no console.

## 5. Removed route

`PATCH /events/{eventID}/output-mixer-position` is deleted. The console's
position travels on `PATCH /consoles/{consoleID}` with every other node's, and
`events.output_mixer_position_y` no longer exists (research.md R8). No client
outside this repo consumes it.

## 6. Cable routes — unchanged shape, one more valid kind

`POST /input-cables` and `POST /output-cables` keep their bodies exactly.
`console_local` becomes valid in `from_kind`/`to_kind` per the table in
data-model.md. Two error cases are worth pinning:

| Case | Response |
|---|---|
| `console_local` port index ≥ the console's declared count | `400 console_local port 9 out of range` (same wording pattern as the stagebox check) |
| `console_local` used on the wrong side of a graph (e.g. `from_kind: console_local` → `to_kind: stagebox` on the input graph) | `400 invalid cable endpoints`, from the existing kind-pair validation |

## 7. Rental summary — one more arm

`GET /events/{eventID}/rental-summary` gains no fields. `rentalSummaryQuery`
goes from 11 to 12 UNION arms and from 12 to 13 `eventID` parameters:

```sql
UNION ALL
SELECT COALESCE(inventory_item_id, owned_item_id), 1, 0
FROM event_consoles
WHERE event_id = ? AND (inventory_item_id IS NOT NULL OR owned_item_id IS NOT NULL)
```

Placed after the `stage_multis` arm, keeping the query's stagebox → multi →
console reading order. `ORDER BY` is untouched. A console with neither item set
contributes nothing, so `specs/013-stage-plots/rental-baseline.json` still
matches after the migration.
