---

description: "Task list for CI/CD deploy to VPS via GitHub Actions (Slice 19)"
---

# Tasks: CI/CD deploy to VPS via GitHub Actions

**Input**: Design documents from `/specs/019-cicd-vps-deploy/`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md, contracts/remote-deploy-script.md

**Tests**: Not requested for this feature. Verification instead relies on
GitHub Actions' own pass/fail signal plus manual runbook checks against a
real repo/VPS (this feature has no application code to unit-test — it is
CI/CD configuration and one ops shell script). Manual-verification tasks
are marked explicitly, following the same pattern Slice 18 used for its
two server-dependent checks.

**Organization**: Tasks are grouped by user story. **Note on file overlap**:
unlike most slices, all three user stories add steps to the *same* two
files (`.github/workflows/deploy.yml` and `deploy/remote-deploy.sh`) rather
than touching independent files — there is only one pipeline, and each
story adds a slice of its behavior. Tasks within a story are therefore
mostly sequential against those files even where `[P]` might otherwise
apply; `[P]` is used only where a task genuinely touches a different file.
Each story is still independently *testable* (see each story's Independent
Test), even though the underlying files are shared.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Repository root paths, per plan.md's Project Structure: `.github/workflows/`
(new), `deploy/` (existing dir, one new file), `README.md`, `ROADMAP.md`.

---

## Phase 1: Setup

**Purpose**: Scaffold the two new files this feature adds, with no
behavior yet.

- [ ] T001 [P] Create `.github/workflows/deploy.yml` with just
  `name: Deploy` and an empty `jobs.build-test-deploy` skeleton
  (`runs-on: ubuntu-latest`, no `on:` trigger and no `steps:` yet).
- [ ] T002 [P] Create `deploy/remote-deploy.sh` with `#!/usr/bin/env bash`,
  `set -euo pipefail`, and argument-count validation only (fail with a
  clear message if `$1` is missing), per the invocation contract in
  `specs/019-cicd-vps-deploy/contracts/remote-deploy-script.md`. Make it
  executable (`chmod +x`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared plumbing every user story's trigger path runs
through — none of the three stories can be demonstrated until this phase
is complete.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T003 Implement the full body of `deploy/remote-deploy.sh` per
  `specs/019-cicd-vps-deploy/contracts/remote-deploy-script.md`: validate
  `$1` is a directory containing an executable `patchplanner` binary and a
  `migrations/` directory; back up the current live binary to
  `patchplanner.prev`; atomically `mv` the staged binary into place;
  replace `migrations/`; `sudo systemctl restart patchplanner`; poll
  `http://127.0.0.1:<port>/health` (port read from the service's own env
  file) with a small retry budget and short backoff; on success clean up
  the staging directory and exit `0`; on failure restore
  `patchplanner.prev`, restart again, and exit non-zero. (Depends on T002.)
- [ ] T004 Add the shared verification steps to
  `.github/workflows/deploy.yml`: `actions/checkout`, `actions/setup-go`
  + `go vet ./...` + `go test ./...` (working directory `backend/`),
  `actions/setup-node` + frontend `tsc -b` + `eslint .` + `vitest run`
  (working directory `frontend/`), then `make build` from the repo root —
  reusing Slice 18's Makefile target exactly, producing
  `backend/patchplanner`. (Depends on T001.)
- [ ] T005 Add an SSH setup step to `.github/workflows/deploy.yml`, after
  the steps from T004: write `secrets.DEPLOY_SSH_KEY` to
  `~/.ssh/id_ed25519` (mode `600`) and `secrets.DEPLOY_KNOWN_HOSTS`
  verbatim to `~/.ssh/known_hosts`, using only the OpenSSH client already
  on the runner — no third-party SSH/SCP actions, per research.md's
  deploy-transport decision. (Depends on T004.)
- [ ] T006 Add `concurrency: {group: production-deploy, cancel-in-progress: false}`
  at the workflow level in `.github/workflows/deploy.yml`, so overlapping
  runs queue instead of racing each other to the server (spec edge case:
  two merges in quick succession). (Depends on T001; independent of
  T004/T005's step content, but touches the same file — sequence after
  T005 to avoid an edit conflict.)

**Checkpoint**: The pipeline can check out, verify, and build the app, and
is ready to talk to the VPS; the VPS-side script is fully capable of
performing a deploy when invoked by hand. Nothing yet actually triggers
the workflow or calls the script from CI — that's what the user stories
add.

---

## Phase 3: User Story 1 - A merge to main goes live without manual steps (Priority: P1) 🎯 MVP

**Goal**: Merging a change into `main` results in that change being live
on the production VPS with zero manual operator action.

**Independent Test**: Merge a small, visibly-verifiable change into `main`
and confirm it's live at the production address within a few minutes,
with no one touching the server.

### Implementation for User Story 1

- [ ] T007 [US1] Add `on: {push: {branches: [main]}}` to
  `.github/workflows/deploy.yml`. (Depends on T006.)
- [ ] T008 [US1] Add an `scp` step to `.github/workflows/deploy.yml`,
  after the SSH setup step, transferring the built
  `backend/patchplanner` binary and `backend/migrations/` to
  `/opt/patchplanner/incoming/` on the VPS, using
  `secrets.DEPLOY_SSH_HOST`/`DEPLOY_SSH_USER`. (Depends on T007.)
- [ ] T009 [US1] Add an `ssh` step to `.github/workflows/deploy.yml`,
  immediately after T008's transfer step, invoking
  `sudo -n /opt/patchplanner/deploy.sh /opt/patchplanner/incoming` on the
  VPS exactly per the invocation contract in
  `contracts/remote-deploy-script.md`, and failing the job (non-zero exit
  propagated) if the remote script exits non-zero. (Depends on T008 and
  T003.)
- [ ] T010 [P] [US1] Add a line to the README.md "Deployment" section
  pointing at `specs/019-cicd-vps-deploy/quickstart.md` for automatic
  deploys, alongside the existing Slice 18 pointer for the initial manual
  setup.
- [ ] T011 [US1] **Manual verification** (requires a real GitHub repo with
  secrets configured and a real VPS reachable over SSH — cannot be
  automated in this sandbox, same category as Slice 18's T013/T017):
  follow `specs/019-cicd-vps-deploy/quickstart.md` end-to-end against the
  real production VPS, then merge a trivial, visible change into `main`
  and confirm it deploys automatically and is live within a few minutes.
  (Depends on T009, T010, and the VPS-side one-time setup in
  quickstart.md steps 1-7.)

**Checkpoint**: User Story 1 is fully functional — this alone is the MVP:
automatic deploy on merge to main.

---

## Phase 4: User Story 2 - A broken change never reaches production (Priority: P2)

**Goal**: A change that fails the build or test steps is guaranteed never
to reach the VPS; a VPS-side deploy that fails its own health check
self-heals back to the previous good version; every failure is visible on
GitHub without needing server access.

**Independent Test**: Merge a change with a deliberately failing test and
confirm the pipeline stops before the deploy step, the live server is
untouched, and the failure is visible on the GitHub run. Separately,
trigger a VPS-side health-check failure and confirm the script restores
the previous binary automatically.

### Implementation for User Story 2

- [ ] T012 [US2] Review `.github/workflows/deploy.yml` end-to-end and
  confirm no step from T004 (build/test) or T005/T008/T009 (deploy) uses
  `continue-on-error: true` or `if: always()` — a failing check step must
  hard-stop the job before any deploy step runs, satisfying FR-002 with
  GitHub Actions' default step-failure behavior alone. Fix the file if any
  such flag is present. (Depends on T009.)
- [ ] T013 [US2] Review every step added in T005/T008/T009 of
  `.github/workflows/deploy.yml` and confirm no secret value is ever
  echoed, printed via a verbose/`-v` SSH flag, or interpolated into a
  logged shell command — satisfies FR-008's "never appears in plain text
  in pipeline logs." Fix the file if any step is at risk of leaking a
  secret into its log output. (Depends on T009.)
- [ ] T014 [US2] **Manual verification** (requires a real GitHub repo run
  — cannot be automated in this sandbox): push a commit with a
  deliberately failing test to a branch, open a PR/merge it into `main`,
  and confirm on the Actions tab that the run fails at the test step, the
  deploy steps never execute, and the live VPS is unmodified. (Depends on
  T012, T013.)
- [ ] T015 [US2] **Manual verification** (requires real VPS access —
  cannot be automated in this sandbox): on the VPS, deliberately make the
  post-restart health check fail once (e.g. temporarily point
  `deploy/remote-deploy.sh`'s health-check URL at the wrong port for one
  test run), invoke the script by hand with a valid staging directory, and
  confirm it restores `patchplanner.prev`, restarts the service again, and
  exits non-zero. (Depends on T003.)

**Checkpoint**: User Stories 1 AND 2 both work — automatic deploy on
success, guaranteed no-op on failure, with visible failure reporting and
VPS-side self-healing.

---

## Phase 5: User Story 3 - Redeploying on demand without a new change (Priority: P3)

**Goal**: An operator can trigger the exact same build/test/deploy pipeline
from GitHub without merging a new change and without touching the server
directly.

**Independent Test**: Without merging anything new, trigger the workflow
manually from GitHub's Actions tab and confirm the current `main` is
rebuilt and redeployed through the identical checks.

### Implementation for User Story 3

- [ ] T016 [US3] Add `workflow_dispatch:` (no inputs) alongside the
  existing `push` trigger in `.github/workflows/deploy.yml`'s `on:` block.
  Because both triggers feed the same single job built in Phases 2-4, no
  further workflow changes are needed for a manual run to go through
  identical build/test/deploy checks (FR-006). (Depends on T009.)
- [ ] T017 [P] [US3] Reconcile `specs/019-cicd-vps-deploy/quickstart.md`
  step 8 ("Try it") wording against the actual workflow's `name:` field
  (from T001) so the documented "Actions tab → Run workflow" instructions
  match exactly what an operator will see.
- [ ] T018 [US3] **Manual verification** (requires a real GitHub repo —
  cannot be automated in this sandbox): without merging any new change,
  trigger the `Deploy` workflow via **Run workflow** in the Actions tab
  and confirm it runs the same steps as an automatic run and successfully
  redeploys the current `main`. (Depends on T016, T017.)

**Checkpoint**: All three user stories are independently functional —
automatic deploy, safe failure handling, and on-demand manual redeploy.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Consistency checks across the whole feature; no new behavior.

- [ ] T019 [P] Reconcile `specs/019-cicd-vps-deploy/quickstart.md` in full
  against the final `.github/workflows/deploy.yml` and
  `deploy/remote-deploy.sh` — secret names, the exact sudoers line, the
  script's installed path, and the health-check port must all match what
  was actually built, not just what research.md/plan.md originally
  proposed.
- [ ] T020 [P] Validate `.github/workflows/deploy.yml`'s YAML/step syntax
  (via `actionlint` if available locally, otherwise a careful manual
  read-through) before relying on a real push to `main` to be the first
  thing that surfaces a syntax error.
- [ ] T021 [P] Add a "Slice 19 — CI/CD deploy to VPS" section to
  `ROADMAP.md`, matching the existing heading/bullet style used by Slices
  14-18, noting it depends on Slice 18, and update the dependency graph at
  the bottom of the file to append `Slice 18 (deployment) ──→ Slice 19
  (CI/CD deploy)`. Leave it unchecked (prospective) until this feature is
  actually merged.
- [ ] T022 Run `specs/019-cicd-vps-deploy/quickstart.md` as a full runbook
  against the real GitHub repo and VPS one more time, start to finish, to
  confirm every command in it is copy-pasteable and correct as written —
  this is the feature's own "did we document it right" check (SC-005).
  (Depends on T011, T014, T015, T018 already having exercised the
  individual pieces; this is the end-to-end read-through. Requires real
  infrastructure, same as the other manual-verification tasks.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 and T002 can start
  immediately and run in parallel (different files).
- **Foundational (Phase 2)**: T003 depends on T002; T004 depends on T001;
  T005 depends on T004; T006 depends on T005. Phase 2 as a whole BLOCKS
  all user stories.
- **User Stories (Phase 3-5)**: All depend on Foundational (Phase 2)
  completion. Because all three stories edit the same `deploy.yml`, they
  are sequenced P1 → P2 → P3 in practice (T009 before T012 before T016)
  even though P2's and P3's *behavior* doesn't depend on P1's — see each
  story's Independent Test for what's actually being verified.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T001 and T002 (Phase 1).
- T010 alongside T007-T009 (different file, README.md vs. deploy.yml).
- T017 alongside T016 (different file, quickstart.md vs. deploy.yml).
- T019, T020, T021 in Phase 6 (three different files).
- The four manual-verification tasks (T011, T014, T015, T018) each depend
  on their own story's implementation tasks but are otherwise independent
  of each other and could be run in either order once their prerequisites
  are met.

---

## Parallel Example: Phase 1

```bash
Task: "Create .github/workflows/deploy.yml skeleton"
Task: "Create deploy/remote-deploy.sh skeleton with arg validation"
```

## Parallel Example: Phase 6

```bash
Task: "Reconcile quickstart.md against final deploy.yml/remote-deploy.sh"
Task: "Validate deploy.yml YAML/step syntax with actionlint"
Task: "Add Slice 19 section to ROADMAP.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002).
2. Complete Phase 2: Foundational (T003-T006) — CRITICAL, blocks everything.
3. Complete Phase 3: User Story 1 (T007-T011).
4. **STOP and VALIDATE**: run T011's manual end-to-end check.
5. This alone is a working, demoable automatic-deploy pipeline.

### Incremental Delivery

1. Setup + Foundational → pipeline can verify/build/talk to the VPS.
2. Add User Story 1 → automatic deploy on merge works (MVP!).
3. Add User Story 2 → failure paths are proven safe.
4. Add User Story 3 → on-demand manual redeploy works.
5. Polish → docs and the shared files are internally consistent.

---

## Notes

- No test tasks (`tests/`) exist for this feature — it has no application
  code; correctness is verified by GitHub Actions' own pass/fail signal
  (Phase 4) and by manual runbook checks against real infrastructure
  (T011, T014, T015, T018, T022), the same pattern Slice 18 used for its
  two infrastructure-dependent checks (T013, T017 in
  `specs/018-deployment/tasks.md`).
- [P] tasks touch different files; everything else touching
  `.github/workflows/deploy.yml` or `deploy/remote-deploy.sh` is
  sequential by necessity, not by story boundary.
- Commit after each task or logical group, per this repository's existing
  convention of committing at phase/story boundaries.
