# Feature Specification: Event Ownership & Sharing

**Feature Branch**: `015-event-sharing`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Slice 15 — Event ownership & sharing"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owner shares an event with a collaborator (Priority: P1)

An event's owner brings in another already-known person to help plan it,
choosing whether that person can fully edit the event or only view it.

**Why this priority**: This is the entire point of the feature — without
it, every event stays visible only to the person who created it, which is
the exact limitation this slice exists to remove.

**Independent Test**: Can be fully tested by having an owner invite one
other previously-signed-in person to their event as a contributor, and
confirming that person now sees the event on their own dashboard and can
edit it, while a third, uninvited person still cannot see it at all.

**Acceptance Scenarios**:

1. **Given** an event owned by person A, and person B who has signed in
   before but was never invited, **When** A invites B as a contributor,
   **Then** the event appears on B's dashboard and B can view and edit it.
2. **Given** the same event, **When** A invites a third person, C, as a
   viewer instead, **Then** C sees the event on their dashboard but can
   only view (and print/export) it, not change anything.
3. **Given** a person who has never been invited to an event and does not
   own it, **When** they look at their own dashboard, **Then** that event
   never appears for them.
4. **Given** an owner trying to invite someone, **When** that person has
   never signed into the app before, **Then** the owner is told clearly
   that the person must sign in at least once before they can be invited.

---

### User Story 2 - Viewer gets safe, read-only access (Priority: P2)

Someone given viewer access (e.g., a client or stakeholder who should be
able to check on planning progress) can see everything about the event,
including printing or exporting it, but cannot accidentally change
anything.

**Why this priority**: Read-only sharing is a distinct, common need
(showing progress to someone who shouldn't be able to break the plan) and
is meaningfully separate from full collaboration (User Story 1), but the
app is still useful without it if every invitee were a contributor.

**Independent Test**: Can be fully tested by signing in as a person with
viewer access to an event and confirming every add/edit/delete action is
unavailable or blocked, while viewing, printing, and exporting all still
work normally.

**Acceptance Scenarios**:

1. **Given** a person with viewer access to an event, **When** they open
   any part of that event, **Then** they can see all of its content
   exactly as an owner or contributor would.
2. **Given** the same person, **When** they attempt to add, edit, or
   delete anything on the event, **Then** the action is blocked.
3. **Given** the same person, **When** they print or export the event
   (e.g., a rental order or patch sheet), **Then** the action succeeds
   exactly as it would for the owner.

---

### User Story 3 - Contributor grows the team (Priority: P3)

A contributor (not just the original owner) brings in additional people,
so collaboration doesn't have to funnel through one person.

**Why this priority**: A genuine convenience once sharing already works
(User Story 1), but the feature is still coherent if only the owner could
invite people — this removes a bottleneck rather than adding new
capability.

**Independent Test**: Can be fully tested by having a contributor (not the
owner) invite a new person to the event as either a contributor or a
viewer, and confirming that new person gains the expected access.

**Acceptance Scenarios**:

1. **Given** a contributor on an event, **When** they invite another
   already-known person as a contributor, **Then** that person gains full
   access exactly as if the owner had invited them.
2. **Given** a contributor on an event, **When** they invite another
   person as a viewer, **Then** that person gains read-only access.

---

### Edge Cases

- What happens if the owner tries to remove their own access to their own
  event? Not permitted — an event's owner cannot be changed or removed
  through this feature; they remain the accountable person permanently.
- What happens if a viewer tries to reach a blocked action directly (e.g.,
  a stale link to an edit screen)? The action is clearly denied, not
  silently ignored or allowed through.
- What happens when someone's access is changed or removed while they are
  actively looking at the event? Their very next action against that event
  is blocked/reflects the new role — access does not linger.
- What happens to events that existed before this feature launched (which
  had no owner at all)? They are not left inaccessible — see Assumptions
  for how ownership is assigned to them.
- What happens if two collaborators both change a third person's role at
  the same moment? The last change applied wins; no special conflict
  handling is expected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST associate every event with exactly one owner.
- **FR-002**: The owner MUST have full ability to view, edit, and delete
  their event and everything in it.
- **FR-003**: The owner MUST be able to invite any other person who has
  signed in before, choosing whether that person becomes a contributor or
  a viewer.
- **FR-004**: A contributor MUST have the same full view, edit, and delete
  access to the event as the owner, with the sole exception that a
  contributor cannot change who the event's owner is.
- **FR-005**: A contributor MUST also be able to invite further people as
  contributors or viewers, the same as the owner can.
- **FR-006**: A viewer MUST be able to view and print/export every part of
  the event, and MUST NOT be able to add, edit, or delete anything on it.
- **FR-007**: System MUST prevent inviting anyone who has never signed
  into the app — only people already known to the system can be chosen as
  an invitee.
- **FR-008**: System MUST show each signed-in person only the events they
  own or have been given access to; an event MUST be completely invisible
  to everyone else.
- **FR-009**: The owner or any contributor MUST be able to change an
  existing collaborator's role between contributor and viewer, or remove
  their access entirely.
- **FR-010**: A change to someone's role, or removal of their access,
  MUST take effect immediately — no further viewing or editing after that
  point.
- **FR-011**: System MUST NOT allow the owner's own access to be removed
  or reassigned through this feature.

### Key Entities

- **Event Owner**: The one person permanently accountable for an event;
  every event has exactly one. For events that existed before this
  feature, see Assumptions for how this is assigned.
- **Collaborator**: A person, other than the owner, who has been given
  access to a specific event, with a role of either contributor (full
  access, can also invite) or viewer (read/print-only, cannot invite).
- **Known User**: Anyone who has signed into the app at least once —
  the only people eligible to be invited as a collaborator on any event.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can grant another known person access to their
  event in under 30 seconds.
- **SC-002**: 100% of attempted add/edit/delete actions by a viewer are
  blocked, while 100% of that viewer's view/print/export actions succeed.
- **SC-003**: A person with no ownership or invited access to an event
  never sees that event appear anywhere in their own event list.
- **SC-004**: Revoking or downgrading someone's access blocks their very
  next attempted view or edit of that event.
- **SC-005**: Every event that existed before this feature launched
  remains fully owned and accessible afterward — none become orphaned or
  unreachable.

## Assumptions

- Only people who have signed into the app at least once can be invited
  to an event — there is no email-based invite for someone who has never
  used the app (no mail server; matches the existing sign-in requirement).
- Ownership does not transfer between people in this feature; the person
  who created the event (or who is assigned ownership per the next bullet)
  remains its owner permanently.
- Events created before this feature existed had no owner concept at all.
  The first person to sign in after this feature launches is automatically
  assigned as the owner of every such pre-existing event, so nothing is
  left inaccessible.
- Printing and exporting (e.g., the rental order) count as viewing, not
  editing, for the purposes of what a viewer may do.
- There is no limit on how many collaborators an event can have, and no
  approval step for an owner/contributor's invite — being invited grants
  access immediately.
- This feature governs access at the level of a whole event; splitting
  permissions further (e.g., audio-only vs. lighting-only access) is out
  of scope.
