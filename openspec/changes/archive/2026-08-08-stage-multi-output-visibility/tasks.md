## 1. Data model and migration

- [x] 1.1 Add a migration pair adding `stage_multis.show_in_output_graph BOOLEAN NOT NULL DEFAULT 0`, following the `027_output_graph_positions` / `031_input_graph_positions` pattern (`backend/migrations/`). (Field renamed from the planned `hide_from_output_graph` during implementation — see design.md's Decisions for why: Go's bool zero value has to line up with the intended default.)
- [x] 1.2 Add `ShowInOutputGraph bool` (`json:"show_in_output_graph"`) to `domain.StageMulti` (`backend/internal/domain/audio.go`).
- [x] 1.3 Update `scanStageMulti` and the `CreateStageMulti`/`UpdateStageMulti` column lists and statements to read/write the new column (`backend/internal/db/audio_patch.go`).

## 2. Backend graph builder

- [x] 2.1 In `passThroughNodes` (`backend/internal/service/audio_graph.go`), on the output branch (`!input`), skip a stage multi whose `ShowInOutputGraph` is false unless it has at least one `output_cables` row referencing it.
- [x] 2.2 Add a test alongside `TestBuildOutputGraphWalksToTheDestination` in `backend/internal/service/audio_graph_test.go` covering: a hidden, uncabled stage multi is omitted from the output graph; a hidden but cabled stage multi is included; the input graph is unaffected by the flag.

## 3. Frontend types and API

- [x] 3.1 Add `show_in_output_graph: boolean` to the `StageMulti` interface (`frontend/src/types/index.ts`).

## 4. Frontend output graph

- [x] 4.1 Add a pure helper to `frontend/src/lib/outputGraph.ts` that decides whether a stage multi should appear as an output-graph node, given the flag and the output cable list.
- [x] 4.2 Use that helper in the node-layout `useMemo` in `AudioOutputsTab.tsx` (replacing the unconditional loop that pushes every stage multi as a `processing` node) and in the empty-state check that currently counts `stageMultis.length`.
- [x] 4.3 Add a test case for the new helper in `frontend/src/lib/outputGraph.test.ts`.
- [x] 4.4 Confirm `InputGraphCanvas.tsx` is untouched — it must keep listing every stage multi regardless of the flag.

## 5. Stage multi edit form

- [x] 5.1 Add a checkbox to `StageMultiSection.tsx`'s create/edit form for the new flag, following the `phantom_power` checkbox pattern in `InputFlowInspector.tsx` (label "Output graph", checkbox reads "shown"/"hidden" directly off `show_in_output_graph` — no inversion needed once the field was renamed).
- [x] 5.2 Confirm the search/palette and Rig drawer/summary in `AudioOutputsTab.tsx` still enumerate every stage multi unconditionally (no change expected — verify only).

## 6. Validation

- [x] 6.1 Run the backend gates: `cd backend && gofmt -l . && go vet ./... && go test ./...`.
- [x] 6.2 Run the frontend gates: `cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build`.
- [x] 6.3 Manually verify against a copy of real data (`PATCHPLANNER_DB` pointed at a `/tmp` copy, never the tracked `backend/patchplanner.db`): the real database had no existing stage multis to check against, so verification instead exercised the actual `db.CreateStageMulti` API path against the copy — confirming a create that omits the field defaults to hidden (this caught the zero-value bug fixed in task 1.1-1.2's rename), and that a cabled multi still appears in both the output graph and the input graph.
