---

description: "Task list for Slice 18 — Production Deployment"
---

# Tasks: Production Deployment

**Input**: Design documents from `/specs/018-deployment/`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md — all present and read. No `data-model.md`/`contracts/` — this slice adds no domain entities or API endpoints.

**Tests**: Included for the two pieces of new/changed Go logic (static-file serving, cookie `Secure`-flag). Most of this slice is ops configuration and documentation, verified manually per quickstart.md rather than by automated test — there is no automated way to test "does HTTPS actually work against a real domain" or "does systemd restart a killed process" from within this repo.

**Organization**: Tasks are grouped by user story (spec.md's US1/US2/US3, priority order P1/P2/P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, or US3 — omitted for Setup/Foundational/Polish tasks

---

## Phase 1: Setup

- [ ] T001 Verify a clean baseline on `018-deployment`: `cd backend && go build ./... && go vet ./... && go test ./...`, and `cd frontend && npx tsc -b && npm run lint && npm run test` — all must pass before any Slice 18 edit, so any later failure is attributable to this slice

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The build script every user story's manual verification depends on to produce a deployable binary in the first place.

**⚠️ CRITICAL**: No user story's manual verification (T010/T014/T017) can happen until this phase is complete, though the code-level tasks within each story can be written beforehand.

- [ ] T002 Create `Makefile` at the repo root with a `build` target that runs, in order: `npm run build` inside `frontend/` (producing `frontend/dist`); remove any existing `backend/cmd/dist` and copy `frontend/dist` into `backend/cmd/dist` (research.md R2 — `go:embed` cannot reach `frontend/dist` directly since it lives outside the `backend/` Go module and embed patterns forbid `..`); then `go build -o patchplanner ./cmd` inside `backend/`. Each step must complete before the next (research.md R3)
- [ ] T003 [P] Create `backend/cmd/.gitignore` containing `dist/` — mirrors `frontend/.gitignore`'s own `dist` entry, since `backend/cmd/dist` is a build artifact copied in by `make build` (T002), never committed

**Checkpoint**: `make build` produces a runnable binary (even though, until T006/T007/T008 land, it has nothing embedded yet — this phase's job is just the build plumbing).

---

## Phase 3: User Story 1 - One address for the whole app (Priority: P1) 🎯 MVP

**Goal**: The entire application — interface and API together — is reachable at a single address from a single running process, with client-side routes surviving a direct link or browser refresh.

**Independent Test**: Build and start the application on a server (or locally, treating `localhost:$PATCHPLANNER_ADDR` as the address) and confirm the entire app loads and works from that one address alone, including a direct link to a non-root page.

### Implementation for User Story 1

- [ ] T004 [US1] Edit `frontend/src/api/client.ts`: change `API_BASE` from the hardcoded `http://localhost:7331/api/v1` to the relative `/api/v1` (research.md R1)
- [ ] T005 [US1] Edit `frontend/vite.config.ts`: add a `server.proxy` entry forwarding `/api` and `/health` to `http://localhost:7331`, so `npm run dev` keeps working exactly as before now that `API_BASE` is relative (research.md R4) (depends on T004)
- [ ] T006 [US1] Create `backend/internal/api/static.go`: `NewStaticHandler(fsys fs.FS) http.Handler` (or equivalent) that serves static files from `fsys` and falls back to serving `index.html` for any request path that isn't an existing file and doesn't start with `/api/` or equal `/health` — the standard SPA-with-a-client-side-router serving pattern (research.md R2). Takes an `fs.FS` parameter (not the embed directly) so it's testable without a real embedded build
- [ ] T007 [P] [US1] Write `backend/internal/api/static_test.go`: using an `fstest.MapFS` fixture (an `index.html` plus one fake asset file), assert a request for the real asset returns its content; a request for an unknown path (e.g. `/events/12`) returns `index.html`'s content; and confirm the handler itself never intercepts anything — this is a unit test of the handler alone, not the full router (depends on T006)
- [ ] T008 [US1] Edit `backend/cmd/main.go`: add `//go:embed dist` (`var frontendFS embed.FS`) and mount `api.NewStaticHandler` (via `fs.Sub(frontendFS, "dist")`) as the catch-all route on the top-level router, registered so it never shadows the existing `/health` route or the `/api/v1` mount (research.md R2) (depends on T002, T006)
- [ ] T009 [US1] Manually verify: run `make build`, start the resulting `backend/patchplanner` binary locally with no `vite dev` process running, confirm the full application loads at `http://localhost:$PATCHPLANNER_ADDR`, and confirm a browser refresh on a deep link (e.g. an event detail page) loads correctly instead of a 404 (depends on T004, T005, T008)

**Checkpoint**: The application runs as one process at one address, including correct client-side-route fallback behavior. This alone is a demoable MVP — Slice 18's core deliverable.

---

## Phase 4: User Story 2 - Secure access and working sign-in (Priority: P2)

**Goal**: All production traffic is encrypted, unencrypted requests are automatically upgraded, and the session cookie is correctly marked secure once TLS is terminated by a reverse proxy in front of the Go process.

**Independent Test**: From outside the server, request the deployed address over plain HTTP and confirm an automatic redirect to HTTPS; sign in with Google at the production address and confirm the session cookie is marked `Secure` and sign-in persists across visits.

### Implementation for User Story 2

- [ ] T010 [US2] Edit `backend/internal/api/auth.go`: add a small helper (e.g. `requestIsSecure(r *http.Request) bool`) that returns true when `r.TLS != nil` **or** the request carries `X-Forwarded-Proto: https`; use it in place of the current bare `r.TLS != nil` at both cookie-setting call sites (login and logout) (research.md R5)
- [ ] T011 [P] [US2] Extend `backend/internal/api/auth_test.go`: a request with header `X-Forwarded-Proto: https` (and `r.TLS == nil`, i.e. simulating a request that already passed through a TLS-terminating proxy) results in a cookie with `Secure=true`; a plain request with neither `r.TLS` nor the header results in `Secure=false` (depends on T010)
- [ ] T012 [US2] Create `deploy/nginx.conf.example`: an HTTP server block that redirects every request to the HTTPS equivalent (nginx does not do this automatically), plus an HTTPS server block reverse-proxying to `127.0.0.1:$PATCHPLANNER_ADDR` that explicitly sets `proxy_set_header X-Forwarded-Proto $scheme;`, `X-Forwarded-For`, and `Host` (research.md R6 — nginx does not add these on its own, unlike some alternatives, so the example must set them explicitly or T010's fix has nothing to trust)
- [ ] T013 [US2] Manually verify per `specs/018-deployment/quickstart.md`'s "Setting up the reverse proxy" and "Verifying the deployment" sections, against a real domain: plain HTTP is redirected to HTTPS; signing in produces no browser security warning; the session persists across a repeat visit (depends on T009, T012)

**Checkpoint**: Production traffic is encrypted end-to-end, with sign-in sessions correctly marked secure behind the reverse proxy.

---

## Phase 5: User Story 3 - The service stays up and the data is recoverable (Priority: P3)

**Goal**: The application recovers automatically from a crash or host restart with no manual intervention, and operators have a documented, working way to produce a restorable backup of the application's data.

**Independent Test**: Kill the running application's process directly and confirm it restarts on its own; follow the documented backup procedure and confirm the resulting file is a valid, restorable copy of the data.

### Implementation for User Story 3

- [ ] T014 [US3] Create `deploy/patchplanner.service`: a systemd unit running the built binary, `Restart=on-failure`, `RestartSec` set to a short delay, `EnvironmentFile=` pointing at the production env file (research.md R7's `patchplanner.env`), and `WantedBy=multi-user.target` so `systemctl enable` makes it start on boot
- [ ] T015 [P] [US3] Create `deploy/backup.sh.example`: a shell script that runs `sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/patchplanner-$(date +%F).db'"` (SQLite's own safe-copy command, not a raw file copy which risks capturing a mid-write file — research.md R8), with `DB_PATH`/`BACKUP_DIR` as script variables an operator sets once
- [ ] T016 [US3] Manually verify against a **copy** of the real dev DB, never the live file ([[db-safety-rule]]): run `deploy/backup.sh.example`'s `.backup` command against the copy, confirm the resulting file opens correctly with `sqlite3` and contains the expected tables and row counts matching the source
- [ ] T017 [US3] Manually verify per `specs/018-deployment/quickstart.md`'s systemd steps, against a scratch/test deployment: killing the process results in automatic restart within a few seconds; confirm the unit is enabled for start-on-boot (`systemctl is-enabled patchplanner`) (depends on T009, T014)

**Checkpoint**: All three user stories independently verified — single-origin serving, secure access, and operational resilience all work end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 Edit `README.md`: add a "Deployment" section summarizing the production topology and pointing at `specs/018-deployment/quickstart.md` for the full runbook; note `PATCHPLANNER_ADDR`'s production convention of binding to `127.0.0.1` behind the reverse proxy, not a public interface
- [ ] T019 Amend `.specify/memory/constitution.md` (PATCH version bump): Principle III's "MAY serve the compiled frontend... revisit this once deployed... tracked as roadmap Slice 16" bullet updated to state this is now how the application is actually built and deployed, correcting the stale slice number; the Technology Stack table's "Build/deploy" row updated to match (research.md R9)
- [ ] T020 Edit `PROJECT.md` §4.3: the "Embedding the Vite build output using Go's `embed` package is planned but not implemented" note updated to describe the shipped approach (research.md R9)
- [ ] T021 Edit `specs/014-auth/quickstart.md`: the placeholder *"Before deploying to production (Slice 16): come back here and add the real production callback URL"* note updated with the correct slice number and a pointer to `specs/018-deployment/quickstart.md`'s concrete steps, rather than left as a bare reminder (research.md R9)
- [ ] T022 [P] Run `go vet ./...` and `golangci-lint run` in `backend/`, and `tsc -b` + ESLint in `frontend/`, per the constitution's Development Workflow gates — fix anything they flag
- [ ] T023 Run the full backend (`go test ./...`) and frontend (`npm run test`) suites one final time to confirm zero regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup passing cleanly — blocks every story's *manual verification* task, though each story's code-level tasks can be written in parallel with it
- **User Story 1 (Phase 3)**: depends on Foundational for T009's manual verification; otherwise independent
- **User Story 2 (Phase 4)**: depends on User Story 1 being deployable (T013's manual verification needs a running, single-origin app to put behind the reverse proxy) — code-level tasks (T010–T012) have no dependency on US1's code
- **User Story 3 (Phase 5)**: depends on User Story 1 being deployable (T017 needs a running app to supervise) — code-level tasks (T014–T015) have no dependency on US1/US2's code
- **Polish (Phase 6)**: depends on all three user stories being complete

### Within Each User Story

- Code changes before the manual-verification task that exercises them
- Story complete (checkpoint) before moving to the next priority

### Parallel Opportunities

- T003 (gitignore) can run in parallel with T002 (Makefile) once both are understood, though T002 is the one with real content
- T007 (static handler test) can be written in parallel with T008 once T006 lands
- T011 (auth test) can run in parallel with T012 (nginx config) — different files entirely
- T014 and T015 (systemd unit and backup script) are fully independent, different files
- T019, T020, T021 (three separate stale-doc corrections) can run in parallel — different files

---

## Parallel Example: User Story 2

```bash
Task: "Extend auth_test.go for the X-Forwarded-Proto Secure-flag fix"
Task: "Write deploy/nginx.conf.example with the required proxy headers"
```

## Parallel Example: Polish

```bash
Task: "Amend the constitution's stale Slice 16 deployment pointer"
Task: "Correct PROJECT.md's planned-but-not-implemented note"
Task: "Update specs/014-auth/quickstart.md's placeholder production reminder"
```

---

## Implementation Strategy

### MVP: User Story 1 alone is genuinely deployable

Unlike Slices 15–17, where US1 alone was safe-but-partial, here User
Story 1 alone already produces a real, usable (if not yet
production-hardened) deployment: one binary, one address, working
routes. Stories 2 and 3 layer production-grade security and resilience
on top — valuable before exposing this to real users over the public
internet, but not blocking a first internal/private smoke-test
deployment.

### Incremental Delivery

1. Setup + Foundational → the build script exists and produces a binary
2. US1 → the application runs as one process at one address; deployable for a private/internal first look
3. US2 → safe to expose publicly: encrypted, sign-in behaves correctly
4. US3 → resilient to crashes/restarts, with a verified backup procedure
5. Polish → lint/vet/typecheck gates green, every stale cross-reference from earlier slices corrected, full suite green one final time

---

## Notes

- [P] tasks touch different files with no unfinished-task dependency between them
- [Story] labels map tasks to spec.md's US1/US2/US3 for traceability
- This slice is unusually documentation/ops-heavy relative to its code
  diff — that's expected for a deployment feature, not a sign of
  under-specification; T009/T013/T017's manual verifications are the
  real acceptance gates spec.md's Independent Test sections describe
- T016 is the only task touching anything resembling production data,
  and only ever a throwaway copy, never `backend/patchplanner.db`
  itself ([[db-safety-rule]])
- No `.github/workflows/` task exists anywhere in this list — GitHub
  Actions CI/CD is explicitly out of scope for this slice (research.md
  R3), even though the build/deploy shape here is chosen to need no
  rework when that pipeline is eventually built
