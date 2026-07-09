# Tasks: Mixer Buses — Groups & DCAs

**Input**: Design documents from `/specs/008-groups-dcas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/groups-dcas-api.md, quickstart.md

**Tests**: Included — the constitution mandates httptest coverage for API
handlers and Vitest for non-trivial frontend logic, and the spec's FR-009/
FR-010 migration behavior is only verifiable by test.

**Organization**: Grouped by user story. US1 (groups) is the MVP; US2
(DCAs) reuses its components; US3 (colors) layers a cosmetic attribute on
US1–US2's surfaces; US4 (display) is pure presentation.

## Phase 1: Setup

- [ ] T001 Write migration `backend/migrations/021_groups_dcas.up.sql` and `.down.sql`: create `mixer_groups`, `mixer_dcas`, `audio_input_groups`, `audio_input_dcas` exactly per data-model.md (COLLATE NOCASE names, UNIQUE(event_id, name), ON DELETE CASCADE FKs, composite-PK join tables, nullable `color` on both entity tables); seed LR per event; backfill LR routing for all existing inputs; convert `dca_groups` via the recursive-CTE comma split with `INSERT OR IGNORE` (research R5); `ALTER TABLE audio_patch_inputs DROP COLUMN dca_groups`; `ADD COLUMN color TEXT` on `audio_patch_inputs` and `audio_patch_outputs`; seed the `channel_colors` vocabulary into `reference_values` (8 rows per research R8, value = hex, label = name). Down: drop the four tables, re-add `dca_groups TEXT`, drop the two color columns, delete the vocabulary rows.

## Phase 2: Foundational (blocking all user stories)

- [ ] T002 [P] Domain structs in `backend/internal/domain/audio.go`: add `MixerGroup` (ID, EventID, Name, IsBuiltin, Color) and `MixerDCA` (ID, EventID, Name, Color); on `AudioPatchInput` delete `DCAGroups`, add `GroupIDs []int64 json:"group_ids"`, `DCAIDs []int64 json:"dca_ids"`, and `Color string json:"color,omitempty"`; on `AudioPatchOutput` add `Color`.
- [ ] T003 Bus db layer in `backend/internal/db/buses.go` (new): List/Create/Update/Delete for groups and DCAs (name + color; typed `ErrDuplicateName` from the UNIQUE violation; built-in flag readable for handler guards); event-wide assignment loaders returning `map[inputID][]busID` for both join tables; `replace*Assignments(tx, inputID, ids)` helpers that dedupe and rewrite join rows.
- [ ] T004 Rewire `backend/internal/db/audio_patch.go`: drop `dca_groups` from `audioInputColumns`, scanner, INSERT and UPDATE; add `color` to input and output column lists, scanners, INSERTs, UPDATEs (`nullString`/COALESCE idiom); wrap input create/update in a transaction that also replaces join rows; on create with nil `GroupIDs` assign the event's LR group (research R4); `ListAudioPatchInputs`/`GetAudioPatchInput` merge `group_ids`/`dca_ids` via T003's loaders (arrays never null).
- [ ] T005 [P] `CreateEvent` in `backend/internal/db/events.go` inserts the LR group (`is_builtin = 1`) in the same transaction as the event row.
- [ ] T006 Migration conversion test `backend/internal/db/buses_migration_test.go` (new): build a scratch SQLite file, `migrate.Migrate(20)`, seed two events and inputs with `dca_groups` values `"Trummor"`, `" Trummor "`, `"Trummor, Keys"`, `""`, NULL, then `Up()` to 21; assert one "Trummor" DCA per event (whitespace variants merged), a separate "Keys" DCA, correct `audio_input_dcas` rows, LR group + LR routing on every input, per-event isolation, `dca_groups` gone from the schema, `color` present on inputs/outputs, and 8 `channel_colors` rows in `reference_values`.
- [ ] T007 Frontend foundation: in `frontend/src/types/index.ts` add `MixerGroup`/`MixerDCA` (with `color?`), replace `dca_groups?: string` with `group_ids: number[]` / `dca_ids: number[]` plus `color?: string` on `AudioPatchInput`, add `color?: string` to `AudioPatchOutput`, extend `AudioPatchResponse` with `groups`/`dcas`; add group/DCA CRUD functions to `frontend/src/api/audioPatch.ts`; strip the `dca_groups` draft default, table cell, and 'DCA' heading from `frontend/src/components/event/AudioInputsTab.tsx` and the DCA column from `frontend/src/components/print/InputPatchSheet.tsx` so `tsc` stays green (new columns arrive in US1–US4).

**Checkpoint**: backend compiles with the new schema, migration test green, frontend compiles with no bus UI yet.

## Phase 3: User Story 1 — Route input channels to managed groups (P1) 🎯 MVP

**Goal**: Per-event group manager with protected built-in LR; multi-select
group routing per channel; LR default for new channels.

**Independent test**: Create groups, assign channels, reload — assignments
persist; new channels arrive routed to LR; LR cannot be renamed/deleted.

- [ ] T008 [US1] Group endpoints in `backend/internal/api/audio_patch.go`: register `POST/PATCH/DELETE /events/{eventId}/groups[/{groupId}]` accepting `{name, color}`; handlers enforce the contract status matrix (400 empty name, 400 built-in **name change or delete** — recolor of LR allowed, 404 unknown/foreign event or group, 409 duplicate); `getAudioPatch` response gains `groups`; input create/update validate every `group_ids` entry belongs to the event (400) before writing.
- [ ] T009 [US1] Group API tests in `backend/internal/api/audio_patch_test.go`: LR exists on a fresh event with `is_builtin`; CRUD matrix incl. case-insensitive duplicate 409 (`"lr"` too), built-in rename/delete 400s, and LR recolor 200; input created without `group_ids` returns `[LR]` while explicit `[]` stays empty (scenario 5); round-trip of a two-group assignment through PATCH and GET; foreign-event group id → 400; deleting a group clears assignments (GET shows channels without it) but leaves channels intact.
- [ ] T010 [P] [US1] `frontend/src/components/event/BusMultiSelect.tsx` (new): props `{ selected: number[], options: {id, name, is_builtin?, color?}[], onChange }`; selected render as removable Badges (× removes) tinted by the bus color when set, remaining options in a compact "+ add" Select that appends on choose; used for both bus kinds.
- [ ] T011 [US1] `frontend/src/components/event/BusSection.tsx` (new): Groups manager card following the `StageboxMultiSection` pattern — add form, inline rename persist-on-blur, delete with `confirm()` stating the affected-channel count (computed from loaded inputs); LR row shows a "built-in" Badge and no rename/delete controls; mutations invalidate `['audio-patch', eventId]`. (Color pick lands in T017.)
- [ ] T012 [US1] Wire `frontend/src/components/event/AudioInputsTab.tsx`: mount BusSection under StageboxMultiSection; add a Groups column rendering BusMultiSelect over `audioQuery.data.groups`, persisting on change via the existing update mutation; `addRow` payload omits `group_ids` so the server applies the LR default.

**Checkpoint**: US1 fully usable — groups end to end.

## Phase 4: User Story 2 — Assign DCAs by selection (P2)

**Goal**: DCA manager + multi-select DCA membership replacing the free-text
field; legacy text already converted by T001/T006.

**Independent test**: Create DCAs, assign channels (multiple per channel),
reload — persists; migrated "Trummor" appears assigned; no text input left.

- [ ] T013 [US2] DCA endpoints in `backend/internal/api/audio_patch.go`: `POST/PATCH/DELETE /events/{eventId}/dcas[/{dcaId}]` accepting `{name, color}` (same matrix minus built-in rule); `getAudioPatch` gains `dcas`; input create/update validate `dca_ids` ownership (400).
- [ ] T014 [US2] DCA API tests in `backend/internal/api/audio_patch_test.go`: CRUD matrix, duplicate 409, multi-DCA assignment round-trip, foreign-event dca id → 400, delete cascades assignments; assert the inputs response carries `dca_ids` and no `dca_groups` key.
- [ ] T015 [US2] Frontend DCAs: DCA manager card in `frontend/src/components/event/BusSection.tsx` (reuse the group card body; no built-in row); DCA column in `frontend/src/components/event/AudioInputsTab.tsx` via BusMultiSelect over `audioQuery.data.dcas`.

**Checkpoint**: both bus kinds fully manageable; free-text DCA entry gone.

## Phase 5: User Story 3 — Console channel-strip colors (P3)

**Goal**: Optional palette color on groups, DCAs, input channels, and
output channels, picked from the `channel_colors` vocabulary; visible in
both patch tabs.

**Independent test**: Color a group, a DCA, an input, and an output; all
four render tinted in their tabs and survive reload; palette editable on
Settings; no free color input anywhere.

- [ ] T016 [P] [US3] `frontend/src/components/event/ColorSelect.tsx` (new): compact palette picker — a `Select` over the `channel_colors` vocabulary from `useReferenceData` (label shown, value = hex) with a leading "—" no-color option and a swatch square showing the current value; merges a legacy stored value not in the palette per row (the `options(vocab, current)` idiom).
- [ ] T017 [US3] Colors in `frontend/src/components/event/BusSection.tsx`: ColorSelect on every group/DCA row (including LR — recolor allowed) persisting via the update mutations; manager name Badges tinted.
- [ ] T018 [US3] Color columns in `frontend/src/components/event/AudioInputsTab.tsx` and `frontend/src/components/event/AudioOutputsTab.tsx`: ColorSelect cell writing `color` through the existing row persist; row swatch visible when set.
- [ ] T019 [US3] Color API tests in `backend/internal/api/audio_patch_test.go` (+ reference-data test file if separate): color round-trips on group create/PATCH (incl. clearing with empty string), DCA, input, and output payloads; `GET /reference-data` includes `channel_colors` with 8 seeded entries.

**Checkpoint**: colors assignable everywhere; tabs render them.

## Phase 6: User Story 4 — Routing & colors on print sheets and Signal Flow (P4)

**Goal**: Group/DCA names on the input sheet; color swatches on both print
sheets surviving into PDF; tinted names in Signal Flow.

**Independent test**: Assign buses + colors, open both print previews and
the Signal Flow tab — names and colors rendered; uncolored/unrouted rows
unchanged.

- [ ] T020 [P] [US4] `frontend/src/components/print/InputPatchSheet.tsx`: add Groups and DCA columns (comma-joined names resolved from `groups`/`dcas` props, tinted when colored) and a channel-color swatch beside the channel number; `print-color-adjust: exact` (+ `-webkit-` prefix) on swatch/tint styles (research R9); extend the input-sheet case in `frontend/src/components/print/printSheets.test.tsx` with a routed, colored channel asserting names + swatch and an unrouted channel rendering an empty cell.
- [ ] T021 [P] [US4] `frontend/src/components/print/OutputPatchSheet.tsx`: channel-color swatch beside the output number with the same print-color CSS; printSheets.test.tsx output case asserts it.
- [ ] T022 [P] [US4] `frontend/src/components/event/SignalFlowTab.tsx`: render group and DCA names (tinted when colored) in each channel card header from `group_ids`/`dca_ids` + the response's `groups`/`dcas` (memberships are not hops — `frontend/src/lib/signalFlow.ts` stays untouched).

**Checkpoint**: all four stories delivered.

## Phase 7: Polish & verification

- [ ] T023 [P] Update `README.md`: audio patch feature bullet (managed groups with built-in LR, multi-DCA selection, console-style channel/bus colors) and API reference rows for the six new endpoints; note the removed `dca_groups` field and the `channel_colors` vocabulary.
- [ ] T024 Full gates from repo root: `cd backend && go vet ./... && go test ./... && gofmt -l . && golangci-lint run`; `cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run && npm run build`.
- [ ] T025 Smoke verification against a COPY of the dev DB (never the live file): run the new binary on :7432 with `PATCHPLANNER_DB=<copy>`, confirm migration 021 converts the real "Trummor" rows (DCA created, 4 channels assigned, LR everywhere, column dropped, palette seeded) and exercise group/DCA CRUD, assignment, and color writes via curl; then mark slice 8 done in `ROADMAP.md`.

## Dependencies

```text
T001 (migration) ──→ T003/T004/T005/T006 (db layer & test)
T002 (domain)    ──→ T003/T004
T004/T005        ──→ T008 (US1 API) ──→ T009 (US1 tests)
T007 (FE types)  ──→ T010/T011/T012 (US1 UI)
US1 API+UI       ──→ US2 (T013–T015: same files, reused components)
T007             ──→ T016 (ColorSelect); T011/T015 ──→ T017; T012 ──→ T018
T008/T013        ──→ T019 (color tests exercise the bus endpoints)
T007 + US3       ──→ T020/T021/T022 (US4 display)
everything       ──→ T023–T025 (polish)
```

Story order: US1 → US2 → US3 → US4. US3 (colors) needs US1/US2's managers
and columns to hang its pickers on; US4 renders what US1–US3 stored.

## Parallel opportunities

- T002 ∥ T005 (different files)
- T006 ∥ T007 (backend test vs frontend foundation)
- T010 ∥ T011 during US1 (separate new components); T012 after both
- T016 ∥ backend color tests prep (T019 draftable once T008/T013 exist)
- T020 ∥ T021 ∥ T022 (different files)
- T023 ∥ T024 prep

## Implementation strategy

Land Phases 1–2 first (schema + both foundations) since every story sits
on them; then US1 as the MVP checkpoint (groups usable end to end); US2 is
small because it reuses BusSection/BusMultiSelect and the handler pattern;
US3 threads the color attribute through the surfaces US1–US2 built; US4 is
display-only. Gates and the dev-DB-copy smoke run close it out.
