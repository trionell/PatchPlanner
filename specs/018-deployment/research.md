# Research: Production Deployment (Slice 18)

All items below were resolved through direct reading of the current
codebase (`backend/cmd/main.go`, `backend/internal/api/auth.go`,
`backend/internal/db/db.go`, `frontend/vite.config.ts`,
`frontend/src/api/client.ts`, the constitution, and `PROJECT.md`) plus
the deployment-topology decisions already made when Slice 14 was
originally planned (single small VPS, Go serves the built frontend,
DB-backed sessions, no new infrastructure). No unknowns remain in the
Technical Context.

## R1 — The frontend's hardcoded dev API URL is the real blocker for single-origin, not just embedding

**Decision**: `frontend/src/api/client.ts`'s `API_BASE` changes from the
hardcoded `http://localhost:7331/api/v1` to a relative `/api/v1`, so the
built frontend calls whatever origin it's actually served from — in dev
that's still `localhost:5173` proxied or CORS'd to `:7331` as today
(unaffected in dev, see R4), and in production it's the same origin the
page itself loaded from, with no separate host to configure.

**Rationale**: Confirmed by direct reading: `API_BASE` is a hardcoded
absolute URL naming `localhost:7331`, not an env-driven or relative
value. Even after `go:embed`-ing the frontend into the binary, the
compiled JavaScript would still try to call `http://localhost:7331/...`
from whatever real production origin it's loaded on — this is the
actual functional blocker for FR-001 ("one address for the whole app"),
more fundamental than the embedding mechanism itself. This was not
caught in the original Slice 14/15/16 planning conversation because
every slice up to now was developed and demoed only against localhost,
where the hardcoded value happens to already be correct.

**Alternatives considered**:
- A build-time env var (`VITE_API_BASE`) injected differently per
  environment — rejected: adds a build-time configuration axis for no
  benefit, since a relative path is correct in every environment this
  project targets (dev proxy, and single-origin production) with zero
  configuration.

## R2 — Single-binary serving: `go:embed` the frontend via a copied-in build directory, not the migrations

**Decision**: `//go:embed` cannot reach `frontend/dist` directly —
Go's embed patterns are forbidden from containing `..` path elements,
and `frontend/dist` sits outside `backend/`'s own module tree (`backend/`
is its own Go module; `frontend/` is a sibling directory, not a
subdirectory of it). So `make build` (R3) copies `frontend/dist` into
`backend/cmd/dist` (gitignored, regenerated on every build, never
committed — mirrors `frontend/dist` itself already being gitignored)
*before* running `go build`. `backend/cmd/main.go` then embeds that
copied-in directory (`//go:embed dist` → `embed.FS`) and passes it to a
new handler (`internal/api/static.go`) that serves it as static files,
falling back to `index.html` for any path that isn't a static asset and
doesn't start with `/api/` or `/health` — the standard SPA-with-a-router
serving pattern, needed because `react-router-dom` handles routes
client-side, so a hard refresh or direct link to e.g. `/events/12` must
still receive `index.html` and let the client-side router take over.
Database migrations stay exactly as they are today — loaded from a
plain filesystem directory via `PATCHPLANNER_MIGRATIONS`, shipped
alongside the binary, not embedded.

**Rationale**: The constitution's own Principle III already anticipated
exactly this ("The backend MAY serve the compiled frontend as static
files in production for a single deployable binary... revisit this once
the tool is deployed beyond a single local machine") — this slice is
that revisit. The copy-into-the-module-tree step is not a workaround
being invented here; it's the standard, well-established pattern for
embedding a frontend build from a sibling directory in a two-module
repo layout like this one (`go:embed`'s restriction against `..` is a
hard compiler rule, not a style preference — confirmed by direct
reading of the constraint, not assumed). Migrations are deliberately
left as-is: they already work correctly via a simple env var, switching
golang-migrate's source driver from `file://` to an embedded `iofs.FS`
would be a real (if small) mechanical change for no requirement in
spec.md — FR-001 asks for one *address*, not a single *file* on disk;
shipping the binary plus its `migrations/` directory together (e.g. via
`scp` or a deploy script) fully satisfies "one thing to start" without
touching working code.

**Alternatives considered**:
- A build-time symlink (`backend/cmd/dist -> ../../frontend/dist`)
  instead of a copy — rejected: `go:embed` follows symlinks
  inconsistently across platforms/toolchains and this isn't a pattern
  the Go team documents as supported; a plain file copy in the Makefile
  is simple, portable, and unambiguous.
- Embed migrations too, for a literal single-file deployment — rejected
  as unnecessary scope: no functional requirement asks for zero
  auxiliary files, and it would touch `db.Open`'s migration-source
  wiring, which has no other reason to change in this slice.

## R3 — Build ordering: a single script, deliberately shaped for a future GitHub Actions workflow

**Decision**: One build script (`Makefile` target, e.g. `make build`)
runs, in order: `npm run build` (frontend, producing `frontend/dist`),
then a copy of `frontend/dist` into `backend/cmd/dist` (R2 — the
directory `go:embed` actually reads, since it can't reach outside its
own module tree), then `go build` (backend). Each step must complete
before the next — `go:embed` reads `backend/cmd/dist` at Go compile
time, so both the frontend build and the copy step must happen first or
the Go build fails outright (a directory `go:embed` can see must
already contain the built files, or the build fails with a clear "no
matching files found" compile error). No CI/CD
pipeline is introduced in this slice, but the deploy target is a VPS
with GitHub Actions as the intended future CI/CD (per direct user
instruction), so every choice here is made to need no rework later: a
single `make build` producing exactly two artifacts (one binary, one
`migrations/` directory), environment configuration entirely via
`EnvironmentFile`/plain env vars (a GitHub Actions workflow populates
these from repository Secrets the same way an operator's `.env` file
does today — no manual-only config mechanism), and deployment as a
plain copy-then-restart (SCP/SSH + `systemctl restart`), which is
exactly the shape an `appleboy/scp-action` + `appleboy/ssh-action` (or
equivalent) GitHub Actions step automates directly, with zero redesign.

**Rationale**: Matches spec.md's Assumptions and ROADMAP.md's explicit
"No CI/CD pipeline is in scope here unless wanted later (manual build +
copy + restart is fine for a single small VPS to start)" — a documented,
repeatable manual procedure satisfies FR-006 without new infrastructure,
consistent with Principle V (Pragmatic Simplicity). Explicitly designing
it to be CI-automation-ready (without building that automation now) is
the correct middle ground given the user's stated intent to add GitHub
Actions later — avoids both premature CI infrastructure (Principle V)
and choices (e.g. an interactive-only deploy script, or config that
can't be sourced from CI secrets) that would need to be redone once
that pipeline is built.

## R4 — Local dev is unaffected

**Decision**: Nothing about the local dev workflow changes. `vite dev`
keeps running on `:5173` as its own process; the frontend's now-relative
`API_BASE` (`/api/v1`, R1) resolves correctly in dev too, since
`fetch('/api/v1/...')` from a page served by the Vite dev server on
`:5173` still needs to reach the Go backend on `:7331` — this is exactly
what `PATCHPLANNER_CORS_ORIGIN` (already `AllowCredentials: true`,
already defaulting to `http://localhost:5173`) exists for, and a
relative path plus `fetch`'s same-origin-by-default behavior would
normally break this. **Concretely**: Vite's dev server proxy
(`server.proxy` in `vite.config.ts`) forwards `/api/*` requests from
`:5173` to `:7331` during `npm run dev` only — a dev-only addition, with
zero effect on the production build (`vite build` doesn't run a dev
server, so the proxy config is simply inert there; the relative path
just resolves against whatever origin actually served the built files).

**Rationale**: This is the one piece of genuinely new frontend
configuration this slice needs beyond the `API_BASE` change itself
(R1) — without it, switching to a relative API base would silently
break every dev-mode `fetch` (they'd hit `localhost:5173/api/v1/...`,
which doesn't exist, instead of `:7331`). Using Vite's built-in dev
proxy is the standard, zero-new-dependency way to keep dev working
exactly as it does today while making the production path correct.

## R5 — The session cookie's `Secure` flag is wrong behind a reverse proxy

**Decision**: `backend/internal/api/auth.go`'s cookie-setting code
(`Secure: r.TLS != nil`, two call sites) changes to trust
`X-Forwarded-Proto: https` when set, in addition to `r.TLS != nil` — a
reverse proxy terminating TLS in front of the Go process (R6) means
`r.TLS` is always `nil` from the Go process's own point of view, even
though every real visitor is on HTTPS. A small helper,
e.g. `requestIsSecure(r *http.Request) bool`, centralizes this check.
**This makes the nginx config (R6) load-bearing, not just conventional**:
unlike some proxies, nginx does not add `X-Forwarded-Proto` on its own —
the example config in `deploy/nginx.conf.example` must explicitly
include `proxy_set_header X-Forwarded-Proto $scheme;`, called out
prominently in `quickstart.md` since a correctly-behaving cookie
(spec.md FR-004) depends on it.

**Rationale**: This is the exact seam Slice 14's own plan flagged in
advance: *"Known seam for Slice 16 \[now 18\]: the cookie's `Secure`
flag is derived from `r.TLS != nil`, which is wrong once TLS terminates
at a reverse proxy in front of the Go binary."* Confirmed still present
by direct reading — both `login`'s and `logout`'s cookie-setting code
use the same unconditional `r.TLS != nil`. Left unfixed, the session
cookie would never get `Secure` set in production, satisfying spec.md's
FR-004/SC-003 incorrectly (the browser would accept it, but it's a real
best-practice/security gap this slice explicitly exists to close, not
an acceptable production compromise).

**Alternatives considered**:
- Force `Secure: true` unconditionally via a `PATCHPLANNER_FORCE_SECURE_COOKIE`
  env var — rejected: `X-Forwarded-Proto` is the standard signal a
  reverse proxy sends for exactly this purpose; an env var would be one
  more thing an operator could forget to set correctly, where trusting
  the proxy header just works once the proxy is configured correctly —
  the one added risk (nginx not setting the header unless explicitly
  told to, unlike some proxies) is mitigated by making it prominent in
  both the example config and the runbook, not by working around nginx.

## R6 — Reverse proxy: nginx + Certbot, per explicit user direction

**Decision**: nginx sits in front of the Go binary, terminating TLS and
reverse-proxying to `PATCHPLANNER_ADDR` (kept bound to `127.0.0.1` in
production, not a public interface, so the Go process is never reachable
except through the proxy). Certbot (`certbot --nginx`, the standard
Let's Encrypt client with an nginx plugin) obtains the certificate and
installs its own renewal timer — nginx itself has no built-in ACME
client, unlike some alternatives, so Certbot is a second package, not
optional tooling layered on top. The example config
(`deploy/nginx.conf.example`) includes an explicit HTTP→HTTPS redirect
server block (nginx does not do this automatically) and the
`X-Forwarded-Proto`/`X-Forwarded-For`/`Host` proxy headers the
application depends on (R5).

**Rationale**: Chosen per explicit user direction, overriding this
plan's original Caddy recommendation (research.md's earlier draft) —
nginx is a reasonable, extremely well-established choice for this exact
role, and the user may already have nginx experience or reasons (e.g.
familiarity, or plans to front other services on the same box) that
make it the better fit for their actual environment even though it
needs two packages and slightly more explicit configuration than Caddy
would have. The concrete cost of this choice — nginx doesn't set
`X-Forwarded-Proto` or redirect HTTP→HTTPS on its own the way Caddy
does — is fully absorbed into the example config and R5's fix, not left
as a footgun.

**Alternatives considered** (superseded by explicit user direction, kept
for the record):
- Caddy — this plan's original recommendation for its single-binary,
  automatic-HTTPS-by-default behavior; not used per the user's stated
  preference for nginx.
- Terminate TLS in the Go process itself (Go's `net/http` supports
  `ListenAndServeTLS`) — rejected regardless of proxy choice: would need
  the application itself to manage certificate issuance/renewal (e.g.
  via `autocert`), pulling an operational concern into the application
  that a dedicated proxy already solves better, and loses the option to
  front multiple services on the same box later.

## R7 — Process supervision: a systemd unit, no container runtime

**Decision**: A `systemd` service unit runs the built binary directly
(`Restart=on-failure`, `WantedBy=multi-user.target` for start-on-boot),
with production configuration supplied via an `EnvironmentFile` (a
plain `KEY=value` file outside the repo, per Principle V's "no
implicit/undocumented config").

**Rationale**: Satisfies FR-005 (auto-restart on crash, auto-start on
reboot) with tooling already present on essentially every Linux VPS —
no Docker, no container registry, no orchestration layer, consistent
with "SQLite is the only database... no external services unless a
feature explicitly demands it" (Principle V) extended to the same
philosophy for process management at this deployment's scale (one
server, one instance — spec.md Assumptions).

**Alternatives considered**:
- Docker (single-container deployment) — rejected: adds an image-build
  step, a registry or manual image-transfer story, and a container
  runtime dependency on the server, for a workload (one Go binary plus
  SQLite) that gains no isolation or portability benefit proportional to
  that cost at this scale.

## R8 — Backups: a scheduled file copy of the SQLite file, no new tooling

**Decision**: The ops documentation describes a `cron`-scheduled copy of
the live SQLite database file to a separate location (e.g. daily),
using SQLite's own safe-copy guidance (the `.backup` CLI command, which
is safe to run against a live database, rather than a raw `cp` which
risks copying a file mid-write). No backup tooling is built into the
application itself.

**Rationale**: Matches spec.md's Assumptions exactly ("Backups are
file-copy-based snapshots... this feature does not need to build an
automated backup scheduler or off-site backup storage integration") and
ROADMAP.md's "a simple SQLite backup strategy (periodic file copy of the
live DB — no new tooling)." `sqlite3 patchplanner.db ".backup backup.db"`
is the standard, dependency-free way to do this safely against a
running application.

## R9 — Stale forward-references from earlier slices need correcting, not just new docs written

**Decision**: Three pre-existing documents currently describe this
slice's work as future/unstarted and need updating now that it's real,
beyond just writing new deployment docs:
1. `.specify/memory/constitution.md` Principle III's "MAY serve the
   compiled frontend... revisit this once deployed... tracked as
   roadmap Slice 16" — the slice number is stale (deployment moved to
   18 during planning) and the hedge language ("MAY", "revisit") no
   longer matches reality once this slice ships. A `/speckit-constitution`
   PATCH-level amendment corrects both.
2. `PROJECT.md`'s §4.3 architecture-decisions section states
   "Embedding the Vite build output using Go's `embed` package is
   planned but not implemented" — needs updating to reflect that it now
   is.
3. `specs/014-auth/quickstart.md` already contains a placeholder note
   — *"Before deploying to production (Slice 16): come back here and
   add the real production callback URL"* — with the same stale slice
   number, and only a one-line reminder rather than the concrete steps
   this slice's own deployment runbook should provide.

**Rationale**: These aren't new problems this slice introduces, but
loose ends earlier slices deliberately deferred to "whenever deployment
happens" — now. Leaving them stale after this slice ships would mean
the project's own documentation contradicts its actual, deployed state,
which is exactly the kind of drift this project's `/speckit-*` workflow
exists to avoid. Fixing them is in-scope polish work, not scope creep,
since they are direct, previously-flagged prerequisites of this exact
slice.
