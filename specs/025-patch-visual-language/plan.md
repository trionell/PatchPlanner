# Implementation Plan: The mockup's visual language, for real

**Branch**: `025-patch-visual-language` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-patch-visual-language/spec.md`

## Summary

Five items from the second field test, in four passes.

Two do not work, and both have one-line causes. `onEditInFlow={() => setView('flow')}`
throws away the node the sheet computed, and the canvas could not have received it
anyway because it owns its selection privately and is unmounted while the sheet
shows — so the fix is to lift the selection to the tab and pass it down. And the
output canvas's `PortRow` takes no colour at all: Slice 23 gave the output graph
`derivedCableColor` for its cables and never gave its ports anything, so a run is
cabled in colour and ported in grey.

Three are the surface not having been built to the mockup. Those are mostly a
matter of enumerating what the mockup's stylesheet actually says and applying it —
research.md R5 to R9 are that enumeration, table by table, against what is
currently rendered. Three structural changes fall out of it rather than being
cosmetic: the toolbar, content and status strip become **one framed panel**
instead of three rounded cards with gaps; a pass-through box becomes **one row per
jack** with its two ports on opposite edges instead of two independent columns
that line up by luck; and both canvases' private copies of `NodeShell`, `PortDot`
and `PortRow` are **replaced by shared ones**, which is why they drifted in the
first place and the only way SC-004 stays true.

The mockup's pixel values are not copied. It renders the whole application scaled
down at an 11 px base against the app's 14 px, so every value is carried across as
a ratio (research.md R11) — copying them literally would produce controls smaller
than the ones the *previous* round complained about.

## Technical Context

**Language/Version**: TypeScript 5 + React 18. No backend change at all.

**Primary Dependencies**: Vite, TanStack React Query, Tailwind, lucide-react.
**No new dependency.**

**Storage**: None. No migration, no schema change, no stored field. Which box is
selected is interface state for as long as the tab is open.

**Testing**: Vitest for the one new pure function (`derivedOutputPortColor`) and
for the truncation helper. The rest is appearance, walked in quickstart.md against
the mockup.

**Target Platform**: Desktop browsers. Mobile layouts and printed sheets untouched
(FR-038).

**Project Type**: Web application, existing monorepo layout.

**Performance Goals**: Unchanged, with one improvement: truncating a port list at
the mockup's limit (FR-029) means a 32-jack stagebox renders 8 rows and a count
instead of 32 rows, so a festival patch draws less DOM than it does today.

**Constraints**: The other six tabs must look exactly as they do now (FR-039),
which rules out editing the shared `ui/Table` and `ui/Badge` — they are used
across the app. The audio surface gets its own primitives instead.

**Scale/Scope**: ~18 frontend files, of which 8 are new; the two canvases lose
~200 lines of duplicated node code to the shared module. 4 commits, one per pass.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Domain-First Data Model** | Pass, untouched. No entity, relationship or graph rule changes. The one thing added is a derived colour, which answers a domain question — "which output does this run belong to?" — by walking the existing port-and-cable graph rather than by storing anything. |
| **II. Extensibility by Design** | Pass. Nothing branches on a category name. The shared graph primitives take a structural port type and a `colorOf` callback, so a future graph (video, power) could use them without either audio graph being touched — the same seam that let `DeviceSection` be shared. |
| **III. Full-Stack Monorepo** | Pass. Frontend only; shared UI primitives under `components/ui/` and graph primitives under `components/event/graph/`, both within the layout Principle III sets out. No migration, so nothing for the migration rule to apply to. |
| **IV. Inventory-Driven Rental Workflow** | Pass, untouched. No change to what reaches the rental order. Worth stating because the sheet's chain cell is being restyled and it names cables: FR-016 changes how a hop *reads* (mono, dotted underline, amber for the desk's own socket) and not what it counts. The desk-versus-rented distinction the mockup draws is in fact the billable-versus-not distinction, so the restyle makes an existing invariant visible rather than altering it. |
| **V. Pragmatic Simplicity** | Pass. No new dependency, no new state library — the lifted selection is `useState` in the tab, which is exactly what Principle V prescribes for UI state. The one judgement call is extracting shared graph primitives instead of editing two files: justified because the duplication is the documented cause of the drift being fixed (research.md R8), and it removes more code than it adds. Type sizes land in one tokens table rather than being repeated, so the later app-wide slice has one place to read. |

**Post-design re-check**: unchanged. No principle needs a justification, so
Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/025-patch-visual-language/
├── plan.md                     # This file
├── spec.md
├── research.md                 # R1–R11: the two causes, and the mockup enumerated
├── data-model.md               # no stored data; the derived colour rule and the tokens
├── quickstart.md               # how to verify each pass against the mockup
├── checklists/requirements.md
├── contracts/
│   └── visual-language.md      # the binding values, per element
└── tasks.md                    # /speckit-tasks output
```

### Source Code (repository root)

```text
frontend/src/
├── components/
│   ├── ui/
│   │   ├── PatchPanel.tsx              # NEW — bar / content / rail, one frame
│   │   └── SheetTable.tsx              # NEW — the sheet's own table + TapeBar, NumCell, Pill
│   └── event/
│       ├── graph/                      # NEW — shared by both canvases
│       │   ├── tokens.ts               # the carried-across type scale and colours
│       │   ├── NodeShell.tsx           # chrome, header, badge, footer, selected/desk variants
│       │   ├── PortDot.tsx             # 7px, hollow / filled / coloured
│       │   ├── PortRow.tsx             # one-sided row, and SplitPortRow for a pass-through
│       │   ├── MoreRow.tsx             # "⋯ N more"
│       │   └── LaneBands.tsx           # tinted bands with their labels inside the canvas
│       ├── AudioPatchShell.tsx         # renders PatchPanel; zoom into the bar; tab title
│       ├── AudioInputsTab.tsx          # owns `selection`; passes it both ways
│       ├── AudioOutputsTab.tsx         # owns `selection`; canvas uses the shared graph module
│       ├── InputGraphCanvas.tsx        # controlled selection; shared primitives; rail rebuilt
│       ├── InputSheet.tsx              # SheetTable; tape bar; tabular figures
│       ├── OutputSheet.tsx             # the same
│       ├── ChainCell.tsx               # mono, dotted underlines, amber desk hop
│       ├── FlowInspector.tsx           # rail; labels beside fields; boxed notes; drawn legend
│       └── PatchStatusRail.tsx         # the panel's bottom strip, with its two tints
└── lib/
    ├── outputGraph.ts                  # derivedOutputPortColor, derivedCableColor on top of it
    ├── outputGraph.test.ts             # the new colour rule
    └── patchSheet.ts                   # unchanged; `kind: 'desk'` already marks the desk hop
```

**Structure Decision**: The existing layout, with two new homes. `ui/PatchPanel`
and `ui/SheetTable` are UI primitives with no audio knowledge, so they sit beside
`ui/GearList` from the previous slice — the audio surface now has a small
vocabulary of its own rather than styling inline. `event/graph/` is a directory
rather than one file because six primitives in one module would be among the
largest files in the tree, and because both canvases import from it, which is the
point.

Notably `ui/Table` and `ui/Badge` are **not** touched: six other tabs render them
and FR-039 requires those to be unchanged. The audio sheets get their own table
and their own smaller pill.

## Implementation Sequencing

Passes are ordered by the spec's priorities, which is also the order in which each
is independently verifiable.

**Pass A — selection (US1, P1).** Lift `selection` into both tabs, thread it into
both canvases as a controlled prop, delete the canvases' own state, wire the
sheets' `onEditInFlow` to `setSelection` + `setView('flow')`, and scroll the
selected source into view. Verifiable alone: press the button, land on the source.

**Pass B — colour on the outputs graph (US2, P2).** Extract the backward walk into
`derivedOutputPortColor`, redefine `derivedCableColor` in terms of it, thread it
into the output canvas's `PortRow`. Small, self-contained, and testable as a pure
function — the one pass with a real unit test.

**Pass C — the panel, the sheet, the canvas chrome and the inspector (US3 + US4,
both P3).** `PatchPanel` first, since the sheet and the canvas both go inside it
and the zoom control moves into its bar. Then `SheetTable` and the two sheets,
then `ChainCell`, then `PatchStatusRail` as the panel's strip, then `LaneBands`
and the inspector. The two stories are one pass because they share the panel:
doing them separately would mean building the frame twice.

**Pass D — the nodes and the sources rail (US5, P4).** `event/graph/` primitives,
then both canvases adopt them and lose their private copies, then the rail is
rebuilt to R9's table. Last because it depends on the tokens pass C establishes,
and because it is the pass where a mistake is most visible and least dangerous.

Three things worth flagging for whoever reviews the diff:

- **Pass A changes behaviour in files pass C and D restyle.** That is deliberate:
  the P1 fix should be reviewable and revertable without the restyle attached.
- **Pass D deletes code from both canvases in the same commit that adds its
  replacement.** A half-done extraction leaves two `NodeShell`s with the same name
  in one import graph, so it cannot be split further without being briefly
  incoherent.
- **`.prow--split` is not cosmetic.** Drawing a pass-through as one row per jack
  changes which DOM element a port's ref registers on, and the canvas measures
  those elements to place its cables. The check is that cables still land on their
  ports after the change, at every zoom level — geometry, not appearance.

## Complexity Tracking

> No Constitution Check violations. Nothing to justify.
