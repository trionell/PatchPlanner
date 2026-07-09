# Implementation Plan: Mono/Stereo Channels & DI Cabling

**Branch**: `009-stereo-di` | **Date**: 2026-07-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-stereo-di/spec.md`

## Summary

Add a per-channel **width** (mono/stereo) to audio inputs and outputs. A stereo channel carries a second, independently patchable physical connection (own stagebox/stage-multi route — adjacency is only a client-side convenience default) and, on inputs, a **mixer behavior** (*stereo channel* = one console strip, *linked channels* = two). DI-type inputs gain a **source cable** pick (source → DI) with a per-channel *two individual cables* vs *one splitter cable* choice on stereo rows. The rental CTE doubles per-side physical equipment (mics, stands, cables, speakers) while two-channel devices (DI, amplifier) count once; the Excel export follows automatically. Signal flow traces both sides and the two-hop DI chain, flagging a missing source cable as a gap; print sheets show pairs and both cables.

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi router, modernc.org/sqlite, golang-migrate; Vite, TanStack Query, Tailwind

**Storage**: SQLite — migration `022_stereo_di` (next after 021), plain `ALTER TABLE ... ADD COLUMN` on both patch tables

**Testing**: Go `testing` + `httptest` (api/db packages, migration replay via `openMigratedTo`/`execMigrationFileTx`); Vitest (signalFlow, printSheets)

**Target Platform**: Linux server, single binary + static frontend

**Project Type**: Web application (backend + frontend)

**Performance Goals**: N/A — single-user tool; rental CTE stays one query

**Constraints**: Never touch the user's live dev DB (verification on copies); never modify source LL.xlsx; existing events must render and count exactly as before (all pre-existing rows mono, no source cable)

**Scale/Scope**: 2 tables × ~6 new columns, 1 migration, rental CTE arm changes + 1 new arm, 2 tab UIs, 2 print sheets, signal-flow model, ~8 new/extended tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Data Model** — PASS. Width, mixer link behavior, side-B patch route, and source cable are real console/stage concepts; side B is a first-class route (FK columns), not free text.
- **II. Extensibility by Design** — PASS with note. `width`, `mixer_behavior`, and `source_cabling` are stored as TEXT values validated in handlers, **not** reference vocabularies: each value carries counting/numbering semantics in code (doubling, pair display, splitter counting), so a user-added third value could not mean anything. This matches the existing `destination_type` precedent, not the connector/cable vocabularies. New columns are optional/nullable → non-destructive (Principle II's patch-schema clause).
- **III. Full-Stack Monorepo Architecture** — PASS. Versioned migration 022; REST JSON on existing `/events/{id}/audio-patch` routes; no new packages.
- **IV. Inventory-Driven Rental Workflow** — PASS. Source cables are catalog picks validated like all cable picks; the rental CTE and LL.xlsx export count them per the standing invariant.
- **V. Pragmatic Simplicity** — PASS. No new tables, no join tables; conditional columns on existing rows; frontend keeps useState/draft-row pattern.

**Post-design re-check (Phase 1)**: PASS — no violations introduced; Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/009-stereo-di/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── stereo-di-api.md # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 022_stereo_di.up.sql        # NEW — width/mixer_behavior/side-B/source-cable columns
│   └── 022_stereo_di.down.sql      # NEW — reverse
└── internal/
    ├── domain/audio.go              # AudioPatchInput/Output: Width, MixerBehavior, *B fields, SourceCableItemID, SourceCabling
    ├── db/
    │   ├── audio_patch.go           # column lists, scanners, INSERT/UPDATE params
    │   ├── rental.go                # CTE: doubled arms + source-cable arm
    │   ├── rental_test.go           # extended: doubling matrix
    │   └── stereo_migration_test.go # NEW — replay 022 on a v21 DB
    └── api/
        ├── audio_patch.go           # enum validation (width/mixer_behavior/source_cabling), source-cable ref validation
        ├── audio_patch_test.go      # extended: round-trip + validation 400s
        └── rental_test.go           # extended: stereo & DI counting end-to-end

frontend/src/
├── types/index.ts                   # new optional fields on both patch types
├── lib/
│   ├── signalFlow.ts                # sourceCable + di hops, pathB for stereo
│   └── signalFlow.test.ts           # extended
├── components/event/
│   ├── AudioInputsTab.tsx           # Width column, stacked side-B routing, source-cable cell, linked-aware addRow
│   ├── AudioOutputsTab.tsx          # Width column, stacked side-B destination, linked-agnostic addRow
│   └── SignalFlowTab.tsx            # renders extended hops
└── components/print/
    ├── InputPatchSheet.tsx          # pair numbering, both sides, both cables
    ├── OutputPatchSheet.tsx         # width + both destinations
    └── printSheets.test.tsx         # extended
```

**Structure Decision**: Web application layout per constitution — all changes land in existing `backend/` and `frontend/` trees; no new top-level directories.

## Complexity Tracking

No constitution violations — table intentionally left empty.
