---

description: "Task list for Slice 14 — Authentication"
---

# Tasks: Authentication

**Input**: Design documents from `/specs/014-auth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-api.md, quickstart.md — all present and read.

**Tests**: Included. This project's established convention (every prior slice, and this feature's own plan.md) is Go `httptest` + Vitest tests co-located with the code they cover; they are listed here as ordinary implementation tasks, not a strict TDD red-green gate.

**Organization**: Tasks are grouped by user story (spec.md's US1/US2/US3, priority order P1/P2/P3) so each can be implemented and verified independently, following the checkpoints below.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, or US3 — omitted for Setup/Foundational/Polish tasks

---

## Phase 1: Setup

**Purpose**: Add the one new dependency and document the new configuration surface before any code is written.

- [ ] T001 Add `golang.org/x/oauth2` and `golang.org/x/oauth2/google` to `backend/go.mod`/`go.sum` (`go get golang.org/x/oauth2`)
- [ ] T002 [P] Extend the environment variable table in `README.md` with `PATCHPLANNER_GOOGLE_CLIENT_ID`, `PATCHPLANNER_GOOGLE_CLIENT_SECRET`, `PATCHPLANNER_GOOGLE_REDIRECT_URL`, `PATCHPLANNER_FRONTEND_URL`, `PATCHPLANNER_ALLOWED_EMAILS`, `PATCHPLANNER_SESSION_TTL` (default `720h`), per contracts/auth-api.md and quickstart.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, data access, service layer, middleware, and router/test-harness wiring that every user story depends on.

**⚠️ CRITICAL**: No user story task can start until this phase is complete.

- [ ] T003 Write `backend/migrations/036_auth.up.sql` creating `users` (id, google_sub UNIQUE, email UNIQUE COLLATE NOCASE, name, picture_url, created_at, last_login_at) and `sessions` (token_hash PRIMARY KEY, user_id REFERENCES users(id) ON DELETE CASCADE, created_at, expires_at) plus `idx_sessions_user_id`, per data-model.md
- [ ] T004 Write `backend/migrations/036_auth.down.sql` dropping both tables and the index
- [ ] T005 [P] Create `backend/internal/domain/user.go` with the `User` struct (ID, GoogleSub, Email, Name, PictureURL, CreatedAt, LastLoginAt), no DB tags, alongside the existing `domain/*.go` files
- [ ] T006 Create `backend/internal/db/users.go` with `UpsertUserByGoogleSub(db, googleSub, email, name, pictureURL string) (domain.User, error)` (keyed on `google_sub`; refreshes email/name/picture_url and bumps `last_login_at` on every call) and `GetUserByID(db, id int64) (domain.User, error)` (depends on T003, T005)
- [ ] T007 [P] Create `backend/internal/db/sessions.go` with `CreateSession(db, userID int64, ttl time.Duration) (token string, err error)` (generates 32 random bytes via `crypto/rand`, stores only the SHA-256 hash), `GetSessionUser(db, token string) (domain.User, error)` (hashes, joins sessions⋈users, checks `expires_at`), and `DeleteSession(db, token string) error` (depends on T003)
- [ ] T008 [P] Create `backend/internal/service/allowlist.go` with a pure `isAllowedEmail(email string, allowed []string) bool` (case-insensitive) and a `ParseAllowedEmails(raw string) []string` that splits `PATCHPLANNER_ALLOWED_EMAILS` on commas and trims whitespace
- [ ] T009 [P] Create `backend/internal/service/google_oauth.go` defining an `IdentityProvider` interface (`AuthCodeURL(state string) string`, `Exchange(ctx context.Context, code string) (Profile, error)`) and a Google-backed implementation using `golang.org/x/oauth2` + `golang.org/x/oauth2/google` (token exchange, then a plain HTTP GET to `https://www.googleapis.com/oauth2/v2/userinfo` for the profile — no ID-token signature verification, per research.md R1) (depends on T001)
- [ ] T010 Create `backend/internal/api/middleware/auth.go` with `RequireAuth(db *sql.DB) func(http.Handler) http.Handler` (reads the `pp_session` cookie, calls `db.GetSessionUser`, 401s via the existing `writeError` helper on failure, otherwise stores the user in request context via a typed unexported key) and exported `UserFromContext(ctx context.Context) (domain.User, bool)` (depends on T007)
- [ ] T011 Edit `backend/internal/api/router.go`: change `NewRouter(db *sql.DB) http.Handler` to `NewRouter(db *sql.DB, auth AuthConfig) http.Handler`; register the (still-to-be-created) `AuthHandler`'s unauthenticated routes directly, then wrap every existing handler's `Register(r)` call in one `r.Group(func(r chi.Router) { r.Use(middleware.RequireAuth(db)); ... })` (depends on T010)
- [ ] T012 Edit `backend/cmd/main.go`: add `envOr()` reads for the six new env vars, build an `api.AuthConfig{...}`, pass it to `api.NewRouter(database, authConfig)`, and flip the CORS `AllowCredentials` option to `true` (depends on T011)
- [ ] T013 Edit `backend/internal/api/testutil_test.go`: give `newTestServer` a fixed test `AuthConfig` (dummy client id/secret, never dials Google), seed one `users` row and one valid `sessions` row directly via SQL (mirroring the existing `seedItem`/`seedRoleItem` pattern), replace `doJSON`'s `http.DefaultClient` reference with a package-level `httpClient` variable that `newTestServer` points at an `http.Client` with a cookie jar preloaded with that session's cookie (depends on T003, T006, T007, T011)
- [ ] T014 [P] Write `backend/internal/db/users_test.go`: upsert idempotence (same `google_sub` twice updates in place, bumps `last_login_at`), distinct users get distinct rows, an email collision on a different `google_sub` surfaces a clear error (depends on T006)
- [ ] T015 [P] Write `backend/internal/db/sessions_test.go`: create → lookup-by-token succeeds, expired row is rejected, delete removes the row and a subsequent lookup fails (depends on T007)
- [ ] T016 [P] Write `backend/internal/service/allowlist_test.go`: table-driven case-insensitivity, empty list, exact match, no match (depends on T008)
- [ ] T017 [P] Write `backend/internal/service/google_oauth_test.go`: exchange logic against a fake `httptest.Server` standing in for Google's token + userinfo endpoints (the `oauth2.Config`'s `Endpoint` field is overridable) (depends on T009)
- [ ] T018 [P] Write `backend/internal/api/middleware/auth_test.go`: table-driven 401s (no cookie, garbage cookie, expired session row) vs. 200 + populated context user (depends on T010)

**Checkpoint**: Schema, data access, service layer, middleware, and the test harness all exist and compile; every pre-existing `_test.go` in `internal/api` still passes unmodified. User story work can now begin.

---

## Phase 3: User Story 1 - Approved user signs in with Google (Priority: P1) 🎯 MVP

**Goal**: An approved person can sign in with their Google account and land on their dashboard, is recognized as the same account on return visits, and stays signed in across normal repeated use.

**Independent Test**: Have an approved person (already in `PATCHPLANNER_ALLOWED_EMAILS`) open the app, click "Sign in with Google," complete Google's consent screen, and confirm they land signed in with their name/picture visible.

**Note**: This phase implements the sign-in success path only; the allow-list *rejection* behavior (spec.md's US2, the actual security boundary) is added in Phase 4. Do not deploy or expose this feature with only this phase complete — see Implementation Strategy below.

### Implementation for User Story 1

- [ ] T019 [US1] Create `backend/internal/api/auth.go` with `AuthHandler{DB *sql.DB, Config AuthConfig, Provider service.IdentityProvider}` and `Register(r chi.Router)` wiring `GET /auth/google/login` (random `state` cookie + 302 to `Provider.AuthCodeURL(state)`) and `GET /auth/google/callback` (validates `state`, exchanges the code, upserts the user via `db.UpsertUserByGoogleSub`, creates a session via `db.CreateSession`, sets the `pp_session` cookie — `HttpOnly`, `SameSite=Lax`, `Secure` iff `r.TLS != nil` — and 302s to `${FRONTEND_URL}/`); also add a `RegisterMe(r chi.Router)` method for `GET /auth/me` returning the context-injected user as JSON (depends on Foundational phase, especially T009/T010)
- [ ] T020 [US1] Write `backend/internal/api/auth_test.go` happy-path cases: full login→callback flow against a fake `IdentityProvider` for an allow-listed email (asserts the `users` row, the session cookie's `HttpOnly`/`SameSite`/`Secure`-false-over-plain-http shape, and the 302 target), plus `/auth/me` returning the correct shape when authenticated (depends on T019)
- [ ] T021 [P] [US1] Create `frontend/src/api/auth.ts` exporting `loginUrl` (`${API_BASE}/auth/google/login`) and `getCurrentUser(): Promise<CurrentUser | null>` (calls `/auth/me`, resolves `null` on any thrown error)
- [ ] T022 [P] [US1] Create `frontend/src/hooks/useCurrentUser.ts`: `useQuery({ queryKey: ['auth','me'], queryFn: getCurrentUser, retry: false })` exposing `{ user, isLoading, isAuthenticated }`
- [ ] T023 [US1] Create `frontend/src/components/RequireAuth.tsx`: while loading render nothing; if unauthenticated `<Navigate to="/login" replace />`; else `<Outlet/>` (depends on T022)
- [ ] T024 [US1] Create `frontend/src/pages/Login.tsx`: heading + "Sign in with Google" `<a href={loginUrl}>` plain navigation link (no error banner yet — added in Phase 4) (depends on T021)
- [ ] T025 [US1] Edit `frontend/src/App.tsx`: wrap the existing `<Route path="/" element={<Layout/>}>` subtree in the `RequireAuth` guard, add an unguarded `/login` route rendering `Login.tsx` (depends on T023, T024)
- [ ] T026 [US1] Edit `frontend/src/api/client.ts`: add `credentials: 'include'` to every fetch call in `request()`, and add a 401→`window.location.href = '/login'` branch in the response handler, excluding any `/auth/*` path (so `/auth/me`'s expected 401 doesn't loop)
- [ ] T027 [US1] Edit `frontend/src/components/Layout.tsx`: show the current signed-in user's name/picture in the header via `useCurrentUser` (logout action itself is added in Phase 5) (depends on T022)

**Checkpoint**: An approved person can sign in end-to-end and reach the Dashboard; returning visits recognize the same account; the frontend redirects unauthenticated visitors to `/login`.

---

## Phase 4: User Story 2 - Unapproved account is denied access (Priority: P2)

**Goal**: A Google account not on the approved list is clearly refused, with no account record created.

**Independent Test**: Attempt to sign in with a Google account deliberately not on `PATCHPLANNER_ALLOWED_EMAILS`, and confirm a clear "not authorized" message, no sign-in, and no `users` row for that person.

### Implementation for User Story 2

- [ ] T028 [US2] Edit `backend/internal/api/auth.go`'s callback handler: call `service.isAllowedEmail` on the exchanged profile's email **before** calling `db.UpsertUserByGoogleSub`; on rejection, create no user row and no session, and 302 to `${FRONTEND_URL}/login?error=not_allowed&email=<addr>` instead (depends on T008, T019)
- [ ] T029 [US2] Extend `backend/internal/api/auth_test.go` with rejection-path cases: an email not in the configured allow-list gets a 302 to the `not_allowed` error URL, and a follow-up query confirms no `users` row exists for that email (depends on T028)
- [ ] T030 [US2] Edit `frontend/src/pages/Login.tsx`: read `error`/`email` from `useSearchParams()` and render a plain "This Google account isn't authorized for PatchPlanner" banner when `error=not_allowed` (depends on T024)

**Checkpoint**: Both approved sign-in (US1) and rejection of unapproved accounts (US2) are verified — this is the minimum safe, deployable combination (see Implementation Strategy).

---

## Phase 5: User Story 3 - Signed-in user signs out (Priority: P3)

**Goal**: A signed-in person can deliberately end their session; no event data is reachable afterward until they sign in again.

**Independent Test**: Sign in, trigger "sign out," and confirm the app immediately falls back to the sign-in screen with no event data accessible; sign back in with the same account and confirm it's the same account/history.

### Implementation for User Story 3

- [ ] T031 [US3] Edit `backend/internal/api/auth.go`: add a `POST /auth/logout` route that deletes the `sessions` row for the current cookie's hash (if any) via `db.DeleteSession`, clears the `pp_session` cookie (`Max-Age: -1`), and always responds `204` (depends on T007, T019)
- [ ] T032 [US3] Extend `backend/internal/api/auth_test.go` with logout cases: logging out deletes the session row (a subsequent `/auth/me` returns 401), and calling logout again (or with no session at all) is a harmless `204` (depends on T031)
- [ ] T033 [P] [US3] Edit `frontend/src/api/auth.ts`: add `logout(): Promise<void>` calling `POST /auth/logout`
- [ ] T034 [US3] Edit `frontend/src/components/Layout.tsx`: add a logout action in the header calling `logout()` then hard-navigating to `/login` (depends on T027, T033)

**Checkpoint**: All three user stories are independently functional — sign-in, rejection, and sign-out all work end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T035 [P] Write `frontend/src/api/client.test.ts` (Vitest): mock global `fetch`, assert the 401→redirect branch fires for a non-`/auth` path and is skipped for `/auth/me` (depends on T026)
- [ ] T036 Run `go vet ./...` and `golangci-lint run` in `backend/`, and `tsc -b` (not `tsc --noEmit`) + ESLint in `frontend/`, per the constitution's Development Workflow gates — fix anything they flag
- [ ] T037 Manually verify against `quickstart.md`: complete Google Cloud Console setup (consent screen, test users, OAuth client, redirect URIs), then run the real browser round-trip for all three stories (successful sign-in, a test-user-but-not-allow-listed rejection, and sign-out) — this is the one thing genuinely untestable in `httptest`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup (T001 for T009) — blocks all user stories
- **User Story 1 (Phase 3)**: depends on Foundational completion
- **User Story 2 (Phase 4)**: depends on Foundational completion **and** T019 (edits the same `auth.go`/`auth_test.go` files US1 created) — practically sequential after Phase 3, not parallel with it
- **User Story 3 (Phase 5)**: depends on Foundational completion **and** T019 (same file-sharing reason as US2); independent of US2's changes (different code paths in the same file), so Phase 5 could start in parallel with Phase 4 if staffed, but both still need Phase 3 done first
- **Polish (Phase 6)**: depends on all three user stories being complete

### Within Each User Story

- Backend handler/test before the frontend pieces that call it
- Foundational middleware/db/service pieces before any handler that uses them
- Story complete (checkpoint) before moving to the next priority

### Parallel Opportunities

- T002 (README) can run alongside T001
- T005, T007, T008, T009 (domain struct, sessions, allowlist, google_oauth — four different files with no cross-dependencies once T001/T003 land) can run in parallel
- T014–T018 (foundational tests, five different files) can all run in parallel once their respective implementation files exist
- T021 and T022 (frontend api/auth.ts and hooks/useCurrentUser.ts) can run in parallel
- T033 (frontend logout API call) has no dependency on T031/T032 landing first in terms of writing the code, but is only meaningfully testable once they do

---

## Parallel Example: Foundational Phase

```bash
# After T001 (dependency) and T003 (migration) land, launch together:
Task: "Create domain/user.go with the User struct"
Task: "Create db/sessions.go with CreateSession/GetSessionUser/DeleteSession"
Task: "Create service/allowlist.go with isAllowedEmail"
Task: "Create service/google_oauth.go with the IdentityProvider implementation"
```

## Parallel Example: User Story 1

```bash
Task: "Create frontend/src/api/auth.ts"
Task: "Create frontend/src/hooks/useCurrentUser.ts"
```

---

## Implementation Strategy

### Minimum safe, deployable slice: User Story 1 + User Story 2 together

Unlike a typical spec-kit feature where "ship P1 alone" is a reasonable MVP, spec.md is explicit that US1 without US2 is **worse than shipping neither** — an unrestricted Google sign-in is not a safe intermediate state for this feature (it exists specifically to be a security boundary). Treat Phases 3+4 as one combined checkpoint before this branch is considered demo-ready or merged toward deployment; User Story 3 (sign-out) is a genuine, independently deferrable increment on top.

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) — blocks everything
2. Complete Phase 3 (US1) + Phase 4 (US2) together — **this pair is the real MVP**
3. **STOP and VALIDATE**: run T037's manual walkthrough for both the success and rejection paths
4. Complete Phase 5 (US3) — sign-out convenience
5. Complete Phase 6 (Polish), including the full manual quickstart verification

### Incremental Delivery

1. Setup + Foundational → foundation ready, nothing user-visible yet
2. US1 → sign-in works for anyone with a Google account (**do not expose beyond local dev**)
3. US1 + US2 → sign-in is actually restricted — first point this is safe to demo/deploy
4. + US3 → sign-out added
5. + Polish → lint/typecheck gates green, quickstart fully walked through

---

## Notes

- [P] tasks touch different files with no unfinished-task dependency between them
- [Story] labels map tasks to spec.md's US1/US2/US3 for traceability
- T019's `auth.go`/`auth_test.go` are edited across three phases (US1 creates them, US2 and US3 extend them) — this is expected given all three stories share one small handler; it does not change each story's own independent-test criterion
- Commit after each task or logical group, per this repo's existing convention
- The real Google OAuth browser round-trip (T037) is the one part of this feature not covered by automated tests — call this out again at review time, don't treat its absence from CI as an oversight
