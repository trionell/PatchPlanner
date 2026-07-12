# Implementation Plan: Audio Input Signal-Flow Graph

**Branch**: `012-input-signal-graph` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-input-signal-graph/spec.md`

## Summary

Replace the flat, single-table Audio Inputs model with a port-to-port
graph mirroring Slice 11's Output graph, reversed in direction. Today's
`audio_patch_inputs` conflates two independent things — a physical
Source's own configuration (mic/stand/phantom/connector) and a console
Channel's identity (name/groups/DCA/color) — behind one row that can
express only one Source per Channel. This feature splits them: a new
`input_sources` table (mic or line, connector, mono/stereo width) and
`input_channels` (the same table, renamed and slimmed to its
console-strip fields only, keeping every row's `id` so group/DCA
memberships need no migration). A new `input_cables` table is the graph's
edges, structurally identical to `output_cables` but with `source` in
place of the Output graph's implicit `mixer` node and `channel` in place
of its device/destination rail — critically, a Source's port may
originate more than one cable at once (double-patching), the one
deliberate asymmetry from the Output graph's Mixer-only fan-out rule. DI
boxes get their own new `input_devices` table (same shape as
`output_devices`, but kept structurally independent so the two graphs
never share or conflate device rows). Every existing input row converts
automatically via a one-time Go migration (mirroring Slice 11's), the
riskiest and most-tested part of this feature since it must reproduce
real production rental totals and stagebox/multi routing exactly. Color
is set only on the Channel and traced forward through the graph on the
frontend — never stored anywhere else — the same "derive, don't store"
instinct the Output graph already established for node role/zone.

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi router, modernc.org/sqlite, golang-migrate;
Vite, TanStack Query, Tailwind. No new dependency on either side — the
canvas reuses the Output graph's hand-rolled SVG + React state technique
(research.md R1); color inheritance and the legacy migration are pure
Go/TypeScript logic, no new library.

**Storage**: SQLite — migration `029_input_signal_graph` renames
`audio_patch_inputs` → `input_channels` (keeping legacy columns
temporarily) and adds `input_sources`, `input_devices`, `input_cables`,
plus a `preamp_connectors` reference-value row for
`mini_jack_3_5mm`; a Go-level data-migration step then converts every
legacy row into the new shape; `030_drop_legacy_input_channel_columns`
drops the now-superseded columns once that conversion is verified
(mirrors Slice 11's `025`/`026` split).

**Testing**: Go `testing` + `httptest` (new `input_cables_test.go`
mirroring `output_cables_test.go`; a dedicated
`input_signal_graph_migration_test.go` replaying the conversion algorithm
per legacy row shape); Vitest (`inputGraph.ts` pure functions,
`inputSignalFlow.test.ts`, extended `printSheets.test.tsx`).

**Target Platform**: Linux server, single binary + static frontend

**Project Type**: Web application (backend + frontend)

**Performance Goals**: N/A — single-user tool; graph size bounded by one
event's real input list (SC-006 exercises 32 Sources, still tens of rows,
not hundreds); rental CTE stays one query.

**Constraints**: Never touch the user's live dev DB (verification on
copies only, this project's standing DB-safety rule); never modify source
LL.xlsx; the reference event's real, already-built Audio Input rows MUST
convert losslessly — same highest-stakes-migration discipline Slice 11's
chain-to-graph conversion required, applied here to data that's been live
even longer (Audio Inputs predates the Output graph entirely).

**Scale/Scope**: 2 schema migrations (extend + rename, then drop legacy
columns), 1 Go-level data-conversion step, 3 new tables
(`input_sources`, `input_devices`, `input_cables`) plus 1 renamed/slimmed
table (`input_channels`), rental CTE extended with 3 new arms, 1 new
interactive canvas UI replacing the flat table, 3 new management sections
(Channels, Sources, Devices) plus the existing shared Stagebox/Stage-Multi
manager reused unchanged, Signal Flow + input print sheet rewritten to
walk the graph backward from each channel.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Data Model** — PASS. Splitting Source from Channel and
  connecting them with real, traversable cable edges is a strictly more
  accurate model of the constitution's own worked example ("mic → cable →
  stagebox → multicore → mixer channel") than a single flattened row ever
  was — the same generalization Slice 11 already made for the output
  side, now applied to the input side it was always the mirror of.
- **II. Extensibility by Design** — PASS with note (same note as Slices
  9/10/11). `from_kind`/`to_kind`/Source `kind` are Go-validated enums,
  not reference vocabularies — they select which table/behavior applies
  and drive validation/rental logic in code, matching the existing
  `destination_type`/`hop_kind`/Output-graph `from_kind`/`to_kind`
  precedent exactly.
- **III. Full-Stack Monorepo Architecture** — PASS. Versioned migrations;
  REST JSON on new `/events/{id}/input-sources`, `/input-devices`,
  `/input-cables` routes plus a reshaped `/events/{id}/input-channels`
  (renamed from `audio-inputs`); no new packages.
- **IV. Inventory-Driven Rental Workflow** — PASS. Every rented Source
  mic/stand, Device, and cable resolves to a real `inventory_items` FK,
  validated the same way every existing pick is; a Stagebox/Stage-Multi's
  console-side hop into a Channel is explicitly excluded from ever
  acquiring a cable pick (research.md R5), so there's no double-billing
  of the multicore's own built-in wiring, mirroring Slice 11's FR-013
  exactly in reverse.
- **V. Pragmatic Simplicity** — PASS with three notes, all addressed in
  Complexity Tracking: (1) a new `input_devices` table rather than
  reusing `output_devices`, to keep the two independent directional
  graphs from sharing a mutable resource neither has a field to scope;
  (2) no stored ports table (reaffirms Slice 11 R2); (3) the legacy data
  conversion runs as Go code, not a `.sql` migration, for the same
  unreviewable-branching reason Slice 11's did.

**Post-design re-check (Phase 1)**: PASS — data-model.md and the API
contract confirm no additional violations; Complexity Tracking documents
the three notes above with their rejected alternatives.

## Project Structure

### Documentation (this feature)

```text
specs/012-input-signal-graph/
├── plan.md                        # This file
├── research.md                    # Phase 0 output
├── data-model.md                  # Phase 1 output
├── quickstart.md                  # Phase 1 output
├── contracts/
│   └── input-graph-api.md         # Phase 1 output
├── mockup.html                    # Accepted design mockup (spec Assumptions)
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 029_input_signal_graph.up.sql             # NEW — rename
│   │                                               #       audio_patch_inputs
│   │                                               #       -> input_channels
│   │                                               #       (legacy columns kept
│   │                                               #       for now); create
│   │                                               #       input_sources,
│   │                                               #       input_devices,
│   │                                               #       input_cables;
│   │                                               #       seed mini_jack_3_5mm
│   ├── 029_input_signal_graph.down.sql            # NEW — reverse
│   ├── 030_drop_legacy_input_channel_columns.up.sql   # NEW — drop legacy
│   │                                               #       columns, once
│   │                                               #       conversion (below)
│   │                                               #       has run
│   └── 030_drop_legacy_input_channel_columns.down.sql
└── internal/
    ├── domain/
    │   └── audio.go                       # NEW: InputSource, InputDevice,
    │                                       # InputCable; AudioPatchInput
    │                                       # replaced by slimmed InputChannel
    ├── db/
    │   ├── audio_patch.go                 # input_channels CRUD (replaces
    │   │                                   # audio_patch_inputs CRUD);
    │   │                                   # input_sources/input_devices/
    │   │                                   # input_cables CRUD (new)
    │   ├── input_signal_graph_migration.go      # NEW — the one-time Go
    │   │                                         #       data conversion
    │   │                                         #       (research.md R7)
    │   ├── input_signal_graph_migration_test.go # NEW — per-legacy-shape
    │   │                                         #       conversion correctness
    │   ├── rental.go                      # 3 new arms: input_sources
    │   │                                   # (mic+stand), input_devices,
    │   │                                   # input_cables — flat per-row,
    │   │                                   # no doubling logic
    │   └── rental_test.go                 # extended
    └── api/
        ├── audio_patch.go                 # input_channels validation
        │                                   # (replaces audio_patch_inputs);
        │                                   # input_sources/input_devices/
        │                                   # input_cables handlers + routes
        │                                   # (port-bounds/uniqueness/
        │                                   # direction/kind validation,
        │                                   # R5's cableless-edge rule)
        ├── audio_patch_test.go            # extended
        └── input_cables_test.go           # NEW

frontend/src/
├── types/index.ts                         # NEW: InputSource, InputDevice,
│                                           # InputCable; AudioPatchInput
│                                           # replaced by slimmed
│                                           # InputChannel; AudioPatchResponse
│                                           # gains input_sources/
│                                           # input_channels/input_devices/
│                                           # input_cables
├── lib/
│   ├── inputGraph.ts                      # NEW — pure functions: derived
│   │                                       # port lists per node kind
│   │                                       # (reuses outputGraph.ts's
│   │                                       # stageboxPorts/stageMultiPorts
│   │                                       # directly, research.md R2),
│   │                                       # color-inheritance tracing
│   │                                       # (research.md R9), port
│   │                                       # compatibility rules
│   ├── inputSignalFlow.ts                 # NEW — walks input_cables
│   │                                       # backward from each channel
│   │                                       # (research.md R8), replaces
│   │                                       # the flat-row walk in
│   │                                       # InputPatchSheet today
│   └── inputSignalFlow.test.ts            # NEW
├── components/event/
│   ├── AudioInputsTab.tsx                  # rewritten — Channels section,
│   │                                       # StageboxMultiSection (reused
│   │                                       # unchanged), InputDeviceSection,
│   │                                       # SourceSection, Signal Flow
│   │                                       # card with Graph/Table toggle
│   ├── ChannelSection.tsx                  # NEW — Channels management
│   │                                       # table (mirrors
│   │                                       # OutputChannelsSection)
│   ├── SourceSection.tsx                   # NEW — Sources management
│   │                                       # table (mic/line conditional
│   │                                       # fields)
│   ├── InputDeviceSection.tsx              # NEW — mirrors
│   │                                       # ProcessingDeviceSection
│   └── InputGraphCanvas.tsx                # NEW — the canvas: 3-zone
│                                           # layout (Sources/Processing/
│                                           # Channels), compact single
│                                           # Sources/Channels nodes
│                                           # (spec FR-015), color-traced
│                                           # ports/cables, cable-item
│                                           # picker popover
└── components/print/
    ├── InputPatchSheet.tsx                # rewritten to walk
    │                                       # input_cables backward
    └── printSheets.test.tsx               # extended
```

**Structure Decision**: Web application layout per constitution — all
changes land in existing `backend/` and `frontend/` trees. Two new
frontend pure-logic files (`inputGraph.ts`, `inputSignalFlow.ts`) mirror
the Output graph's `outputGraph.ts`/`signalFlow.ts` split rather than
overloading those existing files, since the two graphs' direction and
node-kind sets genuinely differ (`source`/`channel` vs `mixer`/`device`);
`inputGraph.ts` still directly reuses `outputGraph.ts`'s
`stageboxPorts`/`stageMultiPorts` functions rather than duplicating them,
since that derivation math is identical regardless of which graph calls
it. `AudioInputsTab.tsx`'s old flat-table rendering is fully replaced,
matching how Slice 11 replaced Slice 10's chain editor outright rather
than keeping it as an option.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| New `input_devices` table, not a reuse of `output_devices` | The two graphs are independent and nothing today scopes an `output_devices` row to "belongs to the input graph" vs "output graph" — reusing the same table would mix an unrelated population into `ProcessingDeviceSection`'s existing listing and the rental arm with no filter to separate them | Adding a `graph` discriminator column to `output_devices` was considered — rejected as more invasive than a second table with the same shape: it requires an `ALTER TABLE` + backfill on Slice 11's already-shipped table plus new filtering logic on every existing query/UI surface that reads it, for a "one shared table" benefit this feature doesn't need (research.md R3) |
| No `input_ports` table (ports computed, not stored) | Reaffirms Slice 11 R2 — every port count (`Source.width`, `Stagebox.input_count`, `StageMulti.channels`, `InputDevice.{in,out}_port_count`) already lives on an existing row; a synthetic ports table would just be a second place for the same fact to drift out of sync | Same alternative Slice 11 already rejected, for the same reason, now extended to the Source/Channel kinds this feature adds |
| Legacy data conversion as Go code, not a `.sql` migration | Converting a flat, per-channel row (mic-vs-line inference, optional DI-device insertion, per-side stereo handling, splitter carry-over) into a branching Source/Device/Cable/Channel shape needs real conditional logic with no reasonable pure-SQL expression | A recursive-CTE SQL attempt was rejected for the same reason Slice 11's R5 rejected one: the branching depth makes it unreadable and unverifiable, for a migration whose correctness against the user's real, already-built input list matters more than anything else shipped in this feature |
