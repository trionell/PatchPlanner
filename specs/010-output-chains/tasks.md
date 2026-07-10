---

description: "Task list for slice 10 — output signal chains"
---

# Tasks: Output Signal Chains

**Input**: Design documents from `/specs/010-output-chains/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/output-chains-api.md, quickstart.md

**Tests**: Included, per the constitution's "pragmatic testing" standard (Go `httptest` for API/db, Vitest for non-trivial frontend logic) and the pattern already established in slices 6/8/9.

**Organization**: Tasks are grouped by user story (US1 multi-hop chains, US2 shared devices, US3 signal flow/print) on top of a Foundational phase that lands the full data model, migration, validation, and rental CTE every story depends on. Unlike slice 9, the rental CTE swap is **not** split across stories: removing the old amplifier/speaker/cable arms without the new shared-device arm in place would silently drop already-planned amplifiers from every existing event's rental order (breaks SC-005 mid-story), so all three new CTE arms land together in Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3
- File paths are exact and relative to the repository root.

## Path Conventions

Web app per plan.md: `backend/` (Go) and `frontend/` (React/TS). No new top-level directories.

---

## Phase 1: Setup

- [x] T001 Create `backend/migrations/023_output_chains.up.sql`:
  1. `CREATE TABLE output_devices` and `CREATE TABLE output_chain_hops` exactly per data-model.md (all columns, including the legacy `cable_type`/`cable_length_m` on hops).
  2. `ALTER TABLE output_devices ADD COLUMN migrated_output_id INTEGER` — temporary, used only to pair each one-off migrated shared device with its source row; dropped at the end of this migration.
  3. Convert every existing row's `amplifier_item_id` into a one-off `output_devices` row (name derived from `output_name`/`output_number`, `migrated_output_id` = the source row's id) plus a `hop_kind='device', device_source='shared'` hop at position 0 carrying the row's `cable_item_id`/`cable_type`/`cable_length_m`. One `output_devices` row per source row (never deduplicated across rows — this is what keeps a legacy amplifier single-counted per row exactly as `amplifier_item_id` did, per research.md R3/R6).
  4. Convert every existing row's `speaker_item_id` into a plain (non-shared) `device` hop, `inventory_item_id = speaker_item_id`, at position `1` if an amplifier hop was created for that row in step 3, else position `0`; the legacy cable/cable-text only attaches here if no amplifier hop exists (never to both).
  5. Convert every row with `destination_type IN ('stagebox','stage_multi')` into a `route` hop carrying the old stagebox/stage-multi id+channel (+ `_b` pair), positioned after any amplifier/speaker hops for that row; legacy cable/cable-text attaches here only if neither an amplifier nor a speaker hop exists for that row.
  6. Leftover case: a `destination_type='local'` row with a cable (`cable_item_id` or legacy `cable_type`/`cable_length_m`) but no amplifier and no speaker → a single bare `device` hop at position 0 carrying just the cable, so nothing is silently dropped.
  7. `ALTER TABLE output_devices DROP COLUMN migrated_output_id`.
  8. Rebuild `audio_patch_outputs` (same `PRAGMA defer_foreign_keys = ON` + create-new/copy/drop/rename technique as migration 017 — `destination_type` carries a CHECK constraint, so a direct `DROP COLUMN` is not permitted) keeping only `id, event_id, output_number, output_name, output_type, width, color, notes` and dropping `destination_type, stagebox_id, stagebox_channel, stagebox_id_b, stagebox_channel_b, stage_multi_id, stage_multi_channel, stage_multi_id_b, stage_multi_channel_b, amplifier_item_id, speaker_item_id, cable_item_id, cable_type, cable_length_m`.
  Full column lists and rationale: research.md R6, data-model.md.
- [x] T002 [P] Create `backend/migrations/023_output_chains.down.sql`: rebuild `audio_patch_outputs` with the pre-023 column set (per migration 022's shape), best-effort repopulating `destination_type`/`stagebox_*`/`stage_multi_*` from each output's first `route` hop (default `'local'` if none), `amplifier_item_id` from a `shared`-device hop's underlying `inventory_item_id` if any, `speaker_item_id` from the first plain `inventory` device hop, and `cable_item_id`/`cable_type`/`cable_length_m` from position-0's hop — lossy for chains with more than one device hop or any owned-gear hop (documented as best-effort, matching this project's convention for down-migrations of data-shape changes). Then `DROP TABLE output_chain_hops` and `DROP TABLE output_devices`.

**Checkpoint**: Migration pair exists and is internally consistent. Not yet wired into any Go code.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Full data model, persistence, validation, and rental counting for chains and shared devices — every story's UI is meaningless until an output can actually store, validate, round-trip, and correctly count a chain.

**⚠️ CRITICAL**: No user story work may begin until this phase is complete.

- [x] T003 In `backend/internal/domain/audio.go`: add `OutputDevice` struct (`ID`, `EventID`, `Name`, `InventoryItemID *int64`, `OwnedItemID *int64`) and `OutputChainHop` struct (`ID`, `Position int`, `HopKind string`, `CableItemID *int64`, `CableType string`, `CableLengthM float64`, `DeviceSource string`, `InventoryItemID *int64`, `OwnedItemID *int64`, `OutputDeviceID *int64`, `StageboxID/*B *int64`, `StageboxChannel/*B *int`, `StageMultiID/*B *int64`, `StageMultiChannel/*B *int`) per data-model.md. On `AudioPatchOutput`: remove `DestinationType`, `StageboxID`, `StageboxChannel`, `StageboxIDB`, `StageboxChannelB`, `StageMultiID`, `StageMultiChannel`, `StageMultiIDB`, `StageMultiChannelB`, `AmplifierItemID`, `SpeakerItemID`, `CableItemID`, `CableType`, `CableLengthM`; add `Chain []OutputChainHop \`json:"chain"\``. Add `var ValidHopKinds = []string{"device", "route"}` and `var ValidDeviceSources = []string{"inventory", "owned", "shared"}` alongside the existing `ValidWidths`/etc. Run `gofmt -w`.
- [x] T004 In `backend/internal/db/audio_patch.go`:
  - Rewrite output scanning/CRUD around the trimmed `AudioPatchOutput` columns (drop the removed fields from `audioOutputColumns`/scanner/INSERT/UPDATE).
  - Add hop persistence: `listOutputChainHops(db, outputID) ([]domain.OutputChainHop, error)` and `replaceOutputChainHops(tx, outputID, hops []domain.OutputChainHop) error` (delete all existing hop rows for the output, re-insert the given slice with `position` = slice index — wholesale replace, no partial-hop endpoints, per research.md R5). Wire both into `CreateAudioPatchOutput`/`UpdateAudioPatchOutput` (transactional: write the output row, then replace its hops, single commit) and into whatever lists outputs for `GET /events/{id}/audio-patch` (populate `Chain` per output).
  - Add `output_devices` CRUD: `ListOutputDevices`, `CreateOutputDevice`, `UpdateOutputDevice`, `DeleteOutputDevice` (delete clears `output_device_id`/`device_source` to NULL on every `output_chain_hops` row referencing it, in the same transaction, then deletes the row — mirrors `DeleteStagebox`'s clear-then-delete shape, never blocks, per research.md R4).
  - Extend `DeleteStagebox`/`DeleteStageMulti` to also clear `stagebox_id`/`stagebox_id_b` (or `stage_multi_id`/`stage_multi_id_b`) + channel on any `output_chain_hops` row referencing the deleted stagebox/multi, in the same transaction as the existing `audio_patch_inputs`/`audio_patch_outputs` clearing.
- [x] T005 [P] Create `backend/internal/db/output_chains_migration_test.go`: `TestOutputChainsMigration` using `openMigratedTo(t, 22)` + `execMigrationFileTx(t, database, "023_output_chains.up.sql")`. Seed, before migrating: a `local` row with both amplifier and speaker and a picked cable; a `local` row with only a legacy `cable_type`/`cable_length_m` (no `cable_item_id`, no amp, no speaker); a `stagebox` destination row with side B set and a cable; a `stage_multi` destination row with no cable. After migrating, assert each row's hops match research.md R6 exactly: the amplifier row → one `shared` hop at position 0 (with a matching one-off `output_devices` row) + one plain hop at position 1 for the speaker, cable on hop 0; the legacy-text-only row → one bare device hop carrying the legacy `cable_type`/`cable_length_m`; the stagebox row → one `route` hop with side A+B and its cable; the stage_multi row → one `route` hop, no cable.
- [x] T006 In `backend/internal/api/audio_patch.go`:
  - Add `validHopKind`, `validDeviceSource` (Go-validated enum checks, 400 on any other value, mirroring `validWidth`).
  - Add chain validation: for each hop, exactly one of `inventory_item_id`/`owned_item_id`/`output_device_id` may be set when `hop_kind = "device"` (more than one → 400; `device_source`, if present, must match whichever is set); `stagebox_id`/`stage_multi_id` mutually exclusive when `hop_kind = "route"` (same rule independently for the `_b` pair); every referenced id must belong to the event (reuse `itemBelongsToEvent`/`validItemRef`/the `validSideBRefs` pattern, extended to also validate `output_device_id`).
  - Rewrite `createOutput`/`updateOutput` to decode and validate the `chain` array (rejecting the whole request on any hop's 400, previous chain left untouched on update) and persist it via T004's `replaceOutputChainHops`.
  - Add `createOutputDevice`/`updateOutputDevice`/`deleteOutputDevice` handlers (name required non-empty, exactly one of `inventory_item_id`/`owned_item_id` set, referenced item must exist) and register `POST/PATCH/DELETE /events/{eventID}/output-devices(/{deviceID})` in `Register`. Extend `getAudioPatch`'s response to include `output_devices`.
- [x] T007 In `backend/internal/db/rental.go`: replace the three existing output arms (`amplifier_item_id`, `speaker_item_id`, output `cable_item_id`) with the three arms from research.md R7: non-shared device hops (`h.inventory_item_id`, doubles on `o.width = 'stereo'`), hop cables (`h.cable_item_id`, doubles on stereo, covers both hop kinds), and shared devices (`output_devices.inventory_item_id`, flat `1`, no join through hops — counted once per declaration regardless of reference count). Total placeholder count in `GetRentalSummary`'s `db.Query` call stays 13 (three removed, three added).
- [x] T008 [P] In `backend/internal/db/rental_test.go`: add `TestOutputChainRentalDoubling` — a stereo output with a plain (non-shared) device hop + cable (expect both ×2) and a shared-device hop referenced by that same channel (expect ×1); a mono equivalent (expect ×1 throughout). Add `TestOutputDeviceSharedAcrossChannels` — one declared shared device referenced by three different outputs' hops, assert the rental summary counts it exactly once (SC-002). Extend `output_chains_migration_test.go` (T005) or add here: after migrating a copy of pre-023 rows, assert `GetRentalSummary` totals are identical before/after the migration for a fixed seed dataset (SC-005) — this is the first point in the phase plan where the CTE exists, so it's the right place for this specific assertion despite the migration itself landing in T001/T005.

**Checkpoint**: Outputs support full chains (any hop kind/device source) end-to-end via the API, with correct validation, correct rental counting (including shared-device dedup and stereo doubling), and existing events' rental totals unchanged post-migration. No UI yet — Foundation ready.

---

## Phase 3: User Story 1 - Document a full multi-hop output chain (Priority: P1) 🎯 MVP

**Goal**: A tech can build, reorder, and trim an arbitrary-length chain of hops (route + device, inventory or owned-gear picks) on any output channel, with every device and cable in it landing on the rental order and the print sheet — closing the "only start and end are visible" gap.

**Independent Test**: Build a 5+ hop chain on one output channel using only inventory/owned-gear device picks (no shared devices yet — that's US2) and confirm every device/cable appears once, correctly, on the rental order and the output print sheet.

### Tests for User Story 1

- [x] T009 [P] [US1] In `backend/internal/api/audio_patch_test.go`: add a full chain round-trip test — `POST` an output with a 5-hop chain (route hop with side B, two plain device hops with cables, one bare device hop, one cable-only hop), `PATCH` to reorder and remove the middle hop, verify the response's `chain` reflects the new order with reassigned positions. Assert 400 on: two device FKs set on one hop, `hop_kind` outside `ValidHopKinds`, a route hop's `stagebox_id` belonging to another event — and that the previous chain is untouched after a rejected update.

### Implementation for User Story 1

- [x] T010 [US1] In `frontend/src/types/index.ts`: replace the removed `AudioPatchOutput` fields with `chain: OutputChainHop[]`; add the `OutputChainHop` type (mirrors the Go struct — `hop_kind`, `cable_item_id?`, `cable_type?`, `cable_length_m?`, `device_source?`, `inventory_item_id?`, `owned_item_id?`, `output_device_id?`, `stagebox_id?`/`_b`, `stagebox_channel?`/`_b`, `stage_multi_id?`/`_b`, `stage_multi_channel?`/`_b`).
- [x] T011 [P] [US1] Create `frontend/src/lib/outputChain.ts`: `hopLabel(hop, context)` (device name or route label, e.g. `"SB FOH Rack ch 5"` reusing the existing stagebox/multi label formatting) and `isHopGap(hop)` (a device hop is a gap when no source is set; a route hop is a gap when neither stagebox nor stage-multi is set; a hop's cable is never itself a gap, matching how a missing non-DI cable already isn't one on the input side) per data-model.md's "Chain completeness" section — pure functions, no React, mirrors `channelWidth.ts`'s role from Slice 9.
- [x] T012 [US1] Rewrite `frontend/src/components/event/AudioOutputsTab.tsx`: replace the flat destination/amplifier/speaker/cable row with a chain editor — an ordered list of hop rows per output, each with a hop-kind toggle (device/route), the appropriate pickers (route: stagebox/stage-multi + channel, with side B shown only when the channel is stereo, reusing the existing stagebox/multi picker components; device: inventory-item or owned-gear item picker, per `device_source` — no "shared" option yet, that's US2/T016) and a cable picker, plus add/remove/reorder controls. Persist the whole `chain` array on every change (wholesale replace, matching the existing draft-then-persist idiom already used elsewhere in this file).
- [x] T013 [US1] In `frontend/src/components/print/OutputPatchSheet.tsx`: render the full `chain` per channel (hop-by-hop, using `hopLabel`) instead of the old single destination/amplifier/speaker line; render both sides of a stereo route hop, matching the existing side-B rendering pattern already used for inputs.

**Checkpoint**: User Story 1 is fully functional and testable independently — arbitrary-length chains, correct ordering/removal, correct rental counting, printed. Shared-device reuse (US2) and Signal Flow (US3) not yet touched.

---

## Phase 4: User Story 2 - Reuse a shared device across several output channels (Priority: P2)

**Goal**: A tech declares a device once per event and references that same instance from any number of output channels' chains, with the rental order counting it exactly once regardless of reference count — closing the fan-out gap named in the field feedback.

**Independent Test**: Declare one shared device, reference it from three different output channels' chains, and confirm the rental order counts it exactly once.

### Tests for User Story 2

- [x] T014 [P] [US2] In `backend/internal/api/audio_patch_test.go` (or a new `backend/internal/api/output_devices_test.go` if that keeps the existing file focused): shared-device CRUD round-trip (create, list via `getAudioPatch`, update, 400 on both-or-neither of `inventory_item_id`/`owned_item_id`); create three outputs whose chains each reference the same declared device, call the rental-summary endpoint, assert quantity 1 (SC-002, API-level end-to-end version of T008's unit test); delete the shared device, re-fetch all three outputs, assert every referencing hop now has `device_source`/`output_device_id` cleared and is flagged as a gap (not blocked — matches research.md R4).

### Implementation for User Story 2

- [x] T015 [US2] Create `frontend/src/components/event/OutputDeviceSection.tsx`: a small manager (create/rename/delete a shared device: name + inventory-or-owned item picker) following the exact shape of `StageboxMultiSection.tsx`/`BusSection.tsx`; mount it on the Audio Outputs tab above the chain table.
- [x] T016 [US2] In `frontend/src/components/event/AudioOutputsTab.tsx`: extend the device-hop picker from T012 with a third `device_source` option, "shared device" (select from `OutputDeviceSection`'s declared list instead of picking a catalog/owned item directly).

**Checkpoint**: User Stories 1 AND 2 both work independently. Shared devices declare once, reused across channels, correctly single-counted, deletion clears references without blocking.

---

## Phase 5: User Story 3 - See and print the full chain (Priority: P3)

**Goal**: The Signal Flow tab traces every output channel's full chain (mirroring the existing input-side presentation), flagging any hop missing its device pick (or route, for route hops) as a gap.

**Independent Test**: Render Signal Flow for an event with multi-hop and stereo output chains; confirm every hop renders in order with incomplete hops flagged.

### Tests for User Story 3

- [x] T017 [P] [US3] In `frontend/src/lib/signalFlow.test.ts`: assert a new `buildOutputChainFlow` (or equivalent) returns one `FlowHop` per chain hop in order, a device hop's label resolved via the appropriate item/shared-device name map, a route hop's label matching the existing stagebox/multi label format (with a second hop-equivalent when stereo side B is set), and `missing: true` folded into `hasGap` for any hop `isHopGap` (T011) flags.

### Implementation for User Story 3

- [x] T018 [US3] In `frontend/src/lib/signalFlow.ts`: add the output-chain flow builder from T017 (reuses `pathHop`'s missing/present logic against each hop's route fields; a device hop resolves its label from inventory/owned/shared-device name maps passed in via an extended `FlowContext`).
- [x] T019 [US3] In `frontend/src/components/event/SignalFlowTab.tsx`: add an output-channels section below the existing input-channels table (same `Table`/`Hop`/`Arrow` components), one row per output channel rendering its full chain in order; fold output gaps into the existing gap count/banner.

**Checkpoint**: All three user stories are independently functional. Signal Flow covers both inputs and output chains end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T020 [P] Extend `frontend/src/components/print/printSheets.test.tsx`: add fixtures for a multi-hop output chain, a shared-device hop, and a stereo route hop with independent sides; assert each renders (mirrors the fixture style already used for the input-side stereo/DI tests from slice 9).
- [x] T021 Run `gofmt -w`, `go vet ./...`, `golangci-lint run` (backend) and `tsc -p tsconfig.app.json --noEmit`, `eslint .` (frontend) from their respective directories; fix any findings. (Use `tsc -p tsconfig.app.json --noEmit`, not bare `tsc --noEmit` — the root `tsconfig.json` is solution-style and silently no-ops without `-b`, a false-positive discovered during slice 9.)
- [x] T022 Run the full test suite (`go test ./...` in `backend/`, `npx vitest run` in `frontend/`) and the frontend build (`npm run build`); confirm all green.
- [x] T023 Manually verify `specs/010-output-chains/quickstart.md` end-to-end on a **copy** of the dev database (never the live file) with a fresh binary on a scratch port, per this project's standing DB-safety rule; confirm SC-005 (pre-existing output rows' rental totals unchanged) against the real reference event's data.
- [x] T024 Update `README.md`: document the chain editor, shared-device manager, and the new `output-devices` endpoints; replace the old destination/amplifier/speaker/cable column description with the chain shape.
- [x] T025 Update `ROADMAP.md`: mark Slice 10 done with today's date and checked bullets, following the exact format used for Slices 6–9; update the dependency graph (this was the last remaining slice).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001 must exist before T005 can replay it) — BLOCKS all user stories. T003 → T004 → T006 (domain before persistence before API); T007 (rental CTE) can proceed in parallel with T004/T006 once T003 exists, but T008's tests need T007 done.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational only; independently testable from US1 (a shared device referenced from freshly created chains needs no prior UI), though T016 edits the same file US1's T012 already touched — sequence T012 before T016.
- **User Story 3 (Phase 5)**: Depends on Foundational; benefits from US1/US2 existing (more hop shapes to see rendered) but its own files (`signalFlow.ts`, `SignalFlowTab.tsx`) are untouched by either.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests (T009, T014, T017) are written first and should fail before their corresponding implementation tasks land, except where noted (T008's SC-005/dedup assertions necessarily follow T007 in the same Foundational phase — see the phase intro on why the CTE isn't split by story here).
- Types before pure helpers before components (T010 → T011 → T012).
- Backend chain/device persistence and validation (Foundational) before any UI that depends on it.

### Parallel Opportunities

- T001/T002 (migration up/down) can be drafted together, though down is easiest to finalize once up is final.
- T005 (migration test) is marked [P] against T003/T004/T006 — different files, though it does depend on T001 existing.
- T007 (rental CTE) can proceed in parallel with T004/T006 once T003's types exist; T008 depends on T007.
- Within US1: T009 (test) and T010/T011 (types/helpers) in parallel; T012 depends on T010/T011.
- Within US2: T014 (test) in parallel with T015 (manager component); T016 depends on both T012 (US1) and T015.
- US3 can proceed in parallel with US2 once Foundational is done — entirely different files.

---

## Parallel Example: User Story 1

```bash
# Test and independent frontend pieces together:
Task: "Chain round-trip + validation test in backend/internal/api/audio_patch_test.go"
Task: "Add chain/OutputChainHop types to frontend/src/types/index.ts"
Task: "Create frontend/src/lib/outputChain.ts (hopLabel, isHopGap)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) — the larger of the two, since this slice's data model is the deepest change on the roadmap.
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: run quickstart.md sections 1–2 (lossless migration, multi-hop chain) against a DB copy.
4. This alone closes the core "only start and end are visible" gap — shared-device reuse (US2) and Signal Flow/print polish (US3) can ship in the same slice's next commits without blocking a demo.

### Incremental Delivery

1. Setup + Foundational → migration, full backend chain/device support, and correct rental counting exist; nothing user-visible yet.
2. + US1 → chains usable end-to-end via the tab and print sheet (MVP).
3. + US2 → shared-device declare-once/reference-many closes the fan-out gap (SC-002).
4. + US3 → Signal Flow completes the paperwork story for outputs, matching what inputs already had (SC-004).
5. + Polish → lint/test/build green, quickstart verified on real data, docs and roadmap updated. This is also the **last slice on the roadmap**.

---

## Notes

- [P] tasks touch different files with no ordering dependency.
- [Story] labels map every Phase 3+ task to US1/US2/US3 for traceability back to spec.md.
- Never run verification against the live dev database — copy it first (standing project rule, restated in T023).

## Implementation Notes (post-completion)

- **Found and fixed a real SQLite bug in migration 023's first draft** (T001):
  with foreign keys enforced, `DROP TABLE audio_patch_outputs` performs an
  implicit `DELETE FROM` on the dropped table first, which cascades through
  `output_chain_hops.output_id`'s `ON DELETE CASCADE` and silently wiped
  every hop already inserted, right before the rename — a Go-driver-only
  symptom (`execMigrationFileTx` enforces FKs; the sqlite3 CLI doesn't by
  default, so a naive manual check looked fine and would have shipped
  broken). Fixed by snapshotting the old columns into a `CREATE TEMP TABLE`
  before the rebuild, then running the conversion (steps 1–5) against the
  snapshot afterward, once nothing referencing the old table remains.
  Caught by T005's migration test failing with 0 hops instead of 2, before
  any implementation task was marked done.
- **Corrected two more spec/data-model claims during implementation**,
  same pattern as the shared-device-deletion fix already made during
  planning: (1) `chain`'s write semantics — the spec draft said "omitted
  means no change, explicit `[]` clears" (borrowing GroupIDs' phrasing),
  but `replaceInputGroups`/`replaceInputDCAs` never actually implement
  that distinction on update (always delete-then-reinsert whatever's in
  the payload) — fixed the domain.go comment and contracts doc to match
  reality. (2) FR-013's gap rule ("missing device *or cable*") would have
  made every migrated row with a cable-less hop suddenly show a gap, and
  contradicts the input side's own precedent (a missing non-DI cable is
  explicitly *not* a gap) — narrowed to "missing device/route only, cable
  is optional" before writing `isHopGap`.
- `int64PtrFromNull`/`intPtrFromNull` (`db/helpers.go`) and `nullFloat`
  were added as the read/write-side inverses of the existing
  `nullInt64`/`nullInt`/`nullString` helpers — `OutputChainHop` has enough
  nullable FK columns (a dozen) that inlining the `Valid`-check per field
  would have been significant repetition beyond what any prior scanner in
  this codebase needed.
- `DeleteStagebox`/`DeleteStageMulti` previously looped over
  `["audio_patch_inputs", "audio_patch_outputs"]` clearing `stagebox_id`/
  `stage_multi_id` — `audio_patch_outputs` no longer has those columns at
  all post-023, so this would have errored at runtime ("no such column")
  the moment a stagebox was deleted. Rewrote both to clear only
  `audio_patch_inputs` directly, plus new clearing of `output_chain_hops`
  (both side A and side B independently).
- The `speaker_cable_types` vocabulary's delete-protection usage map
  (`reference.go`) pointed at `audio_patch_outputs.cable_type` — moved to
  `output_chain_hops.cable_type` (caught by `TestDeleteReferenceValueInUse`
  failing to compile against the new schema, not by design review).
- Migrated pre-existing tests referencing the old flat output shape
  (`rental_test.go` ×2 in `db` and `api`, `inventory_import_test.go`,
  `reference_test.go`) to the new chain shape rather than leaving them
  broken — necessary compile-fix work, not scope creep, since T003/T004
  removed the fields those tests constructed.
- Smoke-verified on a **copy** of the dev DB (scratch port): migration 023
  converted the real reference event's one output row (LR, stereo,
  amplifier + speaker + cable, destination `local`) into exactly 2 hops
  (a one-off shared device wrapping the amplifier + its cable at position
  0, a plain speaker hop at position 1) with rental totals unchanged
  (amp ×1, speaker ×2, cable ×2 — SC-005). Declared a second shared device
  and referenced it from two new IEM outputs on the same event: rental
  summary counted it exactly once despite two references (SC-002). Live
  DB confirmed byte-for-byte untouched (unchanged md5sum/mtime) throughout.
- **Post-completion fix from live user feedback (FR-009a)**: the stereo
  doubling model assumed both physical sides of a hop share one cable
  pick — doesn't hold when an amplifier sits to one side of the stage and
  the near speaker needs a shorter cable than the far one. Added
  `cable_item_id_b`: unset, `cable_item_id` still doubles as before; set,
  the rental CTE's hop-cable arm switches from `×2` to `×1` for that hop
  and a new arm counts `cable_item_id_b` independently (`×1` on stereo,
  never on mono).
  **First attempt edited migration 023 directly** on the assumption that
  nothing from this slice had shipped anywhere yet — wrong: this session
  works directly in the user's repo (no worktree), and the user had their
  own dev backend running throughout, pointed at the same
  `backend/migrations/` directory and their real `patchplanner.db`. It
  auto-applies pending migrations on every startup, so their restart
  (to view the new chain editor UI they were giving feedback on) silently
  applied migration 023 to their **live dev database** — discovered only
  because a fresh-copy smoke test of the edited 023 file failed to
  reproduce `cable_item_id_b` (`schema_migrations` on the live db already
  showed version 23 applied; a migration tool never re-runs an already-
  recorded version, so my in-place edit was invisible to any database
  that had already migrated). Verified the live db's data was undamaged
  (the user had already built a real 5-hop chain plus 2 shared devices
  through the new UI — all intact) and reverted 023 to its original
  shape, adding the column instead via a proper migration 024
  (`ALTER TABLE ... ADD COLUMN`), verified against a copy of the
  now-real live db (version 23 → 24, all existing hops/devices/rental
  totals unchanged). Live DB itself was never written by any of my own
  commands throughout (confirmed via unchanged md5sum before/after every
  copy-based check) — the version-23 write came from the user's own
  server, not from me directly.
  Covered by `TestOutputHopIndependentCablePicks` (default doubling,
  independent picks, same-item-both-sides still sums to 2, and mono
  inertness) plus equivalent frontend/print/signal-flow test additions;
  `output_chains_migration_test.go`'s two 023-only replay tests updated
  to chain 024 afterward. `data-model.md`/`contracts/output-chains-api.md`
  /`spec.md` updated to match; `data-model.md`'s "Chain completeness"
  bullet was also found out of sync with the FR-013 correction made
  earlier in implementation (still said a missing cable was a gap) and
  fixed alongside this change.
- Commit after each phase checkpoint, consistent with this project's per-slice `/speckit-git-commit` cadence.
