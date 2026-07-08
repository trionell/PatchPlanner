# Implementation Plan: Lighting Rig Workflow — Fixture IDs, Mode Picking & Bulk-Add

**Branch**: `007-lighting-fixture-workflow` | **Date**: 2026-07-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-lighting-fixture-workflow/spec.md`

## Summary

Three tightly scoped lighting-tab improvements: (1) an optional per-fixture
console number (`fixture_number`, UI "Fixture ID"/"FID") editable in the table,
duplicate-flagged client-side, and printed on the rig sheet; (2) the Add
Fixture dialog gains the catalog-mode picker the table already has (bugfix —
same cached `fixture-modes` query, copy-on-pick, reset on model switch); and
(3) a transactional bulk-add endpoint that creates N units of one model with
shared settings, fixture numbers incrementing from a suggested-but-editable
start, positions appended, and DMX addresses appended after the chosen
universe's occupied range — all-or-nothing with the existing
`ErrUniverseFull`/409 contract. One `ALTER TABLE` migration, one new endpoint,
no new dependencies.

## Technical Context

**Language/Version**: Go 1.22+ (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi, `modernc.org/sqlite`, golang-migrate (existing);
TanStack Query, Tailwind, lucide-react (existing). **No new dependencies.**

**Storage**: SQLite — migration 020 (`ALTER TABLE lighting_fixtures ADD COLUMN
fixture_number INTEGER`; no backfill, no rebuild)

**Testing**: Go `httptest` (new `lighting_test.go`: bulk placement, 409
rollback, validation, fixture_number round-trip); Vitest
(`duplicateFixtureNumbers` unit test, FID column in `printSheets.test.tsx`)

**Target Platform**: Local web app (Linux dev), backend :7331 / Vite :5173

**Project Type**: Web application (Go REST API + React SPA monorepo)

**Performance Goals**: Bulk-add is one transaction of ≤ 100 inserts —
imperceptible; duplicate detection is O(n) over an in-memory rig

**Constraints**: Bulk-add must never mutate existing fixtures (append, not
repack); existing rigs upgrade untouched (all fixture numbers NULL); the
user's live dev DB is never touched during verification

**Scale/Scope**: 1 migration, ~3 backend files + 1 new test file, ~4 frontend
files + 2 test touches; 1 new endpoint

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Data Model — PASS.** The console fixture ID is a
  real-world lighting concept (GrandMA patch number) stored as a first-class
  fixture attribute, named per the repo's number-vs-id convention.
- **II. Extensibility by Design — PASS.** No new enums or hard-coded types;
  modes remain catalog data (this slice finally surfaces them in the add
  dialog); bulk-add reuses power/connector vocabularies as data.
- **III. Full-Stack Monorepo Architecture — PASS.** Versioned migration, one
  resource-oriented endpoint under the existing rig route, typed structs.
  (Pre-existing layout deviation remains documented in Complexity Tracking.)
- **IV. Inventory-Driven Rental Workflow — PASS (no impact).** Bulk-added
  fixtures reference inventory items exactly like single-added ones, so the
  rental order counts them through the existing fixture arm; fixture numbers
  are planning-only data.
- **V. Pragmatic Simplicity — PASS.** Duplicate flagging is a derived UI
  state, not a constraint; the start-ID suggestion is client-side; bulk-add
  reuses the existing universe-full error contract instead of new machinery.

**Post-design re-check (after Phase 1): PASS** — design artifacts introduce no
new violations.

## Project Structure

### Documentation (this feature)

```text
specs/007-lighting-fixture-workflow/
├── plan.md              # This file
├── research.md          # R1 naming, R2 dup flag, R3 dialog modes, R4 bulk endpoint, R5 suggestion, R6 testing
├── data-model.md        # fixture_number, bulk request/response, derivation rules
├── quickstart.md        # Manual verification §1–§3 + automated gates
├── contracts/
│   └── lighting-workflow-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 020_fixture_number.up.sql         # NEW: ALTER TABLE lighting_fixtures ADD COLUMN fixture_number INTEGER
│   └── 020_fixture_number.down.sql       # NEW: DROP COLUMN
└── internal/
    ├── domain/lighting.go                # FixtureNumber *int on LightingFixture
    ├── db/lighting.go                    # column in CRUD/scan; BulkCreateLightingFixtures (tx, placement, ErrUniverseFull)
    └── api/
        ├── lighting.go                   # bulk route + handler (validation, 400/404/409)
        └── lighting_test.go              # NEW: bulk placement/rollback/validation + fixture_number round-trip

frontend/src/
├── types/index.ts                        # fixture_number on LightingFixture; BulkFixtureRequest
├── api/lighting.ts                       # bulkAddFixtures()
├── lib/
│   ├── lightingRig.ts                    # NEW: duplicateFixtureNumbers() helper
│   └── lightingRig.test.ts               # NEW: colocated unit test
├── components/
│   ├── event/LightingTab.tsx             # FID column + dup flag; dialog mode picker; Bulk add dialog/button
│   └── print/
│       ├── LightingRigSheet.tsx          # FID first column
│       └── printSheets.test.tsx          # updated expectations
```

**Structure Decision**: Existing monorepo layout; all changes land in the
files above. One new migration pair, one new endpoint on the existing lighting
route, no new packages or pages.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Pre-existing: Go packages live under `backend/internal/{api,db,domain,service}` instead of the constitution's `backend/{api,db}` + `internal/` split | Layout predates the constitution check and is consistent across the codebase; this slice follows it | Relocating packages mid-feature churns every import for zero behavior change; deviation remains documented here (carried since slice 6) |
