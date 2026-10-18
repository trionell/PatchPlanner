## 1. Backend — profiles and schema

- [ ] 1.1 `internal/domain/desk_models.go`: the ordered `DeskModel` list and LV1 80 bus modes (design D1); `Engine` helpers; unit test that every key is unique, every family is one of the five, and the table in `specs/console-desk-model` matches
- [ ] 1.2 `Console` gains `DeskModel string` and `BusMode string`; `InputChannel` gains `StripPool string` (`channel` | `aux`); validation lists in `domain`
- [ ] 1.3 Migration `054_desk_models` up/down (design D2), including the single-desk attach of deskless channels and outputs
- [ ] 1.4 `db/console_migration_test.go`-style test: an event with one desk and deskless rows → attached; two desks → untouched; every console `generic`; no number changed
- [ ] 1.5 `db/consoles.go` and `db/audio_patch.go` select/insert/update/scan the new columns
- [ ] 1.6 `GET /api/desk-models` (static) with a handler test

## 2. Backend — console model and the mapping

- [ ] 2.1 `createConsole`: `desk_model` required (400 "Pick the desk's model, or Generic."), known key; real model writes derived counts and default bus mode from role (D3)
- [ ] 2.2 `updateConsole`: `desk_model` read-only; `bus_mode` writable on 80s only; typed counts overwritten from the profile on a real model; local-port 409 kept for Generic only
- [ ] 2.3 `service/deskmap.go` `MapRows` with `LocalUse` (design D4 algorithm) — pure, table-tested: wedding M23R → M32R (Piano 7 → 7–8, Trumpet 8 → 9); LV1 64 → X32 Compact overflow; 40 ch LV1 → M32 (8 over, aux empty); M32 aux → LV1 64 (Moved after last channel); X32 → X32 aux stays aux; round trip LV1 → X32 → LV1 moves nothing back; Fits again; names > 12 under Changed; local jacks past the new count under Left out
- [ ] 2.4 Verify each table test by breaking the rule it guards (odd start, order preservation, never-fill-aux) and seeing it fail
- [ ] 2.4a Real → Generic keeps the derived values as typed counts, listed under Changed (design D3)
- [ ] 2.5 `POST /consoles/{cid}/switch` `{desk_model, bus_mode, apply}`: preview without `apply`; one transaction with it (console model + counts, row numbers, pools, `mixer_behavior`); test that applied numbers equal the previewed ones
- [ ] 2.6 `POST /consoles/{cid}/place` `{kind, ids, apply}` for deskless channels and outputs (own number if free → lowest free → past the end; never aux); tests

## 3. Backend — rows on a desk and strip checks

- [ ] 3.1 `domain.CheckStrip` (design D5): past the end, taken strip (occupancy by width per engine), x32 even stereo start; returns message + fix; unit tests for each refusal and its fix
- [ ] 3.2 Channel create: `console_id` required when the event has consoles (400), refused when it has none (409, refusal text); `channel_number = 0` → suggested number per spec; strip check on real models (409 with `fix`)
- [ ] 3.3 Channel update: strip check only when number, width, pool or desk changed; deskless save refused unless the single-desk repair applies; real model forces `mixer_behavior`
- [ ] 3.2a Channel create on a pool with no legal strip → 409 with `FullRefusal` text
- [ ] 3.4 Output create/update: the same desk requirement, no capacity check
- [ ] 3.5 API tests: create on a full M32 (409 names the desk), even stereo start (fix 5–6), Aux 9, taken aux, over row renamed (200), Generic never refuses, no-desk event (409), multi-desk without `console_id` (400), full channel pool with aux free (409, FullRefusal text), viewer 403
- [ ] 3.6 `cd backend && gofmt -l . && go vet ./... && go test ./...`

## 4. Frontend — types, profiles, strips

- [ ] 4.1 Types: `Console.desk_model`, `bus_mode`; `InputChannel.strip_pool`; `DeskModel`; switch/place preview types; API functions in `api/audioPatch.ts`
- [ ] 4.2 `useDeskModels()` (React Query, `staleTime: Infinity`)
- [ ] 4.3 `lib/deskStrips.ts`: number label ("5–6", "6 S", "Aux 1–2"), strip width per engine, usage per pool, `isOver`; delete `channelNumberLabel` / `suggestNextChannelNumber` from `lib/channelWidth.ts` (zero callers, no tests); unit tests
- [ ] 4.4 `lib/patchCapacity.ts`: per-desk strip counting, the one-desk label, `deskless` count; Generic wording unchanged; tests including 28 mono + 4 stereo on X32 = 36/32

## 5. Frontend — the console card and form (Rig drawer)

- [ ] 5.1 Add form: Model first, grouped `Select` (optgroups by family), no default, inline error; Bus mode beside it on the 80s defaulting from role
- [ ] 5.2 Card: model as first Spec, strips / aux / local as used / capacity, a second GearSpecs line for the profile; Meter on strips (fuller pool on X32)
- [ ] 5.3 Edit form: derived counts read-only (B3) on real models, typed fields on Generic only; Model select opens the switch flow; Bus mode applies at once
- [ ] 5.4 Catalog hint: an unambiguous model in the item or owned name → amber note with "Use <model>"; an LV1 name → note without action
- [ ] 5.5 Delete confirm states that its channels and outputs go to No desk
- [ ] 5.6 Viewer: model read from the card and strip, no controls

## 6. Frontend — the switch dialog

- [ ] 6.1 `ui/Dialog` pinned footer (A1) and phone close target (A2); write A1 into `components.md` §ui/Dialog and A2 into `tokens.md` §7 + `components.md` in the same commit
- [ ] 6.2 `ModelSwitchDialog`: figures table (red where the new desk cannot hold it), word-led lines (Left out / Changed / Moved / Fits again), folded Moved list, "Nothing is deleted…" line, primary "Switch to <model>"; Cancel changes nothing
- [ ] 6.3 The dialog opens whenever the preview has any line; only a preview with no line (empty desk, nothing moves) applies at once
- [ ] 6.4 Write A3 + B1 into `patterns.md` §5
- [ ] 6.5 Render tests: each line type, the untinted Fits-again-only box, the primary label

## 7. Frontend — the desk selector and the sheets

- [ ] 7.1 `hooks/useSelectedDesk` (design D7) with tests for fallback and the stored `'none'`
- [ ] 7.2 Selector trough in `AudioPatchShell` after the view toggle (Sheet only), absent with one desk and no deskless rows, `Select` from five desks; entries name desk and fill; No desk entry in amber; shown to viewers too
- [ ] 7.3 `AudioInputsTab` / `AudioOutputsTab` own the selection and pass it to sheet, strip and + action; + Channel sends `console_id` + `channel_number: 0`; no-desk event refusal with Open Rig; Flow unchanged
- [ ] 7.4 `InputSheet`: only the selected desk's rows; X32 Channels / Aux in sections with MicroLabel headings and counts, "No aux inputs used.", + Aux in the aux heading; number cell from `lib/deskStrips` with the over flag (B2)
- [ ] 7.5 Row editor: Desk required (no "No desk" option), Strip field on X32 · M32 only; 409 inline error with the "Use N" fix; deskless save refused
- [ ] 7.6 Moved-row line (B7) with Show <desk>, cleared by the next action; write B7 into `patterns.md` §2
- [ ] 7.7 No desk list: grey numbers, amber note with one "Put on <desk>" per desk, place preview via the switch dialog when anything moves or lands over; entry disappears and the sheet returns to the first desk when emptied; write B2, B4 and B6 into `patterns.md` §5 / §1
- [ ] 7.8 `OutputSheet`: "All desks" filter and Desk column removed in favour of the selector; Desk required in the editor; no output cap (the mockup's "An output past 16" row is void — user, 2026-10-18)
- [ ] 7.9 `PatchStatusRail`: one-desk label and the amber "N on no desk ›" control
- [ ] 7.10 Input and output canvases: local jack panels draw over-count jacks flagged over (design D9)
- [ ] 7.11 Render tests: two-desk sheet lists one desk; X32 sections; over row; No desk list and note; selector absent on one desk; viewer sees the selector

## 8. Frontend — the phone

- [ ] 8.1 Panel title is a `MobilePicker` over the desks (+ No desk); list rows for the selected desk; + adds to it
- [ ] 8.2 `MobileChannelEditSheet` / `MobileOutputEditSheet`: Desk required, Strip as `h-10` Select on X32 · M32; 409 error inline; the no-desk note's buttons 44 px
- [ ] 8.2a Phone list: X32 Channels / Aux in sections, over flag, No desk list with its note and Put on (44 px), moved-row line, selector entries with fill (design D10)
- [ ] 8.3 Rig sheet's console form gains Model (and Bus mode); the switch dialog stays a centred Dialog

## 9. Close-out

- [ ] 9.1 `cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build` and the backend gates (validator)
- [ ] 9.2 Real data: copy `backend/patchplanner.db` to `/tmp`, `PATCHPLANNER_DB=…`, switch the wedding's M23R to M32R and check the preview and result in the browser; a two-desk event lists one desk at a time
- [ ] 9.3 `reviewer` against the specs and the mockup; fix what it finds
- [ ] 9.4 Record Slice 47 in `ROADMAP.md` (with 48 and 49 depending on it); archive the change before any merge (merge is the user's call)
