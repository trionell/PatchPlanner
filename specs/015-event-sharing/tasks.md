---

description: "Task list for Slice 15 — Event Ownership & Sharing"
---

# Tasks: Event Ownership & Sharing

**Input**: Design documents from `/specs/015-event-sharing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/event-sharing-api.md — all present and read.

**Tests**: Included, matching this project's established convention (Go `httptest` + Vitest, co-located with the code they cover) and Slice 14's precedent.

**Organization**: Tasks are grouped by user story (spec.md's US1/US2/US3, priority order P1/P2/P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, or US3 — omitted for Setup/Foundational/Polish tasks

---

## Phase 1: Setup

**Purpose**: No new dependency or env var is needed this slice (research.md) — the one legitimate pre-flight check is confirming the branch (which carries all of Slice 14 forward) still builds and passes cleanly before new work lands on it.

- [ ] T001 Verify a clean baseline on `015-event-sharing`: `cd backend && go build ./... && go test ./...`, and `cd frontend && npx tsc -b && npm run lint && npm run test` — all must pass before any Slice 15 edit, so any later failure is attributable to this slice

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, data access, the second authorization middleware, and the router restructuring that every user story depends on.

**⚠️ CRITICAL**: No user story task can start until this phase is complete.

- [ ] T002 Write `backend/migrations/037_event_sharing.up.sql`: `ALTER TABLE events ADD COLUMN owner_user_id INTEGER REFERENCES users(id)` (nullable) and `CREATE TABLE event_memberships` (id, event_id REFERENCES events(id) ON DELETE CASCADE, user_id REFERENCES users(id) ON DELETE CASCADE, role TEXT CHECK(role IN ('contributor','viewer')), invited_by_user_id REFERENCES users(id) nullable, created_at) plus `UNIQUE(event_id, user_id)` and `idx_event_memberships_user_id`, per data-model.md
- [ ] T003 Write `backend/migrations/037_event_sharing.down.sql` dropping the index, the table, and the column (SQLite `DROP COLUMN` — already used by migration 035's down script)
- [ ] T004 [P] Edit `backend/internal/domain/event.go`: add `OwnerUserID *int64 \`json:"-"\`` (internal only) and `YourRole string \`json:"yourRole,omitempty"\`` (set by the API layer per request, never read from a DB column on this struct — data-model.md)
- [ ] T005 [P] Create `backend/internal/domain/event_membership.go` with the `EventMembership` struct (UserID, Email, Name, PictureURL, Role, InvitedByUserID, CreatedAt) — the members-list response shape, denormalized with the joined user's profile per the project's established display-row convention (`ownedItemColumns` in `owned.go`)
- [ ] T006 Edit `backend/internal/db/events.go`: `CreateEvent(db, event, ownerUserID int64)` sets `owner_user_id` on insert; replace `ListEvents` with `ListEventsForUser(db, userID int64)` (scopes to owner-or-member, computes `your_role` inline via `CASE`+`LEFT JOIN event_memberships`); add `GetEventRole(db, eventID, userID int64) (role string, found bool, err error)` (checks `events.owner_user_id` first, then `event_memberships`); add `ClaimOwnerlessEvents(db, userID int64) (rowsAffected int64, err error)` running `UPDATE events SET owner_user_id = ? WHERE owner_user_id IS NULL` (research.md R3 — the `WHERE` clause is itself the atomic guard, no separate "am I first" check) (depends on T002, T004)
- [ ] T007 [P] Create `backend/internal/db/event_memberships.go`: `ListEventMembers(db, eventID int64) ([]domain.EventMembership, error)` (UNION of the owner, role `"owner"`, with every `event_memberships` row, owner sorted first), `UpsertEventMembership(db, eventID, userID, role int64/string, invitedByUserID int64) error` (`INSERT ... ON CONFLICT(event_id, user_id) DO UPDATE SET role = excluded.role` — research.md R5), `RemoveEventMembership(db, eventID, userID int64) error` (depends on T002, T005)
- [ ] T008 [P] Edit `backend/internal/db/users.go`: add `ListUsers(db) ([]domain.User, error)` ordered by name — feeds the invite picker (research.md R6)
- [ ] T009 Create `backend/internal/api/middleware/event_access.go`: `RequireEventAccess(db *sql.DB) func(http.Handler) http.Handler` (extracts `eventID` via `chi.URLParam`, the user via the already-set `UserFromContext`, calls `db.GetEventRole`; not found → 404 — research.md R2, FR-008; role `"viewer"` + mutating method (POST/PUT/PATCH/DELETE) → 403; else stores the role in context and calls next) and exported `EventRoleFromContext(ctx) (string, bool)` (depends on T006)
- [ ] T010 Edit `backend/internal/api/router.go`: add a nested `r.Route("/events/{eventID}", func(er chi.Router) { er.Use(middleware.RequireEventAccess(db)); ... })` group; call `EventsHandler{DB: db}.RegisterEvent(er)`, `EventMembersHandler{DB: db}.Register(er)` (added in US1 below), `AudioPatchHandler{DB: db}.Register(er)`, `LightingHandler{DB: db}.Register(er)`, `RentalHandler{DB: db}.Register(er)`, `OwnedHandler{DB: db}.RegisterEventEquipment(er)`, `StagePlotsHandler{DB: db}.Register(er)`, `StagePlotsHandler{DB: db}.registerTrussRoutes(er)` inside it (depends on T009)
- [ ] T011 Edit `backend/internal/api/events.go`: `Register(r)` keeps only `/events` list (now `ListEventsForUser`, using the context user) and create (sets owner from context user); add new `RegisterEvent(er chi.Router)` registering `/` GET/PATCH/DELETE relative to the `/events/{eventID}` mount point (moved out of `Register`), with `get` attaching `YourRole` from `middleware.EventRoleFromContext` before responding (depends on T006, T010)
- [ ] T012 Edit `backend/internal/api/owned.go`: split `Register(r)` (keeps only `/owned-items` catalog routes) from a new `RegisterEventEquipment(er chi.Router)` (the `/owned-equipment` routes, prefix `/events/{eventID}` stripped since `er` is already scoped there) (depends on T010)
- [ ] T013 [P] Edit `backend/internal/api/audio_patch.go`: strip the literal `/events/{eventID}` prefix from all 35 route strings in `Register` (mechanical — no handler-body changes; `chi.URLParam(r, "eventID")` inside each handler keeps working since chi populates the same named param regardless of which nesting level declared it) (depends on T010)
- [ ] T014 [P] Edit `backend/internal/api/lighting.go`: same prefix strip (depends on T010)
- [ ] T015 [P] Edit `backend/internal/api/rental.go`: same prefix strip (depends on T010)
- [ ] T016 [P] Edit `backend/internal/api/stage_plots.go`: same prefix strip on its existing `r.Route("/events/{eventID}/stage-plots", ...)` → `r.Route("/stage-plots", ...)` (depends on T010)
- [ ] T017 [P] Edit `backend/internal/api/plot_trusses.go`: same prefix strip on `registerTrussRoutes` (depends on T010)
- [ ] T018 Edit `backend/internal/api/auth.go`: in the callback handler, call `db.ClaimOwnerlessEvents(h.DB, user.ID)` right after session creation, ignoring the returned count (a logging line noting rows claimed is a reasonable touch, not required) (depends on T006)
- [ ] T019 [P] Write `backend/internal/db/events_test.go` (new — no dedicated file existed before): `CreateEvent` sets `owner_user_id`; `ListEventsForUser` returns only owned-or-member events with the correct `your_role` per row; `GetEventRole` returns `"owner"`/a membership role/not-found correctly; `ClaimOwnerlessEvents` claims every NULL-owner row for the given user and is a no-op on a second call (depends on T006)
- [ ] T020 [P] Write `backend/internal/db/event_memberships_test.go`: `ListEventMembers` returns the owner first then members; `UpsertEventMembership` creates then updates-in-place on a repeat call with a different role; `RemoveEventMembership` deletes the row and is idempotent on repeat (depends on T007)
- [ ] T021 [P] Write `backend/internal/api/middleware/event_access_test.go`: table-driven — owner/contributor GET and mutate both succeed; viewer GET succeeds, viewer mutate 403s; a user with no role at all 404s; a malformed/nonexistent `eventID` 404s (depends on T009)
- [ ] T022 Run the full existing backend test suite (`go test ./...`) to confirm zero regressions from the router restructuring — the concrete verification of research.md's claim that no `testutil_test.go` changes are needed beyond Slice 14's (depends on T010–T018)

**Checkpoint**: Schema, data access, the event-access middleware, and the router restructuring are all in place and compile; every pre-existing backend test still passes unmodified. User story work can now begin.

---

## Phase 3: User Story 1 - Owner shares an event with a collaborator (Priority: P1) 🎯 MVP

**Goal**: An owner invites another already-known person to their event as a contributor or viewer; that person then sees and can act on the event per their role, while anyone not invited never sees it at all.

**Independent Test**: Have an owner invite one other previously-signed-in person to their event as a contributor, and confirm that person now sees the event on their own dashboard and can edit it, while a third, uninvited person still cannot see it at all.

**Note**: This phase includes the full members-management surface (invite, list, change role, remove) as one cohesive feature — not just the invite half — since it's one handler file and one dialog component; splitting "invite" from "manage" across phases would fragment a single cohesive implementation for no benefit (the same reasoning Slice 14 used to keep `auth.go` as one coherent pass across its three stories).

### Implementation for User Story 1

- [ ] T023 [US1] Create `backend/internal/api/event_members.go`: `EventMembersHandler{DB *sql.DB}` with `Register(er chi.Router)` wiring `GET /members` (list), `POST /members` (invite — body `{userId, role}`; 400 if `userId` isn't a known user or is the event's own owner; upserts via `db.UpsertEventMembership`), `PATCH /members/{userID}` (change role; 400 if `userID` is the owner — FR-011), `DELETE /members/{userID}` (remove; 400 if `userID` is the owner; 204 idempotent) (depends on Foundational, esp. T007, T010)
- [ ] T024 [US1] Write `backend/internal/api/event_members_test.go`: list includes the owner (role `"owner"`) plus invited members; inviting an existing known user as contributor grants them access (their subsequent `GET /events` includes the event, `GET /events/{id}` succeeds); inviting an unknown email/user id → 400; inviting the owner → 400; `PATCH` changes an existing member's role; `DELETE` removes a member and their next request against that event 404s; `PATCH`/`DELETE` targeting the owner → 400 (depends on T023)
- [ ] T025 [US1] Create `backend/internal/api/users.go`: `UsersHandler{DB *sql.DB}.Register(r chi.Router)` wiring `GET /users` → `db.ListUsers` (depends on T008)
- [ ] T026 [US1] Write `backend/internal/api/users_test.go`: returns every known user with the expected shape (id, email, name, pictureUrl) (depends on T025)
- [ ] T027 [US1] Edit `backend/internal/api/router.go`: wire `EventMembersHandler{DB: db}.Register(er)` into the `/events/{eventID}` group (T010 already reserved the call site) and `UsersHandler{DB: db}.Register(r)` into the outer authenticated (non-event-scoped) group (depends on T023, T025)
- [ ] T028 [P] [US1] Edit `frontend/src/types/index.ts`: add `yourRole?: 'owner' | 'contributor' | 'viewer'` to the `Event` interface and a new `EventMember` interface (userId, email, name, pictureUrl, role, invitedBy, createdAt)
- [ ] T029 [P] [US1] Create `frontend/src/api/eventMembers.ts`: `listMembers(eventId)`, `inviteMember(eventId, userId, role)`, `updateMemberRole(eventId, userId, role)`, `removeMember(eventId, userId)`
- [ ] T030 [P] [US1] Create `frontend/src/api/users.ts`: `listUsers()`
- [ ] T031 [US1] Create `frontend/src/components/event/EventMembersDialog.tsx`: invite picker (lists known users via `listUsers`, filtering out people already on the current member list client-side per research.md R6) + role select + the members list with per-row role-change and remove controls (depends on T028, T029, T030)
- [ ] T032 [US1] Edit `frontend/src/pages/EventDetail.tsx`: add an "Invite" button, visible when `yourRole !== 'viewer'` (i.e. owner or contributor), opening `EventMembersDialog` (depends on T031)
- [ ] T033 [P] [US1] Edit `frontend/src/pages/Dashboard.tsx`: show a small role badge (owner/contributor/viewer) per event using the now-present `yourRole` field
- [ ] T034 [P] [US1] Edit `frontend/src/pages/Events.tsx`: same role badge

**Checkpoint**: An owner can invite a collaborator; the invitee sees and can edit the event; an uninvited person never sees it. Full members management (list/invite/change-role/remove) works.

---

## Phase 4: User Story 2 - Viewer gets safe, read-only access (Priority: P2)

**Goal**: A viewer sees everything on an event, including print/export, but every add/edit/delete attempt is blocked with a clear message.

**Independent Test**: Sign in as a person with viewer access to an event and confirm every add/edit/delete action is blocked, while viewing, printing, and exporting all still work normally.

**Note**: The actual blocking mechanism (403 on mutating methods) was already built and unit-tested in isolation in Foundational (T009/T021); this phase's backend task verifies it holds across a *representative sample of real handlers*, not just the middleware's own isolated test, and adds the one piece of new frontend surface (the read-only banner) — per research.md R4, no existing mutating control across the app's 8 event-detail tabs is individually hidden/disabled.

### Implementation for User Story 2

- [ ] T035 [US2] Create `frontend/src/components/event/ReadOnlyBanner.tsx`: a small banner ("You have view-only access to this event") shown when `yourRole === 'viewer'`
- [ ] T036 [US2] Edit `frontend/src/pages/EventDetail.tsx`: render `ReadOnlyBanner` when applicable (depends on T035)
- [ ] T037 [US2] Extend `backend/internal/api/event_members_test.go` (or a new `internal/api/viewer_access_test.go`) with an integration-level check across a representative sample of existing mutating endpoints of different handler types — `POST /events/{id}/stageboxes` (audio_patch.go), `POST /events/{id}/lighting-rigs/{rigID}/fixtures` (lighting.go), `PUT /events/{id}/rentals/manual/{itemID}` (rental.go), `POST /events/{id}/stage-plots` (stage_plots.go) — all 403 for a viewer with a clear error message, while `GET /events/{id}/rental-export` (a representative export/print-adjacent GET) succeeds for the same viewer (depends on T009, T023)

**Checkpoint**: Viewers can view/print/export everything and are blocked from every mutation type across handler families, not just the ones the middleware's own unit test happened to cover.

---

## Phase 5: User Story 3 - Contributor grows the team (Priority: P3)

**Goal**: A contributor, not just the owner, can invite further collaborators and manage existing ones.

**Independent Test**: Have a contributor (not the owner) invite a new person to the event as either a contributor or a viewer, and confirm that new person gains the expected access.

**Note**: `RequireEventAccess` (T009) already grants contributors the same mutating access as the owner, and `EventMembersDialog`'s Invite button (T032) is already gated on `yourRole !== 'viewer'` (owner *or* contributor), so no new production code is expected here — this phase is a generalization check, the same pattern the roadmap's earlier signal-flow slices used ("generalizing X's rule").

### Implementation for User Story 3

- [ ] T038 [US3] Extend `backend/internal/api/event_members_test.go`: a contributor (added as a member, not the event's owner) can successfully `POST`/`PATCH`/`DELETE` on `/members` — inviting a new contributor and a new viewer, changing an existing member's role, and removing a member — confirming FR-005/FR-009 hold for contributors, not just the owner (depends on T023)
- [ ] T039 [US3] Manually verify (or add a lightweight frontend test if one fits the existing `printSheets.test.tsx`-style pure-render convention): signed in as a contributor, the Invite button and `EventMembersDialog` from US1 are visible and functional — confirms the `yourRole !== 'viewer'` condition from T032 already covers contributors correctly with no further change

**Checkpoint**: All three user stories are independently verified — invite/visibility, safe read-only access, and contributor-level invite/manage all work end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T040 [P] Run `go vet ./...` and `golangci-lint run` in `backend/`, and `tsc -b` + ESLint in `frontend/`, per the constitution's Development Workflow gates — fix anything they flag
- [ ] T041 Manually verify the ownerless-events bootstrap against a **copy** of the real dev DB, never the live file ([[db-safety-rule]]): copy `patchplanner.db` to `/tmp`, run the backend with `PATCHPLANNER_DB` pointed at the copy, sign in once, and confirm every pre-existing event now has an owner and no other column changed
- [ ] T042 Check whether `README.md` needs any update for this slice — research.md confirms no new env vars, so this is likely a no-op; confirm and skip if so

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup passing cleanly — blocks all user stories
- **User Story 1 (Phase 3)**: depends on Foundational completion
- **User Story 2 (Phase 4)**: depends on Foundational completion; its backend task (T037) also wants T023 (event_members.go) to exist so the test file has a natural home, but does not depend on any US1 *behavior*
- **User Story 3 (Phase 5)**: depends on Foundational completion and T023/T032 (reuses US1's endpoint and UI directly — this is a generalization check, not new functionality)
- **Polish (Phase 6)**: depends on all three user stories being complete

### Within Each User Story

- Backend handler/test before the frontend pieces that call it
- Foundational middleware/db pieces before any handler that uses them
- Story complete (checkpoint) before moving to the next priority

### Parallel Opportunities

- T004, T005, T007, T008 (domain struct, membership struct, event_memberships.go, users.go — four different files with no cross-dependencies once T002 lands) can run in parallel
- T013–T017 (five handler files' mechanical prefix strips) can all run in parallel once T010 lands
- T019, T020, T021 (foundational tests, three different files) can run in parallel
- T028, T029, T030 (frontend types, eventMembers.ts, users.ts) can run in parallel
- T033, T034 (Dashboard and Events role badges, different files) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# After T002 (migration) lands, launch together:
Task: "Edit domain/event.go — add OwnerUserID, YourRole"
Task: "Create domain/event_membership.go"
Task: "Create db/event_memberships.go"
Task: "Edit db/users.go — add ListUsers"
```

## Parallel Example: User Story 1

```bash
Task: "Edit frontend/src/types/index.ts — yourRole, EventMember"
Task: "Create frontend/src/api/eventMembers.ts"
Task: "Create frontend/src/api/users.ts"
```

---

## Implementation Strategy

### MVP: User Story 1 alone is safe to demo

Unlike Slice 14 (where shipping the login flow without its allow-list gate would have been an actively unsafe intermediate state), Slice 15's User Story 1 is self-contained and safe on its own: without US2/US3, every collaborator simply has full access regardless of the role picked at invite time (since the viewer-blocking middleware is Foundational, built *before* US1, so the 403 behavior is already live — US2 only adds verification depth and the banner, not the mechanism itself). Complete Setup + Foundational + US1 for a genuinely demoable, correctly-enforced MVP; US2 and US3 add UI polish and confidence, not missing security.

### Incremental Delivery

1. Setup + Foundational → schema, middleware, and router restructuring ready; zero regressions confirmed
2. US1 → owner can invite, invitee sees/edits, uninvited people don't — full members management works
3. US2 → read-only banner ships; viewer-blocking verified across handler families, not just in isolation
4. US3 → contributor-level invite/manage confirmed as a generalization, not new code
5. Polish → lint/typecheck gates green, dev-DB-copy bootstrap verified, README checked

---

## Notes

- [P] tasks touch different files with no unfinished-task dependency between them
- [Story] labels map tasks to spec.md's US1/US2/US3 for traceability
- `event_members.go`/`event_members_test.go` are extended across US1/US2/US3 (T023/T024 create them, T037 and T038 extend the test file) — expected, since all three stories exercise the same small handler surface from different angles, mirroring Slice 14's `auth.go` precedent
- Commit after each task or logical group, per this repo's existing convention
- The router restructuring (T010–T018) is the highest-risk part of this slice — T022's full-suite run is the concrete gate that must pass before any user story work begins
