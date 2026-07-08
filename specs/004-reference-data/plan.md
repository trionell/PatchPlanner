# Implementation Plan: Configurable Reference Data

**Branch**: `004-reference-data` | **Date**: 2026-07-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-reference-data/spec.md`

## Summary

Move the eight planning vocabularies (signal types, preamp connectors, signal
cable types, speaker cable types, output types, mic stands, power connectors,
truss types) out of `frontend/src/lib/constants.ts` arrays and SQLite CHECK
constraints into a single `reference_values` table seeded with today's values.
Planning rows keep storing plain text values (no FK rewrite), so every
existing row stays valid and legacy values still display (FR-007). A
`GET /api/v1/reference-data` endpoint feeds all dropdowns in one fetch;
value CRUD endpoints back a new Settings page with in-use delete protection.
A `fixture_modes` table attached to inventory items lets the Lighting tab
auto-fill DMX channel counts (copy-on-pick). CHECK constraints on
`signal_type`, `mic_stand`, `output_type`, and `truss_type` are dropped via
SQLite table rebuilds using `PRAGMA defer_foreign_keys` (works inside the
transaction golang-migrate wraps each migration in).

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5 + React 18 (frontend)

**Primary Dependencies**: chi v5, modernc.org/sqlite, golang-migrate v4 (backend); Vite, TanStack Query v5, Tailwind (frontend)

**Storage**: SQLite — new `reference_values` and `fixture_modes` tables; rebuilds of `audio_patch_inputs`, `audio_patch_outputs`, `truss_sections` to drop CHECK constraints

**Testing**: Go `testing` + `httptest` against real migrations (existing harness in `backend/internal/db/testutil_test.go` / `backend/internal/api/testutil_test.go`); Vitest for non-trivial frontend logic

**Target Platform**: Local single-user web app (Linux server binary + browser)

**Project Type**: Web application (Go REST API + React SPA)

**Performance Goals**: Reference data is a handful of rows; one query per vocabulary set is fine. No measurable perf concern.

**Constraints**: Upgrade must be invisible — existing DBs migrate with zero row changes; migration table rebuilds must preserve all data and run under the FK-enabled pooled connection (see research.md R1)

**Scale/Scope**: 8 vocabularies × ~5–8 values each; 2 new tables; 3 table rebuilds; ~8 new endpoints; 1 new page + dropdown rewiring in 4 planning components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Domain-First Data Model | ✅ PASS | Vocabularies model real AVL terminology (connector, cable, stand, truss types); fixture modes model real DMX modes. Values remain first-class data on planning rows. |
| II. Extensibility by Design | ✅ PASS | This slice *is* Principle II compliance: connector/cable/signal/stand/truss types and DMX modes become configurable records; CHECK constraint enums are removed. |
| III. Full-Stack Monorepo Architecture | ✅ PASS | Same layout as slices 1–3. REST JSON under `/api/v1/`. Migrations versioned and auto-applied. (Known tracked deviation: `backend/internal/{api,db}` vs constitution's `backend/{api,db}` — carried since slice 1, resolved in Slice 6.) |
| IV. Inventory-Driven Rental Workflow | ✅ PASS | No rental-order surface touched. Fixture modes attach to inventory items without altering import/export behavior (FR-011 guarded by tests). |
| V. Pragmatic Simplicity | ✅ PASS | One generic table for all 8 vocabularies (not 8 tables, not a meta-model); values stored as text on rows (no FK id rewrite of 3 tables' data); no ordering/audit features. |

Post-design re-check (after Phase 1): still PASS — contracts add one resource family (`/reference-data`) and one nested resource (`fixture-modes`); no new dependencies.

## Project Structure

### Documentation (this feature)

```text
specs/004-reference-data/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── reference-data-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 013_reference_values.{up,down}.sql     # table
│   ├── 014_reference_seed.{up,down}.sql       # seed rows (single multi-row INSERT)
│   ├── 015_fixture_modes.{up,down}.sql        # table
│   ├── 016_inputs_drop_checks.{up,down}.sql   # rebuild audio_patch_inputs
│   ├── 017_outputs_drop_checks.{up,down}.sql  # rebuild audio_patch_outputs
│   └── 018_truss_drop_checks.{up,down}.sql    # rebuild truss_sections
├── internal/
│   ├── domain/reference.go                    # ReferenceValue, FixtureMode, request types
│   ├── db/reference.go                        # vocabulary CRUD, in-use checks, fixture-mode CRUD
│   ├── db/reference_test.go
│   ├── api/reference.go                       # handlers + routes
│   └── api/reference_test.go

frontend/
├── src/
│   ├── api/reference.ts                       # typed client calls
│   ├── hooks/useReferenceData.ts              # shared query + option merging (legacy values)
│   ├── pages/Settings.tsx                     # vocabulary editor + route/nav entry
│   ├── components/FixtureModeManager.tsx      # per-model mode editor (Inventory item context)
│   ├── components/event/AudioInputsTab.tsx    # dropdowns → reference data
│   ├── components/event/AudioOutputsTab.tsx   # dropdowns → reference data
│   ├── components/event/LightingTab.tsx       # dropdowns → reference data + mode picker
│   ├── lib/constants.ts                       # shrinks to structural enums only
│   └── types/index.ts                         # ReferenceValue, ReferenceData, FixtureMode
```

**Structure Decision**: Same two-package web layout as slices 1–3. Backend
logic follows the established `internal/{domain,db,api}` pattern; frontend
adds one page, one hook, one component, and rewires existing tabs.

## Design Decisions (from research.md)

- **R1 — Dropping CHECK constraints**: SQLite cannot `ALTER` a CHECK away; the
  affected tables are rebuilt (create new → copy → drop old → rename). The
  migrate driver wraps each migration in a transaction on the FK-enabled pool,
  where `PRAGMA foreign_keys=OFF` is a silent no-op — so rebuilds use
  `PRAGMA defer_foreign_keys=ON`, which is legal inside a transaction and
  defers enforcement to COMMIT (by which point `lighting_fixtures` rows again
  resolve `truss_sections`). Verified against golang-migrate's sqlite driver
  source (tx-wrap default on).
- **R2 — One table, values as text**: `reference_values(vocabulary, value,
  label)` with `UNIQUE(vocabulary, value)`. Planning rows keep their existing
  text columns — no FK ids, no data rewrite, FR-007 (legacy values) free.
  Validation stays at the dropdown level; the API does not reject unknown
  vocabulary values on planning rows (matches today's behavior for
  `preamp_connector`/`cable_type`, which never had CHECKs).
- **R3 — In-use protection**: delete runs EXISTS probes over a hard-coded
  vocabulary→(table, column) map (data-model.md §Usage map). 409 with the
  reason when found.
- **R4 — Copy-on-pick fixture modes**: `lighting_fixtures.dmx_channel_mode`
  (text) and `dmx_channel_count` stay authoritative; picking a mode copies
  name+count into the fixture. Mode edits/deletes never touch fixtures
  (FR-010). Modes cascade-delete with their inventory item; `UpsertInventory`
  never deletes matched items, so re-import preserves modes (FR-011).
- **R5 — Frontend consumption**: single `GET /api/v1/reference-data` returns
  all vocabularies keyed by name; `useReferenceData()` wraps it in a TanStack
  query (`['reference-data']`) and exposes `options(vocab, currentValue?)`
  which appends a row's stored value when it's missing from the vocabulary
  (FR-007). Settings mutations invalidate the key; dropdowns update without
  reload. `destinationTypes` and category types remain in `constants.ts`
  (structural, per spec).
- **R6 — Stage multi connector**: `stage_multis.connector_type` is a free-text
  field today (no dropdown, no CHECK); it is out of scope for this slice and
  noted as a candidate to adopt the signal-cable vocabulary later.

## Complexity Tracking

No constitution violations. The only pre-existing deviation
(`backend/internal/` layout) is tracked since slice 1 and scheduled for
Slice 6.
