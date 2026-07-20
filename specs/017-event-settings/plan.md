# Implementation Plan: Per-Event Settings from a Personal Template

**Branch**: `017-event-settings` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-event-settings/spec.md`

## Summary

The nine planning vocabularies (`reference_values`: connector types,
cable types, signal types, mic stands, output types, power connectors,
truss types, channel colors) move from one table shared by every user and
every event to two independently-scoped homes: a new `reference_templates`
table (one editable "my defaults" set per user, auto-provisioned on first
sign-in, never referenced by planning data) and the existing
`reference_values` table extended with an `event_id` column (one
independent copy per event). Event creation copies the creating user's
current template into fresh event-scoped rows — a one-time snapshot, not
a live link, exactly like Slice 16's inventory duplication but without
any id-remapping step, since nothing references a `reference_values` row
by id (research.md R1). Every event that existed before this migration
gets the same one-time copy, fanned out directly in the migration SQL
(research.md R4) rather than a Go conversion. Deleting a value from an
event's vocabulary is still blocked while a planning row uses it — scoped
per-event now instead of globally, with one table (`lighting_fixtures`)
needing a join through `lighting_rigs` to reach `event_id` (research.md
R6); deleting from a personal template is never blocked, since nothing
outside the template itself ever references it. Event-vocabulary edit
access reuses the existing `RequireEventAccess` gate unchanged (owner/
contributor can edit, viewer can only read) — no new middleware, unlike
Slice 16's inventory-management routes which needed a stricter owner-only
gate for a different kind of resource (research.md R3).

## Technical Context

**Language/Version**: Go 1.25.0 (backend), TypeScript 5 / React 18
(frontend) — unchanged.

**Primary Dependencies**: none new.

**Storage**: SQLite — migration `039_event_settings` adds the
`reference_templates` table and rebuilds `reference_values` to add
`event_id` and change its unique constraint from `(vocabulary, value)` to
`(event_id, vocabulary, value)` (a table rebuild — SQLite can't `ALTER
TABLE` a constraint — using the existing `PRAGMA defer_foreign_keys` /
create-copy-drop-rename pattern from migrations 017/018/023). The
migration also fans out one copy of the pre-existing global vocabulary to
every pre-existing event in the same file, pure SQL, no Go conversion
(research.md R4). See data-model.md.

**Testing**: Go `testing` + `httptest`, matching project convention — new
`db/reference_templates_test.go` (or extended `reference_test.go`),
extended `api/reference_test.go` for both new route groups, a migration
test asserting the pre-existing-event fan-out (mirroring
`buses_migration_test.go`'s existing pattern for `mixer_groups`'
analogous per-event seed). Vitest for the frontend "My defaults" page
split and the event-Settings-tab addition — the ten existing
`useReferenceData` consumers need only a signature-compatible `eventId`
argument added to their call, covered by their existing component tests
continuing to pass.

**Target Platform**: unchanged.

**Project Type**: Web application (backend + frontend).

**Constraints**: Never touch the live dev DB ([[db-safety-rule]]) — the
pre-existing-event fan-out and the `reference_values` table rebuild must
be verified against a copy first, confirming every pre-existing event's
vocabulary labels are byte-for-byte unchanged and every existing planning
row's picked value still resolves. `countReferenceUsage` must be
verified per-event, not just per-value, with a test asserting one event's
in-use value never blocks deletion of the same `(vocabulary, value)` pair
from an unrelated event.

**Scale/Scope**: 1 SQL migration (1 new table, 1 rebuilt table, 1
pure-SQL pre-existing-event fan-out); 0 new middleware (both new route
groups reuse existing gates — `RequireAuth` alone for the template
routes, the existing `RequireEventAccess` for event routes); ~10 existing
frontend components each gain one `eventId` argument to an existing hook
call; `Settings.tsx` splits into a personal "My defaults" page and a new
per-event Settings tab.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No amendment needed (confirmed in research.md).

- **I. Domain-First Data Model** — PASS. `reference_templates` and the
  now-event-scoped `reference_values` are first-class entities with real
  ownership relationships (to a user, to an event respectively), not
  bolted-on fields.
- **II. Extensibility by Design** — PASS, unaffected — vocabulary values
  remain configurable data, editable without code changes; this slice
  changes *whose* vocabulary a value belongs to, not how vocabularies
  themselves are structured or extended.
- **III. Full-Stack Monorepo Architecture** — PASS. New code lands in the
  existing `backend/internal/{api,db,domain}` and `frontend/src/{pages,
  components,api}` trees; no new middleware subpackage file is even
  needed (research.md R3), so this slice touches less of the established
  layout than Slice 16 did.
- **IV. Inventory-Driven Rental Workflow** — PASS, unaffected. This slice
  touches planning vocabularies (connector types, cable types, etc.), not
  the rental catalog or export mechanism Slice 16 already scoped per
  owner.
- **V. Pragmatic Simplicity** — PASS. No new runtime dependency, no new
  service. The pre-existing-event fan-out is a single `INSERT ... SELECT`
  in the migration file itself rather than new Go conversion machinery
  (research.md R4) — the simpler of the two approaches ROADMAP.md
  considered, chosen deliberately over the literal suggestion there
  (flagged explicitly to the user in research.md R4).

**Post-design re-check (Phase 1)**: PASS — data-model.md and the API
contract introduce nothing beyond the one new table, one rebuilt table,
and the reused existing middleware already justified above.

## Project Structure

### Documentation (this feature)

```text
specs/017-event-settings/
├── plan.md                        # This file
├── research.md                    # Phase 0 output
├── data-model.md                  # Phase 1 output
├── contracts/
│   └── reference-data-api.md      # Phase 1 output
├── checklists/requirements.md     # Spec quality checklist (passing)
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 039_event_settings.up.sql      # NEW — reference_templates table;
│   │                                   #      reference_values rebuild (+event_id,
│   │                                   #      new unique constraint); pre-existing-event
│   │                                   #      fan-out, pure SQL (research.md R4)
│   └── 039_event_settings.down.sql
└── internal/
    ├── domain/
    │   └── reference.go                # EDITED — ReferenceValue gains EventID;
    │                                    #          + ReferenceTemplate struct
    ├── db/
    │   ├── reference.go                 # EDITED — ListReferenceData/CreateReferenceValue/
    │   │                                #          UpdateReferenceValueLabel/DeleteReferenceValue
    │   │                                #          all gain an eventID parameter;
    │   │                                #          countReferenceUsage joins through
    │   │                                #          lighting_rigs for power_connectors
    │   │                                #          (research.md R6); fixture_modes functions
    │   │                                #          in this file untouched (Slice 16's concern)
    │   ├── reference_templates.go       # NEW — ListReferenceTemplate, CreateReferenceTemplateValue,
    │   │                                #        UpdateReferenceTemplateValueLabel,
    │   │                                #        DeleteReferenceTemplateValue (no in-use check —
    │   │                                #        research.md R6), EnsureUserHasReferenceTemplate
    │   │                                #        (research.md R5)
    │   ├── reference_templates_test.go  # NEW
    │   ├── reference_test.go            # EDITED — every existing test gains event scoping
    │   └── events.go                    # EDITED — CreateEvent copies the creator's current
    │                                    #          template into new event-scoped rows,
    │                                    #          same transaction as the existing LR-group seed
    └── api/
        ├── router.go                    # EDITED — new /reference-templates/... group
        │                                #          (RequireAuth only); ReferenceHandler's
        │                                #          old top-level /reference-data registration
        │                                #          replaced by an event-scoped one inside the
        │                                #          existing /events/{eventID} group
        ├── reference.go                 # EDITED — handlers gain eventID from the URL;
        │                                #          fixture-modes handlers here untouched
        ├── reference_test.go            # EDITED — event-scoped request paths
        ├── reference_templates.go       # NEW — ReferenceTemplateHandler: CRUD, no path param
        ├── reference_templates_test.go  # NEW
        └── auth.go                      # EDITED — callback also calls
                                          #          db.EnsureUserHasReferenceTemplate after
                                          #          db.EnsureUserHasInventory

frontend/src/
├── types/index.ts                       # + ReferenceTemplateValue type (or reuse
│                                         #   ReferenceValue with the same shape)
├── api/
│   ├── reference.ts                     # EDITED — getReferenceData/create/update/delete
│   │                                    #          all take eventId
│   └── referenceTemplates.ts            # NEW — mirrors reference.ts, no eventId
├── hooks/
│   └── useReferenceData.ts              # EDITED — takes eventId; + useReferenceTemplate()
├── pages/
│   ├── Settings.tsx                     # RENAMED/SPLIT → MyDefaults.tsx (personal
│   │                                    #   template CRUD, no eventId; also fixes the
│   │                                    #   pre-existing missing channel_colors title —
│   │                                    #   research.md R7)
│   └── EventDetail.tsx / tabs/          # EDITED — new event-scoped Settings tab,
│                                        #          same VocabularySection CRUD UI,
│                                        #          readOnly-gated like other mutating tabs
└── components/event/                    # EDITED (eventId argument added only) —
                                          # ColorSelect, ProcessingDeviceSection,
                                          # InputDeviceSection, SourceSection,
                                          # TrueOutputDeviceSection, AudioOutputsTab,
                                          # LightingTab, plus print/LightingRigSheet,
                                          # print/OutputPatchSheet
```

**Structure Decision**: Web application layout per constitution — all
changes land in the existing `backend/` and `frontend/` trees. No new
middleware subpackage file is needed at all (research.md R3), a lighter
footprint than Slice 16's `api/middleware/inventory_access.go` because
event-vocabulary access reuses `RequireEventAccess` verbatim and
personal-template access needs only the existing `RequireAuth`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| `countReferenceUsage`'s query shape varies per vocabulary (flat `WHERE` for three, a join for `lighting_fixtures`) rather than one uniform query | `lighting_fixtures` has no `event_id` column of its own — only `lighting_rigs` does — a real schema fact, not a design choice | Adding a denormalized `event_id` column to `lighting_fixtures` — rejected: touches an existing table for the sole benefit of one delete-protection query, when a join expresses the same fact directly from the schema as it already exists |
| Pure-SQL pre-existing-event fan-out in the migration file, deliberately diverging from ROADMAP.md's literal "needs its own one-time Go conversion" wording | The fan-out depends on no runtime state (unlike Slice 15/16's login-order-dependent claims) and has direct precedent in this exact codebase (`021_groups_dcas.up.sql`'s per-event `mixer_groups` seed) | A Go conversion sequenced in `db.go`, per the literal ROADMAP.md wording — rejected: adds a full extra file, test file, and `db.go` sequencing step to do exactly what one `INSERT ... SELECT` already does correctly and more simply; flagged explicitly to the user in research.md R4 rather than silently deviating |
