---

description: "Task list for slice 11 — audio output signal-flow graph"
---

# Tasks: Audio Output Signal-Flow Graph

**Input**: Design documents from `/specs/011-output-signal-graph/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/output-graph-api.md, quickstart.md

**Tests**: Included, per the constitution's "pragmatic testing" standard and the pattern established in slices 6/8/9/10.

**Organization**: Tasks are grouped by user story (US1 build/rearrange the graph, US2 stage-multi independence, US3 signal flow/print) on top of a large Foundational phase — this slice's core risk (converting the user's real, already-built Slice 10 chains) and its core simplification (flat rental counting replacing width-based doubling) both have to be correct before any user story is meaningful, so neither is deferrable the way some Foundational work has been in earlier slices.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3
- File paths are exact and relative to the repository root.

## Path Conventions

Web app per plan.md: `backend/` (Go) and `frontend/` (React/TS). The canvas
lands in the *existing* `frontend/src/components/event/AudioOutputsTab.tsx`
(rewritten in place, same as Slice 10 did to this same file) rather than a
new component file, to avoid unnecessary churn in
`frontend/src/pages/EventDetail.tsx`'s single import site.

---

## Phase 1: Setup

- [ ] T001 Create `backend/migrations/025_output_graph.up.sql`: `ALTER TABLE output_devices` adding `input_port_count INTEGER NOT NULL DEFAULT 0`, `input_connector_type TEXT`, `output_port_count INTEGER NOT NULL DEFAULT 0`, `output_connector_type TEXT`, `position_x REAL NOT NULL DEFAULT 0`, `position_y REAL NOT NULL DEFAULT 0`; then `CREATE TABLE output_cables` per data-model.md (`id`, `event_id` FK cascade, `from_kind TEXT NOT NULL`, `from_id INTEGER NOT NULL`, `from_port INTEGER NOT NULL`, `to_kind TEXT NOT NULL`, `to_id INTEGER NOT NULL`, `to_port INTEGER NOT NULL`, `cable_item_id INTEGER REFERENCES inventory_items(id)`, plus `UNIQUE(from_kind, from_id, from_port)` and `UNIQUE(to_kind, to_id, to_port)`). Does **not** touch `output_chain_hops` — that stays intact for T005's conversion to read.
- [ ] T002 [P] Create `backend/migrations/025_output_graph.down.sql`: drop `output_cables`; reverse the `output_devices` column additions (SQLite `ALTER TABLE ... DROP COLUMN`, one statement per column — none of the six new columns carry a CHECK constraint, so this doesn't need the table-rebuild dance migration 023 needed).
- [ ] T003 [P] Create `backend/migrations/026_drop_output_chain_hops.up.sql`: `DROP TABLE output_chain_hops`. Kept as its own migration file, applied only after T005's conversion has run and cleared it (research.md R5 step 5 / data-model.md's "Superseded" note) — never applied standalone against un-converted data (T005's `runMigrations` wiring in T009 guarantees the ordering).
- [ ] T004 [P] Create `backend/migrations/026_drop_output_chain_hops.down.sql`: best-effort — recreate the `output_chain_hops` table shape (structure only; historical row data is not recoverable, same convention as every other lossy down-migration in this project).

**Checkpoint**: Schema migrations exist and are internally consistent. Not yet wired into any Go code; `output_chain_hops` is untouched until T009's `runMigrations` sequencing lands.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The graph's full data model, the migration that carries forward the user's real existing rig, and the rental-counting simplification. No user story is meaningful — or safe to demo against real data — until all of this is in place.

**⚠️ CRITICAL**: No user story work may begin until this phase is complete.

- [ ] T005 In `backend/internal/domain/audio.go`: extend `OutputDevice` with `InputPortCount int`, `InputConnectorType string`, `OutputPortCount int`, `OutputConnectorType string`, `PositionX float64`, `PositionY float64` (all `json:"..."`, matching data-model.md's field list). Add new `OutputCable` struct (`ID`, `FromKind string`, `FromID int64`, `FromPort int`, `ToKind string`, `ToID int64`, `ToPort int`, `CableItemID *int64`). Remove `Chain []OutputChainHop` from `AudioPatchOutput`; keep `OutputChainHop` itself defined (unexported-adjacent, or in a clearly-labeled "legacy, migration-only" section) since T007 still needs to scan the old shape. Add `var ValidPortFromKinds = []string{"mixer", "stagebox", "stage_multi", "device"}` and `var ValidPortToKinds = []string{"stage_multi", "device"}` alongside the existing `ValidHopKinds`/etc. (those become unused once T008 removes the hop-validation code — leave removal to T008, not this task). Run `gofmt -w`.
- [ ] T006 In `backend/internal/db/audio_patch.go`: extend `output_devices` scanning/CRUD (columns list, scanner, INSERT/UPDATE) with the six new fields. Remove `listOutputChainHops`/`replaceOutputChainHops`/`scanOutputChainHop` and the `Chain` population in `ListAudioPatchOutputs`/`GetAudioPatchOutput`/`CreateAudioPatchOutput`/`UpdateAudioPatchOutput` (T007 owns the one remaining legitimate reader of `output_chain_hops`). Add full `output_cables` CRUD: `ListOutputCables(db, eventID)`, `CreateOutputCable`, `UpdateOutputCable` (only ever changes `cable_item_id`), `DeleteOutputCable`. Add derived-port-count helpers per data-model.md: `mixerPortCount(width string) int` (1 or 2), and lookups for a stagebox's `output_count`, a stage multi's `channels`, a device's `input_port_count`/`output_port_count` — these back T008's validation and T010's rental CTE bounds reasoning (not enforced in SQL, per research.md R2/R7).
- [ ] T007 Create `backend/internal/db/output_graph_migration.go`: `convertOutputChainHopsToGraph(db *sql.DB) error` implementing research.md R5's algorithm exactly: guarded by `SELECT name FROM sqlite_master WHERE type='table' AND name='output_chain_hops'` (no-op if the table doesn't exist — already converted-and-dropped, or a fresh install past 026) and `SELECT DISTINCT output_id FROM output_chain_hops` (no-op if empty). For each output row still holding hops: walk them in `position` order once per physical side (side A always; side B too when `width='stereo'`), converting `hop_kind='route'`→stagebox into a dropped link + cursor reset (no cable), `hop_kind='route'`→stage-multi into a cable with `cable_item_id` forced `NULL`, and `hop_kind='device'` into a reused (`device_source='shared'`) or one-off new `output_devices` row plus a cable (`cable_item_id` on side A; `cable_item_id_b` falling back to `cable_item_id` on side B). After all sides for an output are converted, `DELETE FROM output_chain_hops WHERE output_id = ?` in the **same transaction** as that output's inserts — this is what makes the whole function safely re-run after a crash (already-cleared outputs are skipped next time; nothing is ever double-converted). After every output is processed, size every touched device's `input_port_count`/`output_port_count` to the number of distinct cables actually referencing each side (minimum 1 on a side with any connections). Collect and log (via the existing `log/slog` logger already used in `cmd/main.go`) every dropped stagebox-terminal link and every FR-013 cable-drop, per research.md R5 step 5.
- [ ] T008 [P] Create `backend/internal/db/output_graph_migration_test.go`: replay the conversion (via `openMigratedTo(t, 25)` + seeding raw `output_chain_hops` rows + calling `convertOutputChainHopsToGraph` directly) against every hop shape quickstart.md's "Automated coverage" section lists: (a) a plain linear mono device chain (shared device followed by a one-off inventory device) — asserts the right cable sequence and that the shared device's ports size to what's actually used; (b) a route-to-stagebox as the terminal hop — asserts no cable is created and the mixer port stays unconnected; (c) a route-to-stagebox mid-chain followed by more device hops — asserts the downstream hops migrate correctly, now sourced from the stagebox; (d) a route-to-stage-multi with an old `cable_item_id` set — asserts a cable is created with `cable_item_id` forced `NULL`; (e) a shared device referenced by two different output rows — asserts one `output_devices` row, two cables, port counts sized to 2; (f) a stereo channel with `cable_item_id_b` set on one hop and unset on another — asserts side B's cable uses `cable_item_id_b` where set and falls back to `cable_item_id` where not. Also assert the function is idempotent (call it twice in a row, second call is a no-op) and that `output_chain_hops` ends up empty (not yet dropped — that's T003, applied afterward by `runMigrations`).
- [ ] T009 In `backend/internal/db/db.go`: rewrite `runMigrations` to sequence T007's conversion correctly (research.md R5 / this phase's checkpoint): check `m.Version()`; if `errors.Is(err, migrate.ErrNilVersion)` or `version < 25`, call `m.Migrate(25)` (never call this when already at 25+, to avoid golang-migrate running migration 026's *down* script on an already-settled database — the guard is load-bearing, not a style choice) then `convertOutputChainHopsToGraph(db)`; finally call `m.Up()` unconditionally to reach the latest version (026+) either way. `migrate.ErrNoChange` is not an error in either branch.
- [ ] T010 In `backend/internal/db/rental.go`: replace every output-related CTE arm with research.md R4's flat per-row counting: `SELECT inventory_item_id, 1, 0 FROM output_devices WHERE event_id = ? AND inventory_item_id IS NOT NULL` and `SELECT cable_item_id, 1, 0 FROM output_cables WHERE event_id = ? AND cable_item_id IS NOT NULL` (the second arm structurally excludes `to_kind='stage_multi'` rows since their `cable_item_id` is always `NULL` by construction — no extra `WHERE` clause needed, per research.md R6). Remove every `CASE WHEN width = 'stereo'` on the output side. Update the placeholder-count doc comment and `GetRentalSummary`'s `db.Query` args to match the new total.
- [ ] T011 [P] In `backend/internal/db/rental_test.go`: add `TestOutputGraphRentalCounting` — two devices wired to represent a stereo channel's independent physical sides (two separate device rows, same catalog item) assert quantity 2; the same catalog item on one shared device referenced by two cables asserts quantity 1; a cable into a stage multi's input side asserts zero rental impact regardless of whether a `cable_item_id` was attempted (rejected at the API layer, but assert the CTE arm itself would exclude a NULL either way); a cable out of a stage multi's output side counts normally.
- [ ] T012 In `backend/internal/db/audio_patch.go`: extend `DeleteStagebox`/`DeleteStageMulti` to `DELETE FROM output_cables WHERE (from_kind = 'stagebox' AND from_id = ?) OR (to_kind = 'stagebox' AND to_id = ?)` (stage multi equivalently for both kinds it can appear as) in the same transaction as the existing clearing logic, replacing Slice 10's column-clearing approach (cables are a real table now, not inline columns — data-model.md's state-transition note). Extend `DeleteOutputDevice` similarly: delete every `output_cables` row referencing it as `from` or `to` before deleting the device row itself — still never blocks (research.md carries forward Slice 10's R4 precedent).
- [ ] T013 In `backend/internal/api/audio_patch.go`: remove the Slice 10 hop/chain validation functions (`validChain`, `validHop`, `validDeviceHop`, `validRouteHop`) and the `chain` decode/persist wiring in `createOutput`/`updateOutput`. Extend `output_devices` validation: port-count/connector-type consistency (data-model.md's rule — a side's connector type is required exactly when that side's port count is `> 0`), and a `409` with the list of affected cables when an update would reduce a port count below the number of cables currently attached to that side (FR-016). Add full `output_cables` handlers (`createOutputCable`, `updateOutputCable`, `deleteOutputCable`) and routes (`POST/PATCH/DELETE /events/{eventID}/output-cables(/{cableID})`) per contracts/output-graph-api.md: `from_kind`/`to_kind` enum validation, event-ownership of `from_id`/`to_id`, port-bounds validation against each resolved node's live port count (T006's helpers), port-uniqueness (`409` — reuse the `UNIQUE` constraints from T001 as the source of truth, mapped to a friendly error), and `cable_item_id` forced-`NULL`-when-`to_kind='stage_multi'` (`400` otherwise, FR-013).

**Checkpoint**: The graph's full backend exists — devices and cables can be created/validated/deleted via the API with correct port/connector/uniqueness rules, the user's real existing rig converts automatically and idempotently on startup, and rental counting is simpler and correct with no width-based doubling anywhere in this feature. No UI yet.

---

## Phase 3: User Story 1 - See and build the rig as a graph (Priority: P1) 🎯 MVP

**Goal**: A tech can place devices with real port counts and connector types, drag them into a layout, draw cables port-to-port with a catalog picker, and see the whole thing reflected correctly in the rental order.

**Independent Test**: Build a rig — mixer → controller → amplifier → two speakers — entirely in the graph, using only newly-created devices (no shared-device reuse yet, that's more central to US2's stage-multi story but already exercised structurally here too) and confirm every device/cable appears once, correctly, on the rental order.

### Tests for User Story 1

- [ ] T014 [P] [US1] Create `backend/internal/api/output_cables_test.go`: full cable round-trip through the real HTTP API — create a device, connect the mixer to it, connect it onward to a second device, assert the response and a `GET /events/{id}/audio-patch` both reflect the graph; assert `400`/`409` on: an out-of-bounds port index, a port already in use, a `to_kind` of `mixer`/`stagebox`, and a non-null `cable_item_id` against a `stage_multi` `to_kind`. Assert `PATCH` changes only `cable_item_id` and leaves the ports untouched.

### Implementation for User Story 1

- [ ] T015 [US1] In `frontend/src/types/index.ts`: replace `AudioPatchOutput`'s removed `chain` field (delete it); extend `OutputDevice` with the six new fields; add the `OutputCable` type; extend `AudioPatchResponse` with `output_cables: OutputCable[]`.
- [ ] T016 [P] [US1] Create `frontend/src/lib/outputGraph.ts` (replaces `frontend/src/lib/outputChain.ts`, deleted in this task): pure functions — `mixerPorts(output)` / `stageboxPorts(stagebox)` / `stageMultiPorts(stageMulti)` / `devicePorts(device)` each returning the derived port list for that node kind (data-model.md); `nodeRole(device)` → `'source' | 'processing' | 'destination'` from its port counts; `isPortConnected(kind, id, portIndex, direction, cables)`; a cable's/port's label helper reusing the existing `"SB {name} ch {n}"` conventions where applicable.
- [ ] T017 [US1] Rewrite `frontend/src/components/event/AudioOutputsTab.tsx`: the canvas — mixer (always present, one node per output channel's ports) and stagebox nodes pinned to a left rail (vertically reorderable only); device nodes with both port sides free-floating in the middle (2D drag, matching the mockup's drag mechanics); device nodes with only input ports pinned to a right rail. SVG layer renders cable paths between jack DOM positions (mockup's bezier-path technique). Dragging from a free (unconnected) port to another free port of the opposite direction opens a cable-item picker (reusing the existing cable-catalog picker component) before the connection commits; canceling leaves nothing created. Keep a toggle to the flat "all resources" table view (spec's explicit ask to keep a basic table alongside the graph).
- [ ] T018 [US1] Extend `frontend/src/components/event/OutputDeviceSection.tsx`: add input/output port-count number inputs and connector-type selects per side (no position field — position is graph-managed via drag, persisted on drag-end, not through this form).
- [ ] T019 [US1] Rewrite `frontend/src/components/print/OutputPatchSheet.tsx`: walk `output_cables` from each mixer port through however many hops until a dead end, rendering the full path per channel (replaces the Slice 10 `chain`-walking version); render both of a stereo channel's independent paths.

**Checkpoint**: User Story 1 is fully functional and testable independently — devices with real ports, drag-to-arrange, port-to-port cabling with a picker, correct rental counting, printed. Stage-multi-specific behavior (US2) and Signal Flow (US3) not yet touched.

---

## Phase 4: User Story 2 - Route a stage multi's channels independently (Priority: P2)

**Goal**: A stage multi's channels each connect independently — different sources, different destinations — with its own built-in wiring never prompting for a cable pick or adding a rental line.

**Independent Test**: Route two different channels of one stage multi from two different sources to two different destinations; confirm the rental order counts the multi itself once (unchanged from today) and adds nothing extra for either channel's input side.

### Tests for User Story 2

- [ ] T020 [P] [US2] In `backend/internal/api/output_cables_test.go` (or a new `backend/internal/api/stage_multi_graph_test.go` if that keeps the file focused): connect two different stage-multi channels from two different sources (one from the mixer, one from a stagebox) to two different destinations through the real HTTP API; assert both `to_kind='stage_multi'` cables are created with `cable_item_id: null` regardless of what's sent in the request body, and that the rental summary shows no line attributable to either of those two cables while the stage multi's own existing line (from `stageboxes`/`stage_multis`' pre-existing rental arm) is unaffected.

### Implementation for User Story 2

- [ ] T021 [US2] In `frontend/src/components/event/AudioOutputsTab.tsx`: render stage-multi nodes in the free-floating middle zone with both their input and output port rows (T016's `stageMultiPorts`); when a drag lands on one of its input ports, skip the cable-item picker entirely and commit the connection immediately with no catalog item (mirrors T017's picker flow but short-circuited for this one target kind, per FR-013).

**Checkpoint**: User Stories 1 AND 2 both work independently. Stage multis behave as real multi-source, multi-destination pass-throughs with no phantom cable billing for their own wiring.

---

## Phase 5: User Story 3 - See and print the graph-derived signal flow (Priority: P3)

**Goal**: The Signal Flow tab and output print sheet describe each channel's path by walking the graph, the same way they already do for the input side.

**Independent Test**: Render Signal Flow for an event with a multi-hop, branching graph (built in US1/US2) and confirm every channel's path renders correctly with unconnected ports flagged as gaps.

### Tests for User Story 3

- [ ] T022 [P] [US3] In `frontend/src/lib/signalFlow.test.ts`: replace the Slice 10 `buildOutputChainFlow` tests with graph-walking equivalents — a multi-hop path through two devices, a path with a stage-multi hand-off in the middle (asserting no "gap" is flagged for its cable-less input side, only for a genuinely unconnected port), a stereo channel's two independent paths, and an unconnected port flagged as a gap and folded into `hasGap`.

### Implementation for User Story 3

- [ ] T023 [US3] Rewrite the output-flow half of `frontend/src/lib/signalFlow.ts`: starting from each mixer port, follow `to` → that node's other `from` ports (via T016's port helpers) until a dead end; a port with nothing attached is a gap unless it's a source's *output* side with genuinely nothing downstream (mirrors the existing "no routing = direct, not a gap" input-side rule, data-model.md's derived gap rule) — replaces `buildOutputChainFlow`/`buildOutputChainFlows` entirely.
- [ ] T024 [US3] Update `frontend/src/components/event/SignalFlowTab.tsx`'s output section to consume the rewritten builder — same `Table`/`Hop`/`Arrow` components as before, now walking real graph edges instead of a flat `chain` array.

**Checkpoint**: All three user stories are independently functional. Signal Flow and the print sheet describe the graph faithfully, including stage-multi hand-offs and stereo's two independent sides.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Extend `frontend/src/components/print/printSheets.test.tsx`: fixtures for a multi-hop graph-derived output sheet, a stage-multi hand-off, and a stereo channel's two paths (mirrors the fixture style already used since Slice 9).
- [ ] T026 Run `gofmt -w`, `go vet ./...`, `golangci-lint run` (backend) and `tsc -p tsconfig.app.json --noEmit`, `eslint .` (frontend) from their respective directories; fix any findings. (`tsc -p tsconfig.app.json --noEmit`, not bare `tsc --noEmit` — documented false-positive from Slice 9.)
- [ ] T027 Run the full test suite (`go test ./...` in `backend/`, `npx vitest run` in `frontend/`) and the frontend build (`npm run build`); confirm all green.
- [ ] T028 Manually verify `specs/011-output-signal-graph/quickstart.md` end-to-end on a **copy** of the dev database (never the live file, with a fresh binary on a scratch port) — this project's standing DB-safety rule, restated with extra weight here since this is the first migration verified against data known to exist on the live database (Slice 10's chain editor, actively used). Confirm SC-004 (existing chains convert losslessly, including the two disclosed exceptions being reported rather than silently dropped) against the real reference event's actual "LR amplifier"/"LR splitter" rig.
- [ ] T029 Update `README.md`: replace the Slice 10 chain-editor description with the graph — devices, ports, connector types, the mixer/stagebox/stage-multi roles, cable drawing, and the new `output-cables`/extended `output-devices` endpoints.
- [ ] T030 Update `ROADMAP.md`: mark Slice 11 done with today's date and checked bullets, following the format already used for Slices 6–10.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. T003/T004 (migration 026) can be drafted alongside T001/T002, though its down-migration is easiest to finalize once the up-migration's column list is settled.
- **Foundational (Phase 2)**: Depends on Setup (T001 must exist before T007's conversion can be tested against a migrated schema; T003 must exist before T009 can sequence it). Internally: T005 (domain types) before T006 (db layer) before T007 (migration, needs the domain/db plumbing to write devices/cables) before T008 (test) before T009 (wiring); T010 (rental) can proceed in parallel with T006/T007 once T005 exists; T012/T013 depend on T006.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational only; independently testable from US1 (a stage multi's independent-channel behavior needs no prior UI), though T021 edits the same file US1's T017 already touched — sequence T017 before T021.
- **User Story 3 (Phase 5)**: Depends on Foundational; benefits from US1/US2 existing (more real graph shapes to see traced) but its own files (`signalFlow.ts`, `SignalFlowTab.tsx`) are untouched by either.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests (T014, T020, T022) are written first and should fail before their corresponding implementation tasks land.
- Types before pure helpers before components (T015 → T016 → T017).
- Backend device/cable persistence, validation, and the migration (Foundational) before any UI that depends on it — unlike some earlier slices, this Foundational phase is not optional-to-defer, since T007's conversion has to be correct before *any* user story can be safely demoed against the real reference event.

### Parallel Opportunities

- T002/T003/T004 marked [P] — different files from T001 and each other.
- T008 (migration test) is marked [P] against T009 (runMigrations wiring) — different files, though it does depend on T007 existing.
- T011 (rental test) can proceed in parallel with T012/T013 once T010 exists.
- Within US1: T014 (test) in parallel with T015 (types); T016 (pure helpers) in parallel with T015.
- Within US2: T020 (test) in parallel with nothing else in that phase — T021 is the only implementation task and depends on it existing to verify against.
- US3 can proceed in parallel with US2 once Foundational is done — entirely different files.

---

## Parallel Example: User Story 1

```bash
# Test and independent frontend pieces together:
Task: "Cable round-trip + validation test in backend/internal/api/output_cables_test.go"
Task: "Add OutputCable/extended OutputDevice types to frontend/src/types/index.ts"
Task: "Create frontend/src/lib/outputGraph.ts (derived ports, node role, gap logic)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) — the larger of the
   two by a wide margin, since this slice's migration correctness matters
   more than anything else shipped in this project so far.
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: run quickstart.md sections 1–2 (lossless
   migration of the real reference event, building a rig from scratch)
   against a DB copy — never the live file.
4. This alone replaces the chain editor with the graph and closes the
   core "doesn't show branching or shared equipment" gap — stage-multi
   independence (US2) and Signal Flow/print (US3) can ship in the same
   slice's next commits without blocking a demo.

### Incremental Delivery

1. Setup + Foundational → migration verified against real data, full
   backend graph support, simplified rental counting; nothing user-visible
   yet.
2. + US1 → the graph usable end-to-end via the tab and print sheet (MVP).
3. + US2 → stage multis behave correctly as real pass-through hubs.
4. + US3 → Signal Flow completes the paperwork story for the graph,
   matching what the flat chain already had in Slice 10.
5. + Polish → lint/test/build green, quickstart verified on the real
   reference event's actual rig, docs and roadmap updated.

---

## Notes

- [P] tasks touch different files with no ordering dependency.
- [Story] labels map every Phase 3+ task to US1/US2/US3 for traceability
  back to spec.md.
- Never run verification against the live dev database — copy it first
  (standing project rule, restated with extra emphasis in T028 given this
  slice's migration touches data known to exist for real).
- Commit after each phase checkpoint, consistent with this project's
  per-slice `/speckit-git-commit` cadence.
