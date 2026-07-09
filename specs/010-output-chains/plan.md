# Implementation Plan: Output Signal Chains

**Branch**: `010-output-chains` | **Date**: 2026-07-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-output-chains/spec.md`

## Summary

Replace each output channel's flat destination/amplifier/speaker/cable
shape with an ordered **chain of hops** (`output_chain_hops`): each hop is
either a `device` (an inventory item, an owned item, or a reference to a
newly declared per-event **shared device** — `output_devices`) or a
`route` (a stagebox/stage-multi hand-off, with independent side-B routing
on stereo channels, same as Slice 9's existing side-B pattern but now
scoped per hop instead of per row), plus an optional cable into that hop.
Chains are always replaced wholesale on output update (mirrors the
`group_ids`/`dca_ids` pattern). The rental CTE gains three arms replacing
the three it loses: non-shared device hops and hop cables double on
stereo (matching today's speaker/cable rule); a shared device's own
declaration is counted once regardless of how many hops reference it
(matching today's amplifier rule, generalized). Migration 023
non-destructively converts every existing output row into an equivalent
chain (old amplifier → a one-off shared device; old speaker → a plain hop;
old cable → that hop's cable; old stagebox/stage-multi destination → a
route hop) and then drops the now-fully-superseded columns. Signal Flow
and the output print sheet render the full chain per channel with gap
flagging on incomplete hops, extending the presentation already built for
inputs in Slice 5/9.

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi router, modernc.org/sqlite, golang-migrate; Vite, TanStack Query, Tailwind

**Storage**: SQLite — migration `023_output_chains` (next after 022): two
new tables (`output_devices`, `output_chain_hops`), plus a rebuild of
`audio_patch_outputs` dropping fourteen now-superseded columns after
converting their data into hop rows

**Testing**: Go `testing` + `httptest` (api/db packages, migration replay
via `openMigratedTo`/`execMigrationFileTx`); Vitest (signalFlow, printSheets)

**Target Platform**: Linux server, single binary + static frontend

**Project Type**: Web application (backend + frontend)

**Performance Goals**: N/A — single-user tool; rental CTE stays one query
(join through a small per-event/per-output child table, no N+1)

**Constraints**: Never touch the user's live dev DB (verification on
copies); never modify source LL.xlsx; existing events' rental totals must
be byte-for-byte unchanged post-migration (SC-005) — the deepest
constraint in this slice, since it requires the migration's conversion
scheme to exactly reproduce the old amplifier/speaker/cable doubling
split via the new hop model (see research.md R3/R6)

**Scale/Scope**: 2 new tables, 1 table rebuild, 1 migration, 3 rental CTE
arms replacing 3, 1 new small CRUD resource (shared devices), 1 tab UI
rewritten (Audio Outputs), 1 new manager section (Output Devices), 1
extended Signal Flow tab (adds an output-chain view alongside the
existing input view), 1 extended print sheet, ~10 new/extended test files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Data Model** — PASS. A hop is a first-class,
  traversable relationship (device → cable → next hop), exactly the
  "mic → cable → stagebox → multicore → mixer channel" chain the
  constitution names as the model to follow — this slice extends that
  same pattern to the output side, where it was previously flattened.
  Shared devices are a real AVL concept (one physical rack unit feeding
  several channels), not an implementation convenience.
- **II. Extensibility by Design** — PASS with note (same note as Slice 9).
  `hop_kind` and `device_source` are Go-validated enums, not reference
  vocabularies: each value selects which FK columns are meaningful and
  carries counting semantics (shared-vs-doubling) in code, so a
  user-added value would have no defined behavior — matches the existing
  `destination_type`/`width` precedent. The hop schema itself is additive
  by construction: a new hop kind in a future slice is a new enum value
  plus new nullable columns, never a rewrite of existing rows.
- **III. Full-Stack Monorepo Architecture** — PASS. Versioned migration
  023; REST JSON on the existing `/events/{id}/audio-outputs` routes plus
  one small new resource (`/events/{id}/output-devices`) following the
  exact Stagebox/StageMulti CRUD shape; no new packages.
- **IV. Inventory-Driven Rental Workflow** — PASS. Every hop's rented
  device and cable resolves to a real `inventory_items` FK, validated the
  same way every existing pick is; owned-gear hops are structurally
  excluded from the rental CTE (no arm joins `owned_items`), matching
  Slice 3's invariant exactly.
- **V. Pragmatic Simplicity** — PASS with note. Two new tables is more
  schema than any prior slice added at once, but it's the minimum needed
  to represent a variable-length ordered chain (rejected alternatives —
  a fixed set of extra columns, or a JSON blob — either cap chain length
  arbitrarily or break Principle I/IV's traversable-FK requirement; see
  research.md R1). No new runtime dependency, no new service, no join
  table beyond what an ordered one-to-many collection requires.

**Post-design re-check (Phase 1)**: PASS — data-model.md and the API
contract confirm no additional violations; Complexity Tracking documents
the two-new-tables note above with its rejected alternatives, as required
when a Pragmatic Simplicity note is non-trivial.

## Project Structure

### Documentation (this feature)

```text
specs/010-output-chains/
├── plan.md                        # This file
├── research.md                    # Phase 0 output
├── data-model.md                  # Phase 1 output
├── quickstart.md                  # Phase 1 output
├── contracts/
│   └── output-chains-api.md       # Phase 1 output
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 023_output_chains.up.sql          # NEW — output_devices, output_chain_hops,
│   │                                      #       data conversion, audio_patch_outputs rebuild
│   └── 023_output_chains.down.sql        # NEW — reverse (best-effort: hops collapse back
│                                          #       to the old single amp/speaker/cable shape)
└── internal/
    ├── domain/
    │   └── audio.go                       # OutputDevice, OutputChainHop, ValidHopKinds/
    │                                       # ValidDeviceSources; AudioPatchOutput loses the
    │                                       # 13 superseded fields, gains Chain []OutputChainHop
    ├── db/
    │   ├── audio_patch.go                 # output CRUD rewritten around chain replace,
    │   │                                   # output_devices CRUD (create/list/update/delete
    │   │                                   # with reference-clearing), hop scanners
    │   ├── rental.go                      # CTE: 3 output arms → 3 hop/device arms
    │   ├── rental_test.go                 # extended: hop/shared-device doubling matrix
    │   └── output_chains_migration_test.go # NEW — replay 023 on a v22 DB, assert
    │                                       # lossless conversion + unchanged rental totals
    └── api/
        ├── audio_patch.go                 # chain validation, output_devices handlers +
        │                                   # routes, delete-clears-hop-references on
        │                                   # stagebox/stage-multi/output-device delete
        ├── audio_patch_test.go            # extended: chain round-trip, validation 400s
        ├── output_devices_test.go         # NEW — shared-device CRUD + delete-clears
        └── rental_test.go                 # extended: end-to-end hop/shared-device counting

frontend/src/
├── types/index.ts                         # OutputChainHop, OutputDevice types;
│                                           # AudioPatchOutput loses old fields, gains chain
├── lib/
│   ├── outputChain.ts                     # NEW — hop label formatting, gap detection
│   │                                       # (mirrors channelWidth.ts's role for Slice 9)
│   ├── signalFlow.ts                      # extended — builds an output-chain flow
│   │                                       # alongside the existing input flow
│   └── signalFlow.test.ts                 # extended
├── components/event/
│   ├── AudioOutputsTab.tsx                # rewritten — chain editor (add/reorder/remove
│   │                                       # hops) replaces the flat destination row
│   ├── OutputDeviceSection.tsx            # NEW — shared-device manager, same shape as
│   │                                       # StageboxMultiSection.tsx/BusSection.tsx
│   └── SignalFlowTab.tsx                  # extended — renders output chains alongside
│                                           # the existing input flows
└── components/print/
    ├── OutputPatchSheet.tsx               # full chain per channel, not just destination
    └── printSheets.test.tsx               # extended
```

**Structure Decision**: Web application layout per constitution — all
changes land in existing `backend/` and `frontend/` trees; one new
frontend component (`OutputDeviceSection.tsx`) follows an existing sibling
pattern rather than introducing a new organizational concept.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Two new tables (`output_devices`, `output_chain_hops`) in one slice | A variable-length, orderable chain of hops per output channel is the spec's core requirement (FR-001/002); a shared device referenced by many channels without double-counting (FR-007/008) needs its own identity independent of any single hop | A fixed set of extra columns on `audio_patch_outputs` caps chain length arbitrarily and can't be reordered/removed from the middle without renumbering columns (contradicts FR-002); a JSON blob column can't be joined for per-item rental aggregation (violates Principle IV's real-FK requirement) |
