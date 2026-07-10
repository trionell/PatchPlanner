# Implementation Plan: Audio Output Signal-Flow Graph

**Branch**: `011-output-signal-graph` | **Date**: 2026-07-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-output-signal-graph/spec.md`

## Summary

Replace Slice 10's ordered per-channel hop chain with a real port-to-port
graph. `output_devices` (Slice 10's shared-device table) is extended with
input/output port counts, a connector type per side, and a canvas
position, becoming the general-purpose `Device` node. A new
`output_cables` table is the graph's edges — each cable connects one
output port to one input port, where a port is identified by
`(kind, id, index)` with `kind` ∈ `mixer | stagebox | stage_multi |
device` (no separate `ports` table; ports are derived slots computed from
whichever node they belong to, same pattern this project already uses for
polymorphic-ish references). `output_chain_hops` is dropped once its data
converts losslessly into devices + cables. The conversion is genuinely
branching per hop (route vs device, shared vs not, mono vs the two
independent physical sides of a stereo channel) and is implemented as a
one-time Go data migration rather than hand-written SQL — the first
migration in this project to need that. Rental aggregation actually
*simplifies*: because stereo is now two real, separate ports/cables
instead of one row with a doubling flag, every arm becomes a flat
per-row `SUM`, no `CASE WHEN width = 'stereo'` anywhere. The canvas itself
is hand-rolled React state + SVG (no new graph-rendering dependency),
matching this project's "no new runtime dependency without a demonstrated
need" principle — the interaction surface (a few dozen nodes per event,
not hundreds) doesn't need what a full graph library provides.

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi router, modernc.org/sqlite, golang-migrate;
Vite, TanStack Query, Tailwind. No new dependency on either side — the
canvas is plain SVG + React state, not a graph-editor library (research.md
R1).

**Storage**: SQLite — migration `025_output_graph`: extends `output_devices`
with port/connector/position columns, adds `output_cables`, then a Go-level
data-migration step converts every `output_chain_hops` row into devices +
cables before the table is dropped in a follow-up migration once conversion
is verified.

**Testing**: Go `testing` + `httptest` (api/db packages, migration replay
via `openMigratedTo`/`execMigrationFileTx` for the schema half, a dedicated
Go conversion-function test for the data half); Vitest (canvas interaction
logic extracted into pure functions, signalFlow, printSheets)

**Target Platform**: Linux server, single binary + static frontend

**Project Type**: Web application (backend + frontend)

**Performance Goals**: N/A — single-user tool; graph size is bounded by
one event's real equipment list (tens of nodes, not hundreds); rental CTE
stays one query

**Constraints**: Never touch the user's live dev DB (verification on
copies only — this project's DB-safety rule already caught one real
incident this session, see `specs/010-output-chains/tasks.md`
Implementation Notes); never modify source LL.xlsx; the user's real,
already-built Slice 10 chains (confirmed present on the live dev DB) MUST
convert losslessly — this is the highest-stakes migration in the project
so far, since it's not hypothetical, it's specifically verified against
data known to exist

**Scale/Scope**: 2 schema migrations (extend `output_devices` + add
`output_cables`; drop `output_chain_hops`), 1 Go-level data-conversion
step, full rental CTE rewrite (simplification, not just extension), 1 new
interactive canvas UI replacing the chain editor, device-management table
extended with port/connector fields, Signal Flow + print sheet rewritten
to walk the graph instead of a flat chain

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Data Model** — PASS. A port-to-port cable graph is a
  strictly more accurate model of real AVL signal flow than an ordered
  list ever was — this is the constitution's own example relationship
  ("mic → cable → stagebox → multicore → mixer channel") generalized to
  branch and merge the way real rigs do, not flattened into a sequence.
- **II. Extensibility by Design** — PASS with note (same note as Slices
  9/10). `from_kind`/`to_kind` are Go-validated enums, not reference
  vocabularies — they select which table a polymorphic id/port pair
  resolves against and drive validation/rental logic in code, so a
  user-added fifth kind would have no defined behavior. This matches the
  existing `destination_type`/`hop_kind` precedent exactly.
- **III. Full-Stack Monorepo Architecture** — PASS. Versioned migrations;
  REST JSON on new `/events/{id}/output-cables` routes plus an extended
  `/events/{id}/output-devices`; no new packages.
- **IV. Inventory-Driven Rental Workflow** — PASS. Every rented device and
  cable resolves to a real `inventory_items` FK, validated the same way
  every existing pick is; owned-gear devices stay structurally excluded
  from the rental CTE; a stage multi's input-side connections are
  explicitly excluded from ever acquiring a cable pick (FR-013), so
  there's no leak in the other direction either (nothing double-billed
  for the multicore's own built-in wiring).
- **V. Pragmatic Simplicity** — PASS with two notes, both addressed in
  Complexity Tracking: (1) no `ports` table — ports are computed, not
  stored, avoiding a fourth new entity when three (extended device, new
  cable, plus reusing two existing entities) already cover it; (2) the
  data conversion runs as Go code, not a `.sql` migration file, because
  the branching (route vs device hop, shared vs per-side device, mono vs
  independently-migrated stereo sides) is real conditional logic that
  would be unsafe and unreviewable as a recursive-CTE SQL script — Go
  code can be unit-tested hop-shape by hop-shape the way the SQL couldn't
  be.

**Post-design re-check (Phase 1)**: PASS — data-model.md and the API
contract confirm no additional violations; Complexity Tracking documents
the two notes above with their rejected alternatives.

## Project Structure

### Documentation (this feature)

```text
specs/011-output-signal-graph/
├── plan.md                        # This file
├── research.md                    # Phase 0 output
├── data-model.md                  # Phase 1 output
├── quickstart.md                  # Phase 1 output
├── contracts/
│   └── output-graph-api.md        # Phase 1 output
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 025_output_graph.up.sql          # NEW — extend output_devices
│   │                                     #       (ports/connector/position),
│   │                                     #       create output_cables
│   ├── 025_output_graph.down.sql        # NEW — reverse
│   ├── 026_drop_output_chain_hops.up.sql # NEW — drop the superseded table,
│   │                                     #       once conversion (below) has run
│   └── 026_drop_output_chain_hops.down.sql
└── internal/
    ├── domain/
    │   └── audio.go                       # OutputDevice gains port/connector/
    │                                       # position fields; new OutputCable;
    │                                       # AudioPatchOutput loses Chain
    ├── db/
    │   ├── audio_patch.go                 # output_devices CRUD extended;
    │   │                                   # output_cables CRUD (new);
    │   │                                   # output_chain_hops code removed
    │   ├── output_graph_migration.go      # NEW — the one-time Go data
    │   │                                   # conversion (hops -> devices+cables)
    │   ├── output_graph_migration_test.go # NEW — hop-shape by hop-shape
    │   │                                   # conversion correctness
    │   ├── rental.go                      # CTE rewritten: flat per-row SUM,
    │   │                                   # no width-based CASE WHEN
    │   └── rental_test.go                 # extended
    └── api/
        ├── audio_patch.go                 # output_devices validation extended
        │                                   # (ports/connector/position);
        │                                   # output_cables handlers + routes
        │                                   # (port-bounds/uniqueness/direction
        │                                   # validation, stage-multi-input
        │                                   # cable-pick exclusion)
        ├── audio_patch_test.go            # extended
        └── output_cables_test.go          # NEW

frontend/src/
├── types/index.ts                         # OutputDevice gains port/connector/
│                                           # position fields; new OutputCable;
│                                           # AudioPatchOutput loses chain
├── lib/
│   ├── outputGraph.ts                     # NEW — pure functions: derived port
│   │                                       # lists per node kind, port-label/
│   │                                       # gap logic, replaces outputChain.ts
│   ├── signalFlow.ts                      # rewritten to walk output_cables
│   │                                       # instead of a flat chain
│   └── signalFlow.test.ts                 # extended
├── components/event/
│   ├── AudioOutputGraphTab.tsx             # NEW — the canvas: draggable
│   │                                       # nodes, SVG cable rendering,
│   │                                       # port-to-port drag-to-connect,
│   │                                       # cable-item picker popover
│   ├── OutputDeviceSection.tsx             # extended — port count + connector
│   │                                       # type per side, position is
│   │                                       # graph-managed (not a form field)
│   └── SignalFlowTab.tsx                  # rewritten output section
└── components/print/
    ├── OutputPatchSheet.tsx               # rewritten to walk the graph
    └── printSheets.test.tsx               # extended
```

**Structure Decision**: Web application layout per constitution — all
changes land in existing `backend/` and `frontend/` trees; one new
frontend file (`outputGraph.ts`) replaces `outputChain.ts` (deleted) as
the pure-logic layer the canvas and Signal Flow/print sheet all share; the
canvas itself is one new component, not a new library integration.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| No `ports` table (ports are computed, not stored rows) | A stored `ports` table would need synthetic rows kept in sync with a device's port-count edits, a mixer channel's width, a stagebox's `output_count`, and a stage multi's `channels` — four different triggers for one derived fact | Computing a node's live port list on demand (from fields already on its owning row) needs no sync logic at all and can't drift out of date; the cost is that port bounds are validated in Go rather than a DB FK, which already matches this project's `destination_type`/`hop_kind` precedent |
| Data conversion as Go code, not a `.sql` migration | Converting a linear hop chain into a branching port graph requires per-hop conditional logic (route vs device, shared vs per-side-doubled device, and — for a stereo channel — generating two parallel migrated chains, one per independently-patched physical side) that has no reasonable expression as a single SQL script | A recursive-CTE SQL attempt was considered and rejected: the branching depth (hop kind × device-source × width) makes it unreadable and unverifiable compared to Go code with per-shape unit tests, for a migration whose correctness on the user's *real, already-built* data matters more than anything else shipped so far |
