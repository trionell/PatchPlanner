## 1. Data model and migration

- [ ] 1.1 Add a migration pair adding `stage_multis.hide_from_output_graph BOOLEAN NOT NULL DEFAULT 1`, following the `027_output_graph_positions` / `031_input_graph_positions` pattern (`backend/migrations/`).
- [ ] 1.2 Add `HideFromOutputGraph bool` (`json:"hide_from_output_graph"`) to `domain.StageMulti` (`backend/internal/domain/audio.go`).
- [ ] 1.3 Update `scanStageMulti` and the `CreateStageMulti`/`UpdateStageMulti` column lists and statements to read/write the new column (`backend/internal/db/audio_patch.go`).

## 2. Backend graph builder

- [ ] 2.1 In `passThroughNodes` (`backend/internal/service/audio_graph.go`), on the output branch (`!input`), skip a stage multi whose `HideFromOutputGraph` is true unless it has at least one `output_cables` row referencing it.
- [ ] 2.2 Add a test alongside `TestBuildOutputGraphWalksToTheDestination` in `backend/internal/service/audio_graph_test.go` covering: a hidden, uncabled stage multi is omitted from the output graph; a hidden but cabled stage multi is included; the input graph is unaffected by the flag.

## 3. Frontend types and API

- [ ] 3.1 Add `hide_from_output_graph: boolean` to the `StageMulti` interface (`frontend/src/types/index.ts`).

## 4. Frontend output graph

- [ ] 4.1 Add a pure helper to `frontend/src/lib/outputGraph.ts` that decides whether a stage multi should appear as an output-graph node, given the flag and the output cable list.
- [ ] 4.2 Use that helper in the node-layout `useMemo` in `AudioOutputsTab.tsx` (replacing the unconditional loop that pushes every stage multi as a `processing` node) and in the empty-state check that currently counts `stageMultis.length`.
- [ ] 4.3 Add a test case for the new helper in `frontend/src/lib/outputGraph.test.ts`.
- [ ] 4.4 Confirm `InputGraphCanvas.tsx` is untouched — it must keep listing every stage multi regardless of the flag.

## 5. Stage multi edit form

- [ ] 5.1 Add a checkbox to `StageMultiSection.tsx`'s create/edit form for the new flag, following the `phantom_power` checkbox pattern in `InputFlowInspector.tsx` (label: something like "Show in output flow graph", reflecting the flag inverted for display since the field itself is a "hide" flag).
- [ ] 5.2 Confirm the search/palette and Rig drawer/summary in `AudioOutputsTab.tsx` still enumerate every stage multi unconditionally (no change expected — verify only).

## 6. Validation

- [ ] 6.1 Run the backend gates: `cd backend && gofmt -l . && go vet ./... && go test ./...`.
- [ ] 6.2 Run the frontend gates: `cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build`.
- [ ] 6.3 Manually verify against a copy of real data (`PATCHPLANNER_DB` pointed at a `/tmp` copy, never the tracked `backend/patchplanner.db`): an existing stage multi with no output cabling disappears from the output flow graph and the exported PDF's output graph section; one with output cabling stays visible in both.
