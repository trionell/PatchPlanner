# Feature Specification: CI/CD deploy to VPS via GitHub Actions

**Feature Branch**: `019-cicd-vps-deploy`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "Add a CI/CD deploy of the application to a VPS
using github actions. Utilize the make build created in slice 18. Don't
forget instructions and, if necessary, scripts that needs to run on the VPS
as part of the CI/CD. What is the most common way-of-working using github
and deploys? Run it on change on main or use a specific deploy branch? Or
something else? Manual trigger of Github action?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A merge to main goes live without manual steps (Priority: P1)

Today, shipping a change to production means an operator manually building
the application, copying the binary to the server, and restarting the
service by hand (Slice 18's documented manual runbook). An operator needs
that whole sequence to happen automatically whenever a change is merged into
the project's main line of development, so that shipping a fix or a new
feature no longer depends on someone being at a keyboard with server access.

**Why this priority**: This is the core value of the feature — nothing else
matters until merging code reliably results in the live application being
updated. Every other story refines or safeguards this one flow.

**Independent Test**: Merge a small, verifiable change (e.g. a visible text
change) into the main line, then confirm — without any operator taking a
manual action — that the change is live at the production address within a
few minutes.

**Acceptance Scenarios**:

1. **Given** a change is merged into the project's main line, **When** the
   automated pipeline runs, **Then** the application is rebuilt, transferred
   to the server, and running as the new live version with no operator
   action taken.
2. **Given** the automated pipeline has just deployed a new version,
   **When** a visitor loads the production address, **Then** they see the
   behavior of the newly merged change.
3. **Given** the deploy step is running, **When** it is in progress,
   **Then** the previous version keeps serving requests until the new
   version is confirmed running, so there is no window where the
   application is completely unreachable.

---

### User Story 2 - A broken change never reaches production (Priority: P2)

Before any change reaches the live server, an operator needs confidence that
it has already passed the project's existing checks (build succeeds, tests
pass). A change that fails those checks must never be deployed, and the
person who merged it must be able to see clearly, from GitHub, that the
deploy did not happen and why.

**Why this priority**: Automatic deployment (User Story 1) is only safe to
rely on if broken code is guaranteed not to reach the live server
unattended. This is what makes User Story 1 trustworthy enough to leave
unattended.

**Independent Test**: Merge a change that fails an existing build or test
step and confirm the pipeline stops before the deploy step runs, the live
server is left completely unchanged, and the failure is visible on GitHub
against that change.

**Acceptance Scenarios**:

1. **Given** a merged change whose build fails, **When** the pipeline runs,
   **Then** the deploy step never executes and the previously running
   version keeps serving requests unmodified.
2. **Given** a merged change whose automated tests fail, **When** the
   pipeline runs, **Then** the deploy step never executes.
3. **Given** a pipeline run has failed before deploying, **When** an
   operator looks at GitHub, **Then** they can see which step failed and
   why, without needing server access to diagnose it.
4. **Given** a deploy step itself fails partway (e.g. the server is
   unreachable), **When** this happens, **Then** the previous version is
   left running and reachable, not in a half-updated or stopped state.

---

### User Story 3 - Redeploying on demand without a new change (Priority: P3)

Sometimes an operator needs the current main-line version deployed again
without merging any new change — for example, after fixing a server-side
configuration problem, rotating a credential, or recovering from a failed
deploy. An operator needs a documented, self-service way to trigger the
deploy pipeline on demand from GitHub, without merging an empty change or
touching the server directly.

**Why this priority**: This is an operational convenience and recovery tool
layered on top of the automatic pipeline (User Stories 1 and 2) — valuable
for handling the exceptions, but the feature already delivers its core value
without it.

**Independent Test**: Without merging any new change, trigger the pipeline
manually from GitHub and confirm the currently merged version is rebuilt and
redeployed exactly as it would be by an automatic run.

**Acceptance Scenarios**:

1. **Given** no new change has been merged, **When** an operator manually
   triggers the pipeline from GitHub, **Then** the current main-line version
   is rebuilt and deployed the same way an automatic run would deploy it.
2. **Given** the manual trigger is used, **When** the run completes,
   **Then** it goes through the exact same build/test/deploy checks as an
   automatic run — there is no reduced-safety "fast path."

---

### Edge Cases

- A change is merged but the build or test step fails: covered by User
  Story 2 — deploy never runs, previous version stays live.
- The pipeline can reach GitHub but cannot reach the VPS (server down,
  network issue, credential expired): the run fails visibly on GitHub, the
  previous version keeps serving requests, and no partial/corrupt binary is
  left in place on the server.
- Two changes are merged in quick succession before the first pipeline run
  finishes: the pipeline for the newer change does not have to race the
  older one to the server in a way that could leave an older version live
  after a newer one already deployed.
- Credentials the pipeline needs to reach the server (e.g. SSH access) are
  stored outside the repository's source code and are never printed in
  pipeline logs.
- The service the application runs as (from Slice 18) must already be
  restarted for a new binary to take effect; the pipeline is responsible for
  making that restart happen as its final step, not just for placing a new
  binary on disk.
- An operator changes the pipeline itself (e.g. adjusting which branch
  triggers deploys) — this is a documented, ordinary code change, not a
  special server-side procedure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST automatically build, test, and deploy the
  application to the production VPS whenever a change is merged into the
  project's main line of development.
- **FR-002**: The system MUST run the project's existing build and test
  checks before any deploy step, and MUST NOT deploy if any of those checks
  fail.
- **FR-003**: The system MUST leave the previously deployed version running
  and reachable, unmodified, whenever a pipeline run fails at any stage
  before the new version is confirmed running — there is no
  partially-deployed state that leaves the application down or serving a
  broken build.
- **FR-004**: The system MUST restart the application's running service as
  part of a successful deploy, so the newly deployed version actually takes
  effect rather than a new binary merely sitting unused on disk.
- **FR-005**: Operators MUST be able to trigger a full pipeline run
  on-demand from GitHub without needing a new merged change and without
  needing direct server access.
- **FR-006**: A manually triggered run MUST go through the same build, test,
  and deploy checks as an automatically triggered run — no reduced or
  skipped verification.
- **FR-007**: Every pipeline run's outcome (success, and the specific step
  that failed if it did not succeed) MUST be visible to an operator directly
  on GitHub, without requiring server access to diagnose.
- **FR-008**: Any credential or secret the pipeline needs to reach the VPS
  MUST be stored outside the repository's tracked source code and MUST NOT
  appear in plain text in pipeline logs.
- **FR-009**: The system's documentation MUST clearly state every one-time
  setup step required — both on GitHub (e.g. registering credentials) and
  on the VPS (e.g. any script or account the pipeline depends on being
  present) — before the pipeline will work, so it is not discovered only
  after a failed run.
- **FR-010**: The deploy step MUST reuse the project's existing build
  procedure (the `make build` process established for production
  deployment) rather than introducing a separate or duplicate way of
  producing the deployable artifact.

### Key Entities

- **Pipeline run**: One execution of the automated build/test/deploy
  sequence, triggered either by a merge to main or by an operator's manual
  request; has an outcome (succeeded, or failed at a specific step) visible
  on GitHub.
- **Deploy credential**: The access the pipeline needs to reach the VPS
  (e.g. a key proving it's allowed to connect) — stored securely outside
  the repository's source, scoped only to what deploying requires.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A change merged into main is live at the production address
  within a few minutes, with zero manual steps taken by the operator.
- **SC-002**: 100% of merges whose build or tests fail result in zero
  changes to the live application — the previous version keeps running
  unmodified.
- **SC-003**: An operator can trigger a full redeploy of the current
  main-line version from GitHub in under a minute of hands-on effort (one
  action), without connecting to the server directly.
- **SC-004**: An operator can determine the success or failure of any given
  deploy, and the reason for any failure, entirely from GitHub — zero
  instances of needing to log into the server just to find out what
  happened.
- **SC-005**: A new team member can follow the documentation to set up the
  pipeline's one-time prerequisites (both GitHub-side and VPS-side) from
  scratch, without needing to ask anyone for undocumented steps.
- **SC-006**: Across normal operation, no pipeline failure ever leaves the
  production application unreachable or serving a broken build — the
  previous good version is always what's live until a new run fully
  succeeds.

## Assumptions

- **Trigger strategy**: automatic deploy on every merge to `main` (a
  "continuous deployment" model), supplemented by an on-demand manual
  trigger — no separate long-lived `deploy` branch or tag-based release
  process. This matches how the project already treats `main` as its
  deployable trunk (Slice 18 assumed direct, manual deploys from a built
  `main`) and is the most common pattern for a small, single-environment
  project with one production target — a separate deploy branch or release
  tags add process overhead that only pays off with multiple environments
  or a slower, gated release cadence, neither of which applies here.
- The VPS, its domain, TLS/reverse-proxy setup, and the systemd service
  supervising the running binary already exist, as provisioned by Slice 18
  — this feature automates *getting a new build onto that existing setup
  and restarting it*, it does not re-provision the server from scratch.
- The pipeline connects to the VPS using SSH key-based access scoped to a
  deploy-only account/action (not a shared personal login), consistent with
  standard practice for automated deploy credentials.
- Database migrations continue to be applied automatically by the
  application itself on startup (existing behavior) — the pipeline does not
  need a separate migration step; restarting the service after placing the
  new binary is sufficient.
- This is a single production environment (no staging/preview environment
  in scope) — multi-environment promotion pipelines are explicitly out of
  scope for this feature.
- Rollback is manual (re-running the pipeline for a previous known-good
  commit, or an operator's documented manual fallback) — an automated
  one-click rollback mechanism is out of scope for this feature.
