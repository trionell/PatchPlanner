# Implementation Plan: Mixer Buses — Groups & DCAs

**Branch**: `008-groups-dcas` | **Date**: 2026-07-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-groups-dcas/spec.md`

## Summary

Replace free-text bus routing on audio input channels with managed per-event
entities: **groups** (with a built-in, undeletable LR that is the default
routing for every channel) and **DCAs** (replacing the `dca_groups` text
field, whose existing values are converted once by migration). Two new
entity tables plus two many-to-many join tables, CRUD endpoints following
the stagebox pattern, assignment arrays on the input create/update payload,
a badge-based multi-select cell in the inputs table, and group/DCA display
on the print sheet and Signal Flow tab.

Added scope (user, 2026-07-09): **console channel-strip colors** — groups,
DCAs, input channels, and output channels each carry an optional color from
a static palette. The palette is a new `channel_colors` vocabulary in the
existing `reference_values` table (value = CSS hex, label = name; Settings
page manages it with zero new code); rows store the color as plain text,
the `signal_type` pattern. Colors render in the inputs/outputs tabs and on
both print sheets (`print-color-adjust: exact`).

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi router, modernc.org/sqlite, golang-migrate;
Vite, TanStack Query, Tailwind (existing stack — nothing new)

**Storage**: SQLite. New migration `021_groups_dcas`: tables `mixer_groups`,
`mixer_dcas`, `audio_input_groups`, `audio_input_dcas` (entity tables include
`color TEXT`); LR seed + LR routing backfill; one-time DCA text conversion;
`DROP COLUMN dca_groups`; `ADD COLUMN color` on `audio_patch_inputs` and
`audio_patch_outputs`; seed the `channel_colors` vocabulary into
`reference_values` (8 console-style colors, value = hex, label = name)

**Testing**: Go `testing` + `httptest` (handler CRUD, assignment round-trip,
migration conversion replay); Vitest (print sheet, multi-select helper)

**Target Platform**: Linux server (single binary), modern browsers

**Project Type**: Web application (backend + frontend)

**Performance Goals**: Interactive editing on patch sheets of ≤ ~64 channels
and ≤ ~20 buses — no measurable latency concerns; assignments load with the
existing single audio-patch GET (two extra queries, no N+1)

**Constraints**: FK enforcement is on for every connection (slice 0) — join
tables use `ON DELETE CASCADE` so group/DCA/channel/event deletes clear
assignments in the engine, not in handler code. Migration must convert the
production `dca_groups` values ("Trummor" ×4) losslessly and run exactly once.

**Scale/Scope**: 1 migration, ~4 db-layer files touched, 1 new API handler
group, ~5 frontend components touched + 2 new shared components
(bus multi-select, palette color picker), 2 print surfaces (input + output
sheets)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Domain-First Data Model | ✅ Advances it | Groups and DCAs become first-class entities with traversable channel links, replacing a free-text field — exactly what Principle I demands ("not free-text fields") |
| II. Extensibility by Design | ✅ Pass | Buses are per-event data records; no enums, no hard-coded bus lists; LR is a flagged row, not special-cased schema; the color palette is a `reference_values` vocabulary (configurable data, Settings-editable for free), not a code enum |
| III. Full-Stack Monorepo | ✅ Pass | Versioned migration 021, REST resources under `/api/v1/events/{id}/...`, typed request/response structs, typed TS client |
| IV. Inventory-Driven Rental | ✅ N/A | No equipment selection involved; rental aggregation and export untouched (standing invariant not triggered — asserted by leaving rental tests unchanged) |
| V. Pragmatic Simplicity | ✅ Pass | No new dependencies; multi-select cell built from existing Badge + Select primitives; no state library |

**Post-design re-check (Phase 1)**: still ✅ — the design added no new
dependencies and no schema constructs beyond two entity tables and two join
tables with cascades.

## Project Structure

### Documentation (this feature)

```text
specs/008-groups-dcas/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R7
├── data-model.md        # Phase 1 — tables, domain structs, validation
├── quickstart.md        # Phase 1 — manual verification walkthrough
├── contracts/
│   └── groups-dcas-api.md   # Phase 1 — endpoint contracts
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 021_groups_dcas.up.sql      # NEW: tables (with color), LR seed, LR routing, DCA conversion,
│   │                               #      drop dca_groups, color columns on inputs/outputs, palette seed
│   └── 021_groups_dcas.down.sql    # NEW: re-add dca_groups, drop the four tables + color columns + palette
├── internal/domain/
│   └── audio.go                    # Group/DCA structs (with Color); inputs: -DCAGroups, +GroupIDs/+DCAIDs/+Color; outputs: +Color
├── internal/db/
│   ├── buses.go                    # NEW: Group/DCA CRUD, assignment load & replace helpers
│   ├── audio_patch.go              # input create/update write assignments in a tx; list merges them; color columns
│   ├── events.go                   # CreateEvent seeds the LR group
│   └── buses_migration_test.go     # NEW: step-to-020 → seed legacy text → migrate 021 → assert
└── internal/api/
    ├── audio_patch.go              # group/dca routes + handlers; assignment validation on inputs
    └── audio_patch_test.go         # bus CRUD, LR protection, assignment round-trip, defaults, color round-trip

frontend/src/
├── types/index.ts                  # Group, DCA (color); AudioPatchInput: -dca_groups, +group_ids/+dca_ids/+color; output +color
├── api/audioPatch.ts               # group/dca CRUD functions
├── components/event/
│   ├── BusSection.tsx              # NEW: Groups & DCAs managers (StageboxMultiSection pattern) + color pick
│   ├── BusMultiSelect.tsx          # NEW: badge-list + add-select cell; badges tinted by bus color
│   ├── ColorSelect.tsx             # NEW: palette swatch select (channel_colors vocabulary)
│   ├── AudioInputsTab.tsx          # Groups + DCA columns replace the DCA text column; Color column
│   ├── AudioOutputsTab.tsx         # Color column
│   └── SignalFlowTab.tsx           # group/DCA names (tinted) per channel card
└── components/print/
    ├── InputPatchSheet.tsx         # Groups + DCA columns (names, comma-joined, tinted); channel color swatch
    └── OutputPatchSheet.tsx        # channel color swatch
```

**Structure Decision**: Existing web-application layout; one new db file
(`buses.go`) and two new frontend components; everything else extends files
in place, matching how slices 6–7 landed.

## Complexity Tracking

No constitution violations — table intentionally left empty.
