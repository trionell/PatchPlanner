# Research: An inspector for the audio outputs flow graph

**Feature**: `026-output-flow-inspector` | **Date**: 2026-07-27

Phase 0. Every decision below was taken by reading the code that already exists,
because this slice adds a second instance of something the inputs side already
does — so the question is almost never "how should this work" but "what is the
inputs side already doing, and what is genuinely different here".

---

## R1 — Why the outputs canvas has no inspector

**Finding**: it was never an oversight; it was written down.
`AudioOutputsTab.tsx:90-94` says so:

> Which node the graph marks. Held here rather than in the canvas so it survives
> the view toggle and so the sheet can set it (Slice 25 FR-001/FR-002). **This
> graph has no inspector — the mockup draws none** — so a selection here marks
> the box and nothing more.

So Slice 25 built the selection plumbing on both canvases and the rail on one,
because the approved mockup only drew one. Everything a rail needs on this side
is therefore already in place: `selection` and `onSelectionChange` are lifted to
the tab, every node already takes `selected`/`onSelect`, and the sheet's
`openInFlow` already sets a selection before switching views.

**Consequence**: this is not "add an inspector to a canvas that has no notion of
selection". It is "give an existing selection something to show". The work is the
rail, the row-level selection, and the extraction — not the plumbing.

## R2 — A box is not fine enough: the selection type has to widen

**Problem**: the outputs selection is `{ kind: PortRef['kind']; id: number }` —
a *box*. An output is not a box; it is one row inside the desk's bus list. Several
outputs share a box, so `{kind: 'mixer', id: deskId}` cannot say which row the
rail is editing.

Worse, `mixer` is already overloaded on this graph. A mixer **port**'s `id` is the
**output**'s id (`mixerPorts()` in `lib/outputGraph.ts:17`), while the mixer
**node**'s selection `id` is the **desk**'s id (`AudioOutputsTab.tsx:809`). Two
different entities behind one `kind`. Nothing has broken yet only because the
selection is never compared against a port.

**Decision**: widen the union with a new kind that is not a `PortRef` kind:

```ts
export type OutputFlowSelection =
  | { kind: 'output'; id: number }                       // one output row
  | { kind: 'stagebox' | 'stage_multi' | 'device' | 'console_local'; id: number }
```

**Rationale**: `output` cannot collide with a port kind, so the ambiguity above
becomes impossible to write rather than merely unwritten. Reusing `mixer` with a
convention ("id means the output here, the desk there") is exactly the sort of
thing that reads fine on the day and is a bug three slices later.

**Alternatives considered**:

- *`{kind: 'mixer', id: deskId, outputId?: number}`* — rejected: an optional field
  that must be present for one kind and absent for another is a discriminated
  union written badly.
- *Keep the box selection and add a separate `selectedOutputId` state* — rejected:
  two pieces of state that must never both be set is a rule with no enforcement,
  and both the tab and the canvas would have to maintain it.

## R3 — `mixer` leaves the selection union entirely

**Problem**: the desk box and the "No desk" box are currently selectable
(`onSelect={() => onSelectionChange({kind: 'mixer', id: desk.id})}`) and, per the
spec's assumptions, get no rail of their own. A box that can be marked but shows
nothing is the precise inconsistency US2 exists to remove — it would be the one
box in five that behaves differently.

**Decision**: drop `onSelect` from `ConsoleNode` and `MixerNode`. The desk box is
not selectable; its **rows** are. `mixer` disappears from the selection union.

**Rationale**: a desk's own fields (name, output count, local jack count) live in
the Rig drawer, so there is nothing a desk rail would hold that the "declared in
the Rig drawer" note doesn't already say — and the box's contents each have a rail
now. This also removes the `mixer` ambiguity from R2 at the root rather than
routing around it.

**Note**: the desk box keeps its amber border. That comes from `desk={badge ===
'DESK'}` on the shell, not from selection, so nothing visual is lost.

## R4 — Which gesture selects a row

**Finding**: the sources rail already answers this. On the inputs canvas a source
row's **body** selects the source and its **port dot** starts a cable — two
gestures, one row, no modifier key. The dot's hit area is a padded transparent
button (`graph/PortDot.tsx`), so the two targets do not overlap.

**Decision**: the same split on an output row. `PortRow` gains optional
`selected` and `onSelect`; when `onSelect` is given, the label becomes a clickable
region and the row tints amber when selected. The dot's handlers are untouched.

**Rationale**: consistency with a gesture the user has already field-tested, and
it is the only split that doesn't need a modifier or a second control. `PortDot`
already stops propagation on pointer-down (`handlePortPointerDown` calls
`event.stopPropagation()`), so a dot press cannot leak into a row press.

**Why the shared `PortRow` rather than a copy in the output canvas**: because the
input canvas's channel rows are the obvious next thing to want this on, and
Slice 25 exists because both canvases kept private copies of exactly this
component. The props are optional, so the input canvas's call sites do not change
and cannot change behaviour.

## R5 — What to extract, and what not to

`FlowInspector.tsx` currently holds five things that are about *being a rail*
rather than about being a source:

| Part | Lines | Genuinely shared? |
|---|---|---|
| the `<aside>` frame | 119 | yes — verbatim |
| header (micro-label, pill slot, close ✕) | 120-126 | yes — verbatim |
| `Field` (44px label beside control) | 296-303 | yes — verbatim |
| `Note` (bordered box with a micro-label) | 306-313 | yes — verbatim |
| `Legend` (svg stroke samples) | 367-391 | the **drawing**, yes; the **wording**, no |

**Decision**: extract the first four verbatim into
`components/event/graph/InspectorRail.tsx`; extract the legend as a component
that owns the strokes and takes its wording from the caller:

```ts
export type LegendRow = { kind: 'cable' | 'network' | 'unpatched' | 'phantom'; meaning: string }
export function Legend({ rows }: { rows: LegendRow[] })
```

**Rationale**: the strokes are the thing that must not drift — the legend's whole
claim is "these are the lines the canvas draws", and it is falsified the moment a
dash array is changed in one of two places. The wording is genuinely different:
the input side's colour means *which channel this run reaches*, the output side's
means *which output this run carries*, and phantom power does not exist on an
output at all (FR-013). Forcing one string set on both would make the outputs
legend wrong in order to make it shared, which is the wrong trade.

**Alternative rejected**: a `noun` prop ("channel" / "output"). The two sides
differ by verb as well as noun — *reaching* a channel versus *carrying* an
output — so a noun swap produces "cable, reaching that output", which is not what
the output graph draws.

## R6 — Where the rail's "lands on" line comes from

**Options**: walk the cables in the inspector; or reuse `buildOutputChannelFlow`
from `lib/signalFlow.ts`; or reuse `outputChainSegments` from `lib/patchSheet.ts`,
which the sheet's Chain column already renders.

**Decision**: `outputChainSegments`, taking the last segment of each line.

**Rationale**: it makes the rail and the sheet's Chain column structurally unable
to disagree — the same reasoning that made `derivedCableColor` be defined in terms
of `derivedOutputPortColor` in Slice 25 rather than being a second implementation
of the same walk. It also gets the stereo collapsing, the "not patched" marker and
the built-in/desk-hop distinction for free, all of which the sheet already
computes correctly.

**Cost**: the canvas has to be handed `itemLabelById`, which it currently does not
receive (`OutputFlowContext` needs it). The tab already builds that map for the
sheet and the print view; it is one more prop, and the input canvas already takes
the same one for the same reason.

## R7 — Fields save one at a time, with no Save button

**Finding**: `FlowInspector` mutates per field — `saveSource({kind})` on a select's
change, name on blur. The sheet keeps an explicit Save because `useRowEditor`
holds a whole-row draft and is keyboard-driven (Enter saves, Escape cancels).

**Decision**: the output rail does the same as the source rail: per-field mutation,
name on blur, everything else on change. No draft, no Save.

**Rationale**: matching the sibling rail is the request. It also avoids a second
source of truth for a row that the sheet may be editing — a rail holding a stale
draft while the sheet saves is a conflict that a per-field mutation cannot have.

**One consequence to handle deliberately**: `updateAudioOutput` takes the whole
row (`Omit<AudioPatchOutput, 'id'>`), so each field save sends `{...output,
...patch}`. `output` is read from the live query on every render, so the spread is
never stale by more than one refetch — the same shape `saveSource` already uses.

## R8 — Duplicate: which number, which desk

**Finding**: the source rail's Duplicate creates `${name} copy` offset 24px below,
copying the source's own fields and none of its cables. The tab's `addOutputRow`
uses `outputs.at(-1)?.output_number ?? 0` plus one.

**Decision**: copy every field of the row, keep the same `console_id`, and take
`max(output_number) + 1` across all outputs. Name becomes `${name} copy` when the
row has a name, and is left empty when it doesn't (an unnamed row's copy should
not be called " copy").

**Rationale**: `at(-1)` assumes the array is sorted by number, which it is in the
sheet (`ordered`) but not necessarily in the raw query. `max + 1` needs no such
assumption. Keeping the desk is what "duplicate" means for a row that belongs to
a desk.

**Rail follows the copy**: `createAudioOutput` returns the created row, so the
mutation's `onSuccess` can select `{kind: 'output', id: created.id}`. Nothing has
to guess.

## R9 — The rail must close when its subject disappears

**Problem**: the rail resolves `outputs.find(o => o.id === selection.id)`. After a
delete — from the rail, or from the sheet in another window — that is `undefined`
and the rail would render an empty frame.

**Decision**: when the selection is `{kind:'output'}` and no such output exists,
render nothing and clear the selection. The same for a box whose row is gone.

**Rationale**: the input rail sidesteps this today because a missing source falls
through to its "edited in the Rig drawer" branch, which is wrong but invisible
(the heading still reads "Source"). This side should not copy that. Clearing is
better than rendering nothing silently, because a stale amber border on a box that
no longer exists is not possible either way, and the canvas reclaims the width.

## R10 — No backend work, and how that gets proven

`AudioPatchOutput` already carries every field the rail needs; `createAudioOutput`,
`updateAudioOutput` and `deleteAudioOutput` already exist and are already used by
this exact tab. There is no migration, no route, no domain change.

**Proof obligation**: `go vet ./...` and `go test ./...` are run at the end and
must be green *without any Go file having changed* — `git diff --stat main -- backend/`
empty for this slice. That is the check that keeps "frontend-only" honest rather
than assumed.

## R11 — Considered and deliberately not done

- **Splitting the output canvas into `OutputGraphCanvas.tsx`.** The inputs canvas
  is its own 1357-line file; the outputs canvas is 1000 lines inside its tab. The
  asymmetry is real and worth fixing, but a pure move of 1000 lines in the same
  commit as this feature would bury the feature in the diff, and nothing here
  needs it. Recorded so it is a decision rather than an omission.
- **A rail for the desk box itself.** See R3 — there is nothing in it that isn't
  either a row (which has its own rail) or a Rig drawer field.
- **Row selection on the inputs canvas's channel rows.** `PortRow` gains the
  capability, and the channels rail is the obvious place to want it, but adding it
  would change the inputs Flow view — which FR-015 forbids in this slice.
- **Renaming `FlowInspector` → `InputFlowInspector`.** Done, and it is the one
  cosmetic change to the inputs side this slice makes: a file rename with three
  import updates and no behaviour change. Left as `FlowInspector` the pair reads as
  "the flow inspector" and "the output one", which is not what they are.
