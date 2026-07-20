# Implementation Plan: Event Ownership & Sharing

**Branch**: `015-event-sharing` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-event-sharing/spec.md`

## Summary

Every event gains exactly one owner (`events.owner_user_id`) and any number
of collaborators (`event_memberships`, role `contributor` | `viewer`).
A second authorization middleware, `middleware.RequireEventAccess`, sits
behind Slice 14's `RequireAuth` and gates every `/events/{eventID}/...`
route by HTTP method: GET needs at least viewer, mutations need owner or
contributor. Getting this middleware in place requires a real structural
change — six existing handlers (`audio_patch.go`, `lighting.go`,
`rental.go`, `owned.go`, `stage_plots.go`, `plot_trusses.go`) currently
register their `/events/{eventID}/...` routes directly on the flat router
they're handed; they move under one shared nested chi group declared once
in `router.go`, with their route strings' now-redundant prefix stripped
(mechanical, no handler-body changes). Events the caller has no role on at
all 404 (not 403 — "completely invisible" per FR-008); a viewer's mutating
request 403s. Pre-existing events (created before this slice) get an owner
via an idempotent `WHERE owner_user_id IS NULL` claim that runs on every
login — whoever logs in first after this ships claims them all, and it's
a guaranteed no-op for everyone after that, with no separate "am I first"
check needed. New `GET/POST /events/{eventID}/members` and
`PATCH/DELETE .../members/{userID}` endpoints manage collaborators;
`GET /users` feeds the invite picker from everyone who has ever signed in.
Frontend UI scope is deliberately bounded: a role-aware banner and the new
Invite UI are role-gated, but the app's existing ~8 event-detail tabs
(13 prior slices' worth of add/edit/delete controls) are *not* individually
audited/hidden for viewers — backend 403 enforcement is complete and
authoritative, and a blocked action already surfaces through each
component's existing per-component inline-error display (research.md R4).

## Technical Context

**Language/Version**: Go 1.25.0 (backend), TypeScript 5 / React 18
(frontend) — unchanged.

**Primary Dependencies**: none new on either side — this slice is pure
application logic on top of Slice 14's `users` table and auth middleware.

**Storage**: SQLite — migration `037_event_sharing` adds `events.owner_user_id`
(nullable column) and the `event_memberships` table (see data-model.md).
Purely additive; no `db.go` sequencing entry needed.

**Testing**: Go `testing` + `httptest` — `db/events_test.go` and
`db/event_memberships_test.go` (new — no dedicated events test file
existed before this slice; event CRUD was only incidentally exercised via
other tests' `seedEvent` helper), `api/middleware/event_access_test.go`
(new), `api/event_members_test.go` (new), `api/users_test.go` (new).
Existing `internal/api` tests need **no changes**: every one of them
creates its test event via `POST /events` through the shared authenticated
test client (confirmed via `grep -L "INSERT INTO events" internal/api/*.go`
— no test bypasses the API to insert an event directly via SQL), so every
test-created event is automatically owned by the seeded test user and
passes `RequireEventAccess` without further `testutil_test.go` changes.

**Target Platform**: unchanged.

**Project Type**: Web application (backend + frontend).

**Constraints**: Never touch the live dev DB ([[db-safety-rule]]) — the
ownerless-events claim must be verified against a copy, confirming it
assigns ownership without altering any other column. Router restructuring
(research.md R1) must not change any existing route's URL or request/response
shape — only its authorization gate changes; the full existing backend test
suite passing unmodified is the acceptance bar for this.

**Scale/Scope**: 1 SQL migration (1 column + 1 table); 1 new middleware
file; 6 existing handler files get a mechanical prefix-strip + are called
with a different (nested) router; `EventsHandler` and `OwnedHandler` split
into two registration methods each (a precedent already established by
`StagePlotsHandler`'s `Register`/`registerTrussRoutes`); 2 new handler
files (`event_members.go`, `users.go`); `domain.Event` gains one computed
field, one new `domain.EventMembership` struct; frontend gains an invite
dialog, a members list, role badges, and a read-only banner — no changes
to the internals of the 8 existing event-detail tab components.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No amendment needed (confirmed in research.md) — this slice needs no
constitution changes.

- **I. Domain-First Data Model** — PASS. Ownership/membership are
  administrative access-control entities, not AVL equipment — the same
  category `users`/`sessions` (Slice 14) already established without
  amending this principle.
- **II. Extensibility by Design** — N/A.
- **III. Full-Stack Monorepo Architecture** — PASS. New code lands in the
  existing `backend/internal/{api,db,domain}` and `frontend/src/{pages,
  components,hooks,api}` trees; `api/middleware/event_access.go` is a
  second file in the `middleware` subpackage the v0.3.0 constitution
  amendment already canonicalized (no new subpackage).
- **IV. Inventory-Driven Rental Workflow** — N/A.
- **V. Pragmatic Simplicity** — PASS. No new dependency, no new
  infrastructure; the ownerless-events bootstrap reuses a single `WHERE`
  clause instead of extra state-tracking (research.md R3); the frontend
  scope decision (research.md R4) is itself a pragmatic-simplicity call,
  justified in Complexity Tracking below.

**Post-design re-check (Phase 1)**: PASS — data-model.md and the API
contract introduce nothing beyond the one column, one table, and the
router restructuring already justified above.

## Project Structure

### Documentation (this feature)

```text
specs/015-event-sharing/
├── plan.md                        # This file
├── research.md                    # Phase 0 output
├── data-model.md                  # Phase 1 output
├── contracts/
│   └── event-sharing-api.md       # Phase 1 output
├── checklists/requirements.md     # Spec quality checklist (passing)
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 037_event_sharing.up.sql      # NEW — events.owner_user_id, event_memberships
│   └── 037_event_sharing.down.sql
└── internal/
    ├── domain/
    │   ├── event.go                  # EDITED — + OwnerUserID (internal), YourRole (wire)
    │   └── event_membership.go       # NEW — EventMembership struct
    ├── db/
    │   ├── events.go                 # EDITED — CreateEvent(owner), ListEventsForUser,
    │   │                              #          GetEventRole, ClaimOwnerlessEvents
    │   ├── events_test.go             # NEW
    │   ├── event_memberships.go       # NEW — ListEventMembers (owner+members UNION),
    │   │                              #       UpsertEventMembership, RemoveEventMembership
    │   ├── event_memberships_test.go  # NEW
    │   └── users.go                  # EDITED — + ListUsers
    └── api/
        ├── middleware/
        │   ├── event_access.go        # NEW — RequireEventAccess, EventRoleFromContext
        │   └── event_access_test.go    # NEW
        ├── router.go                  # EDITED — nested /events/{eventID} group
        ├── events.go                  # EDITED — Register (list/create, scoped+owned),
        │                              #          new RegisterEvent (get/update/delete)
        ├── event_members.go           # NEW — members CRUD handler
        ├── event_members_test.go       # NEW
        ├── users.go                   # NEW — GET /users
        ├── users_test.go              # NEW
        ├── owned.go                   # EDITED — split Register / RegisterEventEquipment
        ├── audio_patch.go             # EDITED — strip "/events/{eventID}" prefix (mechanical)
        ├── lighting.go                # EDITED — same
        ├── rental.go                  # EDITED — same
        ├── stage_plots.go             # EDITED — same (already internally nested)
        ├── plot_trusses.go            # EDITED — same (already internally nested)
        └── auth.go                    # EDITED — callback calls db.ClaimOwnerlessEvents
                                        #          after session creation

frontend/src/
├── types/index.ts                     # + yourRole on Event, EventMember type
├── api/
│   ├── events.ts                      # unchanged shape, response now carries yourRole
│   ├── eventMembers.ts                # NEW — list/invite/updateRole/remove
│   └── users.ts                       # NEW — listUsers (invite picker)
├── components/event/
│   ├── EventMembersDialog.tsx         # NEW — invite picker + members list + role controls
│   └── ReadOnlyBanner.tsx             # NEW — small banner shown when yourRole === 'viewer'
├── pages/
│   ├── Dashboard.tsx                  # EDITED — role badge per event
│   ├── Events.tsx                     # EDITED — role badge per event
│   └── EventDetail.tsx                # EDITED — Invite button (owner/contributor only),
                                        #          ReadOnlyBanner (viewer only)
```

**Structure Decision**: Web application layout per constitution — all
changes land in the existing `backend/` and `frontend/` trees, confirmed
against the actual current router (`router.go`'s flat `NewRouter(db,
AuthConfig)`) and every event-scoped handler's real route strings (grep'd
directly, not assumed). `EventsHandler`/`OwnedHandler` splitting into two
registration methods each follows `StagePlotsHandler`'s existing
`Register`/`registerTrussRoutes` precedent rather than inventing a new
handler-structuring convention.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Restructuring 6 handler files' route registration into a shared nested group | The only way to attach one authorization middleware to every `/events/{eventID}/...` route without repeating `.With(...)` at ~50 individual call sites (35 in `audio_patch.go` alone), any one of which could be missed and silently ship unauthenticated | Per-route `.With()` — rejected: far more error-prone than one shared group applied once |
| Not auditing/hiding every existing mutating frontend control for viewers | 8 tabs' worth of controls built over 13 prior slices is a large surface area to exhaustively find and gate; backend 403 enforcement is already complete and correct regardless of frontend polish | A full per-component hide-pass — rejected: high effort, high risk of a missed control creating a false sense of completeness, for a UX gain over "the action fails with a clear inline message" that's marginal given viewers are expected to be occasional stakeholders, not daily editors |
