# Research: Authentication (Slice 14)

All items below were resolved through direct exploration of the current
codebase and discussion with the user before this plan was written — no
unknowns remain in the Technical Context.

## R1 — Google identity verification approach

**Decision**: Use the OAuth 2.0 authorization-code flow end-to-end via
`golang.org/x/oauth2` + `golang.org/x/oauth2/google` (the `google.Endpoint`
constant for the token URL). After exchanging the code, fetch the profile
from Google's `https://www.googleapis.com/oauth2/v2/userinfo` endpoint using
the obtained access token. Do not verify an ID token's JWT signature.

**Rationale**: The code exchange itself is a server-to-server, TLS-protected,
client-secret-authenticated call — Google already vouches for the profile it
returns over that channel. Verifying an ID token's signature is the right
approach for browser-side/implicit flows where a token arrives without a
trusted channel backing it, but is redundant work here and would pull in
`google.golang.org/api/idtoken` (and its heavier transitive dependency
tree: protobuf, grpc-adjacent packages) for no additional trust.

**Alternatives considered**:
- `google.golang.org/api/idtoken` for signature verification — rejected as
  unnecessary given the authorization-code flow's server-side trust model,
  and heavier than the codebase's "minimal dependencies" discipline
  (`go.mod` currently has 5 direct deps).
- A third-party all-in-one auth library (e.g. `goth`, `gothic`) — rejected;
  the flow needed here is simple enough that the standard `x/oauth2` package
  covers it directly, and pulling in a multi-provider abstraction for a
  single provider adds surface area without benefit.

## R2 — Session mechanism

**Decision**: DB-backed sessions — a `sessions` SQLite table storing only
the SHA-256 hash of an opaque random token, referenced by an `HttpOnly`
cookie holding the raw token.

**Rationale**: Fits Constitution Principle V ("SQLite is the only database.
No external services... unless a feature explicitly demands it") — there is
no demand here that a session store be anything but a table. DB-backed
sessions give true, immediate logout (delete the row) with no blocklist,
and need no signing-secret env var or rotation story a JWT would require.
Storing only the hash means a DB file leak/backup can't be replayed as a
live cookie.

**Alternatives considered**:
- JWT-in-cookie — rejected: revocation would require either short TTLs
  (poor UX for a tool people expect to "just stay signed in") or a
  server-side blocklist, which is a second piece of state, not less
  infrastructure than the sessions table it would replace.

## R3 — Cookie/CORS design across dev (two-origin) and prod (single-origin)

**Decision**: `SameSite=Lax` cookie, `HttpOnly`, `Secure` derived from
whether the connection is actually TLS; CORS `AllowCredentials: true` with
the existing single-origin (never wildcard) `AllowedOrigins`.

**Rationale**: Browsers scope cookies and `SameSite` by *registrable
domain*, not port — `localhost:5173` and `localhost:7331` are already
"same-site" to a browser, so today's two-process dev setup needs no special
cross-site cookie handling (`SameSite=None`), and the plan (roadmap Slice
16) to serve frontend+backend from one origin in production only makes this
simpler, never harder. `AllowCredentials: true` combined with a wildcard
origin is what browsers actually reject — the codebase already avoids `*`
(`cmd/main.go:31`), so flipping this one flag is safe.

**Alternatives considered**:
- Bearer token in an `Authorization` header instead of a cookie — rejected:
  requires the frontend to manage token storage (localStorage is readable
  by any injected script; an in-memory-only token doesn't survive a
  reload), solving a problem the cookie approach doesn't have here since
  both origins are ever only `localhost` (dev) or the same origin (prod).

## R4 — Allow-list enforcement

**Decision**: A comma-separated, case-insensitive list of literal email
addresses from `PATCHPLANNER_ALLOWED_EMAILS`, parsed once at startup into a
set; checked in the OAuth callback handler *before* any `users` row is
created or session issued.

**Rationale**: Matches the user's explicit choice (see roadmap Slice 14)
for a small, hand-picked group — no domain-wildcard matching needed. Config
that don't require deploying new code satisfies FR-010; editing an env var
and restarting the process is an operations action, not a code change.

**Alternatives considered**:
- Domain wildcard matching (`*@company.com`) — explicitly declined by the
  user; not implemented.
- A `users`-adjacent allow-list DB table — rejected for v1: adds a
  migration and a write path for a list the user described as small and
  managed by hand; can be revisited later without disturbing anything
  designed here (the check is a single function call site).

## R5 — Router/middleware integration point

**Decision**: `internal/api/middleware` (new package) holds `RequireAuth`,
the project's first middleware and first typed-context-value pattern.
`NewRouter` gains an `AuthConfig` parameter and wraps every existing
handler's `Register` call inside one `r.Group(func(r chi.Router) { r.Use(middleware.RequireAuth(db)); ... })`,
leaving only the auth routes themselves and `/health` outside it.

**Rationale**: Confirmed via direct reading of `backend/internal/api/router.go`
and `backend/cmd/main.go` — today `NewRouter(db *sql.DB) http.Handler` is a
flat list of `XHandler{DB: db}.Register(r)` calls with zero middleware
anywhere in the package. Gating at the router-construction level, once,
avoids touching eight existing handler files individually and gives Slice
15 a single, already-established seam (`middleware.UserFromContext`) to
build per-event authorization on top of, instead of retrofitting auth
piecemeal later.

## R6 — Test-suite integration

**Decision**: Update only `backend/internal/api/testutil_test.go`:
`newTestServer` gains a fixed test `AuthConfig` (dummy client id/secret,
never dials Google), seeds one `users` row and one valid `sessions` row
directly via SQL (mirroring the existing `seedItem`/`seedRoleItem`
pattern), and builds an `http.Client` with a cookie jar preloaded with that
session's cookie. `doJSON`'s single `http.DefaultClient` reference becomes a
package-level client variable that `newTestServer` points at the
authenticated client — every other existing `_test.go` file keeps calling
`doJSON(t, method, url, payload)` completely unchanged and transparently
gets an authenticated request. `auth_test.go` itself gets its own bare,
jar-less `http.Client{}` for asserting unauthenticated 401s and exercising
the allow-list/callback path directly.

**Rationale**: Confirmed via direct reading of `testutil_test.go` — `doJSON`
currently calls `http.DefaultClient.Do(request)` (line 55) and no test in
this package uses `t.Parallel()`, so a single package-level client variable
is safe. This keeps the blast radius of adding auth to zero changes across
the ~15 other existing `_test.go` files in `internal/api`.

## R7 — Google Cloud Console setup (for `quickstart.md`)

**Decision**: Document, at first-timer level: creating a Google Cloud
project, configuring the OAuth consent screen (External audience, Testing
publishing status — add each allowed person as a Google test user, capped
at 100, in addition to the app's own `PATCHPLANNER_ALLOWED_EMAILS` list),
creating an OAuth 2.0 Client ID (Web application type), and registering
both the localhost and future production authorized redirect URIs.

**Rationale**: The user has no prior OAuth experience and explicitly asked
for guidance; Google permits `localhost` redirect URIs without any
verification step, so local dev needs no bypass/mock login. Testing mode
was the user's explicit choice over publishing the app now.
