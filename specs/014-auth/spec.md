# Feature Specification: Authentication

**Feature Branch**: `014-auth`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Slice 14 — Authentication"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Approved user signs in with Google (Priority: P1)

A person the system owner has already approved visits the app, signs in with
their existing Google account, and lands on their dashboard — no separate
username/password to create or remember.

**Why this priority**: This is the entire feature. Without it, nobody can
reach the app at all; it's the single gate every other user story and every
future feature (event sharing, deployment) sits behind.

**Independent Test**: Can be fully tested by having an approved person open
the app, click "Sign in with Google," complete Google's sign-in screen, and
confirm they land signed-in with their name/picture visible somewhere in the
app.

**Acceptance Scenarios**:

1. **Given** a person whose Google account email is on the approved list and
   who has never signed in before, **When** they sign in with Google for the
   first time, **Then** an account is created for them automatically and
   they land signed in — no separate registration step.
2. **Given** a person who has signed in before, **When** they return to the
   app and sign in again, **Then** they land signed in and are recognized as
   the same person as last time (their name/picture/history are consistent).
3. **Given** a signed-in person, **When** they close the browser and return
   within a normal working period (days, not months), **Then** they are
   still signed in and are not asked to sign in again.

---

### User Story 2 - Unapproved account is denied access (Priority: P2)

Someone who is not on the system owner's approved list tries to sign in with
their own, valid Google account. The app must clearly refuse them and must
not create any account or leave any trace that could later be mistaken for
approved access.

**Why this priority**: This is the security boundary the whole feature
exists to enforce. Getting sign-in to work (US1) without this is worse than
having neither, since it would mean the app is really open to anyone with a
Google account.

**Independent Test**: Can be fully tested by attempting to sign in with a
Google account that is deliberately not on the approved list, and confirming
the person is shown a clear "not authorized" message, is not signed in, and
no account record was created for them.

**Acceptance Scenarios**:

1. **Given** a Google account not on the approved list, **When** that person
   attempts to sign in, **Then** they see a clear message explaining they
   are not authorized to use the app, and they are not signed in.
2. **Given** the same rejected attempt, **When** the system owner later
   checks the list of known users, **Then** no account exists for the
   rejected person.

---

### User Story 3 - Signed-in user signs out (Priority: P3)

A signed-in person deliberately ends their session (e.g., on a shared or
borrowed computer) and is returned to a signed-out state where none of the
app's event data is visible or reachable until they sign in again.

**Why this priority**: Important for trust and shared/borrowed-device
hygiene, but the app is still usable and secure without it in the very
first cut, since sessions already expire on their own — this is a
convenience/safety layer on top of US1.

**Independent Test**: Can be fully tested by signing in, triggering "sign
out," and confirming the app immediately falls back to the signed-out
(sign-in) screen with no event data accessible.

**Acceptance Scenarios**:

1. **Given** a signed-in person, **When** they choose to sign out, **Then**
   they are returned to the sign-in screen and can no longer view any event
   data without signing in again.
2. **Given** a person who has signed out, **When** they sign back in with
   the same Google account, **Then** they land back in the app as themselves
   (same account, same history).

---

### Edge Cases

- What happens when a person's session expires while they're actively using
  the app? They are returned to the sign-in screen the next time the app
  needs to talk to the server; nothing they were viewing is corrupted, they
  simply need to sign in again to continue.
- What happens if the system owner removes someone from the approved list
  after that person already has an account and an active session? Their
  next new sign-in attempt is rejected; an already-active session is not
  forcibly ended the instant the list changes (see Assumptions).
- What happens if a person's name or profile picture changes on the Google
  side between visits? The app picks up the updated name/picture the next
  time they sign in; they remain the same underlying account.
- What happens if someone tries to reach app pages directly without ever
  having signed in? They are sent to the sign-in screen instead of seeing
  any app content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let a person sign in using their existing Google
  account — no separate username/password to create.
- **FR-002**: System MUST restrict access to a list of approved Google
  accounts maintained by the system owner; only approved accounts can sign
  in.
- **FR-003**: System MUST reject sign-in attempts from any Google account
  not on the approved list, showing a clear "not authorized" message, and
  MUST NOT create an account record for a rejected attempt.
- **FR-004**: System MUST automatically create an account for an approved
  person the first time they sign in — no separate registration step.
- **FR-005**: System MUST recognize a returning, previously-approved person
  as the same account on every subsequent sign-in.
- **FR-006**: System MUST keep a person signed in across normal, repeated
  use (reopening the app over subsequent days) without requiring them to
  sign in again every time.
- **FR-007**: System MUST let a signed-in person deliberately sign out,
  after which no app content is visible or reachable until they sign in
  again.
- **FR-008**: System MUST prevent any app content from being viewed by
  someone who has not signed in.
- **FR-009**: System MUST record enough information about each signed-in
  person (name, email, profile picture) to identify them elsewhere in the
  app later (e.g., in a future list of people to share an event with).
- **FR-010**: The system owner MUST be able to add or remove approved
  accounts by updating a configuration list, without changing any
  application logic.

### Key Entities

- **User Account**: A person who has signed in at least once. Holds their
  name, email address, profile picture, when their account was first
  created, and when they last signed in. Created automatically on a
  person's first successful sign-in.
- **Approved Sign-in List**: The set of email addresses the system owner
  has decided may sign in at all. Checked before an account is ever created
  for someone; maintained by the system owner outside of normal app usage.
- **Session**: An active signed-in period for one person. Has a start time
  and an expiration; ending it (by sign-out or expiry) removes access to
  app content until the person signs in again.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An approved person can go from clicking "Sign in" to viewing
  their dashboard in under 15 seconds under normal conditions.
- **SC-002**: 100% of sign-in attempts from accounts not on the approved
  list are rejected, and none of them result in an account being created.
- **SC-003**: A signed-in person can close and reopen the app over several
  days of normal use without ever being asked to sign in again mid-week.
- **SC-004**: Immediately after signing out, 100% of attempts to view event
  data are blocked until the person signs in again.
- **SC-005**: The system owner can grant a new person access by updating a
  single configuration list, with no application code changes required.

## Assumptions

- Google is the only supported sign-in method for v1; there is no
  email/password option and no other identity provider.
- The approved list is small and is maintained directly by the system
  owner; there is no self-service "request access" flow in v1.
- Revoking someone's access takes effect on their next sign-in attempt; an
  already-active session for that person is not forcibly ended the instant
  the approved list changes.
- Account recovery (forgotten password, compromised account, etc.) is
  handled entirely by Google, since the app itself never stores a password.
- People are expected to already have a Google account; creating one is out
  of scope for this feature.
- This feature covers proving *who* someone is only. Deciding *what* a
  signed-in person is allowed to do within the app (owning or contributing
  to specific events, view-only access, invitations) is a separate, later
  feature and is out of scope here.
