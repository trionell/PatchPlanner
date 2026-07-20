# Research: CI/CD deploy to VPS via GitHub Actions

## Trigger strategy

**Decision**: A single GitHub Actions workflow triggered by `push` to
`main` and by `workflow_dispatch` (no inputs). No separate long-lived
`deploy` branch, no tag-based releases, no PR-time deploy previews.

**Rationale**: The spec's Assumptions section already settled this
(continuous deployment on merge to `main`, matching how the project already
treats `main` as its deployable trunk since Slice 18). A single trigger
pair keeps the workflow simple and gives operators both the automatic path
(FR-001) and the on-demand path (FR-005) without a second workflow file to
keep in sync.

**Alternatives considered**:
- *Separate `deploy` branch operators merge into*: rejected — adds a
  second merge step to every release with no benefit for a single
  production environment; only pays off with a staging/prod split, which
  is explicitly out of scope.
- *Tag-based releases (`v1.2.3`)*: rejected — implies a curated release
  cadence distinct from `main`, which doesn't match this project's
  "docs and small slices land on main and are live" style already
  established by earlier ROADMAP slices.
- *PR-time CI only, deploy purely manual*: rejected — fails FR-001
  (automatic deploy on merge) directly.

## Job structure and gating

**Decision**: One job (`build-test-deploy`) with sequential steps: checkout
→ backend checks (`go vet ./...`, `go test ./...`) → frontend checks
(`tsc -b`, `eslint`, `vitest run`) → `make build` → SSH deploy steps. No
`needs:`-linked second job, no artifact upload/download between jobs.

**Rationale**: GitHub Actions stops a job at the first failing step by
default, so a single sequential job already satisfies FR-002 (no deploy on
build/test failure) with zero extra wiring. A two-job split (verify job +
deploy job with `needs: verify`) would require uploading the built binary
as an artifact and downloading it in the second job purely to reproduce
behavior a single job gets for free — unjustified complexity for a project
whose constitution (Principle V) says not to add structure without a
concrete need.

**Alternatives considered**:
- *Two jobs (`verify` + `deploy`, artifact-passed)*: rejected for the
  reason above; would be worth revisiting only if a future need arises for
  parallel test matrices or multiple deploy targets.
- *Reusable workflow / composite action*: rejected — only one deploy target
  exists; premature abstraction for a single call site.

## Build reuse

**Decision**: The workflow calls `make build` from the repository root —
the exact target Slice 18 created — producing `backend/patchplanner` and
using the existing `backend/migrations/` directory as-is. No parallel
build logic is written into the workflow YAML.

**Rationale**: Directly required by FR-010 and the user's explicit
instruction to reuse Slice 18's `make build`. Keeps exactly one build
recipe in the repository (the Makefile), so CI and a developer's laptop
never drift apart.

## Deploy transport and VPS-side execution

**Decision**: SSH-based push deploy. The workflow:
1. `scp`s the new `backend/patchplanner` binary and `backend/migrations/`
   to a staging path on the VPS (`/opt/patchplanner/incoming/`).
2. `ssh`es in and runs a fixed script already installed on the VPS,
   `/opt/patchplanner/deploy.sh` (the repo's tracked
   `deploy/remote-deploy.sh`, copied there once during setup), passing the
   staging path as its argument.
3. That script — running *on the VPS, as the deploy user* — does the
   actual swap: back up the current binary, atomically move the new one
   into place (`mv` within the same filesystem, so there is never a
   half-written binary at the live path), replace `migrations/`, restart
   the `patchplanner` systemd service, then poll `http://127.0.0.1:<port>/health`
   a few times with a short backoff. If the health check never succeeds,
   the script restores the backed-up binary and restarts again, then exits
   non-zero so the GitHub Actions run itself shows as failed.

**Rationale**: Keeps the actual swap/restart/health-check/self-heal logic
in one shell script that is version-controlled, testable by hand on the
VPS independent of CI, and reused identically whether triggered by an
automatic or a manual run (FR-006). Running it as a fixed script the
operator installed once (rather than shipping arbitrary inline shell from
the workflow YAML over SSH) keeps the trusted surface on the VPS small and
auditable — the CI pipeline can only invoke exactly this one operation, not
run arbitrary commands as the deploy user.

Restarting a single systemd process is not literally zero-downtime (there
is a sub-second gap while the process restarts) — this is accepted as
consistent with Slice 18's existing single-instance deployment model (one
VPS, no load balancer, no blue-green). FR-003's "no window where the
application is completely unreachable" and the acceptance scenario's
"previous version keeps serving requests until the new version is
confirmed running" are satisfied at the level this project operates at: no
*extended or indefinite* outage, and never left serving a broken build —
not a hard real-time zero-millisecond guarantee, which would require
multiple running instances and a load balancer, explicitly out of scope
(Slice 18 and this feature's Assumptions both describe a single VPS,
single instance).

**Alternatives considered**:
- *Third-party GitHub Actions for SCP/SSH (e.g. `appleboy/scp-action`,
  `appleboy/ssh-action`)*: rejected — pulls in third-party supply-chain
  trust for something the OpenSSH client (already present on GitHub's
  `ubuntu-latest` runners) does natively in a few shell lines. Matches
  Principle V's "minimal deps" preference and avoids the security review
  burden of trusting a third-party action with deploy credentials.
- *Pull-based deploy (a VPS-side agent/cron polling GitHub for new
  releases)*: rejected — meaningfully more moving parts (an agent process,
  its own auth to GitHub) for a single small VPS; push-based SSH is the
  standard, simplest pattern at this scale.
- *Container image + registry + `docker pull` on the VPS*: rejected — the
  project has no Docker anywhere today (Slice 18 deliberately chose a
  single native binary over containers); introducing a registry and image
  build step here would be a large, unrelated infrastructure addition.
- *Blue-green / multiple instances behind a load balancer for true
  zero-downtime*: rejected — out of scope per this feature's and Slice
  18's single-instance assumption; would also require re-provisioning the
  VPS setup, not just automating deploys onto the existing one.

## SSH credentials and host verification

**Decision**: A dedicated SSH key pair generated solely for deploys (not a
personal key), with the private key stored as the `DEPLOY_SSH_KEY`
repository secret. The VPS's host key is captured **once**, manually, by
the operator (`ssh-keyscan` run from their own machine during setup, not
from the CI runner) and stored as the `DEPLOY_KNOWN_HOSTS` secret, which
the workflow writes verbatim into `~/.ssh/known_hosts` before connecting.

**Rationale**: A deploy-only key scopes the blast radius of a leaked
secret to exactly the deploy account's narrow permissions (FR-008,
least-privilege). Pinning the host key from a secret captured by the
operator — rather than letting the CI runner's own `ssh-keyscan` trust
whatever key the server presents on first connection — avoids a
trust-on-first-use gap where a MITM'd first CI run would silently pin an
attacker's key.

**Alternatives considered**:
- *`ssh-keyscan` run live inside the CI job*: rejected as the default —
  simpler, but trust-on-first-use from an untrusted network path (the
  runner's egress) is a weaker guarantee than a value the operator
  captured and pinned themselves; documented as an acceptable fallback
  in the quickstart for operators who judge the risk acceptable for their
  setup.
- *`StrictHostKeyChecking=no`*: rejected outright — disables host
  verification entirely, defeating the point of SSH transport security.

## VPS-side deploy account and privilege

**Decision**: A dedicated, non-interactive `deploy` system user on the VPS
that owns `/opt/patchplanner` (so it can write the new binary and
migrations without elevated privilege), plus one narrowly scoped
passwordless `sudo` rule limited to exactly
`systemctl restart patchplanner` and `systemctl status patchplanner` —
nothing else.

**Rationale**: Slice 18's systemd unit is a system-level unit under
`/etc/systemd/system`, which only root (or `sudo`) can restart — some
privilege escalation is unavoidable for the "restart the service" step of
FR-004. Scoping it to only those two exact commands (rather than granting
the deploy user broad or full sudo) keeps a leaked deploy key from being
able to do anything beyond deploying this one service, satisfying
FR-008's spirit even though FR-008 itself is about secret storage, not
account scope.

**Alternatives considered**:
- *Deploy over SSH as `root`*: rejected — far broader blast radius than
  necessary for "copy a file and restart one service."
- *Rootless/user-level systemd unit (`systemctl --user`)*: rejected as a
  change here — would restructure Slice 18's already-shipped, already-
  documented system-level unit for a benefit (no sudo at all) that a
  two-command sudo allowlist already captures at far lower migration cost.

## Concurrency safety

**Decision**: `concurrency: group: production-deploy` at the workflow
level, without `cancel-in-progress` (defaults to `false`, i.e. queue
rather than cancel).

**Rationale**: Directly addresses the spec's edge case of two merges in
quick succession — GitHub Actions serializes runs in the same concurrency
group, so a second run waits for the first to finish rather than racing it
to the server. Explicitly *not* cancelling an in-progress run avoids ever
interrupting a deploy mid-swap, which is the actual danger scenario (an
interrupted `mv`/restart), not merely "two deploys happen."

## Health check reuse

**Decision**: The VPS-side script polls the existing `GET /health`
endpoint (already present since Slice 18) over `127.0.0.1`, not the public
domain — checking the process directly rather than through the reverse
proxy or DNS, both of which are irrelevant to "did the new binary start
successfully."

**Rationale**: No new endpoint needed; reuses what already exists and
avoids a false failure signal from an unrelated DNS/proxy hiccup.

## Explicitly out of scope (noted, not deferred as unresolved)

- **PR-time CI checks** (running tests on every pull request, independent
  of deploy): a natural complement that could reuse the same test steps in
  a separate `pull_request`-triggered workflow, but not requested by the
  spec (which scopes triggers to merges-to-main and manual runs) and not
  added here, to avoid scope creep beyond what was asked.
- **Automated one-click rollback to an arbitrary prior version**: per the
  spec's Assumptions, rollback stays manual (re-running the pipeline
  against a prior good commit). The VPS script's own automatic restore is
  narrower — it only fires immediately after a failed post-restart health
  check within the same deploy, not as a general rollback tool.
