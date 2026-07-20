<!--
SYNC IMPACT REPORT
==================
Version change: 0.3.0 → 0.3.1
Modified principles:
  - III. Full-Stack Monorepo Architecture — the single-binary-deploy
    bullet no longer describes this as optional/future work: production
    deployment shipped as roadmap Slice 18 (`make build` + `go:embed`),
    correcting the stale "tracked as roadmap Slice 16" pointer (Slice 16
    became inventory ownership during planning; deployment moved to
    Slice 18). Local dev is now described accurately (Vite dev-server
    proxy forwards `/api` and `/health`, since the frontend's API base
    URL became relative in this same slice).
Added sections: none
Removed sections: none
Technology Stack: "Build/deploy" row updated to state the single-binary
  production build concretely instead of calling it optional.
Templates checked:
  ✅ plan-template.md — no hardcoded principle text to update
  ✅ spec-template.md — no constitution references
  ✅ tasks-template.md — no constitution references
  ✅ commands/*.md — none present in this project
This is a documentation-only PATCH clarifying wording after Slice 18
(production deployment) shipped — no principle was added, removed, or
redefined.
Deferred TODOs: none
-->

<!--
PRIOR SYNC IMPACT REPORT (0.2.0 → 0.3.0)
==================
Version change: 0.2.0 → 0.3.0
Modified principles:
  - III. Full-Stack Monorepo Architecture — package-layout bullet now
    names `api/middleware/` as the home for cross-cutting request
    handling (authentication), the first subpackage of its kind in the
    project. Also dropped a dangling "(Principle V)" cross-reference in
    the single-binary-deploy bullet (it pointed at the "single-user"
    clause removed from Principle V below) and replaced it with a
    pointer to roadmap Slice 16, the actual trigger for revisiting that
    decision.
  - V. Pragmatic Simplicity — struck the "Authentication is out of
    scope for v1; the tool is single-user, locally hosted" bullet
    (factually superseded by roadmap Slice 14) and replaced it with the
    chosen authentication approach: Google OAuth 2.0 with DB-backed
    sessions, explicitly not JWT, explicitly not a new external
    session-store service — framed as consistent with, not an
    exception to, the "SQLite is the only database" rule in the same
    principle.
Added sections: none (no new principles)
Removed sections: none
Technology Stack: added an "Auth" row (Google OAuth 2.0 authorization-code
  flow + DB-backed sessions) and added `internal/api/middleware/` to the
  documented backend project structure.
Templates checked:
  ✅ plan-template.md — Constitution Check section is generic, no
     hardcoded principle text to update
  ✅ spec-template.md — no constitution references
  ✅ tasks-template.md — no constitution references
  ✅ commands/*.md — none present in this project
  ✅ PROJECT.md §4.3 — "No authentication (v1)" architecture-decision
     bullet updated to point at the new Slice 14 direction instead of
     the superseded constitution line
Deferred TODOs: none
-->

# PatchPlanner Constitution

## Core Principles

### I. Domain-First Data Model

The application's core strength is accurately representing AVL (Audio, Video, Lighting)
equipment, connections, patches, and rigs. Every entity in the system MUST map to a
real-world AVL concept (mixer channel, fixture, stagebox, DMX address, cable run, etc.).

- Data models MUST reflect industry terminology: channels, patch, DCA, stagebox, multicore,
  fixture, DMX universe, power circuit, truss, etc.
- Relationships between entities (e.g., mic → cable → stagebox → multicore → mixer channel)
  MUST be first-class, traversable connections — not free-text fields.
- The inventory catalog (sourced from LL.xlsx) MUST be the authoritative source for rentable
  equipment; custom/owned gear may be added as separate catalog entries.
- Signal-routing features (the Output and Input audio graphs) MUST model connections as an
  explicit, traversable port-and-cable graph — a shared node-zone/`PortRef`/cable convention,
  not flat foreign keys on the entity being routed. This is the established pattern any
  future signal-flow feature (e.g., video or power distribution) MUST follow.

### II. Extensibility by Design

Equipment types, connector types, channel attributes, and fixture definitions MUST be defined
as data, not hard-coded logic, so the system can grow without schema rewrites.

- Fixture channel modes (DMX), connector types (XLR, NL4, Schuko, CEE, etc.), and cable
  types MUST be stored as configurable records, not enums in code.
- New inventory *categories* from the LL.xlsx catalog (e.g., a new "Video Cameras" or
  "Rigging" category appearing in the price list) MUST be addable by adding data alone —
  they MUST NOT require new API endpoints or frontend components, since every domain
  entity references inventory items generically (`inventory_item_id`/`category_id`) and
  never branches logic on a category name.
- This does NOT extend to new domain *node kinds* in the planning data model itself (e.g.,
  a new signal-flow node type, or splitting one entity into several as Source/Channel were
  split from the old flat audio-input row) — those are structural additions and MAY require
  new tables, endpoints, and components; that is expected engineering work, not a violation
  of this principle.
- The patch schema for audio inputs and outputs MUST support optional fields (mic stand,
  DCA group, cable length, etc.) so future attributes can be added non-destructively.

### III. Full-Stack Monorepo Architecture

This project is a single-repo full-stack web application: Go REST API backend + React/TypeScript
frontend, with SQLite as the embedded database.

- Repository layout MUST follow: `backend/` (Go) and `frontend/` (React/TypeScript + Vite).
- The backend serves the compiled frontend as embedded static files in production for a
  single deployable binary (`make build`; `//go:embed dist` in `backend/cmd/main.go`,
  shipped as roadmap Slice 18); in local development the two still run as separate
  processes (`go run` + `vite dev`), with a Vite dev-server proxy forwarding `/api` and
  `/health` to the backend.
- The REST API MUST use JSON and follow resource-oriented URL conventions (`/api/v1/...`).
- Database migrations MUST be versioned and applied automatically on startup.
- Go packages MUST be organized under `backend/internal/`: `api/` for HTTP handlers and
  routing (including `api/middleware/` for cross-cutting request handling such as
  authentication), `db/` for data access, `domain/` for pure domain structs (no DB tags),
  `service/` for cross-cutting business logic (e.g., inventory import, rental export,
  Google OAuth); `backend/cmd/main.go` is the sole entry point.

### IV. Inventory-Driven Rental Workflow

Planning MUST be grounded in the renter's available inventory. The rental order export
MUST reproduce the LL.xlsx template format so it can be sent directly to the renter.

- Every piece of rented equipment in a plan MUST reference an inventory item from the catalog.
- Quantities requested in a plan MUST be validated against available stock counts from the
  inventory.
- The export feature MUST write quantities back into the LL.xlsx template structure (same
  row layout, columns: Antal Ljud / Antal Ljus) so the file can be submitted unmodified.
- Owned or generic equipment (rigging hardware, consumables) MAY be tracked outside the
  rental catalog without export constraints.

### V. Pragmatic Simplicity

Start with the simplest solution that solves the problem. Avoid speculative infrastructure.

- YAGNI: Do not add abstractions, layers, or services unless a concrete current need
  requires them.
- SQLite is the only database. No external services (Redis, message queues, etc.) unless
  a feature explicitly demands it and is approved.
- Authentication is Google OAuth 2.0 (authorization-code flow) with DB-backed sessions —
  a SQLite `sessions` table plus an `HttpOnly` cookie, not JWT. This is consistent with,
  not an exception to, the SQLite-only rule above: it introduces no new session-store
  service and needs no signing-secret to manage or rotate.
- Server state (data fetched from the API) MUST be managed via TanStack React Query
  (`useQuery`/`useMutation`) — this is the established, project-wide convention, not an
  exception to avoid. Purely local/UI state (form drafts, dialog open/close, canvas drag
  state) MUST use React's built-in state (`useState`/`useContext`/`useReducer`) before
  reaching for any additional external state library.

## Technology Stack

| Layer              | Technology                                                                |
|--------------------|----------------------------------------------------------------------------|
| Backend            | Go 1.25+ (standard library + chi router)                                 |
| Database           | SQLite via `modernc.org/sqlite` (pure Go)                                |
| Migrations         | `golang-migrate/migrate`                                                 |
| Frontend           | React 18 + TypeScript + Vite                                             |
| Server state (FE)  | TanStack React Query (`useQuery`/`useMutation`)                          |
| Forms/validation   | react-hook-form + zod                                                    |
| Routing (FE)       | react-router-dom                                                         |
| UI components      | To be decided per feature (prefer minimal deps)                          |
| API style          | REST JSON (`/api/v1/...`)                                               |
| Auth               | Google OAuth 2.0 (authorization-code flow) + DB-backed sessions (SQLite `sessions` table + `HttpOnly` cookie) |
| Build/deploy       | Single Go binary in production (`make build` embeds the built frontend via `go:embed`); separate dev processes locally via a Vite proxy (see Principle III) |
| Testing (BE)       | Go standard `testing` package + `httptest`                              |
| Testing (FE)       | Vitest, with lightweight custom render helpers (no React Testing Library) |

**Project structure**:

```
backend/
├── cmd/
│   └── main.go   # Entry point
├── internal/
│   ├── api/      # HTTP handlers and routing
│   │   └── middleware/  # Cross-cutting request handling (e.g., authentication)
│   ├── db/       # SQLite access, migrations, queries
│   ├── domain/   # Pure Go structs (no DB tags)
│   └── service/  # Cross-cutting business logic (e.g., inventory import, Google OAuth)
└── migrations/   # Versioned SQL migration files

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── lib/      # Pure functions (graph/signal-flow logic, utils)
│   └── api/      # typed API client
└── vite.config.ts

inventory/
└── LL.xlsx       # Source inventory file (read-only input)
```

## Development Workflow

- Features are specified before implementation: spec → plan → tasks → implement.
- Each user story MUST be independently testable and deliverable as an MVP increment.
- The backend MUST expose an OpenAPI/Swagger spec (or at minimum a typed Go struct per
  request/response) so the frontend can use type-safe API calls.
- DB schema changes MUST include a migration file; no direct `ALTER TABLE` in application code.
- `go vet` and `golangci-lint` MUST pass before merging backend changes.
- `tsc --noEmit` and ESLint MUST pass before merging frontend changes.

## Governance

- This constitution supersedes all other conventions; any deviation MUST be justified in the
  relevant plan.md under Complexity Tracking.
- Amendments follow semantic versioning:
  - **MAJOR**: Principle removal, technology replacement, or backward-incompatible governance change.
  - **MINOR**: New principle, new mandatory technology, or materially expanded guidance.
  - **PATCH**: Clarifications, wording improvements, typo fixes.
- All feature plans (plan.md) MUST include a Constitution Check section confirming compliance
  with Principles I–V before implementation begins.
- Complexity violations (e.g., adding a new runtime dependency, adding a second database)
  MUST be documented in the relevant plan.md with rationale.

**Version**: 0.3.1 | **Ratified**: 2026-06-25 | **Last Amended**: 2026-07-21
