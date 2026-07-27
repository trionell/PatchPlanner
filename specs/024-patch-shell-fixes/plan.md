# Implementation Plan: Audio patch shell, second pass

**Branch**: `024-patch-shell-fixes` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-patch-shell-fixes/spec.md`

## Summary

Four defects found by field-testing Slice 23, fixed in four passes, in severity
order.

Two of them are real bugs with narrow causes. A channel loses its desk because
the sheet's row editor PATCHes eight fields and not `console_id`, and the update
SQL writes the resulting nil as NULL — and the box that then appears to hold the
detached row was never given a drag handler, so it sits immovably on top of the
desk. A desk's local sockets are unusable because both graphs draw them as
one-sided ports on the desk's own node: the output graph draws only the out side,
so a bus has nothing to land on, and the input graph draws only the in side, so a
cabled-in source can never reach a channel. The model underneath — the port
kinds, the cableless rules, the rental arm — was already right in Slice 23; only
the rendering and one walker branch are wrong.

The other two are the Slice 23 UI not actually being built to the approved
mockup. The Rig and Buses drawers still host the old `Card` sections, one of
which puts stage boxes and stage multis in two columns inside a `max-w-3xl`
drawer, leaving six live controls per row about 340 px to share — the "input
fields are too small to function". And both sheets' row editors lay out on a
fixed column track that drops the action buttons into a 9 rem cell, which
compresses "Save channel" against its own padding and squeezes the delete
button's icon into a tall thin sliver: one cause, three of the reported
symptoms (research.md R14).

So: pass A restores desk assignment and makes every node draggable; pass B gives
a desk's sockets their own two-sided node in the processing lane on both graphs,
shaped exactly like a stage box, with new per-graph positions for it; pass C
builds one drawer design language and rebuilds all six rig/bus sections on it;
pass D rebuilds both row editors on the same language and adds the missing Edit
in Flow.

## Technical Context

**Language/Version**: Go 1.25 (backend), TypeScript 5 + React 18 (frontend)

**Primary Dependencies**: chi, `modernc.org/sqlite`, golang-migrate; Vite,
TanStack React Query, Tailwind, lucide-react. **No new dependency.**

**Storage**: SQLite. One migration, `043_console_local_positions`, adding four
`REAL NOT NULL DEFAULT` columns to `event_consoles`. No data migration.

**Testing**: Go `testing` + `httptest`; Vitest for frontend pure functions.

**Target Platform**: Desktop browsers for everything in this slice. Mobile
layouts are untouched (FR-033).

**Project Type**: Web application, existing monorepo layout.

**Performance Goals**: Unchanged. The extra node per desk on each canvas is one
more absolutely-positioned box among tens; the sockets node replaces port rows
that the desk node was already rendering, so total port count is flat.

**Constraints**: Existing events must open unchanged (FR-034, SC-012), verified
against a copy of the production database and never against the file itself. The
two audio tabs change; the other eight tabs must look exactly as they do now.

**Scale/Scope**: 1 migration; ~6 backend files; ~20 frontend files, of which 8
are new and 2 are deleted. 4 commits, one per pass.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Domain-First Data Model** | Pass, and strengthened. A desk's socket panel is a real object — the connector panel on the back of the console — and this slice is what makes it traversable in the graph rather than a decorative row on the desk's box. The four new columns are canvas placement, following migration 031's established per-graph convention. |
| **II. Extensibility by Design** | Pass. No new node kind: `console_local` already exists and is already in all four valid-kind lists. Nothing branches on an inventory category. |
| **III. Full-Stack Monorepo** | Pass. Schema change ships as a numbered migration pair; no `ALTER TABLE` in application code; new Go code stays in `internal/db` and `internal/api`; the new frontend primitives go in `components/ui/`. |
| **IV. Inventory-Driven Rental Workflow** | Pass, and this is a stated requirement rather than an incidental one. FR-012 and SC-005 require a run through a desk's sockets to bill exactly the same number of cables as the equivalent run through a stage box. `rentalSummaryQuery` is not touched — it was already correct — and a test pins the parity so it cannot drift. |
| **V. Pragmatic Simplicity** | Pass. No new dependency, no new table. The one place this was tempting — storing a position for the box that holds rows belonging to no desk — is deliberately declined: that box is not an entity, so its position lives in the canvas's existing in-memory override map for the session and is not persisted at all (research.md R4). The drawer gets a set of small compositional primitives rather than one configurable list component, which would have had to express four counts, an owned-or-rented item, a length in metres and a connector per side (research.md R11). |

**Post-design re-check**: unchanged. No principle needs a justification, so
Complexity Tracking below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/024-patch-shell-fixes/
├── plan.md                        # This file
├── spec.md
├── research.md                    # R1–R16: what is actually broken, and why each fix
├── data-model.md                  # migration 043, the second node per desk, port labels
├── quickstart.md                  # how to verify each pass
├── checklists/requirements.md
├── contracts/
│   ├── console-positions.md       # the one API change + the graph's UI contract
│   └── drawer-design.md           # the drawer and row-editor design language
└── tasks.md                       # /speckit-tasks output
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 043_console_local_positions.up.sql          # NEW
│   └── 043_console_local_positions.down.sql        # NEW
└── internal/
    ├── domain/audio.go                             # Console: 4 position fields
    ├── db/
    │   ├── consoles.go                             # columns, scanners, create, update
    │   ├── audio_patch.go                          # update falls back to DefaultConsoleID
    │   ├── console_migration_test.go               # 043 up/down round trip
    │   └── audio_patch_test.go                     # desk kept on update (new cases)
    └── api/
        └── consoles_test.go                        # local positions round-trip

frontend/src/
├── components/
│   ├── ui/
│   │   ├── GearList.tsx                            # NEW — drawer primitives
│   │   ├── Input.tsx                               # size variant
│   │   └── Select.tsx                              # size variant
│   └── event/
│       ├── ConsoleSection.tsx                      # rebuilt on primitives
│       ├── StageboxSection.tsx                     # NEW — replaces half of the manager
│       ├── StageMultiSection.tsx                   # NEW — replaces the other half
│       ├── InputDeviceSection.tsx                  # rebuilt
│       ├── ProcessingDeviceSection.tsx             # rebuilt
│       ├── TrueOutputDeviceSection.tsx             # rebuilt
│       ├── BusSection.tsx                          # rebuilt
│       ├── RowEditor.tsx                           # NEW — the shared editor strip
│       ├── LocalJackNode.tsx                       # NEW — the two-sided sockets node
│       ├── InputSheet.tsx                          # editor + console_id in the draft
│       ├── OutputSheet.tsx                         # editor + console_id in the draft
│       ├── InputGraphCanvas.tsx                    # desk node / sockets node split
│       ├── AudioOutputsTab.tsx                     # desk node / sockets node split
│       ├── RigDrawer.tsx                           # section list
│       └── StageboxMultiSection.tsx                # DELETED
├── components/StageboxMultiManager.tsx             # DELETED
├── lib/
│   ├── inputGraph.ts                               # nodeZone, port labels
│   ├── outputGraph.ts                              # nodeZone, port labels
│   ├── signalFlow.ts                               # console_local continuation + consoles
│   └── signalFlow.test.ts                          # chain continues past a local jack
├── api/audioPatch.ts                               # console position payloads
└── types/index.ts                                  # Console: 4 position fields
```

**Structure Decision**: The existing `backend/` + `frontend/` layout from
Principle III, unchanged. Two new frontend concerns get files of their own rather
than being inlined: `ui/GearList.tsx`, because the whole point is that six
sections share one language, and `event/RowEditor.tsx`, because both sheets must
not drift again. `event/LocalJackNode.tsx` is shared by both canvases even though
they each keep their own node components, since a sockets panel is drawn
identically on both — the only difference is which jack count sizes it.

## Implementation Sequencing

Passes are ordered by the spec's priorities, which is also the order in which
each pass is independently verifiable.

**Pass A — desk assignment (US1, P1).** Backend first: the update fallback plus
its tests, so the safety net exists before any frontend change relies on it. Then
`console_id` into both sheets' drafts and out of their side-mutations, then the
drag handlers and the starting position for the orphan boxes. Verifiable on its
own: edit a channel, check it stays on the desk, drag the box.

**Pass B — the sockets node (US2, P2).** Migration and Go first, then types and
the API client, then the two graph libraries (`nodeZone`, labels), then the
walker fix, then the canvases. The canvases come last because they are what needs
everything else in place. Note that the desk node and the sockets node must be
split in the *same* edit on each canvas: the layout key `console_local:{id}` moves
from the former to the latter, so a half-done split leaves both nodes reading the
same position.

**Pass C — the drawer language (US3, P3).** `Input`/`Select` size variants and
`GearList.tsx` first, then the six sections one at a time, then `RigDrawer` and
the deletion of `StageboxMultiManager`. Each section is independently checkable
by opening the drawer, so this pass is the easiest to review incrementally and
the most tedious to get consistent — the primitives are what make it consistent
rather than repeated care.

**Pass D — the row editors (US4, P4).** `RowEditor.tsx` on the primitives from
pass C, then both sheets adopt it. Pass D depends on pass C's primitives; nothing
else depends on pass D.

Two things worth flagging for the reviewer of the diff:

- Pass A touches `InputSheet.tsx` and `OutputSheet.tsx` for the draft, and pass D
  rewrites the editor markup in both. The two edits are in the same components
  and land in different commits, deliberately: the P1 data fix should be
  reviewable and revertable without the P4 restyle attached to it.
- `nodeZone('console_local')` changing lane on both graphs is a one-line change
  with a wide blast radius, because zones drive both the lane labels and
  `clampProcessingX`. It is checked by the sockets node landing between the two
  dashed lane dividers on each canvas, not by a unit test.

## Complexity Tracking

> No Constitution Check violations. Nothing to justify.
