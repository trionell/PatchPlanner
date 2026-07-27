# Contract: console socket-panel positions

**Feature**: `024-patch-shell-fixes` | **Date**: 2026-07-26

The only API surface this slice changes. Everything else is presentation, or a
fix behind an endpoint whose request and response shapes stay as they are.

---

## 1. `PATCH /api/v1/events/{eventID}/consoles/{consoleID}`

Four new optional fields, accepted exactly as the existing four canvas
coordinates are — sent by a canvas on drag-end, ignored when absent:

```json
{
  "local_position_x": 312,
  "local_position_y": 448,
  "local_input_position_x": 260,
  "local_input_position_y": 320
}
```

| Field | Rules |
|---|---|
| `local_position_x` / `local_position_y` | optional, `REAL`; the socket panel on the output canvas |
| `local_input_position_x` / `local_input_position_y` | optional, `REAL`; the socket panel on the input canvas |

`200` with the updated console. No new error case: a coordinate is not
validated, the same as `position_x` today.

The existing conflict rule is untouched — reducing a jack count below what is
patched still returns `409` with the conflicting jacks named.

## 2. `GET /api/v1/events/{eventID}/audio-patch`

Every console in the `consoles` array carries the four new fields. No other
change to the payload.

```json
{
  "id": 3,
  "event_id": 12,
  "name": "FOH · SD10",
  "role": "foh",
  "input_count": 96,
  "output_count": 48,
  "local_input_count": 8,
  "local_output_count": 4,
  "position_x": 24,
  "position_y": 76,
  "input_position_x": 0,
  "input_position_y": 24,
  "local_position_x": 260,
  "local_position_y": 320,
  "local_input_position_x": 260,
  "local_input_position_y": 320
}
```

## 3. `PATCH /events/{eventID}/input-channels/{channelID}` — behaviour only

Request and response shapes are unchanged. What changes is what happens when
`console_id` is absent or null:

| Event has | Incoming `console_id` | Stored |
|---|---|---|
| exactly one desk | absent or `null` | that desk |
| exactly one desk | a desk id | that id |
| no desk | anything | `null` |
| several desks | absent or `null` | `null` |
| several desks | a desk id | that id |

This matches what `POST` to the same collection has always done, and is what
makes a single-desk event unable to accumulate deskless rows (FR-002,
research.md R1/R2). Callers are still expected to send the field — the whole-row
PATCH convention is unchanged — this is the safety net beneath that convention,
not a replacement for it.

## 4. `PATCH /events/{eventID}/audio-outputs/{outputID}` — behaviour only

Identical to §3, for `audio_patch_outputs`.

---

## UI contract — what the graphs now offer

Not an HTTP contract, but the part of this slice a reviewer most needs stated,
because it is what FR-009 to FR-011 are checked against.

### The sockets node

One per desk per graph, drawn only when that graph's jack count is above zero.
Two columns, in on the left and out on the right, drawn by the same component
shape as a stage box. Freely draggable within the processing lane; drag-end
PATCHes the matching pair of coordinates from §1. Titled with the desk's name
and badged `LOCAL`, so two desks' panels are told apart (FR-015).

### What may be connected

Unchanged from Slice 23 — restated so the fix can be verified as *not* having
changed it:

| Graph | From | To | Physical cable? |
|---|---|---|---|
| Input | `source` out | `console_local` in | yes — counts on the order |
| Input | `console_local` out | `channel` in | no — the desk's own routing |
| Output | `mixer` out | `console_local` in | no — the desk's own routing |
| Output | `console_local` out | `device` in | yes — counts on the order |

So a run through a desk's sockets bills exactly one cable, the same as the
equivalent run through a stage box (FR-012, SC-005).

### Every node draggable

Including the two that hold rows belonging to no desk. Those keep their position
for the session only — there is no row to store it on — and their drag-end
persists nothing (FR-006, research.md R4).
