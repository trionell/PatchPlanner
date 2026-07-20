# Implementation Plan: Production Deployment

**Branch**: `018-deployment` | **Date**: 2026-07-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-deployment/spec.md`

## Summary

The application moves from two separate dev-only processes to one
deployable Go binary serving both the API and the built frontend at a
single origin. The real blocker for this turns out not to be the
`go:embed` mechanism itself but a hardcoded `localhost:7331` API base URL
baked into the frontend (research.md R1) — fixed by making it a relative
path, with Vite's dev-server proxy added so local development keeps
working unchanged (R4). The Go binary gains a catch-all static-file
route with an `index.html` fallback for client-side routing (R2), built
via one ordered script (frontend build, then Go build — R3). A
previously-flagged seam from Slice 14's own plan — the session cookie's
`Secure` flag being derived from `r.TLS != nil`, which is always false
behind a reverse proxy — gets fixed to trust `X-Forwarded-Proto` (R5).
Ops documentation covers the production topology: nginx + Certbot in
front for HTTPS (R6, per explicit direction — nginx doesn't set the
`X-Forwarded-Proto` header or redirect HTTP→HTTPS on its own the way
some alternatives do, so both are made explicit in the example config
and R5's fix), a systemd unit for process supervision (R7), and a
cron-scheduled SQLite `.backup` for data safety (R8) — no Docker, no
CI/CD pipeline yet, matching Principle V and the scale this deployment
targets (spec.md Assumptions: one small VPS, one instance). The build
and deploy steps are deliberately shaped to need no rework once GitHub
Actions CI/CD is added later (R3, per explicit direction: a single
build producing two plain artifacts, config entirely via env vars a
workflow can populate from Secrets, deploy as copy-then-restart) —
without building that pipeline now. Three earlier documents that
deliberately deferred this work to "whenever deployment happens" get
corrected now that it's real (research.md R9): the constitution's stale
"Slice 16" pointer and hedge wording, `PROJECT.md`'s "planned but not
implemented" note, and `specs/014-auth/quickstart.md`'s placeholder
reminder.

## Technical Context

**Language/Version**: Go 1.25.0 (backend), TypeScript 5 / React 18
(frontend) — unchanged.

**Primary Dependencies**: none new in application code. nginx + Certbot
(reverse proxy and TLS) and systemd (process supervision) are
host-level ops tooling, not project dependencies — no new
`go.mod`/`package.json` entries. GitHub Actions CI/CD is an explicit
future direction (not built in this slice) that the build/deploy
approach here is shaped not to need rework for (research.md R3).

**Storage**: SQLite — unchanged, no schema/migration needed. This slice
is the first to document how the existing database *file* is backed up
in production (research.md R8), not a change to its structure.

**Testing**: Go `testing` + `httptest` for the cookie `Secure`-flag fix
(a unit test asserting `X-Forwarded-Proto: https` produces a `Secure`
cookie even with `r.TLS == nil`) and for the embedded-static-file
serving/SPA-fallback route (an `httptest` request for a client-side
route path returning `index.html`, and `/api/*`/`/health` still routing
to their real handlers, never swallowed by the catch-all). Manual
end-to-end verification of the full build → deploy → HTTPS → sign-in →
restart-survives chain is documented as a runbook
(`specs/018-deployment/quickstart.md`) rather than automated — matching
Slice 14's own precedent that the real external OAuth round-trip is
manual-only.

**Target Platform**: a single Linux VPS (spec.md Assumptions) — unchanged
from the project's existing `net/http`/SQLite stack, no new platform
constraint.

**Project Type**: Web application (backend + frontend) — unchanged
structure, this slice changes how it's *built and run*, not its layout.

**Constraints**: Never touch the live dev DB ([[db-safety-rule]]) — the
backup procedure (R8) must be verified against a copy, confirming a
`.backup`-produced file is a valid, openable SQLite database with the
expected tables, before being documented as the recommended procedure.
The relative `API_BASE` change (R1) must be manually verified in local
dev (via the new Vite proxy) before being trusted in production, since a
mistake here would silently break every API call in both environments
at once.

**Scale/Scope**: 1 frontend file changed (`api/client.ts`), 1 new Vite
proxy config block, 1 new Go static-file/SPA-fallback route plus its
`go:embed` directive, 1 small cookie-security fix (2 call sites in
`auth.go` collapse to 1 shared helper), 1 build script (`Makefile`), 3
new ops docs (nginx config example, systemd unit example, backup
procedure), 1 constitution PATCH amendment, 2 stale-doc corrections
(`PROJECT.md`, `specs/014-auth/quickstart.md`) — no database migration,
no new backend package, no new frontend page.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

PASS, with one flagged amendment (not a violation — research.md R9).

- **I. Domain-First Data Model** — PASS, unaffected. This slice touches
  no domain entities.
- **II. Extensibility by Design** — PASS, unaffected. No vocabulary,
  catalog, or schema changes.
- **III. Full-Stack Monorepo Architecture** — PASS, and this slice is
  precisely what this principle's existing "MAY serve the compiled
  frontend as static files... revisit this once deployed" bullet
  anticipated. **Amendment flagged**: that bullet's hedge wording and
  its stale "roadmap Slice 16" pointer (deployment moved to Slice 18
  during planning) need a PATCH-level correction once this slice ships
  — tracked as a Polish-phase task, not a blocking violation now
  (research.md R9).
- **IV. Inventory-Driven Rental Workflow** — PASS, unaffected.
- **V. Pragmatic Simplicity** — PASS. Every choice in this plan is the
  simplest option that meets spec.md's requirements at the stated scale
  (research.md R6/R7/R8): no Docker, no CI/CD, no new database, no new
  application-level dependency — matching "avoid speculative
  infrastructure" and "no external services unless a feature explicitly
  demands it" exactly.

**Post-design re-check (Phase 1)**: PASS — no design decision beyond
those already justified above; the constitution amendment itself
(correcting Principle III's wording once this slice ships) is the kind
of governance update Principle V's own Governance section anticipates
for exactly this situation, not a new exception being carved out.

## Project Structure

### Documentation (this feature)

```text
specs/018-deployment/
├── plan.md                        # This file
├── research.md                    # Phase 0 output
├── quickstart.md                  # Phase 1 output — the deployment runbook itself
├── checklists/requirements.md     # Spec quality checklist (passing)
└── tasks.md                       # Phase 2 output (/speckit-tasks)
```

No `data-model.md` or `contracts/` — this slice introduces no domain
entities and no new/changed API endpoints (confirmed: every functional
requirement is about *how* the existing application is built, served,
and operated, not what it exposes).

### Source Code (repository root)

```text
backend/
├── cmd/
│   ├── main.go                     # EDITED — //go:embed dist (embed.FS);
│   │                                #          catch-all static/SPA-fallback route
│   │                                #          (excluding /api/*, /health)
│   └── dist/                       # NEW, gitignored — frontend/dist copied in by
│                                    #          `make build` (research.md R2); the
│                                    #          directory go:embed actually reads,
│                                    #          since it can't cross the backend/
│                                    #          module boundary with `..`
├── internal/
│   └── api/
│       ├── auth.go                 # EDITED — Secure cookie flag trusts
│       │                           #          X-Forwarded-Proto (research.md R5)
│       ├── auth_test.go            # EDITED — covers the new Secure-flag logic
│       ├── static.go               # NEW — the embedded-frontend serving handler,
│       │                           #        takes an fs.FS (testable with
│       │                           #        fstest.MapFS, no real embed needed in
│       │                           #        tests), kept separate from router.go's
│       │                           #        API route tree for a clean boundary
│       └── static_test.go          # NEW
└── (no migrations — no schema change)

frontend/
├── src/
│   └── api/
│       └── client.ts                # EDITED — API_BASE becomes '/api/v1'
│                                    #          (research.md R1)
└── vite.config.ts                   # EDITED — dev-server proxy for /api and
                                     #          /health to :7331 (research.md R4)

Makefile                             # NEW — `make build`: npm run build,
                                     #        copy frontend/dist to
                                     #        backend/cmd/dist, then go build,
                                     #        in that order (research.md R2/R3)
backend/cmd/.gitignore               # NEW — ignores dist/ (mirrors
                                     #        frontend/.gitignore's own dist entry)

deploy/                              # NEW — ops reference material, not
├── patchplanner.service             #        application code:
├── nginx.conf.example                #        systemd unit (R7), nginx reverse
└── backup.sh.example                #        proxy + Certbot config (R6),
                                     #        backup script (R8)

.specify/memory/constitution.md      # EDITED (Polish phase) — Principle III
                                     #        wording + Technology Stack row,
                                     #        PATCH amendment (research.md R9)
PROJECT.md                           # EDITED — §4.3 "planned but not implemented"
                                     #          note corrected (research.md R9)
specs/014-auth/quickstart.md         # EDITED — placeholder "Slice 16" reminder
                                     #          replaced with the real production
                                     #          redirect-URI steps (research.md R9)
README.md                            # EDITED — deployment section, env var
                                     #          additions for production
```

**Structure Decision**: Web application layout per constitution — all
application-code changes land in the existing `backend/` and `frontend/`
trees; ops reference material (systemd unit, nginx config, backup
script) is new, but explicitly *not* application code, so it lives in a
top-level `deploy/` directory rather than inside either tree, mirroring
how `inventory/LL.xlsx` already sits outside both as project-level,
non-code material. No `.github/workflows/` directory is added — GitHub
Actions CI/CD is an explicit future direction, not part of this slice
(research.md R3).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — Constitution Check passed above with one flagged
(non-blocking) documentation amendment, not a violation requiring
justification.
