---

description: "Task list for slice 9 — mono/stereo channels & DI cabling"
---

# Tasks: Mono/Stereo Channels & DI Cabling

**Input**: Design documents from `/specs/009-stereo-di/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/stereo-di-api.md, quickstart.md

**Tests**: Included, per the constitution's "pragmatic testing" standard (Go `httptest` for API/db, Vitest for non-trivial frontend logic) and the pattern already established in slices 6/8.

**Organization**: Tasks are grouped by user story (US1 stereo width, US2 DI cabling, US3 sheets/signal-flow) on top of a shared Foundational phase that lands the data model, migration, and API plumbing every story needs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3
- File paths are exact and relative to the repository root.

## Path Conventions

Web app per plan.md: `backend/` (Go) and `frontend/` (React/TS). No new top-level directories.

---

## Phase 1: Setup

- [ ] T001 Create migration `backend/migrations/022_stereo_di.up.sql`: `ALTER TABLE audio_patch_inputs ADD COLUMN width TEXT NOT NULL DEFAULT 'mono'`, `ADD COLUMN mixer_behavior TEXT NOT NULL DEFAULT 'stereo_channel'`, `ADD COLUMN stagebox_id_b INTEGER REFERENCES stageboxes(id)`, `ADD COLUMN stagebox_channel_b INTEGER`, `ADD COLUMN stage_multi_id_b INTEGER REFERENCES stage_multis(id)`, `ADD COLUMN stage_multi_channel_b INTEGER`, `ADD COLUMN source_cable_item_id INTEGER REFERENCES inventory_items(id)`, `ADD COLUMN source_cabling TEXT NOT NULL DEFAULT 'two_cables'`; and on `audio_patch_outputs`: `ADD COLUMN width TEXT NOT NULL DEFAULT 'mono'`, `ADD COLUMN stagebox_id_b INTEGER REFERENCES stageboxes(id)`, `ADD COLUMN stagebox_channel_b INTEGER`, `ADD COLUMN stage_multi_id_b INTEGER REFERENCES stage_multis(id)`, `ADD COLUMN stage_multi_channel_b INTEGER`. Per data-model.md.
- [ ] T002 [P] Create `backend/migrations/022_stereo_di.down.sql` reversing every column added in T001 (SQLite `ALTER TABLE ... DROP COLUMN`, one statement per column, both tables).

**Checkpoint**: Migration pair exists and is internally consistent (down exactly reverses up). Not yet wired into any Go code.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain types, persistence plumbing, and validation shared by every user story. No story's rental math, UI, or signal-flow work is meaningful until channels can actually store and round-trip width/side-B/source-cable data.

**⚠️ CRITICAL**: No user story work may begin until this phase is complete.

- [ ] T003 In `backend/internal/domain/audio.go`: add `Width string \`json:"width"\``, `MixerBehavior string \`json:"mixer_behavior"\``, `StageboxIDB *int64 \`json:"stagebox_id_b,omitempty"\``, `StageboxChannelB *int \`json:"stagebox_channel_b,omitempty"\``, `StageMultiIDB *int64 \`json:"stage_multi_id_b,omitempty"\``, `StageMultiChannelB *int \`json:"stage_multi_channel_b,omitempty"\``, `SourceCableItemID *int64 \`json:"source_cable_item_id,omitempty"\``, `SourceCabling string \`json:"source_cabling"\`` to `AudioPatchInput`; add `Width`, `StageboxIDB`, `StageboxChannelB`, `StageMultiIDB`, `StageMultiChannelB` (same shapes) to `AudioPatchOutput`. Add package-level `var ValidWidths = []string{"mono", "stereo"}`, `var ValidMixerBehaviors = []string{"stereo_channel", "linked_channels"}`, `var ValidSourceCablings = []string{"two_cables", "splitter"}` per research.md R7. Run `gofmt -w`.
- [ ] T004 [US-shared] In `backend/internal/db/audio_patch.go`: extend `audioInputColumns` and the input scanner with `width, mixer_behavior, stagebox_id_b, stagebox_channel_b, stage_multi_id_b, stage_multi_channel_b, source_cable_item_id, source_cabling` (following the existing `COALESCE(...)`/nullable-scan patterns already used for `stagebox_id`/`stagebox_channel`/`cable_item_id`); extend `audioOutputColumns` and its scanner with `width, stagebox_id_b, stagebox_channel_b, stage_multi_id_b, stage_multi_channel_b`. Extend `CreateAudioPatchInput`/`UpdateAudioPatchInput`/`CreateAudioPatchOutput`/`UpdateAudioPatchOutput` INSERT/UPDATE statements and their `nullInt64`/`nullString`-wrapped params for all new columns.
- [ ] T005 [P] Create `backend/internal/db/stereo_migration_test.go`: `TestStereoDiMigration` using the established `openMigratedTo(t, 21)` + `execMigrationFileTx(t, database, "022_stereo_di.up.sql")` helpers (see `buses_migration_test.go` for the pattern). Seed a handful of pre-existing input/output rows before applying 022, then assert: every row's `width = 'mono'`, `mixer_behavior = 'stereo_channel'`, `source_cabling = 'two_cables'`, and all `*_b`/`source_cable_item_id` columns are NULL — i.e. the migration is purely additive with safe defaults (research.md R6, spec SC-005).
- [ ] T006 In `backend/internal/api/audio_patch.go`: add `decodeWidth`/`decodeMixerBehavior`/`decodeSourceCabling`-style validation (400 on any value not in `domain.ValidWidths`/`ValidMixerBehaviors`/`ValidSourceCablings`, following the existing `decodeBusRequest`/`writeBusError` pattern from slice 8) to the input and output create/update handlers. Add side-B reference validation: `stagebox_id_b` and `stage_multi_id_b`, when non-nil, MUST belong to the same event (extend the existing stagebox/stage-multi ownership check already applied to `stagebox_id`/`stage_multi_id` — reuse rather than duplicate the lookup). Add `source_cable_item_id` validation reusing the exact existing check applied to `cable_item_id` (must reference an existing inventory item → 400).

**Checkpoint**: Inputs/outputs can be created and updated via the API with every new field, round-tripping correctly, and rejecting invalid enum values and foreign-event side-B/source-cable references. Existing behavior (mono, no side B) is fully preserved for callers that omit the new fields. Foundation ready — user stories can now proceed.

---

## Phase 3: User Story 1 - Plan a stereo source as one channel row (Priority: P1) 🎯 MVP

**Goal**: A planner can mark an input or output row stereo, patch each side independently (with a same-route-next-channel convenience default), choose input mixer behavior (stereo channel vs linked channels), and see the rental order double the right per-side equipment automatically.

**Independent Test**: Mark an input row stereo in both mixer behaviors and an output row stereo; verify tabs, printed sheets, and the rental summary — no DI involvement needed (per spec.md).

### Tests for User Story 1

- [ ] T007 [P] [US1] In `backend/internal/db/rental_test.go`: add `TestStereoRentalDoubling` — seed a stereo mic input (mic, cable, stand all picked) and a stereo output (cable, speaker, amplifier all picked), call `GetRentalSummary`, and assert mic/cable/stand/output-cable/speaker quantities are ×2 while amplifier stays ×1. Seed a stereo **non-DI** row specifically to pin down that the `mic_item_id` arm doubles for mic/line/aux/return signal types (guards against reintroducing the R4 bug).
- [ ] T008 [P] [US1] In `backend/internal/api/audio_patch_test.go`: add a width/mixer_behavior round-trip test — create a stereo linked-channels input with side-B stagebox/channel set, PATCH it, verify the response carries every new field; assert 400 on an invalid `width`/`mixer_behavior` value and on a `stagebox_id_b`/`stage_multi_id_b` belonging to another event.

### Implementation for User Story 1

- [ ] T009 [US1] In `backend/internal/db/rental.go`: change the `mic_item_id`, `cable_item_id` (input), `stand_item_id`, output `cable_item_id`, and output `speaker_item_id` CTE arms from literal `1` to the `CASE` expressions specified in research.md R4 (mic arm conditioned on `signal_type != 'di'`; the rest condition only on `width = 'stereo'`). Leave the output `amplifier_item_id` arm as literal `1`. Do not yet add the source-cable arm (US2).
- [ ] T010 [US1] In `frontend/src/types/index.ts`: add `width`, `mixer_behavior`, `stagebox_id_b?`, `stagebox_channel_b?`, `stage_multi_id_b?`, `stage_multi_channel_b?` to `AudioPatchInput`; add `width`, `stagebox_id_b?`, `stagebox_channel_b?`, `stage_multi_id_b?`, `stage_multi_channel_b?` to `AudioPatchOutput`.
- [ ] T011 [P] [US1] In `frontend/src/lib/utils.ts` (or a new `frontend/src/lib/channelWidth.ts` if that keeps `utils.ts` focused): add `channelNumberLabel(channelNumber, mixerBehavior)` returning `"5"` or `"5–6"`, and `suggestNextChannelNumber(rows)` implementing the occupied-number-set algorithm from data-model.md (mono/stereo_channel rows occupy one number, linked_channels rows occupy two; suggestion is `max(occupied) + 1`).
- [ ] T012 [US1] In `frontend/src/components/event/AudioInputsTab.tsx`: add a Width select (mono/stereo) and, when stereo, a Mixer Behavior select (stereo channel/linked channels); when width flips to stereo, default side-B stagebox/multi + channel to side A's route at `channel_number + 1` (one-time fill per FR-002a — do not re-apply if side A changes later). Add stacked side-B routing controls (stagebox/multi + channel pickers) visible only when stereo, reusing the existing side-A picker components. Replace `addRow`'s `lastNumber + 1` with `suggestNextChannelNumber` from T011. Render the channel-number cell via `channelNumberLabel`.
- [ ] T013 [US1] In `frontend/src/components/event/AudioOutputsTab.tsx`: same Width select and stacked side-B routing controls as T012 (no Mixer Behavior — outputs have none, per FR). `addRow` stays `lastNumber + 1` (outputs have no linked-pair occupancy per spec Assumptions).
- [ ] T014 [US1] In `frontend/src/components/print/InputPatchSheet.tsx`: render the channel-number cell via `channelNumberLabel`; when `width === 'stereo'`, render side B's physical connection beneath side A's (reusing the existing stagebox/multi-label formatting logic already used for side A).
- [ ] T015 [US1] In `frontend/src/components/print/OutputPatchSheet.tsx`: same side-B second-connection line as T014, no mixer-behavior label.

**Checkpoint**: User Story 1 is fully functional and testable independently — stereo width, independent side-B patching, mixer behavior, correct doubled/undoubled rental counts, and both tabs/print sheets reflect it. DI-specific behavior (US2) not yet touched.

---

## Phase 4: User Story 2 - Complete DI cabling, including dual-channel DIs (Priority: P2)

**Goal**: A DI-type input channel gets a second, independently countable cable pick (source → DI), with a two-cables-vs-splitter multiplier on stereo DI rows, closing the rental-order leak on source-side cables.

**Independent Test**: Pick a source cable on a mono DI channel and verify it appears on sheets and in the rental summary; then verify the stereo two-cables/splitter interplay on one stereo DI row (per spec.md).

### Tests for User Story 2

- [ ] T016 [P] [US2] In `backend/internal/db/rental_test.go`: add `TestDISourceCableCounting` — seed a mono DI row with a source cable (expect ×1), a stereo DI row with `source_cabling='two_cables'` and a source cable (expect ×2, DI itself stays ×1, DI→preamp cable ×2), and a stereo DI row with `source_cabling='splitter'` (expect source cable ×1). Mirrors spec.md US2 acceptance scenarios 1–3.
- [ ] T017 [P] [US2] In `backend/internal/api/audio_patch_test.go`: assert 400 on an invalid `source_cabling` value and on a `source_cable_item_id` referencing a nonexistent inventory item; assert a non-DI channel still accepts (and ignores for counting) a `source_cable_item_id` if one is somehow set, per FR-012/edge cases.

### Implementation for User Story 2

- [ ] T018 [US2] In `backend/internal/db/rental.go`: add the source-cable CTE arm from research.md R4 — `SELECT source_cable_item_id, CASE WHEN width = 'stereo' AND source_cabling = 'two_cables' THEN 2 ELSE 1 END, 0 FROM audio_patch_inputs WHERE event_id = ? AND signal_type = 'di' AND source_cable_item_id IS NOT NULL`, `UNION ALL`-ed into the existing `combined` CTE; add one more `?` to `GetRentalSummary`'s `db.Query` call (12th placeholder) and its bracketing `eventID` args.
- [ ] T019 [US2] In `frontend/src/types/index.ts`: add `source_cable_item_id?`, `source_cabling` to `AudioPatchInput`.
- [ ] T020 [US2] In `frontend/src/components/event/AudioInputsTab.tsx`: when `signal_type === 'di'`, render a Source Cable picker (reusing the existing cable-catalog picker component used for `cable_item_id`) bound to `source_cable_item_id`; when additionally `width === 'stereo'`, render the two_cables/splitter select bound to `source_cabling`. Hide both controls for non-DI rows (values persist server-side but are not editable/visible, per the inert-not-cleared state-transition rule in data-model.md).
- [ ] T021 [US2] In `frontend/src/components/print/InputPatchSheet.tsx`: for DI rows, render the source cable alongside the existing DI→preamp cable line (label distinguishing "source" vs "DI→preamp", e.g. reusing the two-cable layout already used for stereo side B).

**Checkpoint**: User Stories 1 AND 2 both work independently. DI source cables are picked, validated, counted correctly (including the two_cables/splitter multiplier), and appear on the input print sheet.

---

## Phase 5: User Story 3 - Sheets and signal flow understand width and DI chains (Priority: P3)

**Goal**: The Signal Flow tab traces both physical sides of a stereo channel and the full two-hop DI chain (source → source cable → DI → XLR → console), flagging a DI row with no source cable as a gap — matching the paperwork already added to print sheets in US1/US2.

**Independent Test**: Render the signal-flow view for an event containing a mono channel, a stereo channel of each mixer behavior, and DI channels with and without source cables (per spec.md).

### Tests for User Story 3

- [ ] T022 [P] [US3] In `frontend/src/lib/signalFlow.test.ts`: assert `buildChannelFlow` returns a `pathB` hop (present only when `width === 'stereo'`, computed via the same missing/present rules as `path`) and a `sourceCable` hop (present only when `signal_type === 'di'`; `missing: true` and folded into `hasGap` when `source_cable_item_id` is unset, `missing: false` with the resolved catalog label otherwise).

### Implementation for User Story 3

- [ ] T023 [US3] In `frontend/src/lib/signalFlow.ts`: extend `FlowContext` with `sourceCableLabelById?: Map<number, string>` (mirrors the existing `cableLabelById`); extend `ChannelFlow` with optional `pathB?: FlowHop` and `sourceCable?: FlowHop`; implement `pathBHop` (side-B routing, reusing `pathHop`'s exact missing/present logic against the `_b` columns) and `sourceCableHop` (DI-only; `missing: true` + "No source cable picked" when unset, matching `sourceHop`'s existing missing-hop phrasing); fold both into `hasGap` per research.md R5.
- [ ] T024 [US3] In `frontend/src/components/event/SignalFlowTab.tsx`: pass `sourceCableLabelById` (built from the existing cable inventory query, same pattern as `cableLabelById`) into `buildChannelFlows`; render `pathB` and `sourceCable` hops in the signal-chain cell when present (reusing the existing `Hop`/`Arrow` components).

**Checkpoint**: All three user stories are independently functional. Signal Flow traces stereo pairs and DI chains end-to-end, with missing DI source cables flagged as gaps.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Extend `frontend/src/components/print/printSheets.test.tsx`: add fixtures for a linked-channels stereo input, a stereo output, and a DI row with a source cable; assert the pair label ("5–6"), both physical connections, and both cable lines render (mirrors the existing color-swatch test's fixture style from slice 8).
- [ ] T026 Run `gofmt -w`, `go vet ./...`, `golangci-lint run` (backend) and `tsc --noEmit`, `eslint .` (frontend) from their respective directories; fix any findings.
- [ ] T027 Run the full test suite (`go test ./...` in `backend/`, `npx vitest run` in `frontend/`) and the frontend build (`npm run build`); confirm all green.
- [ ] T028 Manually verify `specs/009-stereo-di/quickstart.md` end-to-end on a **copy** of the dev database (never the live file) with a fresh binary on a scratch port, per this project's standing DB-safety rule; confirm SC-002 (piano channel: 1 DI, 2 XLR, 1 splitter cable) and SC-005 (pre-existing rows' rental totals unchanged) against the real reference event's data.
- [ ] T029 Update `README.md`: document the Width/Mixer Behavior columns, side-B routing controls, Source Cable + two_cables/splitter picker, and the six new/changed request fields on the audio-patch API rows (mirrors the slice 8 README update pattern).
- [ ] T030 Update `ROADMAP.md`: mark Slice 9 done with today's date and checked bullets, following the exact format used for Slices 6–8.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001/T002 migration files must exist before T004's queries can be exercised against a migrated schema) — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational only. Independently testable from US1 (a mono DI row with a source cable needs no stereo involvement per spec.md), though T018's CTE arm sits in the same file US1's T009 already touched — sequence T009 before T018 to avoid a merge conflict within `rental.go` if worked in parallel.
- **User Story 3 (Phase 5)**: Depends on Foundational; benefits from US1 (`pathB`) and US2 (`sourceCable`) existing so signal flow has both new hop types to test meaningfully, but its own tests/implementation touch none of US1/US2's files.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests (T007/T008, T016/T017, T022) are written first and should fail before their corresponding implementation tasks land.
- Backend column plumbing (Foundational) before any story's persistence-dependent work.
- CTE/domain changes before UI changes that display their results.
- Tabs/print sheets (US1) before signal-flow polish (US3), since US3's manual verification benefits from seeing stereo rows on the tabs first — though nothing technically blocks US3 starting in parallel.

### Parallel Opportunities

- T001/T002 (migration up/down) can be written together, though down (T002) is easiest to write correctly once up (T001) is final — kept sequential in the list above but both are small.
- T003 (domain) and T005 (migration test) are marked [P] — different files, no interdependency once T001/T002 exist.
- Within US1: T007/T008 (tests) in parallel; T011 (pure helper) in parallel with T010 (types).
- Within US2: T016/T017 (tests) in parallel.
- US1 and US2 backend work (T009 vs T018) touch the same file (`rental.go`) — not safely parallel; sequence them.
- US3 can proceed in parallel with US2 once Foundational is done, since it touches entirely different files (`signalFlow.ts`, `SignalFlowTab.tsx`) — the "benefits from" note above is about verification quality, not a hard blocker.

---

## Parallel Example: User Story 1

```bash
# Tests together:
Task: "TestStereoRentalDoubling in backend/internal/db/rental_test.go"
Task: "Width/mixer_behavior round-trip test in backend/internal/api/audio_patch_test.go"

# Independent frontend pieces together:
Task: "Add width/mixer_behavior/side-B fields to frontend/src/types/index.ts"
Task: "Add channelNumberLabel/suggestNextChannelNumber helpers"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: run quickstart.md sections 1–3 (existing data untouched, stereo input, stereo output) against a DB copy.
4. This alone closes the core "fake two mono rows" pain point — DI cabling (US2) and deeper signal-flow tracing (US3) can ship in the same slice's next commits without blocking a demo.

### Incremental Delivery

1. Setup + Foundational → migration and plumbing exist, nothing user-visible yet.
2. + US1 → stereo channels usable end-to-end (MVP).
3. + US2 → DI source cables close the rental-order leak (SC-003).
4. + US3 → signal flow and gap-flagging complete the paperwork story (SC-004/SC-006).
5. + Polish → lint/test/build green, quickstart verified on real data, docs and roadmap updated.

---

## Notes

- [P] tasks touch different files with no ordering dependency.
- [Story] labels map every Phase 3+ task to US1/US2/US3 for traceability back to spec.md.
- Verify new tests fail before their implementation task lands (T007→T009/etc., T016→T018/etc., T022→T023).
- Never run verification against the live dev database — copy it first (standing project rule, restated in T028).
- Commit after each phase checkpoint, consistent with this project's per-slice `/speckit-git-commit` cadence.
