# Feature Specification: Production deployment

**Feature Branch**: `018-deployment`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "Go ahead with slice 18" (ROADMAP.md's "Slice 18 — Production deployment")

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One address for the whole app (Priority: P1)

Today the tool only runs as two separate processes on one person's own
machine (a frontend dev server and a backend dev server). An operator
needs to be able to run the whole application — interface and data
operations together — as one thing, reachable at a single public web
address, so that other people can actually use it without anyone's
laptop needing to stay on.

**Why this priority**: Nothing else in this feature matters until the
application can run somewhere other than a developer's own machine.
Every other story (secure access, staying up, backups) only matters once
this exists.

**Independent Test**: Build and start the application on a server and
confirm the entire app — every page and every feature — loads and works
correctly from one address, with nothing else needing to run alongside
it.

**Acceptance Scenarios**:

1. **Given** a freshly built copy of the application, **When** it is
   started on a server, **Then** visiting that server's address loads
   the full working application — no second address or second process
   is needed for any part of it to work.
2. **Given** the running application, **When** a user navigates directly
   to a specific page (not just the home page) or refreshes the browser
   on it, **Then** that page loads correctly rather than showing an
   error.

---

### User Story 2 - Secure access and working sign-in (Priority: P2)

Once real people are using the tool over the public internet, their
connection and their sign-in session need to be genuinely secure —
encrypted in transit, with sign-in behaving correctly and not silently
breaking or warning the browser that something is unsafe.

**Why this priority**: The tool now handles sign-in sessions and
multi-user access to real event data. Exposing that over an unencrypted
connection, or with sign-in subtly misbehaving once behind a proxy,
would be a real security gap — this has to be right before real usage
begins, but it builds directly on User Story 1 existing first.

**Independent Test**: From an outside network, connect to the deployed
address over plain (unencrypted) HTTP and confirm the connection is
automatically upgraded to an encrypted one; sign in with Google and
confirm the session stays valid across multiple visits without browser
security warnings.

**Acceptance Scenarios**:

1. **Given** the deployed application, **When** a visitor requests it
   over an unencrypted connection, **Then** they are automatically
   redirected to the encrypted version — no page is ever served
   unencrypted.
2. **Given** a user signing in with Google on the production address,
   **When** they complete sign-in, **Then** they land back in the
   application, signed in, with no security warning from the browser
   about the session.
3. **Given** a signed-in user, **When** they close and reopen their
   browser and return within their normal session lifetime, **Then**
   they are still signed in.

---

### User Story 3 - The service stays up and the data is recoverable (Priority: P3)

An operator needs the application to keep running on its own — surviving
a crash or a server restart without anyone having to notice and
manually start it again — and needs a documented way to make backup
copies of the application's data on a regular basis.

**Why this priority**: This is operational resilience layered on top of
a working, secure deployment (User Stories 1 and 2) — important for
running unattended over time, but the deployment already delivers value
without it for an initial, closely-watched launch.

**Independent Test**: Stop the running application's process directly
(simulating a crash) and confirm it comes back on its own without manual
intervention; follow the documented backup steps to produce a backup
copy and confirm it contains a usable copy of the data.

**Acceptance Scenarios**:

1. **Given** the deployed application is running, **When** its process
   is unexpectedly stopped, **Then** it automatically restarts and
   resumes serving requests without anyone taking action.
2. **Given** the server hosting the application is restarted (e.g. after
   a reboot), **When** it comes back up, **Then** the application starts
   automatically without manual intervention.
3. **Given** the documented backup procedure, **When** an operator
   follows it, **Then** a backup copy of the application's data is
   produced that can be used to restore the application to that point
   in time.

---

### Edge Cases

- A visitor tries to reach the application over plain HTTP: never served
  unencrypted, always upgraded first (User Story 2).
- The application is restarted (deploy, crash, or host reboot): every
  already-signed-in user's session survives, since sessions are stored
  in the application's own persistent data, not in server memory.
- An operator deploys a new version: the previous version keeps serving
  requests until the new one is ready, so there is no gap where the
  application is completely unreachable during a routine update.
- Before the very first production sign-in works, the one-time external
  setup step (registering the production address with the sign-in
  provider) must already be done — documented explicitly as a
  prerequisite, not discovered by trial and error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST be reachable at a single public web
  address serving both the application's interface and its data
  operations — no separate addresses or ports for different parts of
  the app.
- **FR-002**: The system MUST serve every page correctly when reached by
  a direct link or a browser refresh, not only when reached by
  navigating from the home page.
- **FR-003**: All traffic to the production deployment MUST be
  encrypted; any request arriving unencrypted MUST be automatically
  upgraded to an encrypted connection rather than served as-is.
- **FR-004**: Signing in MUST work correctly at the production address,
  with the resulting session recognized as secure by the browser.
- **FR-005**: The application MUST continue running as a persistent
  background service and MUST automatically restart if it stops
  unexpectedly or the host machine restarts, without manual
  intervention.
- **FR-006**: Operators MUST have a documented, repeatable procedure for
  building and deploying a new version of the application.
- **FR-007**: Operators MUST be able to configure production-specific
  settings (allowed sign-in accounts, credentials, data storage
  location, session lifetime) without editing application code.
- **FR-008**: Operators MUST have a documented, repeatable procedure for
  producing a backup copy of the application's data.
- **FR-009**: The system's documentation MUST clearly state every
  one-time external setup step required before the production
  deployment will work correctly (e.g., registering the production
  address with the sign-in provider), so it is not discovered only after
  something fails.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor can load and use the entire application from one
  address, with zero separate addresses or manual steps required to
  reach any part of it.
- **SC-002**: 100% of connection attempts made over plain, unencrypted
  HTTP are automatically upgraded to encrypted connections.
- **SC-003**: A user can sign in at the production address and remain
  signed in across repeat visits with zero browser security warnings
  related to the session.
- **SC-004**: After an unexpected stop or a full host restart, the
  application is back up and serving requests within a few minutes with
  no manual action taken.
- **SC-005**: An operator unfamiliar with the deployment can follow the
  documentation to build, deploy, and verify a new version end-to-end
  without needing to ask anyone for undocumented steps.
- **SC-006**: A backup produced by following the documented procedure
  can be used to successfully restore the application's data.

## Assumptions

- A server (virtual private server or equivalent) to host the
  application, and a domain name to point at it, are assumed to already
  exist or be provisioned by the operator separately — acquiring either
  is out of scope for this feature.
- This is a single, small-scale deployment (one server, one instance) —
  handling large-scale traffic, multi-region hosting, or automatic
  scaling is explicitly out of scope.
- No automated build/deploy pipeline is in scope; a documented manual
  procedure (build, copy, restart) is sufficient for this feature, since
  a single small deployment does not yet justify that additional
  infrastructure.
- Encrypted-connection handling (obtaining and renewing the certificate
  that makes HTTPS work) is expected to be handled automatically as part
  of the deployment setup, not as a manual, recurring operator task.
- Backups are file-copy-based snapshots of the application's data,
  produced on a schedule the operator sets up themselves following the
  documentation — this feature does not need to build an automated
  backup scheduler or off-site backup storage integration.
- The existing sign-in system (Slice 14) and event-sharing permissions
  (Slice 15) are reused as-is; this feature does not change who can sign
  in or what they can do, only where and how securely the application
  runs.
