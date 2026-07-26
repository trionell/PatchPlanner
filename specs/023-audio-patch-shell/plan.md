# Implementation Plan: Audio Patch Shell — Sheet, Flow, Drawers & the Console

**Branch**: `023-audio-patch-shell` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-audio-patch-shell/spec.md`

## Summary

The two audio tabs today are a vertical stack of six independent cards, each with
its own header and its own always-live form controls, with the signal-flow graph
boxed at the bottom. This slice replaces the stack with one shell: a single
toolbar, a Sheet view that is the page you land on, a Flow view one toggle away,
and two drawers (Rig, Buses) holding everything that used to be a card. It also
adds the one entity the audio model has never had — the console itself.

Four passes, in this order, each shippable on its own:

1. **The shell** — `AudioPatchShell` owns the toolbar, the Sheet/Flow toggle,
   the search box, the drawers and the print/add actions. `BusSection` moves
   into the Buses drawer; `StageboxMultiSection`, `InputDeviceSection`,
   `ProcessingDeviceSection` and `TrueOutputDeviceSection` move into the Rig
   drawer. The existing channel tables and canvases are dropped in as the
   Sheet/Flow content unchanged. Frontend only, no data change.
2. **The sheet** — the chain column (one string per row, assembled from the
   existing backward/forward cable walkers), the in-place row editor, the
   per-hop repatch popover, and the status rail. Frontend only; the walkers
   already exist and are already unit-tested.
3. **The console** — migration `042` creating `event_consoles`, giving
   `input_channels` and `audio_patch_outputs` a `console_id`, and adding
   `console_local` as a port kind on both graphs so a source can land in the
   desk directly. One more UNION arm in `rentalSummaryQuery`. The graphs'
   anonymous mixer node becomes the named desk.
4. **The flow view** — the source rail's row anatomy (tape / name / model /
   red 48 V bar / port), stereo ports stacked vertically, end-to-end channel
   colour along every complete run, and the inspector rail. `SourceSection` is
   retired at the end of this pass and not before, because the inspector is
   what replaces it.

Almost nothing here is new logic. `buildInputChannelFlow` already walks
backward from a channel to its origin source; `buildOutputChannelFlow` already
walks forward; `derivedPortColor`/`reachableChannels` already implement the
agree-or-neutral colour rule the mockup asks to see applied along the whole
path. The genuinely new pieces are the console table, the per-hop picker, and
the Flow inspector.

## Technical Context

**Language/Version**: Go 1.25 (backend), TypeScript 5.7 + React 18 (frontend)

**Primary Dependencies**: Existing only — chi, `modernc.org/sqlite`,
`golang-migrate`, TanStack Query, Tailwind, `lucide-react`, Vitest. **No new
dependency**: the drawers, popovers and inspector are built from the project's
own `components/ui` primitives, as `StagePlotInspector` already is.

**Storage**: SQLite. One migration, `042_event_consoles`:
`CREATE TABLE event_consoles`, `ALTER TABLE input_channels ADD COLUMN
console_id`, `ALTER TABLE audio_patch_outputs ADD COLUMN console_id`, plus a
deterministic backfill (one console per event, carrying
`events.output_mixer_position_y` across, every existing channel and output
pointed at it). Additive; no row is deleted and no value is overwritten.

**Testing**: Go standard `testing` + `httptest` beside the code in-package;
Vitest for pure frontend logic (`lib/*.test.ts`) and for the print sheets.
Both gates run in CI. The rental baseline
`specs/013-stage-plots/rental-baseline.json` must still match — a console with
no item picked adds no line, which is the backfilled state of every existing
event.

**Target Platform**: Desktop browsers (≥768px, the `useIsMobile` false branch).
Mobile is explicitly untouched.

**Project Type**: Web application in the existing `backend/` + `frontend/`
monorepo.

**Performance Goals**: The Sheet must render 64 channels without a visible
frame drop. Every chain string is derived client-side from data already in the
`audio-patch` query — no extra request, no N+1. `reachableChannels` is already
memo-guarded against cycles and is called once per port per render; at 64
channels × ~4 hops that is a few hundred map lookups, which is nothing, but the
Sheet memoises per-row flows anyway so a keystroke in the search box does not
re-walk the graph.

**Constraints**:

- **Mobile code paths must not be modified in place** (the Slice 21 rule). Every
  file this slice touches keeps its `if (isMobile) return …` branch first and
  byte-identical.
- **`backend/patchplanner.db` is never touched.** Migration and backfill are
  verified against a copy in `/tmp` via `PATCHPLANNER_DB`.
- **The typecheck gate is `tsc -b`**, never `tsc --noEmit` (the root tsconfig is
  references-only and would type-check nothing).
- The cabling rules do not change. `console_local` is added to the valid
  kind lists and to the cableless-edge rule; nothing existing is re-defined.
- The rental summary's `ORDER BY` must not change, and the new arm must follow
  the established shape (one row = quantity 1, `NULL` item never joins).
- Restricted roles must have controls **absent from the DOM**, not disabled —
  the standing rule from Slice 15 ("hide, don't just block").

**Scale/Scope**: One migration, ~3 new backend files, 4 new routes, one extra
UNION arm; ~8 new frontend components, 2 new `lib` modules, 2 rewritten tab
files. Events of up to 64 channels and 48 outputs, up to 4 consoles.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against constitution **v0.4.0**. No amendment needed — this slice is
the constitution working as intended rather than straining against it.

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Domain-First Data Model** | ✅ Strengthened | The console is the most conspicuous real-world AVL entity the model was missing. Principle I requires every entity to map to a real-world concept and requires mic → cable → stagebox → multicore → mixer channel to be a traversable connection; today the last link in that chain is a literal `id 0` placeholder with one persisted float. `event_consoles` plus `console_local` ports complete the chain, and they do it through the existing `PortRef`/cable convention the same principle mandates — no flat foreign key shortcut. |
| **II. Extensibility by Design** | ✅ Compliant | A new node kind is explicitly named in this principle as a structural addition that MAY need new tables, endpoints and components, and is called out as "expected engineering work, not a violation". Console role (`foh`/`monitor`/`broadcast`) is the one new closed set; it is a presentation label with no logic branching on it, so it stays a Go slice validated at the boundary like `ValidPortFromKinds`, not a `reference_values` vocabulary. See research.md R7 for why. |
| **III. Full-Stack Monorepo Architecture** | ✅ Compliant | New code lands in `api/`, `db/`, `domain/`, `migrations/`, `components/event/`, `lib/`. Routes are `/api/v1/events/{eventID}/consoles…`, resource-oriented, registered on the existing `AudioPatchHandler`. Migration is versioned and applied on startup. |
| **IV. Inventory-Driven Rental Workflow** | ✅ Fixes a violation | "Every piece of rented equipment in a plan MUST reference an inventory item" and the roadmap's standing invariant ("every planned item that exists in the catalog appears on the rental order and in every export format") are both violated today by the console: the single most expensive item in the truck can only reach the order as a hand-typed manual line. This slice adds the missing UNION arm, so the desk is counted and exported like everything else. |
| **V. Pragmatic Simplicity** | ✅ Compliant | No new dependency, no new state library — drawers and inspector use `useState` (local UI state) over the existing `audio-patch` TanStack query (server state), exactly as Principle V prescribes. The one deliberate superset is multiple consoles per event, which the user chose on 2026-07-26; it costs one nullable column and no extra table. |

Re-checked after Phase 1 design: unchanged. Complexity Tracking is empty —
there is no violation to justify.

## Project Structure

### Documentation (this feature)

```text
specs/023-audio-patch-shell/
├── plan.md              # This file
├── research.md          # Phase 0 — the decisions and what was rejected
├── data-model.md        # Phase 1 — event_consoles, console_id, console_local
├── contracts/
│   └── api.md           # Phase 1 — the four new routes + payload changes
├── quickstart.md        # Phase 1 — how to run and verify each pass
├── checklists/
│   └── requirements.md  # Spec quality gate (done)
└── tasks.md             # Phase 2 — /speckit-tasks output
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 042_event_consoles.up.sql          # NEW — table, two columns, backfill
│   └── 042_event_consoles.down.sql        # NEW
└── internal/
    ├── domain/
    │   └── audio.go                       # + Console, ConsoleRoles, console_local
    │                                      #   in the four Valid*Kinds slices
    ├── db/
    │   ├── consoles.go                    # NEW — CRUD, usage counts, guards
    │   ├── audio_patch.go                 # + console_id on channel/output CRUD,
    │   │                                  #   ConsoleLocalPortCount for validation
    │   └── rental.go                      # + one UNION arm (12 arms, 13 params)
    └── api/
        ├── audio_patch.go                 # + 4 routes, consoles in the payload,
        │                                  #   console_local in cable validation
        └── consoles_test.go               # NEW — httptest coverage

frontend/src/
├── components/event/
│   ├── AudioPatchShell.tsx                # NEW — pass 1, the one toolbar
│   ├── RigDrawer.tsx                      # NEW — pass 1
│   ├── BusesDrawer.tsx                    # NEW — pass 1
│   ├── ConsoleSection.tsx                 # NEW — pass 3, inside the Rig drawer
│   ├── InputSheet.tsx                     # NEW — pass 2
│   ├── OutputSheet.tsx                    # NEW — pass 2
│   ├── ChainCell.tsx                      # NEW — pass 2, incl. per-hop picker
│   ├── PatchStatusRail.tsx                # NEW — pass 2, capacity added in pass 3
│   ├── FlowInspector.tsx                  # NEW — pass 4
│   ├── AudioInputsTab.tsx                 # rewritten desktop branch
│   ├── AudioOutputsTab.tsx                # rewritten desktop branch
│   ├── InputGraphCanvas.tsx               # source rail, desk node, colour
│   ├── ChannelSection.tsx                 # retired by InputSheet (pass 2)
│   ├── SourceSection.tsx                  # retired by FlowInspector (pass 4)
│   └── {StageboxMultiSection,InputDeviceSection,
│        ProcessingDeviceSection,TrueOutputDeviceSection,
│        BusSection}.tsx                   # unchanged, re-parented into drawers
├── lib/
│   ├── patchSheet.ts                      # NEW — hop segments shared by both sheets
│   ├── patchSheet.test.ts                 # NEW
│   ├── patchCapacity.ts                   # NEW — pass 3, console/box usage
│   ├── patchCapacity.test.ts              # NEW
│   ├── inputGraph.ts                      # + console_local kind
│   ├── outputGraph.ts                     # + console_local kind, named desk
│   ├── inputSignalFlow.ts                 # + console_local hop label
│   └── signalFlow.ts                      # + console_local hop label
├── hooks/
│   └── usePatchView.ts                    # NEW — persisted per-tab-per-event view
├── api/audioPatch.ts                      # + console CRUD
├── types/index.ts                         # + Console, console_id, console_local
└── components/print/
    ├── InputPatchSheet.tsx                # columns converge with the Sheet
    └── OutputPatchSheet.tsx               # ditto; desk named instead of "Mixer"
```

**Structure Decision**: The existing monorepo layout is kept exactly. Every new
frontend file lands in `components/event/` (feature components), `lib/` (pure
functions, unit-tested) or `hooks/`, matching where the equivalent stage-plot
pieces live: `StagePlotTab` + `StagePlotCanvas` + `StagePlotInspector` +
`StagePlotPalette` is the precedent this shell follows deliberately, since it
is the one place in the app that already does canvas + inspector + palette well.

## Implementation Sequencing

The four passes are ordered by dependency, not by spec priority. Two ordering
facts are worth stating because they are not obvious:

- **`SourceSection` survives until pass 4.** The mockup has no Sources card:
  sources are created from the Flow palette and edited in the Flow inspector.
  Until that inspector exists, deleting `SourceSection` would remove the only
  place to pick a mic, a stand, a connector or phantom power. So pass 1 leaves
  it below the Sheet (two cards instead of six is already the bulk of the win),
  and pass 4 deletes it in the same commit that lands the inspector. This is the
  only place in the slice where the intermediate state is visibly not the mockup.
- **The status rail is built twice.** Pass 2 ships it with row counts, per-box
  usage, cables picked and gaps — everything derivable today. Pass 3 adds the
  console capacity arm and the over-capacity state, which is the one state the
  mockup calls "impossible to detect today".

## Complexity Tracking

> No Constitution Check violations. Nothing to justify.
