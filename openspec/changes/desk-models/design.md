# Design — desk models

The approved mockup is `mockup.html` (revision 3, https://claude.ai/artifact/FA4iN7WwcLifCt26RWmWBf,
approved 2026-10-18 with B1–B4, B6, B7). It holds every visual value; this file does not restate them.

## Context

- `event_consoles` (migration 042) carries name, role, an item reference and four typed counts.
  `input_channels` and `audio_patch_outputs` carry a nullable `console_id` (`ON DELETE SET NULL`).
  A stereo channel is **one row** with `width = 'stereo'`; `mixer_behavior` (`stereo_channel` |
  `linked_channels`) only changes its label and has no UI.
- `CreateInputChannel` and `consoleIDForUpdate` (`db/audio_patch.go`) attach a row to the desk only
  when the event has exactly one; with several, a row silently gets no desk.
- `lib/patchCapacity.ts` counts **rows** per desk; `lib/channelWidth.ts`'s `channelNumberLabel` and
  `suggestNextChannelNumber` have no callers. `AudioInputsTab.addChannel` sends `highest + 1`.
- `OutputSheet` has an "All desks" filter and a Desk column; `InputSheet` has neither.
- `ConsoleLocalPortConflicts` refuses a local count below a patched jack (409); the canvases draw
  `local_input_count` / `local_output_count` jacks.

## Goals / Non-Goals

**Goals:** one source of truth for the profiles and the mapping (the server); the frontend renders
rules it is handed and does not re-derive them.

**Non-Goals:** mix-pool checks (Slice 48), FX returns, aux sockets as local jacks, user-defined
models, an all-desks sheet, any export (Slice 49).

## Decisions

### D1. Profiles live in Go and are served

`internal/domain/desk_models.go` holds `DeskModel{Key, Family, Label, Engine, Strips, AuxIn, Stereo,
LocalIn, LocalOut, Buses, Groups, Mon, FXAux, Matrix, DCA, Mute, NameLength, Colours, HasBusModes}`
as an ordered slice, plus `BusModes` for the 80s. `GET /api/desk-models` returns it (static,
cacheable; the frontend uses `staleTime: Infinity`). *Alternative:* a TS copy beside the Go one —
two lists drift, and the checks must be server-side anyway.

Behaviour branches on `Engine` (`x32` | `lv1` | `generic`) only.

### D2. Schema — migration `054_desk_models`

```
ALTER TABLE event_consoles ADD COLUMN desk_model TEXT NOT NULL DEFAULT 'generic';
ALTER TABLE event_consoles ADD COLUMN bus_mode   TEXT NOT NULL DEFAULT '';   -- '' | groups | monitors
ALTER TABLE input_channels ADD COLUMN strip_pool TEXT NOT NULL DEFAULT 'channel'; -- channel | aux
UPDATE input_channels / audio_patch_outputs SET console_id = <the one desk>
  WHERE console_id IS NULL AND the event has exactly one console;
```

The down migration drops the three columns; the attached `console_id`s stay (harmless, and they
were what the single-desk default would have written on the next save anyway).

### D3. Derived counts are stored, not computed on read

When a console is created or switched to a real model, the server writes the profile's strips to
`input_count`, local jacks to `local_*_count`, and `output_count = 0` (undeclared: never warns).
Every existing reader — the jack panels, `ConsoleLocalPortCounts`, the PDF — keeps working
unchanged. `updateConsole` overwrites typed counts from the profile on a real model (spec: typed
counts are ignored) and skips the local-port 409 for it, since only a switch changes them.
`desk_model` is **not** writable through PATCH; `bus_mode` is.

### D4. One mapping function previews and applies

`service/deskmap.go`: `MapRows(rows []StripRow, target DeskModel) Mapping` is pure; it returns per row
`{id, fromNumber, fromPool, toNumber, toPool, over}` plus the Left out / Changed / Moved /
Fits again lines and the before/after figures. Two endpoints call it:

- `POST /events/{id}/consoles/{cid}/switch` `{desk_model, bus_mode, apply}` — maps the desk's
  channels to the target model.
- `POST /events/{id}/consoles/{cid}/place` `{kind: "channels"|"outputs", ids, apply}` — maps
  deskless rows *onto* the desk alongside the rows already there (existing rows never move).

Without `apply` they return the preview; with it they run the same mapping in one transaction and
return the result. The client opens the Dialog only when the preview has a Left out or Moved line;
otherwise it sends `apply` at once (empty desk, or placing without conflict). *Alternative:* a client
mapping for the preview plus a server one for the apply — the two would disagree (P6).

**Algorithm.** Rows sorted by (pool, number, id). Cursor per pool starts at 1. For each row:
`n = max(row.number, cursor)`; on x32 a stereo row bumps an even `n` to the next odd; width is 2 for
x32 stereo, else 1. If `n + width − 1 ≤ capacity`, place it and advance the cursor; otherwise it is
left out: `n = max(row.number, lastPlacedEnd + 1)`, flagged over. Pool changes: x32 → lv1/generic
appends aux rows after the last channel row; anything → x32 keeps rows in `channel`. `mixer_behavior`
is set to `linked_channels` on x32 and `stereo_channel` on lv1; generic leaves it. "Fits again" is a
row that was over before and is placed after. "Changed: names" uses `NameLength` (12 on x32; LV1 has
none). For `place`, existing rows on the desk are fixed occupants and the cursor rule is replaced by
"own number if free, else lowest free, else past the end".

### D5. Strip checks on channel create and update

`api/audio_patch.go` calls `domain.CheckStrip(desk, model, row, others)` on create and update of a
channel. Refusals are **409** with `{error, fix?: {number, pool}}` so the inline error can offer
"Use 5–6". A row whose number, width, pool and desk are unchanged is not checked (an over row stays
editable). Generic is never checked. Outputs carry no strip check (no output cap, user 2026-10-18).

Create with `channel_number = 0` asks the server for the suggested number (spec), so the client no
longer computes it; `channelNumberLabel` / `suggestNextChannelNumber` are deleted and replaced by
`lib/deskStrips.ts` (labels, strip widths, usage per pool, `isOver`), which reads the served profile.

### D6. Every row on a desk

`CreateInputChannel` / `CreateAudioPatchOutput`: no console on the event → 409 with the refusal text;
consoles exist and `console_id` missing → 400 "pick the desk this channel is on". Update with no
`console_id` keeps today's single-desk repair (`consoleIDForUpdate`) and otherwise is 400. The
console must belong to the event (existing `itemBelongsToEvent`).

### D7. Desk selection

`hooks/useSelectedDesk(eventId, consoles, hasDeskless)` → `[selection, setSelection]` where
selection is a console id or `'none'`. localStorage key `patchplanner.desk.<eventId>`, try/catch like
`usePatchView`; falls back to the first console when the stored one is gone, and to the first console
when `'none'` has nothing in it. Owned by the tab components so Inputs and Outputs share the key.
The selector renders in `AudioPatchShell`'s bar after the view toggle (Sheet only), and as the
`MobilePicker` title on the phone; a fifth desk turns it into `Select size="sm"`.

### D8. Status strip

`inputPatchStatus` / `outputPatchStatus` take the selected desk and its profile, count strips per
pool, and return one label ("FOH · M32 Live · 30/32 ch · 4/8 aux") plus `deskless: number`.
`PatchStatusRail` gains the amber "N on no desk ›" control. Generic keeps today's wording and the
0-means-undeclared rule.

### D9. Over-count local jacks on the canvas

The jack panels draw `max(count, highest patched port + 1)` jacks; those past the count carry the
over flag (B2). `validInputCable`/`validOutputCable` keep refusing a *new* cable past the count, so
the only way onto them is a cable that was there before the switch.

### D10. design/ edits

Land with the code that first uses them, in one commit each: A1 + A2 (Dialog footer and phone close
target) with the switch dialog; A3 + B1 + B2 with the preview and the over flag; B3 with the console
card; B4 + B6 with the selector and the No desk list; B7 with the moved-row line.

## Risks / Trade-offs

- [The API now refuses deskless rows] → only the frontend calls it; existing deskless rows still
  load, are listed under No desk, and the migration repairs every single-desk event.
- [Profiles unverified for some models (X32 Core local jacks, FX 5–8 insert-only)] → they feed no
  check except local jacks; a wrong value is one line in `desk_models.go`.
- [Strip checks only server-side mean an error arrives after the request] → the inline error sits
  where the mockup draws it; the round trip is local.
- [Stored derived counts can drift from the profile if the list changes] → a later profile change
  ships with a migration that rewrites the counts of consoles on that model.

## Migration Plan

Migration 054 is additive; every console becomes Generic, which behaves as today. Rollback is the
down migration. Verify against a copy of the real database in `/tmp` (`PATCHPLANNER_DB`): the
wedding's "M23R" switches to M32R with Piano 7 → 7–8 and Trumpet 8 → 9.
