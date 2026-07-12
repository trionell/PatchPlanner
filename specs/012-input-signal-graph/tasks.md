---

description: "Task list for slice 12 — audio input signal-flow graph"
---

# Tasks: Audio Input Signal-Flow Graph

**Input**: Design documents from `/specs/012-input-signal-graph/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/input-graph-api.md, quickstart.md

**Tests**: Included, per the constitution's "pragmatic testing" standard and the pattern established in slices 6/8/9/10/11.

**Organization**: Tasks are grouped by user story (US1 graph/double-patching, US2 channel independence, US3 source independence, US4 color inheritance, US5 stereo splitter cabling) on top of a large Foundational phase — like Slice 11, this feature's core risk (converting the user's real, already-built Audio Input rows losslessly) and its core schema split (Source/Channel/Device/Cable replacing one flat row) both have to be correct before any user story is meaningful. `ChannelSection.tsx`/`SourceSection.tsx`/`InputDeviceSection.tsx` ship in their full form under US1 (the graph literally cannot be demoed without a way to create a Source and a Channel first) — US2/US3 then add the dedicated tests proving their specific independence/kind-conditional acceptance criteria against that same code, the same way Slice 11's US2 was a small, targeted addition on top of US1's already-built canvas file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 / US4 / US5
- File paths are exact and relative to the repository root.

## Path Conventions

Web app per plan.md: `backend/` (Go) and `frontend/` (React/TS). The graph
lands in a new `frontend/src/components/event/InputGraphCanvas.tsx`
(rather than reusing `AudioOutputsTab.tsx`'s canvas code, since the node
kinds and direction genuinely differ — plan.md's Structure Decision), with
`frontend/src/components/event/AudioInputsTab.tsx` rewritten to mount it
alongside the new management sections, replacing its current flat-table
implementation entirely.

---

## Phase 1: Setup

- [ ] T001 Create `backend/migrations/029_input_signal_graph.up.sql`: `ALTER TABLE audio_patch_inputs RENAME TO input_channels` (legacy source-only columns kept intact for now — T007 still needs to read them); `CREATE TABLE input_sources` per data-model.md (`id`, `event_id` FK cascade, `name`, `kind TEXT NOT NULL`, `mic_item_id INTEGER REFERENCES inventory_items(id)`, `stand_item_id INTEGER REFERENCES inventory_items(id)`, `phantom_power INTEGER NOT NULL DEFAULT 0`, `connector_type TEXT NOT NULL`, `width TEXT NOT NULL DEFAULT 'mono'`, `position_x REAL NOT NULL DEFAULT 0`, `position_y REAL NOT NULL DEFAULT 0`); `CREATE TABLE input_devices` (same shape as `output_devices`'s port/connector/position fields, minus link-out columns, per data-model.md); `CREATE TABLE input_cables` (`id`, `event_id` FK cascade, `from_kind`, `from_id`, `from_port`, `to_kind`, `to_id`, `to_port`, `cable_item_id REFERENCES inventory_items(id)`, plus `UNIQUE(to_kind, to_id, to_port)` and a **partial** `UNIQUE(from_kind, from_id, from_port) WHERE from_kind != 'source'` so a Source's port is exempt from the one-cable-per-port constraint, FR-006); `INSERT INTO reference_values (vocabulary, value, label) VALUES ('preamp_connectors', 'mini_jack_3_5mm', '3.5mm TRS (mini-jack)')`.
- [ ] T002 [P] Create `backend/migrations/029_input_signal_graph.down.sql`: drop `input_cables`, `input_devices`, `input_sources`; delete the seeded `mini_jack_3_5mm` reference value; rename `input_channels` back to `audio_patch_inputs`.
- [ ] T003 [P] Create `backend/migrations/030_drop_legacy_input_channel_columns.up.sql`: drop every legacy source-only column from `input_channels` listed in data-model.md's "Dropped fields" (one `ALTER TABLE ... DROP COLUMN` statement per column). Applied only after T007's conversion has run (data-model.md's "Superseded" note) — never applied standalone against un-converted data (T009's `runMigrations` wiring guarantees the ordering).
- [ ] T004 [P] Create `backend/migrations/030_drop_legacy_input_channel_columns.down.sql`: best-effort — recreate the dropped columns' shape (structure only; historical row data is not recoverable, same convention as every other lossy down-migration in this project, e.g. Slice 11's `026`).

**Checkpoint**: Schema migrations exist and are internally consistent. Not yet wired into any Go code; the legacy columns are untouched until T009's `runMigrations` sequencing lands.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The graph's full data model, the migration that carries forward the user's real existing input list, and the rental-counting extension. No user story is meaningful — or safe to demo against real data — until all of this is in place.

**⚠️ CRITICAL**: No user story work may begin until this phase is complete.

- [ ] T005 In `backend/internal/domain/audio.go`: add `InputSource` (`ID`, `EventID`, `Name`, `Kind string`, `MicItemID *int64`, `StandItemID *int64`, `PhantomPower bool`, `ConnectorType string`, `Width string`, `PositionX`, `PositionY float64`), `InputDevice` (same field set as `OutputDevice` minus `LinkPortCount`/`LinkConnectorType`), and `InputCable` (`ID`, `EventID`, `FromKind string`, `FromID int64`, `FromPort int`, `ToKind string`, `ToID int64`, `ToPort int`, `CableItemID *int64`). Replace `AudioPatchInput` with a slimmed `InputChannel` struct keeping only `ID`, `EventID`, `ChannelNumber`, `ChannelName`, `Width`, `MixerBehavior`, `Color`, `Notes`, `GroupIDs`, `DCAIDs` — every source-only field moves off it. Keep a `legacyInputChannelRow` struct (or equivalent raw-column scan target) for T007 to read the not-yet-dropped legacy columns. Add `var ValidInputSourceKinds = []string{"mic", "line"}`, `var ValidInputCableFromKinds = []string{"source", "stagebox", "stage_multi", "device"}`, `var ValidInputCableToKinds = []string{"stagebox", "stage_multi", "device", "channel"}`. Run `gofmt -w`.
- [ ] T006 In `backend/internal/db/audio_patch.go`: replace `audio_patch_inputs` CRUD with `input_channels` CRUD against the slimmed `InputChannel` shape (group/DCA membership handling unchanged, same `input_id` FK target — research.md R4). Add full CRUD for `input_sources`, `input_devices`, `input_cables` (`List*`, `Create*`, `Update*` — cable update only ever changes `cable_item_id` — `Delete*`). Add derived-port-count helpers per data-model.md: a Source's port count from `width` (1 or 2); a Device's `input_port_count`/`output_port_count`; reuse the existing Stagebox `input_count`/Stage-Multi `channels` lookups already present for the Output graph.
- [ ] T007 Create `backend/internal/db/input_signal_graph_migration.go`: `convertLegacyInputChannels(db *sql.DB) error` implementing research.md R7's algorithm exactly — for every `input_channels` row, once per physical side (side A always; side B too when `width = 'stereo'`): infer the new Source's `kind` (`mic` if the old `signal_type = 'mic'`, or `mic_item_id`/`mic_label` is set, or `phantom_power` is true; `line` otherwise — covers old `line`/`di`/`return`/`aux` alike) and create it, copying `preamp_connector` into `connector_type` and (mic only) `mic_item_id`/`stand_item_id`/`phantom_power`; if `signal_type = 'di'`, also create a one-off `input_devices` row (1 in/1 out, connector types from `preamp_connector`) between the Source and whatever the old row routed onward to; emit a real cable from the Source (or DI device) into the old `stagebox_id`/`stage_multi_id`'s jack at `*_channel - 1` plus a cableless cable from that jack's console-side port to the Channel (research.md R5), or — if neither was set — one real cable straight from the Source/DI device to the Channel, carrying the old `cable_item_id`; for a stereo row with `source_cabling = 'splitter'`, write side B's Source/DI-side cable with `cable_item_id = NULL` regardless of the old `source_cable_item_id` (research.md R6). Log (via the existing `log/slog` logger) every row that had non-empty legacy `mic_label`/`cable_type`/`cable_length_m`/`mic_stand` text, since that free-text is not carried forward (research.md R7 point 6).
- [ ] T008 [P] Create `backend/internal/db/input_signal_graph_migration_test.go`: replay the conversion (via `openMigratedTo(t, 29)` + seeding raw legacy-column rows + calling `convertLegacyInputChannels` directly) against every shape quickstart.md's "Automated coverage" section lists: mic direct-to-channel, mic via stagebox, mic via stage multi, line/DI via a one-off device, stereo with `two_cables`, stereo with `splitter` (asserting the paired cable's `cable_item_id` is `NULL`), and a row with only legacy free-text fallback fields set (asserting it's logged, not silently dropped). Assert group/DCA memberships survive untouched (same row `id`, research.md R4) and that a subsequent call is a safe no-op.
- [ ] T009 In `backend/internal/db/db.go`: extend `runMigrations`'s sequencing (alongside its existing Slice-11 `output_graph` guard) to also check for migration 29: if not yet applied, `m.Migrate(29)` then `convertLegacyInputChannels(db)`, before the final unconditional `m.Up()` reaches 30+. Guard against re-running the conversion on an already-30+ database, mirroring T009's Slice 11 precedent exactly.
- [ ] T010 In `backend/internal/db/rental.go`: remove the CTE arms reading `audio_patch_inputs`' now-relocated columns (`mic_item_id`, `stand_item_id`, `cable_item_id`) and replace with: `SELECT mic_item_id, 1, 0 FROM input_sources WHERE event_id = ? AND mic_item_id IS NOT NULL`, the equivalent for `stand_item_id`, `SELECT COALESCE(inventory_item_id, ...), 1, 0 FROM input_devices WHERE event_id = ? AND inventory_item_id IS NOT NULL` (plus its owned-item counterpart, excluded from the rental CTE the same way `output_devices`' owned items already are), and `SELECT cable_item_id, 1, 0 FROM input_cables WHERE event_id = ? AND cable_item_id IS NOT NULL` (structurally excludes cableless rows and any deliberately-`null` splitter-pair half, research.md R5/R6 — no extra `WHERE` needed). Update the placeholder-count doc comment and `GetRentalSummary`'s `db.Query` args.
- [ ] T011 [P] In `backend/internal/db/rental_test.go`: add `TestInputGraphRentalCounting` — a mic Source's mic+stand each counted once; a Device counted once per row; a cableless stagebox→channel cable contributing nothing; a stereo Source's splitter pair (one `cable_item_id` set, one `NULL`) counted once, versus two independently-set cables counted twice.
- [ ] T012 In `backend/internal/db/audio_patch.go`: extend `DeleteStagebox`/`DeleteStageMulti` to also `DELETE FROM input_cables WHERE (from_kind IN ('stagebox','stage_multi') AND from_id = ?) OR (to_kind IN ('stagebox','stage_multi') AND to_id = ?)` in the same transaction as their existing `output_cables` clearing (Slice 11). Add `DeleteInputSource`/`DeleteInputDevice`/`DeleteInputChannel`, each deleting every `input_cables` row referencing it as `from`/`to` before deleting the row itself — never blocks, confirmation happens client-side (FR-020).
- [ ] T013 In `backend/internal/api/audio_patch.go`: replace the `audio-inputs` handlers/validation with `input-channels` equivalents against the slimmed shape (routes: `POST/PATCH/DELETE /events/{eventID}/input-channels(/{channelID})`). Add `input-sources` handlers/routes: `kind ∈ {mic, line}` (`400` otherwise), `kind = 'mic'` requires `mic_item_id` (`400` otherwise), `kind = 'line'` forbids `mic_item_id`/`stand_item_id`/`phantom_power = true` (`400` otherwise, and switching an existing Source from `mic` to `line` clears those three fields server-side as part of the same update, per spec Edge Cases), `connector_type` always required. Add `input-devices` handlers/routes mirroring `output_devices`' validation shape exactly (port-count/connector-type consistency, `409` + orphaned-cable list on a shrink below attached-cable count). Add `input-cables` handlers/routes per contracts/input-graph-api.md: `from_kind`/`to_kind` enum + combination validation (`400` on `from_kind = 'channel'` or `to_kind = 'source'`), event-ownership of `from_id`/`to_id`, port-bounds validation (T006's helpers), port-uniqueness (`409`, exempting `from_kind = 'source'` from the `from`-side check per T001's partial unique index), and `cable_item_id` forced-`NULL`-when-(`from_kind ∈ {stagebox, stage_multi}` AND `to_kind = 'channel'`) (`400` otherwise, research.md R5).

**Checkpoint**: The graph's full backend exists — sources, channels, devices, and cables can be created/validated/deleted via the API with correct port/connector/uniqueness/kind rules, the user's real existing input list converts automatically on startup, and rental counting reflects the new shape. No UI yet.

---

## Phase 3: User Story 1 - Patch the input signal path on an interactive graph (Priority: P1) 🎯 MVP

**Goal**: An engineer can create Sources, Stageboxes/Stage-Multis/Devices, and Channels, then wire them together on a graph — including one Source feeding more than one Channel at once — with everything reflected correctly in the rental order.

**Independent Test**: On an event with one Source, one Stagebox, and one Channel, draw a cable from the Source to the Stagebox and another from the Stagebox to the Channel; confirm the Channel is fed. Connect the same Source's port to a second Channel directly; confirm both Channels show it feeding them, with no duplicate Source needed.

### Tests for User Story 1

- [ ] T014 [P] [US1] Create `backend/internal/api/input_cables_test.go`: full graph round-trip through the real HTTP API — create a mic Source, a Stagebox, and a Channel; connect Source→Stagebox (real cable, picker-eligible) and Stagebox→Channel (cableless, `cable_item_id` rejected if attempted non-null); assert `GET /events/{id}/audio-patch` reflects it. Connect that same Source's port directly to a second Channel; assert both Channels show it as a feed and no error occurs (FR-006). Assert `409` when a second Source is connected into an already-fed Channel port, and when a non-Source `from` port is reused. Delete the Stagebox→Channel cable; assert the Channel reverts to unfed.

### Implementation for User Story 1

- [ ] T015 [US1] In `frontend/src/types/index.ts`: remove `AudioPatchInput`; add `InputSource`, `InputChannel`, `InputDevice`, `InputCable`; extend `AudioPatchResponse` with `input_sources: InputSource[]`, `input_channels: InputChannel[]`, `input_devices: InputDevice[]`, `input_cables: InputCable[]` in place of `inputs: AudioPatchInput[]`.
- [ ] T016 [P] [US1] Create `frontend/src/lib/inputGraph.ts`: pure functions — `sourcePorts(source)` (1 or 2 output-only ports from `width`), `channelPort(channel)` (single input-only port), `devicePorts(device)` (input/output port lists, same shape as `outputGraph.ts`'s but for `InputDevice`); import and reuse `outputGraph.ts`'s `stageboxPorts`/`stageMultiPorts` directly (research.md R2/plan.md Structure Decision) rather than reimplementing them; `nodeZone` resolving to `'sources' | 'processing' | 'channels'`; `portsConnectable`/`isPortConnected`/`cableAtPort` adapted to `InputCable`'s kind set, with the Source-port fan-out exemption (FR-006) and the R5 cableless-edge predicate (`isCablelessEdge(fromKind, toKind)`).
- [ ] T017 [US1] Create `frontend/src/components/event/SourceSection.tsx`: Sources management table — name, kind (mic/line) toggle, mic model + stand + phantom-power fields shown only when `kind = 'mic'`, connector type (always), width (mono/stereo), matching the accepted `mockup.html`'s Sources section exactly (including the row left-edge/tint styling, no separate color picker — FR-018/US4 wires the tint value in later).
- [ ] T018 [US1] Create `frontend/src/components/event/ChannelSection.tsx`: Channels management table — channel number, name, width, mixer behavior, groups, DCA, color, notes, plus a read-only "fed by" summary column resolved from `input_cables`, matching `mockup.html`'s Channels section.
- [ ] T019 [US1] Create `frontend/src/components/event/InputDeviceSection.tsx`: mirrors `ProcessingDeviceSection.tsx` — name, catalog/owned item pick, input port count + connector type, output port count + connector type.
- [ ] T020 [US1] Create `frontend/src/components/event/InputGraphCanvas.tsx`: three zones — Sources (single compact node, one row per Source, two for a stereo Source, FR-015) and Channels (single compact node, one row per Channel) pinned to their rails with vertical-reorder-only dragging; Stageboxes/Stage-Multis/Devices free-floating in the Processing zone (2D drag). Click-or-drag port-to-port cabling (reusing `AudioOutputsTab.tsx`'s interaction mechanics); the cable-item picker is skipped entirely for an `isCablelessEdge` connection (T016), committing immediately with no item, mirroring `OutputGraphCanvas`'s stage-multi-input short-circuit; a Source's port stays selectable/draggable after already carrying a cable (fan-out, mirrors the Mixer-port exemption), every other port shows its existing cable's info on a plain click instead.
- [ ] T021 [US1] Rewrite `frontend/src/components/event/AudioInputsTab.tsx`: mount `ChannelSection`, the existing `StageboxMultiSection` (reused unchanged), `InputDeviceSection`, `SourceSection`, and a "Signal flow" card with a Graph/Table toggle between `InputGraphCanvas` and a new embedded `InputResourceTable` (flat all-resources list mirroring `OutputResourceTable`, FR-017) — replacing the current flat per-channel table entirely.
- [ ] T022 [US1] Rewrite `frontend/src/components/print/InputPatchSheet.tsx`: enumerate `input_channels` by `channel_number` and walk `input_cables` backward per channel (research.md R8) to render its full path back to a Source, flagging a channel with nothing found as a gap.

**Checkpoint**: User Story 1 is fully functional and testable independently — Sources, Devices, Stageboxes/Multis, and Channels can all be created and wired on the graph, including double-patching, with correct rental counting and a working print sheet. Color inheritance (US4) and the splitter convenience (US5) not yet wired in.

---

## Phase 4: User Story 2 - Manage channel identity independent of wiring (Priority: P2)

**Goal**: A Channel's own metadata (name, width, groups, DCA, color, notes) is fully manageable with no Source required, and editing it never touches whichever Source feeds it.

**Independent Test**: Create a Channel with no Source wired to it; set its full metadata; confirm it saves/displays correctly with no source-related field present, and that later editing it doesn't alter the Source that eventually feeds it.

### Tests for User Story 2

- [ ] T023 [P] [US2] In `backend/internal/api/audio_patch_test.go`: add `TestInputChannelIndependentOfSource` — create a Channel with no cable; set/read its full metadata; wire a Source to it via `input-cables`; update the Channel's name/color through `input-channels`; assert the Source's own row (`input-sources`) is untouched by that update.

### Implementation for User Story 2

- [ ] T024 [US2] Verify `frontend/src/components/event/AudioInputsTab.tsx` (T021) renders `ChannelSection` first, ahead of `StageboxMultiSection`/`InputDeviceSection`/`SourceSection`, matching the accepted `mockup.html`'s section order and mirroring how the Output tab leads with its own "Output channels" section; adjust ordering if it drifted during T021.

**Checkpoint**: User Stories 1 AND 2 both work independently. Channel metadata is fully self-contained.

---

## Phase 5: User Story 3 - Manage source identity independent of channel (Priority: P2)

**Goal**: A Source's mic-specific fields (model, stand, phantom power) only ever appear for a mic Source; a line Source only ever shows a connector type; neither requires a Channel to exist.

**Independent Test**: Create a mic Source and confirm mic/stand/phantom-power are present and required; create a line Source and confirm those fields are entirely absent, with only a connector type required.

### Tests for User Story 3

- [ ] T025 [P] [US3] In `backend/internal/api/audio_patch_test.go`: add `TestInputSourceKindValidation` — creating a `mic` Source without `mic_item_id` → `400`; creating a `line` Source with `mic_item_id`/`stand_item_id` set or `phantom_power: true` → `400`; switching an existing `mic` Source to `line` clears `mic_item_id`/`stand_item_id`/`phantom_power` in the same response.

### Implementation for User Story 3

- [ ] T026 [US3] Verify `frontend/src/components/event/SourceSection.tsx` (T017) immediately clears/hides the mic-only fields client-side the moment `kind` is switched to `line` (optimistic UI update ahead of the server round-trip confirmed by T025), rather than waiting on the next full refetch.

**Checkpoint**: User Stories 1, 2, AND 3 all work independently.

---

## Phase 6: User Story 4 - Signal-flow color follows the channel automatically (Priority: P3)

**Goal**: Coloring a Channel is immediately visible on its Source, every intermediate Processing/Stagebox/Stage-Multi port, and every cable segment between them — with a double-patched Source feeding differently-colored Channels showing neutral instead.

**Independent Test**: Color a Channel fed through a Stagebox; confirm the Source and the Stagebox's matching ports/cables pick up that color. Double-patch the Source to a second, differently-colored Channel; confirm the Source itself shows neutral while each cable still shows its own destination's color.

### Tests for User Story 4

- [ ] T027 [P] [US4] Create `frontend/src/lib/inputGraph.test.ts`: unit tests for a new color-derivation function — a Source/port reaching one colored Channel through a chain returns that color; reaching two Channels of different colors returns neutral; reaching none yet returns neutral; reaching two Channels of the *same* color returns that color.

### Implementation for User Story 4

- [ ] T028 [US4] In `frontend/src/lib/inputGraph.ts`: add the color-derivation function from T027 (research.md R9) — traces `input_cables` forward from a given port to every reachable Channel, returning a single shared color or neutral. Wire it into `InputGraphCanvas.tsx` (T020) for every port dot/label and cable-segment color, and into `SourceSection.tsx`/`ChannelSection.tsx` (T017/T018) for each row's left-edge accent and tinted background — `ChannelSection` uses its own stored `color` directly, `SourceSection` uses the derived value.

**Checkpoint**: All four user stories are independently functional. Color visually traces every signal path without any new stored field beyond the Channel's own.

---

## Phase 7: User Story 5 - Stereo source through a splitter cable (Priority: P3)

**Goal**: A stereo Source's two ports can share one physical splitter cable, billed once, rather than two independently-picked cables.

**Independent Test**: Connect both ports of a stereo Source to a stereo Device using a shared splitter pick; confirm the rental summary counts that cable item once, not twice.

### Tests for User Story 5

- [ ] T029 [P] [US5] In `backend/internal/api/input_cables_test.go`: add a case connecting a stereo Source's two ports to a stereo Device's two input ports — one cable with `cable_item_id` set, the paired cable left `null` — and assert the rental summary counts that item once (cross-checks T011's unit-level assertion through the real API).

### Implementation for User Story 5

- [ ] T030 [US5] In `frontend/src/components/event/InputGraphCanvas.tsx`: when connecting a stereo Source's second port and its first port's cable already carries an item, offer a one-click "same cable as the other side" action that fills the second cable's picker with that same item — purely a UI convenience (research.md R6, no schema change); manually picking a different (or no) item remains available.

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T031 [P] Extend `frontend/src/components/print/printSheets.test.tsx`: fixtures for an input-side sheet — mic direct-to-channel, a stagebox hand-off (asserting the cableless hop isn't flagged as a gap), a double-patched Source's two independent paths, and a Channel with nothing feeding it flagged as a gap.
- [ ] T032 Run `gofmt -w`, `go vet ./...`, `golangci-lint run` (backend) and `tsc -p tsconfig.app.json --noEmit`, `eslint .` (frontend) from their respective directories; fix any findings.
- [ ] T033 Run the full test suite (`go test ./...` in `backend/`, `npx vitest run` in `frontend/`) and the frontend build (`npm run build`); confirm all green.
- [ ] T034 Manually verify `specs/012-input-signal-graph/quickstart.md` end-to-end on a **copy** of the dev database (never the live file, fresh binary on a scratch port) — this project's standing DB-safety rule. Confirm SC-005 (existing input rows convert losslessly) against the real reference event's actual, already-built Audio Input rows, checking the migration report for any disclosed legacy free-text drops.
- [ ] T035 Update `README.md`: replace the flat Audio Inputs table description with the graph — Sources, Channels, Devices, Stageboxes/Stage-Multis, cabling, color inheritance, and the new `input-sources`/`input-channels`/`input-devices`/`input-cables` endpoints.
- [ ] T036 Update `ROADMAP.md`: add a Slice 12 entry marked done with today's date and checked bullets, following the format already used for Slices 6–11.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. T003/T004 (migration 030) can be drafted alongside T001/T002, though its down-migration is easiest to finalize once T001's dropped-column list is settled.
- **Foundational (Phase 2)**: Depends on Setup (T001 must exist before T007's conversion can be tested against the migrated schema; T003 must exist before T009 can sequence it). Internally: T005 (domain types) before T006 (db layer) before T007 (migration) before T008 (test) before T009 (wiring); T010 (rental) can proceed once T006 exists; T012/T013 depend on T006.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on US1 (T018's `ChannelSection.tsx` and T021's `AudioInputsTab.tsx` must exist first — T024 verifies/adjusts them).
- **User Story 3 (Phase 5)**: Depends on US1 (T017's `SourceSection.tsx` must exist first).
- **User Story 4 (Phase 6)**: Depends on US1 (extends T016/T020/T017/T018's files with color).
- **User Story 5 (Phase 7)**: Depends on US1 (extends T020's canvas).
- **Polish (Phase 8)**: Depends on all five user stories being complete.

### Within Each User Story

- Tests (T014, T023, T025, T027, T029) are written first and should fail before their corresponding implementation tasks land.
- Within US1: types (T015) before pure helpers (T016) before components (T017-T021) before the print sheet (T022).
- US2/US3/US4/US5 each extend files US1 already created — sequence US1's relevant task before each (noted per phase above), same precedent as Slice 11's US2 extending US1's canvas file.

### Parallel Opportunities

- T002/T003/T004 marked [P] — different files from T001 and each other.
- T008 (migration test) is marked [P] against T009 (runMigrations wiring) — different files, though it depends on T007 existing.
- T011 (rental test) can proceed in parallel with T012/T013 once T010 exists.
- Within US1: T014 (test) in parallel with T015 (types); T016 (pure helpers) in parallel with T015; T017/T018/T019 (three independent section components) in parallel with each other once T015/T016 land.
- US2 (T023/T024), US3 (T025/T026), US4 (T027/T028), and US5 (T029/T030) can all proceed in parallel with each other once US1 is complete — each touches a distinct concern, though T028/T030 do land in the same `InputGraphCanvas.tsx`/`inputGraph.ts` files US4/US5 share, so sequence those two phases relative to each other if worked by the same person.

---

## Parallel Example: User Story 1

```bash
# Test and independent frontend pieces together:
Task: "Graph round-trip + double-patch/validation test in backend/internal/api/input_cables_test.go"
Task: "Add InputSource/InputChannel/InputDevice/InputCable types to frontend/src/types/index.ts"
Task: "Create frontend/src/lib/inputGraph.ts (derived ports, connectivity rules, cableless-edge predicate)"

# Once types/helpers land, the three management sections in parallel:
Task: "Create frontend/src/components/event/SourceSection.tsx"
Task: "Create frontend/src/components/event/ChannelSection.tsx"
Task: "Create frontend/src/components/event/InputDeviceSection.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) — the larger of the
   two by a wide margin, since this feature's migration correctness
   against the user's real, already-built input list matters more than
   anything else in this slice.
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: run quickstart.md sections 1–2 (lossless
   migration of the real reference event, patching a rig from scratch,
   including a double-patch) against a DB copy — never the live file.
4. This alone replaces the flat table with the graph and closes the core
   "can't express one source feeding two channels" gap — channel/source
   independence polish (US2/US3), color (US4), and the splitter
   convenience (US5) can ship in the same slice's next commits without
   blocking a demo.

### Incremental Delivery

1. Setup + Foundational → migration verified against real data, full
   backend graph support; nothing user-visible yet.
2. + US1 → the graph usable end-to-end via the tab and print sheet,
   including double-patching (MVP).
3. + US2 → Channel metadata confirmed fully independent of wiring.
4. + US3 → Source kind-conditional fields confirmed correct.
5. + US4 → color traces every signal path automatically.
6. + US5 → stereo splitter cabling billed once, with a one-click
   convenience action.
7. + Polish → lint/test/build green, quickstart verified on the real
   reference event's actual input list, docs and roadmap updated.

---

## Notes

- [P] tasks touch different files with no ordering dependency.
- [Story] labels map every Phase 3+ task to US1–US5 for traceability back
  to spec.md.
- Never run verification against the live dev database — copy it first
  (standing project rule, restated with extra emphasis in T034 given this
  feature's migration touches data that predates even Slice 11).
- Commit after each phase checkpoint, consistent with this project's
  per-slice `/speckit-git-commit` cadence.
