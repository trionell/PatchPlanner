# Implementation Plan: Lighting becomes a sheet

**Branch**: `main` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-lighting-sheet/spec.md`

## Summary

The Lighting tab is a thirteen-column form with twenty-four live controls and no
read state. It becomes the work panel three other tabs already use — bar, sheet,
row editor, status strip — and gains the thing no part of the application has ever
had: a model of the rig's DMX map.

Five pieces, in the order that makes each one reviewable on its own:

1. **The map, as pure functions** (`lib/dmxMap.ts`). Spans, shared groups,
   clashes, out-of-bounds spans, unaddressed fixtures, and per-universe occupancy
   with its free runs. Nothing renders; everything is unit-tested.
2. **The packing, as one pure function with three callers** (`lib/dmxPlan.ts`).
   Auto-assign, optimise and make room differ only in how the groups are ordered
   and whether a span is being inserted. They are one implementation because the
   rule they share — groups move whole, sharing survives, nothing leaves its
   universe — is exactly the rule that is easy to get subtly wrong twice.
3. **One transactional write endpoint**, and the deletion of the old one. The
   backend stops owning an address algorithm and starts owning a guarantee: a list
   of address changes lands completely or not at all.
4. **The surface**: panel, sheet, row editor, add editor, status strip, Universes
   drawer, and the collision prompt.
5. **The column goes**, all the way down: migration, struct, queries, JSON, type.

**Why the packing is in TypeScript and not in Go** is the plan's one substantive
architectural decision, argued in [research.md](./research.md) R3. In short: the
browser has to derive the map anyway — for the strip, the sheet's marks, the
drawer and the collision prompt — and auto-assign, optimise and make room are the
same packing over that same map. Implementing it in Go as well would put the
ripple rule in two languages. So the packing lives where the map already is, the
old `AutoAssignDMX` is deleted rather than rewritten, and the backend gets a
generic transactional writer in its place. The backend ends this slice **smaller**
than it started while the rig gains three operations.

## Technical Context

**Language/Version**: TypeScript 5 (React 18), Go 1.25

**Primary Dependencies**: React 18, TanStack React Query, Tailwind CSS, Vite,
`lucide-react`. No new dependency in either language.

**Storage**: SQLite. **One migration**, and it only removes: `044_drop_dmx_chain`.

**Testing**: Vitest for `dmxMap` and `dmxPlan` — the whole of the difficulty is
there and none of it needs a DOM or a database. Go `testing` + `httptest` for the
batch address endpoint. `tsc -b`, `eslint`, `go vet`, `go test` as gates. The
visual and gesture claims go in [quickstart.md](./quickstart.md), because no unit
test can make them.

**Target Platform**: Desktop browsers. The phone view keeps its list-and-sheet
editor and is touched only by the column removal.

**Project Type**: Web application — `backend/` (Go) + `frontend/` (React/TS).

**Performance Goals**: The map is derived once per fixture-list change and
memoised; it is O(fixtures + universes × 512) and a 200-fixture rig is nothing.
The sheet is not virtualised, as the audio sheets are not.

**Constraints**: The audio tabs, the stage plots, the phone view and the print
sheet must be untouched but for the column removal — asserted by a gate, not
assumed. `PatchPanel`, `SheetTable`, `RowEditor`, `GearList` and `Drawer` are
shared with those surfaces, so any change to them is a change to four tabs.

**Scale/Scope**: 2 new pure modules with their tests, 4 new components, 1 tab
rewritten, 1 migration, 1 new endpoint, 1 endpoint deleted, 1 request struct
widened. Roughly 12 files added or rewritten and 10 edited.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Domain-First Data Model** | ✅ Every concept the map introduces is one a lighting technician already has: a universe, a span, an address clash, a fixture patched to the same address as another. None of them is stored — they are *derived* from universe, start address and channel count, which is the same discipline `patchSheet`/`patchCapacity` apply to the audio graph. The one field removed, `dmx_chain_parent_id`, is the opposite: a relationship the schema asserts and the domain never populated. |
| **II. Extensibility by Design** | ✅ DMX modes stay catalog records copied onto a fixture at pick time; power connectors stay a vocabulary read through `useReferenceData`. Nothing branches on a model name, a connector name or a universe number. The two bulk operations differ by a comparator passed to one function, not by a `switch`. |
| **III. Full-Stack Monorepo Architecture** | ✅ Layout unchanged. One versioned migration applied on startup. The new route is `PATCH /api/v1/events/{id}/lighting-rigs/{rigID}/fixtures/addresses` — resource-oriented, JSON, beside the routes it joins. Go code stays in `api/`, `db/`, `domain/`. |
| **IV. Inventory-Driven Rental Workflow** | ✅ Fixtures keep referencing catalog items; the add editor still picks a model from the event's bound inventory, and still permits a custom fixture as it does today. Nothing about rental aggregation or export changes — `rental-summary` is invalidated by the same mutations as before. |
| **V. Pragmatic Simplicity** | ✅ No new dependency, no new service, no new state library: React Query for server state, `useState` for the editor draft and the drawer. The plan **deletes** an algorithm from the backend rather than adding one, and the two "new" operations are the same function called differently. The one genuine abstraction — `packGroups` — has three concrete callers on the day it is written. |

**Post-design re-check**: still passing, with one thing worth stating rather than
leaving a reviewer to find.

Moving the packing to the client makes a rig-wide rewrite depend on the client's
view being current. That is the concurrency model this application already
has — `updateLightingFixture` PATCHes the whole row from a client-held draft, and
has since Slice 7 — so this is consistent with it rather than an exception to it.
It is written down in research.md R4 because "consistent with the existing
last-write-wins model" is a defensible position and "nobody thought about it" is
not.

## Project Structure

### Documentation (this feature)

```text
specs/027-lighting-sheet/
├── plan.md                        # This file
├── spec.md                        # 82 FRs, 6 user stories, 20 success criteria
├── mockup.html                    # The approved drawing; §07 is the column ledger
├── research.md                    # R1–R12: every decision and what it rejected
├── data-model.md                  # Derived types, the API delta, the migration
├── quickstart.md                  # Interactive passes + the gate commands
├── checklists/requirements.md     # Spec quality checklist (all pass)
├── contracts/
│   ├── dmx-map.md                 # The pure core: conditions, occupancy, packing
│   └── lighting-panel.md          # The surface: columns, strip, drawer, prompt
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 044_drop_dmx_chain.up.sql        # NEW — ALTER TABLE … DROP COLUMN
│   └── 044_drop_dmx_chain.down.sql      # NEW — ADD COLUMN, schema not data
└── internal/
    ├── domain/lighting.go               # − DMXChainParentID; BulkFixtureRequest widened
    ├── db/lighting.go                   # − AutoAssignDMX, − ErrUniverseFull, − chain
    │                                    #   columns; + UpdateFixtureAddresses
    ├── db/lighting_test.go              # auto-assign tests → address-write tests
    ├── api/lighting.go                  # − auto-assign route; + addresses route
    └── api/lighting_test.go             # same swap, at the HTTP layer

frontend/src/
├── lib/
│   ├── dmxMap.ts                        # NEW — spans, groups, clashes, occupancy
│   ├── dmxMap.test.ts                   # NEW
│   ├── dmxPlan.ts                       # NEW — packGroups + the three callers
│   ├── dmxPlan.test.ts                  # NEW
│   └── lightingRig.ts                   # unchanged (duplicate console IDs)
├── api/lighting.ts                      # − autoAssignDMX; + updateFixtureAddresses
├── types/index.ts                       # − dmx_chain_parent_id; BulkFixtureRequest
└── components/
    ├── event/
    │   ├── LightingTab.tsx              # REWRITTEN — the panel shell
    │   ├── LightingSheet.tsx            # NEW — sheet, row editor, add editor, prompt
    │   ├── LightingStatusRail.tsx       # NEW — the strip
    │   ├── UniversesDrawer.tsx          # NEW — universes, models, the two operations
    │   ├── AddressPrompt.tsx            # NEW — the collision decision block
    │   └── RowEditor.tsx                # widened: optional delete, generic hand-off,
    │                                    #   a full-width notice slot
    ├── mobile/MobileFixtureEditSheet.tsx  # unchanged but for the type
    └── print/LightingRigSheet.tsx       # unchanged
```

**Structure Decision**: The existing two-project layout, unchanged. The new
frontend modules follow the established split — pure derivations in `lib/`,
surfaces in `components/event/` — which is what makes SC-016's "tests that render
nothing" achievable rather than aspirational.

`LightingSheet` is split out of `LightingTab` for the same reason `InputSheet` is
split out of `AudioInputsTab`: the tab owns queries, mutations and what is open;
the sheet owns rows and their editor. `LightingTab` is 502 lines today and would
be past 900 unsplit.

## Phase plan

Each phase is a commit, and each leaves the tree green. The order is chosen so
that a regression is attributable: nothing renders differently until phase 4, and
by then the difficult part has been under test for three commits.

| # | Phase | What lands | Gate |
|---|---|---|---|
| 1 | **The map** | `lib/dmxMap.ts` + tests. No caller. | vitest, tsc |
| 2 | **The packing** | `lib/dmxPlan.ts` + tests. No caller. | vitest, tsc |
| 3 | **The backend** | migration, column removal, address endpoint, Go tests; `autoAssignDMX` deleted from the client too | go vet, go test, tsc |
| 4 | **The surface** | panel, sheet, row editor, strip, add editor | tsc, eslint, vitest |
| 5 | **Drawer and operations** | `UniversesDrawer`, the three gestures wired | all gates + `vite build` |
| 6 | **Documentation** | `design/audit.md`, ROADMAP, PROJECT, tasks record | — |

Phases 1 and 2 are deliberately first and deliberately callerless. The whole
difficulty of this slice is in them, and putting them under test before anything
renders is what makes phase 4 a layout exercise rather than a debugging one.

## Complexity Tracking

> Filled only where the Constitution Check needs justification.

| Decision | Why needed | Simpler alternative rejected because |
|---|---|---|
| Packing in TS, not Go | The browser must derive the map for the strip, the sheet marks, the drawer and the collision prompt. The three operations are that same map plus an ordering. | Keeping it in Go means the ripple and grouping rules exist in two languages, and FR-082 requires them testable without a database. See R3. |
| Deleting `AutoAssignDMX` rather than fixing it | Its semantics change in three ways at once (groups, universe isolation, partial success), and its replacement is a caller of `packGroups`. | Rewriting it in Go would be the duplication above, plus a second failure contract to keep in step. |
| A generic address-write endpoint | Three operations produce the same thing — a list of `(fixture, universe, address)` — and each must land atomically. | Three endpoints would be three transactions wrapping identical SQL, differing only in a name. |
| Widening `RowEditor` | Lighting needs a hand-off to the plot rather than to Flow, an add mode with no delete, and a full-width notice for the collision prompt. | A second row editor for lighting is exactly the drift `graph/InspectorRail` was extracted to end. Three small optional props against one shared component is the cheaper side of that trade. |
