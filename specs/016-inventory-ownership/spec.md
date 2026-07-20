# Feature Specification: Inventory Ownership & Duplication

**Feature Branch**: `016-inventory-ownership`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Slice 16 — Inventory ownership & duplication"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Each user's inventory is their own (Priority: P1)

A user imports their own equipment price list, adds items, or adjusts
stock levels — and those changes only ever affect their own catalog, not
anyone else's. When creating an event, they choose which of their own
inventories it uses, and the same inventory can be reused across any
number of their events without rebuilding it each time.

**Why this priority**: This is the entire problem the feature exists to
fix — today every user shares one single catalog, so anyone's edit or
re-import silently affects everyone else. Nothing else in this feature
matters until this isolation exists.

**Independent Test**: Can be fully tested by having two unrelated users
each edit their own inventory (add an item, change a price, import a
price list) and confirming neither ever sees or is affected by the
other's changes, while each can freely create multiple events that all
use their own single inventory.

**Acceptance Scenarios**:

1. **Given** a brand-new user signing in for the first time, **When**
   they look at their inventory, **Then** they already have their own
   starter inventory ready to use — no separate setup step required.
2. **Given** two unrelated users, A and B, **When** A imports a price
   list or edits an item in their inventory, **Then** B's inventory is
   completely unaffected and B never sees A's items.
3. **Given** a user creating a new event, **When** they reach the point
   of choosing equipment sources, **Then** they select which of their own
   inventories that event will use.
4. **Given** a user with one inventory already bound to an event,
   **When** they create a second event, **Then** they can choose the same
   inventory again so both events share the same up-to-date catalog.

---

### User Story 2 - Duplicate an inventory to start a fresh, independent copy (Priority: P2)

An inventory owner duplicates one of their existing inventories, getting
a brand-new, fully independent copy they can freely diverge from the
original — without re-importing or rebuilding it from scratch.

**Why this priority**: A real productivity win once isolation exists
(User Story 1), letting an owner branch off a variant catalog (e.g. a
different venue's price list) cheaply — but the app is fully usable
without it if an owner is willing to re-import instead.

**Independent Test**: Can be fully tested by duplicating an inventory,
then editing an item in the copy and confirming the original inventory
(and any event still using it) is completely unaffected, and vice versa.

**Acceptance Scenarios**:

1. **Given** an inventory an owner already has, **When** they duplicate
   it, **Then** a new, separate inventory is created with the same items,
   owned by the same person.
2. **Given** the newly duplicated inventory, **When** the owner edits an
   item in either the original or the copy, **Then** the change appears
   only in the one they edited — the other is unaffected.

---

### User Story 3 - Collaborators can use but not change an event's inventory (Priority: P3)

Someone invited to another person's event (as a contributor or viewer)
can see and pick from that event's inventory while planning equipment,
but cannot add, edit, re-import, or otherwise change the inventory
itself — even a contributor, who otherwise has full editing access to the
rest of the event.

**Why this priority**: Important for correctness and trust (a shared
inventory shouldn't be alterable by every collaborator on every event
that happens to use it), but the app already functions once User Stories
1–2 exist; this closes a permission gap rather than adding new
capability.

**Independent Test**: Can be fully tested by having a contributor (not
the inventory's owner) open an event that uses someone else's inventory,
confirming they can view items and pick them onto patch rows, but every
attempt to add, edit, or re-import the inventory itself is blocked.

**Acceptance Scenarios**:

1. **Given** a contributor invited to an event that uses another
   person's inventory, **When** they plan equipment for that event,
   **Then** they can view and select from the full inventory normally.
2. **Given** the same contributor, **When** they attempt to add, edit, or
   re-import anything in that inventory, **Then** the action is blocked.
3. **Given** a viewer (not just a contributor) on the same event,
   **When** they look at planned equipment, **Then** they can see which
   inventory items are used, same as any other read access to the event.

---

### Edge Cases

- What happens if an owner tries to delete an inventory that one or more
  events still use? Not permitted — an inventory in use cannot be
  deleted, mirroring how other in-use catalog data is already protected
  elsewhere in the app.
- What happens to events and inventory items that existed before this
  feature shipped? The single existing shared inventory becomes a real,
  owned inventory (assigned to whoever signs in first after this ships)
  rather than being lost, duplicated, or left inaccessible.
- What happens if a duplicated inventory's original is later used by new
  events, or the copy is? Nothing links them after duplication — each is
  a fully independent catalog from that point on.
- Can an event's bound inventory be changed after the event is created?
  No — see Assumptions.
- What happens when someone tries to plan equipment using an item from an
  inventory the event isn't bound to? Not offered/possible — only items
  from the event's own bound inventory are ever selectable for it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let each user own one or more independent
  inventories (their own catalog of equipment, prices, and stock levels).
- **FR-002**: Every user MUST automatically have a starter inventory
  ready to use from their first sign-in — no separate setup step.
- **FR-003**: When creating an event, its creator MUST choose which of
  their own inventories that event will use.
- **FR-004**: The same inventory MUST be usable by any number of events
  belonging to its owner, without needing to be rebuilt or re-imported
  per event.
- **FR-005**: Only an inventory's owner MUST be able to add, edit,
  re-import, or remove items within that inventory.
- **FR-006**: Anyone with any role on an event (owner, contributor, or
  viewer) MUST be able to view and select from that event's bound
  inventory while planning equipment — this read access follows from
  having a role on the event, not from owning the inventory.
- **FR-007**: A contributor invited to someone else's event MUST NOT
  gain any ability to edit that event's inventory, even though a
  contributor otherwise has full editing access to the rest of the
  event.
- **FR-008**: An inventory owner MUST be able to duplicate one of their
  inventories into a brand-new, fully independent copy; edits to either
  the original or the copy afterward MUST NOT affect the other.
- **FR-009**: System MUST prevent selecting equipment for an event from
  any inventory other than the one that event is bound to.
- **FR-010**: An inventory that is still bound to at least one event
  MUST NOT be deletable.
- **FR-011**: Every event and inventory item that existed before this
  feature MUST remain fully usable afterward, with no data loss.

### Key Entities

- **Inventory**: An owned, independent catalog of equipment (categories,
  items, prices, stock levels, and per-item fixture modes). Has exactly
  one owner. Any number of events belonging to that owner may use it.
- **Inventory Owner**: The person who created or duplicated an inventory;
  the only person able to modify it.
- **Event-Inventory Binding**: The single inventory a given event uses,
  chosen at the event's creation and fixed afterward (see Assumptions).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A brand-new user can begin importing their own price list
  within seconds of their first sign-in, with no manual setup step.
- **SC-002**: 100% of one user's inventory edits remain invisible to, and
  have zero effect on, every other unrelated user's inventory.
- **SC-003**: An inventory owner can duplicate an inventory in a single
  action, ending up with two catalogs that can be edited completely
  independently from that point on.
- **SC-004**: 100% of a contributor's attempts to edit an event's
  inventory are blocked, while 100% of their attempts to view or select
  from it succeed.
- **SC-005**: Every event that existed before this feature continues to
  correctly reference its equipment catalog afterward, with zero data
  loss.

## Assumptions

- An event's bound inventory is fixed at the event's creation and cannot
  be changed afterward — matches the existing rule that an event's owner
  is likewise permanent (Slice 15); re-binding an event to a different
  inventory later is out of scope for this feature.
- A duplicated inventory starts completely independent, with zero events
  using it yet; it is not automatically attached to anything.
- A brand-new user's starter inventory is empty and ready for them to
  import their own price list into — it is not pre-seeded with another
  user's catalog.
- Per-item fixture DMX modes travel with their inventory item, including
  through duplication, since they are catalog data rather than event
  data.
- This feature changes who owns and can edit the equipment *catalog* an
  event references; it does not change who owns the *event* itself
  (Slice 15's ownership rules are unaffected).
- Viewers get the same read access to an event's inventory as
  contributors (view/select only, per Slice 15's existing viewer rules) —
  this feature does not introduce any new viewer-specific restriction
  beyond what Slice 15 already established.
