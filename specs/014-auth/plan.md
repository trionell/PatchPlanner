# Implementation Plan: Authentication

**Branch**: `014-auth` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-auth/spec.md`

## Summary

Google OAuth 2.0 authorization-code flow, entirely backend-driven: the
browser is redirected (full navigation, never `fetch`) from a minimal
`/login` page to `GET /api/v1/auth/google/login`, on to Google's consent
screen, back to `GET /api/v1/auth/google/callback`. The callback exchanges
the code server-to-server (`golang.org/x/oauth2`), fetches the profile from
Google's userinfo endpoint (no ID-token signature verification needed — the
code exchange itself is already an authenticated, TLS-protected
server-to-server call), checks the email against an env-var allow-list
*before* touching the `users` table, upserts a `users` row keyed on the
immutable Google `sub`, creates an opaque random session token in a new
`sessions` table, sets it as an `HttpOnly`/`SameSite=Lax` cookie, and 302s
back to the frontend Dashboard. Sessions are DB-backed (a SQLite table +
random token), not JWT — zero new infrastructure, true logout via row
delete, no signing-secret to manage. This slice also establishes the
project's first `internal/api/middleware` package and its first typed
request-context pattern, which Slice 15 (event ownership & sharing) will
build per-event authorization on top of.

## Technical Context

**Language/Version**: Go 1.25.0 (backend, confirmed in `backend/go.mod`),
TypeScript 5 / React 18 (frontend) — unchanged.

**Primary Dependencies (NEW)**: `golang.org/x/oauth2` + `golang.org/x/oauth2/google`
(code exchange, `google.Endpoint` constant) — the only new backend
dependency (research.md R1); deliberately not `google.golang.org/api/idtoken`
or the full `google-api-go-client`. No new frontend dependency: the login
page is a plain anchor/redirect, no Google JS SDK.

**Storage**: SQLite — migration `036_auth` adds two tables, `users` and
`sessions` (see data-model.md). Purely additive; no entry needed in
`db.go`'s staged-`Migrate(N)` sequencing list (confirmed by reading
`backend/internal/db/db.go` — that sequencing exists only to interleave
one-time Go data conversions around destructive drops in migrations
25/29/32, none of which apply here), picked up by the trailing `m.Up()`.

**Testing**: Go `testing` + `httptest`, matching the project's existing
convention — `api/auth_test.go`, `db/users_test.go`, `db/sessions_test.go`,
`service/google_oauth_test.go`, `service/allowlist_test.go`,
`api/middleware/auth_test.go`. Vitest for the one genuinely testable
frontend seam (`api/client.test.ts` — the 401-redirect branch). The real
Google redirect dance is excluded from automated tests by construction
(research.md R7) and is `quickstart.md`'s manual verification step instead.

**Target Platform**: unchanged — Linux server + browser, two-process dev
setup today (`:7331` backend, `:5173` frontend, confirmed in
`backend/cmd/main.go` and README.md).

**Project Type**: Web application (backend + frontend).

**Performance Goals**: N/A beyond SC-001 (sign-in round trip under 15s,
dominated by Google's own consent screen, not this app's code).

**Constraints**: No new infrastructure (Constitution Principle V) — session
store is a SQLite table, not Redis; never touch the live dev DB
([[db-safety-rule]]); `AllowedOrigins` must remain an explicit origin, never
`*`, once `AllowCredentials: true` (browsers reject wildcard-origin +
credentialed requests). Router construction changes shape for the first
time — every existing `_test.go` in `internal/api` must keep compiling and
passing (research.md R6).

**Scale/Scope**: 1 SQL migration (2 tables); 1 new middleware package; 1 new
API handler (`auth.go`) + 4 routes; 1 new service file pair
(`google_oauth.go` + `allowlist.go`, alongside the existing
`inventory_import.go`/`rental_export.go` in `internal/service`); 2 new
`db/` files; 1 new `domain/` file; `NewRouter` signature change (gains an
`AuthConfig` param) touching its one call site (`cmd/main.go`) plus
`testutil_test.go`; frontend gains 1 page, 1 hook, 1 API module, 1 guard
component, small edits to `App.tsx`/`Layout.tsx`/`client.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**This slice requires a constitution amendment, not just a documented
exception.** Principle V currently states *"Authentication is out of scope
for v1; the tool is single-user, locally hosted"* (`.specify/memory/constitution.md:120`)
— that sentence becomes factually false the moment this slice lands. Before
or alongside implementation, run `/speckit-constitution` (MINOR bump,
0.2.0 → 0.3.0: new mandatory technology) to:
- strike the "Authentication is out of scope" bullet from Principle V and
  replace it with something like *"Authentication is Google OAuth 2.0 with
  DB-backed sessions (SQLite `sessions` table + `HttpOnly` cookie) — no
  JWT, no external session store, consistent with the SQLite-only rule
  below,"*
- add a row to the Technology Stack table (`Auth | Google OAuth 2.0
  (authorization-code flow) + DB-backed sessions`),
- note `internal/api/middleware/` as a new, canonical subpackage under
  Principle III's package-layout bullet.

Otherwise, evaluated against the current (pre-amendment) principles:

- **I. Domain-First Data Model** — PASS. `users`/`sessions` are first-class
  tables with real relationships, not bolted onto `events`.
- **II. Extensibility by Design** — N/A (no equipment/reference-vocabulary
  surface here).
- **III. Full-Stack Monorepo Architecture** — PASS. New code lands in the
  existing `backend/internal/{api,db,domain,service}` and
  `frontend/src/{pages,hooks,api}` trees, confirmed against the actual
  current layout; `internal/api/middleware` is a new subpackage, not a new
  top-level module.
- **IV. Inventory-Driven Rental Workflow** — N/A.
- **V. Pragmatic Simplicity** — PASS given the amendment above. One new
  external dependency (`x/oauth2`) is justified (nothing in chi/sqlite/migrate
  provides OAuth); DB-backed sessions over JWT is the more SQLite-native,
  less-infrastructure choice (Complexity Tracking below).

**Post-design re-check (Phase 1)**: PASS — data-model.md and the API
contract introduce nothing beyond the two tables and the one new
dependency already justified above; no second database, no new frontend
dependency.

## Project Structure

### Documentation (this feature)

```text
specs/014-auth/
├── plan.md                        # This file
├── research.md                    # Phase 0 output
├── data-model.md                  # Phase 1 output
├── quickstart.md                  # Phase 1 output
├── contracts/
│   └── auth-api.md                # Phase 1 output
├── checklists/requirements.md     # Spec quality checklist (passing)
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 036_auth.up.sql               # NEW — users, sessions tables
│   └── 036_auth.down.sql
└── internal/
    ├── domain/
    │   └── user.go                   # NEW: User{ID,Email,Name,PictureURL,CreatedAt,LastLoginAt}
    ├── db/
    │   ├── users.go                  # NEW — UpsertUserByGoogleSub, GetUserByID
    │   ├── users_test.go              # NEW
    │   ├── sessions.go                # NEW — CreateSession, GetSessionUser(tokenHash), DeleteSession
    │   └── sessions_test.go           # NEW
    ├── service/
    │   ├── google_oauth.go           # NEW — IdentityProvider impl: AuthCodeURL/Exchange via x/oauth2
    │   ├── google_oauth_test.go       # NEW — fake Google endpoints (httptest.Server)
    │   ├── allowlist.go               # NEW — isAllowedEmail (pure), alongside existing
    │   │                              #       inventory_import.go / rental_export.go
    │   └── allowlist_test.go          # NEW
    └── api/
        ├── auth.go                   # NEW — AuthHandler: login/callback/logout/me, cookie helpers
        ├── auth_test.go               # NEW
        ├── middleware/
        │   ├── auth.go                # NEW — RequireAuth, UserFromContext, context key
        │   └── auth_test.go            # NEW
        ├── router.go                  # EDITED — NewRouter(db, AuthConfig); protected r.Group
        └── testutil_test.go           # EDITED — seed user+session, authenticated http.Client+jar

backend/cmd/main.go                    # EDITED — new envOr() reads, build AuthConfig,
                                        #          CORS AllowCredentials: true

frontend/src/
├── pages/
│   └── Login.tsx                     # NEW — minimal Google sign-in link + error banner
├── hooks/
│   └── useCurrentUser.ts             # NEW
├── api/
│   ├── auth.ts                       # NEW — loginUrl, getCurrentUser, logout
│   ├── auth.test.ts                  # (n/a — covered by client.test.ts)
│   └── client.ts                     # EDITED — credentials:'include', 401 redirect branch
│   └── client.test.ts                # NEW
├── components/
│   ├── RequireAuth.tsx               # NEW — route guard(s)
│   └── Layout.tsx                     # EDITED — user chip + logout action in header
└── App.tsx                            # EDITED — guarded route tree, unguarded /login

README.md                              # EDITED — extend env var table (6 new vars)
```

**Structure Decision**: Web application layout per constitution — all
changes land in the existing `backend/` and `frontend/` trees, confirmed
against the actual current router (`backend/internal/api/router.go`,
currently a flat list of `XHandler{DB: db}.Register(r)` calls with zero
middleware) and entrypoint (`backend/cmd/main.go`). `internal/api/middleware`
is a new subpackage inside the existing `api` tree, not a new top-level
module — it's the seam Slice 15 builds per-event authorization on top of
via `middleware.UserFromContext`. `service/google_oauth.go` and
`service/allowlist.go` join the existing `service` package
(`inventory_import.go`, `rental_export.go`) rather than introducing a new
package, per Constitution III's stated purpose for that directory
("cross-cutting business logic").

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| One new runtime dependency, `golang.org/x/oauth2` (+`/google`) | No existing library in the stack does OAuth code exchange; hand-rolling raw `http.Post`/`http.Get` calls against Google's token/userinfo endpoints is more code and more places to get URL/param construction wrong than the small, standard library | Zero-dependency hand-rolled HTTP calls — rejected as strictly more surface area for equivalent behavior |
| DB-backed session table + opaque token, not JWT | Fits "SQLite is the only database" (Principle V) with zero new infra; supports true, immediate logout (row delete) without a JWT blocklist; needs no signing-secret env var/rotation | JWT-in-cookie — rejected: revocation requires either short TTLs (poor UX) or a server-side blocklist (a second stateful store, i.e. *more* infrastructure, not less, for this single-instance app) |
| `NewRouter(db, AuthConfig)` signature change + wrapping existing handlers in `r.Group(...RequireAuth)` rather than adding auth ad hoc per handler | This is the one seam that must exist before Slice 15 can add per-event authorization on top; retrofitting it handler-by-handler later would be far more invasive than establishing it now | Per-handler auth checks — rejected: duplicates the same cookie/session lookup in 8 handlers instead of once, and gives Slice 15 nowhere consistent to hook into |

## Seams left for later slices (not designed here)

- **Slice 15 (event ownership & sharing)**: `middleware.UserFromContext` is
  the hook; `users.id` is the FK target for the per-event membership table;
  the allow-list check here is coarse ("can sign in at all"), not
  per-event.
- **Slice 16 (production deployment)**: the cookie's `Secure` flag is
  derived from `r.TLS != nil`, which is wrong once TLS terminates at a
  reverse proxy in front of the Go binary — that slice must decide how to
  trust `X-Forwarded-Proto` (or force the flag via env var). Same-origin
  production also means `PATCHPLANNER_CORS_ORIGIN`/the CORS middleware
  becomes largely a no-op in prod (kept for dev only).
