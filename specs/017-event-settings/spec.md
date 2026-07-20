# Feature Specification: Per-event settings from a personal template

**Feature Branch**: `017-event-settings`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "slice 17" (ROADMAP.md's "Slice 17 — Per-event settings from a personal template")

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An event's settings are its own (Priority: P1)

An event owner or contributor customizes one event's planning vocabulary
— adding a connector type, renaming a cable type, removing an unused mic
stand — and that change is visible and effective only within that one
event. No other event, and no other user's personal defaults, is ever
affected.

**Why this priority**: This is the core problem the feature exists to
solve: today every planning vocabulary is one single list shared by every
user and every event, so one person's edit silently changes what
everyone else sees on every event. Without per-event isolation, nothing
else in this feature has value.

**Independent Test**: Create two events (as different users, or by the
same user), customize one event's vocabulary (add/rename/delete a
value), and confirm the other event's vocabulary is byte-for-byte
unchanged, and that any planning row already using the changed
vocabulary elsewhere is unaffected.

**Acceptance Scenarios**:

1. **Given** two existing events, **When** an owner renames a cable-type
   label on Event A, **Then** Event B's vocabulary for that same
   category is unchanged.
2. **Given** an event with a vocabulary value currently used by a
   planning row (e.g., a connector type selected on a patch line),
   **When** someone tries to delete that value from the event's
   vocabulary, **Then** the deletion is blocked with a clear reason,
   exactly as today's global protection works — just scoped to the one
   event.
3. **Given** an event a viewer has access to, **When** the viewer opens
   the event's settings, **Then** they can see the current vocabulary
   but every control that would add, rename, or delete a value is
   hidden or disabled.

---

### User Story 2 - A personal template seeds new events (Priority: P2)

A user maintains their own personal template of preferred vocabulary
values — their usual connector types, cable lengths, mic stands, and so
on. Every new event they create starts pre-loaded with a one-time copy
of that template, so they never have to rebuild the same lists from
scratch for every show.

**Why this priority**: Without a personal starting point, User Story 1's
isolation would mean every new event starts empty, pushing repetitive
setup work onto every event instead of solving it once. This is the
convenience layer on top of isolation, not the isolation itself — hence
second priority.

**Independent Test**: As a user with a customized personal template,
create a new event and confirm its vocabulary matches the template at
the moment of creation. Then edit the personal template and confirm
neither that already-created event, nor any other event previously
created from the same template, changes.

**Acceptance Scenarios**:

1. **Given** a user signs in for the first time, **When** they open
   their personal defaults, **Then** they already have a full, editable
   set of vocabulary values with no setup required.
2. **Given** a user has customized their personal template, **When**
   they create a new event, **Then** the event's vocabulary exactly
   matches the template as it stood at that moment.
3. **Given** an event already created from a user's template, **When**
   the user later edits their personal template, **Then** the
   already-created event's vocabulary is unaffected.
4. **Given** a user's personal template, **When** the user tries to
   delete a value from it, **Then** the deletion always succeeds — a
   personal template is never itself referenced by planning data, so
   the in-use protection from User Story 1 does not apply here.

---

### User Story 3 - Existing events keep working (Priority: P3)

An event created before this feature existed continues to work exactly
as it did — same vocabulary, same labels, same values available on
every planning row — with no action required from anyone, and without
being tied to any user's personal template.

**Why this priority**: This is a one-time migration-safety guarantee
rather than ongoing user-facing value, so it's lowest priority — but it
is a hard requirement: nothing about existing shows may break or shift
silently when this feature ships.

**Independent Test**: Take an event that existed before this feature,
confirm its planning rows still show the same vocabulary labels they did
before, and confirm editing that event's vocabulary afterward behaves
exactly like User Story 1 (fully isolated, no link back to any user's
personal template or to any other pre-existing event).

**Acceptance Scenarios**:

1. **Given** an event that existed before this feature shipped, **When**
   the feature is deployed, **Then** the event's vocabulary values are
   identical, byte-for-byte, to what they were immediately before.
2. **Given** two events that both existed before this feature shipped,
   **When** one of them has its vocabulary edited afterward, **Then**
   the other pre-existing event's vocabulary is unaffected.

---

### Edge Cases

- A contributor (not the owner) edits an event's vocabulary: allowed,
  per existing event roles — but they are editing the event's own copy,
  never the owner's personal template.
- Two events are created from the same user's personal template at
  different times, with the template edited in between: each event
  reflects the template exactly as it stood at its own creation moment,
  never retroactively synced to a later template state.
- A user with no events yet opens their personal defaults: it is
  already populated (see User Story 2, Scenario 1), not empty.
- Per-catalog-item DMX fixture modes are explicitly out of scope here —
  they remain tied to inventory ownership (a prior feature), not to
  event- or personal-level settings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST give every event its own independent set
  of planning vocabulary values, separate from every other event's.
- **FR-002**: Editing an event's vocabulary (adding, renaming, or
  deleting a value) MUST take effect only for that event and MUST NOT
  change any other event's vocabulary.
- **FR-003**: The system MUST give every user their own personal
  template of vocabulary values, separate from every other user's, used
  only to seed new events.
- **FR-004**: A user's personal template MUST already be fully
  populated the first time they access it, with no manual setup step
  required.
- **FR-005**: When a user creates a new event, the system MUST
  initialize that event's vocabulary as a one-time copy of the
  creating user's personal template as it stands at that moment.
- **FR-006**: Editing a user's personal template MUST NOT retroactively
  change any event previously created from it.
- **FR-007**: Editing an event's vocabulary MUST NOT retroactively
  change the creating user's personal template, nor any other event.
- **FR-008**: The system MUST prevent deleting a vocabulary value from
  an event while any planning row in that same event still uses it, and
  MUST explain why the deletion was blocked.
- **FR-009**: The system MUST allow deleting any value from a personal
  template at any time, since a personal template is never itself
  referenced by planning data.
- **FR-010**: Every event that existed before this feature shipped MUST
  retain the exact vocabulary values it had immediately beforehand, with
  no action required from any user.
- **FR-011**: Only an event's owner and contributors MAY edit that
  event's vocabulary; viewers MAY see it but MUST NOT be able to add,
  rename, or delete values, and controls for doing so MUST be hidden or
  disabled for them rather than merely rejected on save.
- **FR-012**: A user's personal template MUST be editable only by that
  user; no other user may view or edit it.
- **FR-013**: Users MUST be able to add, rename, and delete values
  within both their personal template and any event's vocabulary they
  have edit access to, using the same familiar controls in both places.
- **FR-014**: Per-catalog-item DMX fixture modes are out of scope for
  this feature and continue to be managed as part of inventory
  ownership.

### Key Entities *(include if feature involves data)*

- **Personal Vocabulary Template**: One user's own editable set of
  default planning vocabulary values (connector types, cable types,
  signal types, mic stands, output types, power connectors, truss
  types, channel colors, and similar reference lists). Belongs to
  exactly one user, is never directly referenced by any planning row,
  and exists only to seed new events.
- **Event Vocabulary**: One event's own independent set of the same
  planning vocabulary values. Created as a one-time copy of the
  creating user's Personal Vocabulary Template at event-creation time;
  from that point on it has no link back to the template or to any
  other event.
- **Vocabulary Value**: A single labeled choice within one vocabulary
  (e.g., one connector type or one cable type). Belongs to exactly one
  scope — either one user's Personal Vocabulary Template or one specific
  event's Event Vocabulary — never both.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Customizing one event's vocabulary never changes what any
  other user or any other event sees — verified across 100% of edits in
  testing.
- **SC-002**: A newly created event is immediately usable for planning,
  with a complete vocabulary already in place, requiring zero manual
  vocabulary setup before first use.
- **SC-003**: Editing one event's vocabulary has zero measurable effect
  on any other event, including ones created from the same personal
  template.
- **SC-004**: Every event that existed before this feature shipped
  continues to display the exact same vocabulary labels after the
  transition, with zero reported data loss or unexpected changes.
- **SC-005**: A user can find and update their personal defaults, and
  see a newly created event reflect that update, without needing to
  touch any other event.

## Assumptions

- Auto-creation of a user's personal template on first sign-in follows
  the same pattern established for per-user inventories in the prior
  feature: idempotent claim-or-create, so calling it repeatedly is
  always safe.
- The pre-existing global vocabulary set (as it exists at the moment
  this feature ships) becomes the seed for the migration described in
  User Story 3, and is also the starting content the very first user to
  sign in afterward finds in their personal template — matching how the
  prior per-user-inventory feature handled its own equivalent legacy
  data.
- Event-level vocabulary editing follows the same owner/contributor/
  viewer permission model already established for events; no new role
  concept is introduced.
- "Personal defaults" and "event settings" are presented as two
  separate, clearly labeled surfaces so users always know which one
  they are editing and what effect it will have.
- This feature covers the planning vocabularies currently shared
  globally (connector types, cable types, signal types, mic stands,
  output types, power connectors, truss types, channel colors, and
  similar reference lists). Per-catalog-item DMX fixture modes are
  explicitly excluded, as noted in the Edge Cases and FR-014.
