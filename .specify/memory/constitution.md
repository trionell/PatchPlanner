<!--
SYNC IMPACT REPORT
==================
Version change: 0.3.1 → 0.4.0
Modified principles:
  - I. Domain-First Data Model — the inventory-catalog bullet no longer
    names LL.xlsx as *the* source. The catalog is now defined by its
    role (the authoritative source of rentable equipment for the event
    that binds it), with its origin — a supplier price list, a generic
    spreadsheet, or direct entry — explicitly declared irrelevant to
    every downstream consumer. Slice 22 makes the tool usable by
    technicians who rent from any supplier, so hardcoding one
    supplier's file into a core principle became actively wrong.
  - II. Extensibility by Design — the "new inventory *categories* from
    the LL.xlsx catalog" bullet is generalized to categories from any
    source, including ones the user creates by hand. The substance of
    the rule (no new endpoints or components; never branch logic on a
    category name) is unchanged and now covers user-defined categories.
  - IV. Inventory-Driven Rental Workflow — was written as "the export
    MUST reproduce the LL.xlsx template format". Restructured into a
    general obligation (every inventory MUST be exportable in a
    supplier-neutral form) plus a conditional fidelity requirement (an
    inventory populated from a supplier's own price-list file MUST be
    exportable back into that exact file, and MUST NOT offer that
    export otherwise). This strengthens rather than relaxes the old
    rule: it adds the negative half, which is the actual new
    invariant.
Added sections: none (no new principles)
Removed sections: none
Technology Stack: added a "Documents" row naming excelize for
  spreadsheets and a pure-Go PDF writer for the PDF rental order (the
  first PDF generation in the project; the dependency itself is
  justified in specs/022-generic-inventory-formats/plan.md under
  Complexity Tracking, per Governance).
Other corrections bundled in (both factual drift, PATCH-level on their
own — folded into this MINOR amendment rather than deferred):
  - Project structure block listed `inventory/LL.xlsx` as a read-only
    input directory. That has not been true since Slice 16: price-list
    files are per-inventory uploads stored in the database, and the
    repo-root LL.xlsx is only a bootstrap sample. Block corrected.
  - Development Workflow required `tsc --noEmit`, which silently checks
    nothing against this repo's references-only root tsconfig. Changed
    to `tsc -b`, matching the `typecheck` script CI actually runs.
Templates checked:
  ✅ plan-template.md — Constitution Check section is generic, no
     hardcoded principle text to update
  ✅ spec-template.md — no constitution references
  ✅ tasks-template.md — no constitution references
  ✅ checklist-template.md — no constitution references
Follow-up required (tracked in the Slice 22 task list, not deferred
indefinitely):
  ⚠ PROJECT.md §1 and §2.2 still describe the catalog as sourced from
     LL.xlsx; to be updated as part of Slice 22's documentation task.
  ⚠ ROADMAP.md standing invariant (line 27) names "the Excel export";
     to be reworded to cover all three export formats in the same task.
Deferred TODOs: none
-->

<!--
PRIOR SYNC IMPACT REPORT (0.3.0 → 0.3.1)
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
- An event's bound inventory catalog MUST be the authoritative source for rentable equipment
  in that event's plans; custom/owned gear may be added as separate catalog entries. How a
  catalog was populated — imported from a supplier's price-list file, imported from a generic
  spreadsheet, or entered by hand — MUST be invisible to everything downstream of it: an
  inventory item is an inventory item, and no planning, aggregation, or validation logic may
  branch on its origin.
- Signal-routing features (the Output and Input audio graphs) MUST model connections as an
  explicit, traversable port-and-cable graph — a shared node-zone/`PortRef`/cable convention,
  not flat foreign keys on the entity being routed. This is the established pattern any
  future signal-flow feature (e.g., video or power distribution) MUST follow.

### II. Extensibility by Design

Equipment types, connector types, channel attributes, and fixture definitions MUST be defined
as data, not hard-coded logic, so the system can grow without schema rewrites.

- Fixture channel modes (DMX), connector types (XLR, NL4, Schuko, CEE, etc.), and cable
  types MUST be stored as configurable records, not enums in code.
- New inventory *categories* — whether they appear in an imported price list, arrive in a
  generic spreadsheet, or are created by the user by hand (e.g., a new "Video Cameras" or
  "Rigging" category) — MUST be addable by adding data alone. They MUST NOT require new API
  endpoints or frontend components, since every domain entity references inventory items
  generically (`inventory_item_id`/`category_id`) and never branches logic on a category
  name.
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

Planning MUST be grounded in the renter's available inventory, and the resulting rental
order MUST leave the tool in a form a supplier can act on directly.

- Every piece of rented equipment in a plan MUST reference an inventory item from the catalog.
- Quantities requested in a plan MUST be validated against available stock counts from the
  inventory.
- Every event MUST be exportable as a supplier-neutral rental order that stands on its own —
  identifying the event, every item, its quantities, and its price — regardless of how the
  event's inventory was populated. No inventory may be a dead end.
- Where an inventory was populated from a supplier's own price-list file, the export MUST
  additionally be able to reproduce that exact file with quantities written into its own
  order columns, so it can be submitted unmodified. Conversely, an inventory not populated
  from such a file MUST NOT offer that supplier-specific export — neither in the interface
  nor on direct request. Fidelity to a supplier's format is earned by having imported it,
  never assumed.
- Lines that cannot be represented faithfully in a supplier-specific export MUST be reported
  to the user, never silently dropped.
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
| Documents          | `xuri/excelize` for reading and writing spreadsheets; a pure-Go (CGO-free) PDF writer for the PDF rental order |
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
```

Inventory source files are **not** a directory in the repository. Each inventory is
populated by a per-user upload (or by direct entry), and a supplier price-list file is
retained in the database alongside the inventory it populated, so it can be reproduced on
export. The repo-root `LL.xlsx` is only a bootstrap sample for the legacy single-catalog
migration.

## Development Workflow

- Features are specified before implementation: spec → plan → tasks → implement.
- Each user story MUST be independently testable and deliverable as an MVP increment.
- The backend MUST expose an OpenAPI/Swagger spec (or at minimum a typed Go struct per
  request/response) so the frontend can use type-safe API calls.
- DB schema changes MUST include a migration file; no direct `ALTER TABLE` in application code.
- `go vet` and `golangci-lint` MUST pass before merging backend changes.
- `tsc -b` (the `typecheck` script) and ESLint MUST pass before merging frontend changes.
  `tsc --noEmit` MUST NOT be used as the gate: the root `tsconfig.json` is references-only,
  so `--noEmit` type-checks nothing and passes unconditionally.

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

**Version**: 0.4.0 | **Ratified**: 2026-06-25 | **Last Amended**: 2026-07-25
