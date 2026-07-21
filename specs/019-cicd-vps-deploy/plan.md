# Implementation Plan: CI/CD deploy to VPS via GitHub Actions

**Branch**: `019-cicd-vps-deploy` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-cicd-vps-deploy/spec.md`

## Summary

Automate what Slice 18's `quickstart.md` currently documents as a manual
runbook (build locally, `scp` the binary, SSH in, restart the service): a
GitHub Actions workflow that builds and tests the app on every push to
`main` (plus an on-demand `workflow_dispatch` trigger), then, only if those
checks pass, transfers the new binary and migrations to the VPS over SSH
and hands off to a fixed, version-controlled VPS-side script
(`deploy/remote-deploy.sh`) that atomically swaps the binary in, restarts
the existing `patchplanner` systemd service, health-checks it, and
automatically restores the previous binary if the new one fails to come up
healthy. No new application code, no new runtime dependency, no new
database, no containers — this is CI/CD configuration plus one ops script,
layered entirely on top of what Slice 18 already built.

## Technical Context

**Language/Version**: Bash (deploy script) + GitHub Actions YAML; reuses
the existing Go 1.25 / Node toolchain only via the existing `make build`
target — no new language/runtime introduced.

**Primary Dependencies**: GitHub Actions (`ubuntu-latest` runner) and the
OpenSSH client (already present on that runner and on the VPS) — no
third-party GitHub Actions and no new backend/frontend package
dependencies.

**Storage**: N/A — no new persisted data; the existing SQLite database and
migrations mechanism are unchanged and untouched by this feature.

**Testing**: Reuses the project's existing gates as CI steps —
`go vet ./...` and `go test ./...` (backend), `tsc -b`, `eslint .`, and
`vitest run` (frontend) — as the pass/fail condition gating the deploy
step (FR-002).

**Target Platform**: CI runs on GitHub's `ubuntu-latest` runner; deploy
target is the same Linux VPS Slice 18 already provisions (nginx + Certbot
+ systemd).

**Project Type**: Web application (existing backend/frontend monorepo) —
this feature adds only CI/CD configuration and one ops script, no new
application project.

**Performance Goals**: A deploy (build + test + transfer + restart +
health-check) completes within a few minutes end-to-end (SC-001); the
VPS-side restart-to-healthy gap is on the order of a few seconds, not
minutes.

**Constraints**: No new runtime dependency ships inside the application
binary itself; no secret ever appears in workflow logs or tracked source
(FR-008); single VPS / single systemd instance — no blue-green or
zero-millisecond-downtime guarantee (see `research.md`).

**Scale/Scope**: One production environment, one VPS, one systemd service
— matches Slice 18's already-established single-instance scope exactly;
this feature only automates deploys onto it.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Domain-First Data Model** — N/A. No domain entities, no AVL
  concepts involved; this is pure ops/CI tooling. Not violated.
- **II. Extensibility by Design** — N/A. No inventory/equipment data
  touched. Not violated.
- **III. Full-Stack Monorepo Architecture** — Compliant. The pipeline
  invokes the existing `make build` (`//go:embed dist` single-binary
  build) as-is, per the Technology Stack table's "Build/deploy" row; it
  does not introduce a second build path. No change to `backend/internal/`
  package layout.
- **IV. Inventory-Driven Rental Workflow** — N/A. Not touched.
- **V. Pragmatic Simplicity** — Compliant, and directly load-bearing for
  this plan's design choices: no new database, no new external service
  (Redis, message queue, container registry), no third-party GitHub
  Actions where the OpenSSH client already does the job natively (see
  `research.md`'s deploy-transport decision). The one new moving part
  (`deploy/remote-deploy.sh`) is the minimum needed to safely automate
  what was already being done by hand.

**Result**: PASS. No violations; Complexity Tracking section left empty.

## Project Structure

### Documentation (this feature)

```text
specs/019-cicd-vps-deploy/
├── plan.md                          # This file
├── research.md                      # Phase 0 output
├── quickstart.md                    # Phase 1 output — GitHub + VPS one-time setup
├── contracts/
│   └── remote-deploy-script.md      # Phase 1 output — VPS-side script's contract
└── tasks.md                         # Phase 2 output (/speckit.tasks — not this command)
```

No `data-model.md`: this feature introduces no persisted entities (no new
database tables, no new domain structs) — the spec's "Key Entities" (Pipeline
run, Deploy credential) are runtime/GitHub-native and secret-store concepts,
not application data.

### Source Code (repository root)

```text
.github/
└── workflows/
    └── deploy.yml              # NEW — build/test/deploy pipeline (this feature)

deploy/
├── nginx.conf.example          # existing (Slice 18) — unchanged
├── patchplanner.service        # existing (Slice 18) — unchanged
├── backup.sh.example           # existing (Slice 18) — unchanged
└── remote-deploy.sh            # NEW — VPS-side atomic swap + restart +
                                 #       health-check + auto-rollback script

README.md                       # touched — Deployment section gains a
                                 # pointer to this feature's quickstart.md,
                                 # alongside the existing Slice 18 pointer
```

No changes anywhere under `backend/` or `frontend/` — this feature adds only
CI/CD configuration and one ops script layered on top of Slice 18's existing
`make build` and systemd/nginx setup.

**Structure Decision**: Follows the existing `deploy/` ops-files convention
established by Slice 18 (tracked example scripts/configs an operator copies
onto the VPS during setup) and adds the one standard location GitHub Actions
requires, `.github/workflows/`. No new top-level directories, no new source
project.

## Complexity Tracking

*No entries — Constitution Check passed with no violations.*
