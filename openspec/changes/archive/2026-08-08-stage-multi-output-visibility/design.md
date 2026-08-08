## Context

A stage multi is one domain record shared between the input and output flow graphs (it already
carries two independent position pairs, one per graph — see `domain.StageMulti`). Its presence
in a graph is decided independently in three places today: the interactive output canvas
(`AudioOutputsTab.tsx`), the interactive input canvas (`InputGraphCanvas.tsx`, unaffected by
this change), and the backend PDF/graph builder used for the exported document
(`audio_graph.go`'s `passThroughNodes`, shared by both `buildInputGraph` and `buildOutputGraph`).
See proposal.md for why the output side needs to exclude some of these.

## Goals / Non-Goals

**Goals:**
- One flag, one column, one meaning, read the same way by the interactive output canvas and
  the exported PDF's output graph.
- The cabled-override check ("does this stage multi have an output_cables connection") is
  computed the same way on both the frontend and the backend, so the two surfaces cannot
  disagree about whether a given multi is exempt from the flag.

**Non-Goals:**
- No change to how stage multis behave on the input side, in the Rig drawer, or in
  search/palette — only the output flow graph (interactive and exported) is in scope.
- No change to cable validation (`ValidPortFromKinds`/`ValidPortToKinds`) — the flag is
  display-only and never restricts what can be cabled.

## Decisions

- **Field name and shape**: add `ShowInOutputGraph bool` (JSON `show_in_output_graph`) to
  `domain.StageMulti`. The first draft of this decision used a `HideFromOutputGraph` flag
  defaulting to `true`, reasoning that a positive "hide" boolean reads more naturally than a
  negative-of-a-negative "show" one. That was wrong in a way manual verification caught: a
  create request that omits the field (or any Go call site that builds a `domain.StageMulti`
  without setting it — the real HTTP API included, since nothing forces every caller through the
  edit form) gets Go's `bool` zero value, `false`, meaning "not hidden" — the opposite of the
  intended default. Flipping the polarity to `ShowInOutputGraph` makes the zero value (`false`)
  mean exactly the intended default (not shown), so the guarantee holds for every caller without
  a special case, not only the one path the frontend happens to remember to set explicitly.
- **Migration**: one column, `stage_multis.show_in_output_graph BOOLEAN NOT NULL DEFAULT 0`,
  following the single `ALTER TABLE` pattern already used by
  `027_output_graph_positions.up.sql` / `031_input_graph_positions.up.sql`. `DEFAULT 0` covers
  existing rows the same way the Go zero value covers a future insert that omits the column.
- **Cabled-override check, computed independently on each side rather than shared**: the
  frontend already has the output cable list in memory when laying out `AudioOutputsTab`'s
  canvas; the backend already has it in memory when walking `buildOutputGraph`. Rather than
  invent a shared representation, each side computes "is any output_cable's `from`/`to`
  reference this stage multi" locally, using data it already holds. This mirrors how the two
  cable-kind validators (`ValidPortFromKinds` in Go, cable-kind checks in the frontend) already
  exist independently on both sides for the same shape of reason.
- **Frontend extraction**: the visibility decision (`hidden flag AND no output cable
  reference` → omit) is factored out of `AudioOutputsTab.tsx`'s layout `useMemo` into a pure
  function in `frontend/src/lib/outputGraph.ts`, consistent with this project's rule that
  `lib/` holds pure graph/signal-flow logic and is what gets unit-tested. The component keeps
  only the call site.
- **Backend placement**: the same decision is applied inside `passThroughNodes`, guarded by the
  existing `!input` branch, so `buildInputGraph` cannot be affected by a change to this
  function later without an explicit new branch.

## Risks / Trade-offs

- [Existing rigs lose output-graph multis silently on upgrade, since the default flips to
  hidden] → Accepted per proposal.md's explicit **BREAKING** call-out; the cabled-override
  means any multi actually doing something on the output side stays visible, so the only
  multis that disappear are the ones with no output cabling — exactly the redundant case this
  change targets.
- [Frontend and backend computing the cabled-override independently could drift if one side's
  cable-matching logic changes without the other] → Both call sites are named in tasks.md and
  covered by tests on both sides (`audio_graph_test.go` and the new `outputGraph.ts` case), so a
  future change to either one's cable-matching has an existing test to update, not a silent gap.
