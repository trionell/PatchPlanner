<!--
SYNC IMPACT REPORT
==================
Version change: (new project) → 0.1.0
Added sections: Core Principles (5), Technology Stack, Development Workflow, Governance
Modified principles: N/A (initial version)
Removed sections: N/A
Templates updated:
  ✅ plan-template.md — no changes needed, already uses generic structure
  ✅ spec-template.md — no changes needed, already uses generic structure
  ✅ tasks-template.md — no changes needed, already uses generic structure
Deferred TODOs: none
-->

# PatcherPlanner Constitution

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

### II. Extensibility by Design

Equipment types, connector types, channel attributes, and fixture definitions MUST be defined
as data, not hard-coded logic, so the system can grow without schema rewrites.

- Fixture channel modes (DMX), connector types (XLR, NL4, Schuko, CEE, etc.), and cable
  types MUST be stored as configurable records, not enums in code.
- New equipment categories (e.g., video, rigging, power) MUST be addable by adding data
  — they MUST NOT require new API endpoints or frontend components from scratch.
- The patch schema for audio inputs and outputs MUST support optional fields (mic stand,
  DCA group, cable length, etc.) so future attributes can be added non-destructively.

### III. Full-Stack Monorepo Architecture

This project is a single-repo full-stack web application: Go REST API backend + React/TypeScript
frontend, with SQLite as the embedded database.

- Repository layout MUST follow: `backend/` (Go) and `frontend/` (React/TypeScript + Vite).
- The backend MUST serve the compiled frontend as static files in production, producing a
  single deployable binary.
- The REST API MUST use JSON and follow resource-oriented URL conventions (`/api/v1/...`).
- Database migrations MUST be versioned and applied automatically on startup.
- Go packages MUST be organized as: `backend/internal/` for domain logic,
  `backend/api/` for HTTP handlers, `backend/db/` for data access.

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
- Authentication is out of scope for v1; the tool is single-user, locally hosted.
- Frontend state management MUST use React's built-in state (useState/useContext/useReducer)
  before reaching for external state libraries.

## Technology Stack

| Layer        | Technology                                      |
|--------------|-------------------------------------------------|
| Backend      | Go 1.22+ (standard library + chi router)        |
| Database     | SQLite via `modernc.org/sqlite` (pure Go)       |
| Migrations   | `golang-migrate/migrate`                        |
| Frontend     | React 18 + TypeScript + Vite                    |
| UI components| To be decided per feature (prefer minimal deps) |
| API style    | REST JSON (`/api/v1/...`)                       |
| Build/deploy | Single Go binary embedding frontend static files|
| Testing (BE) | Go standard `testing` package + `httptest`      |
| Testing (FE) | Vitest + React Testing Library                  |

**Project structure**:

```
backend/
├── api/          # HTTP handlers and routing
├── internal/     # Domain models and business logic
├── db/           # SQLite access, migrations, queries
└── main.go

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
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

**Version**: 0.1.0 | **Ratified**: 2026-06-25 | **Last Amended**: 2026-06-25
