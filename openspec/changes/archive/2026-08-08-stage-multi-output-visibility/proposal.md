## Why

Stage multis are an input-only concept that connector adapters also let run in reverse to
carry outputs. Because that reverse use exists, every stage multi is shown unconditionally in
both the audio input and audio output flow graphs today — including the common case where a
multi is never used for output at all. That makes the output flow graph noisier than the rig
it describes. A per-multi flag lets a planner keep the output graph limited to the multis that
actually matter there.

## What Changes

- Add a boolean field to the stage multi record controlling whether it is shown in the audio
  output flow graph. **BREAKING**: the field defaults to hidden, so every existing stage multi
  stops appearing in output flow graphs (interactive canvas and exported PDF) the moment this
  ships, unless a planner opts a multi back in or it is cabled for output.
- A stage multi that has a real `output_cables` connection (the connector-adapter/reverse-
  direction use) is shown in the output flow graph regardless of the flag, so an existing cable
  never becomes a dangling edge.
- The flag has no effect anywhere else a stage multi appears: the input flow graph, the Rig
  drawer/summary, and the output tab's search/palette all continue to list every stage multi
  unconditionally.
- Add a checkbox to the stage multi edit form (following the existing `phantom_power` checkbox
  pattern) so a planner can set the flag.

## Capabilities

### New Capabilities
- `stage-multi-output-visibility`: the per-stage-multi flag that controls whether a multi
  appears in the interactive audio output flow graph, its default, and the cabled-multi
  override.

### Modified Capabilities
- `audio-document-export`: the output graph section of the exported PDF must omit a
  stage multi hidden by the new flag, with the same cabled-multi override as the interactive
  graph, so the document and the canvas never disagree.

## Impact

- Domain: `backend/internal/domain/audio.go` — new field on `StageMulti`.
- DB: a new migration pair adding one column to `stage_multis` (`backend/migrations/`).
- DB access: `backend/internal/db/audio_patch.go` — `scanStageMulti` and the create/update
  statements.
- API: `backend/internal/api/audio_patch.go` — `createStageMulti`/`updateStageMulti` already
  decode the full struct, so no new plumbing is expected there.
- Backend PDF/graph builder: `backend/internal/service/audio_graph.go` —
  `passThroughNodes`/`buildOutputGraph` must apply the flag and the cabled override; the input
  graph builder is untouched.
- Frontend types: `frontend/src/types/index.ts` — `StageMulti` interface.
- Frontend output canvas: `frontend/src/components/event/AudioOutputsTab.tsx` — the node-layout
  logic that places stage multis on the canvas.
- Frontend input canvas: `frontend/src/components/event/InputGraphCanvas.tsx` — unaffected,
  confirmed by a test/scenario, not just left alone by omission.
- Frontend edit form: `frontend/src/components/event/StageMultiSection.tsx` — new checkbox.
- Tests: `backend/internal/service/audio_graph_test.go`, and a new or extended pure-function
  test under `frontend/src/lib/` if the visibility decision is factored out for unit testing.
