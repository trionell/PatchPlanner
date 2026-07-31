# Feature Specification: Who can see this event

**Feature Branch**: `038-event-access`

**Created**: 2026-07-31

**Status**: Draft — design approved 2026-07-31 (`mockup.html`, revision 4)

**Input**: ROADMAP.md § *Slice 38 — Who can see this event*, reported from use:
*"I can't find a way to invite a user to my events on mobile."*

## Why this slice exists

Sharing has been an owner-and-contributor affordance since Slice 15 and never got
a phone form. The *Invite* button and the members dialog both sit below the mobile
early return in `pages/EventDetail.tsx:85`, so on `(max-width: 767px)` neither
element exists: **someone standing in a venue can see that four people have access
and change none of it.**

The backend has been complete throughout — list, invite, re-role and remove, with
owner-row protection and role gating already tested. This slice is entirely
frontend.

It is one slice rather than two because the second half decides the first. The
surface is a `Dialog`, and a `Dialog` stays centred at every width, so it has no
phone form. `ui/Drawer` *is* `ui/Sheet` below 768 px. Getting the desktop shape
right is what gives the phone its surface — one call site, not two.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Managing access from a phone (Priority: P1)

Someone who can manage an event opens it on a phone, finds who has access, invites
a colleague as a contributor, corrects a role they set wrong, and removes someone
who has left the crew. Every control is large enough to hit with a thumb.

**Why this priority**: It is the reported defect. Nothing else in the slice is
worth doing if the phone still cannot reach the surface.

**Independent Test**: On a 375 px viewport as an owner, complete invite → re-role →
remove without rotating the device or reaching a desktop.

**Acceptance Scenarios**:

1. **Given** an owner on a 375 px viewport, **When** they open the event's Overview
   section, **Then** a row states how many people have access and their own role,
   and tapping it opens the access surface as a bottom sheet.
2. **Given** that sheet is open and at least one person has not yet been invited,
   **When** the owner picks a person, picks a role and confirms, **Then** the new
   member appears in the list and disappears from the person picker.
3. **Given** a member who is not the owner, **When** their role control is changed,
   **Then** the new role takes effect immediately and no confirmation is asked for.
4. **Given** any control on a member's row, **When** measured on a phone, **Then**
   its touch target is at least 44 px in the direction a thumb travels.

---

### User Story 2 — One door, at every width (Priority: P2)

Anyone with access — including a viewer, who can change nothing — can find out who
else can see the event, from the same place at both widths.

**Why this priority**: The list is useful to everyone; only the controls are
privileged. Today a viewer cannot reach it at all, because the only door was a
button labelled *Invite* that viewers never see.

**Independent Test**: As a viewer at both widths, reach the member list and confirm
no control that would change anything is present.

**Acceptance Scenarios**:

1. **Given** a viewer at any width, **When** they open Overview, **Then** the access
   row is present and tappable, and its trailing word reads as consultation rather
   than management.
2. **Given** a viewer opens the access surface, **When** it renders, **Then** every
   member is listed with their role, and no role control, remove control or invite
   form is present anywhere in it.
3. **Given** an owner or contributor at desktop width, **When** they look at the
   event header, **Then** no *Invite* button is there — the Overview row is the only
   door at both widths.
4. **Given** the access surface is open, **When** the user is on a desktop, **Then**
   it is anchored to the right edge over the surface they were reading, which is not
   displaced or resized.

---

### User Story 3 — Removing someone is a decision, not a slip (Priority: P3)

Removing a member is destructive and currently fires on a single tap of a bare
icon. It should state who is losing what, and be answerable.

**Why this priority**: It is a data-loss-adjacent action behind the smallest target
on the surface. It rides along with the redesign at almost no cost.

**Independent Test**: Trigger a removal, cancel it, confirm the member is still
there; trigger it again, confirm, and see them gone.

**Acceptance Scenarios**:

1. **Given** an owner taps remove on a member, **When** the confirmation appears,
   **Then** it names that member and states that access ends immediately and that
   they can be invited again.
2. **Given** the confirmation is open, **When** the user dismisses it by any means —
   cancel, backdrop or keyboard — **Then** nothing is removed.
3. **Given** the confirmation is open, **When** the user confirms, **Then** the
   member disappears from the list and reappears in the person picker.

---

### Edge Cases

- **Nobody left to invite.** Every known account is already a member. The invite
  section states why in place of the picker, and that sentence is a *state* — it
  stops being true the moment a new person signs in — so it stays where the picker
  was rather than moving behind the explanation toggle.
- **The event has one member.** The owner sees their own row, a chip, and no
  controls on it.
- **The owner's row.** The server refuses every write against it. The row therefore
  carries a chip and no controls at all, rather than controls that would fail.
- **Your own row.** Marked, and carrying no controls — leaving an event under your
  own power is not in this slice, and a control that locks you out of the surface
  you are standing in is worse than an absent one.
- **A member with no profile picture.** The row is the same height; nothing shifts.
- **An invite that fails** (the person signed in and was invited from another
  session between the picker loading and the confirm). The error is stated in the
  invite section and the list refreshes.
- **A viewer who reaches the surface another way.** The surface itself withholds
  every control, independently of the door being hidden.

## Requirements *(mandatory)*

### Functional Requirements

**The shape**

- **FR-001**: The access surface MUST be a `ui/Drawer` at `narrow` width, replacing
  the current `ui/Dialog`. One call site MUST serve both widths — the drawer's own
  phone branch supplies the bottom sheet.
- **FR-002**: Its body MUST be two `DrawerSection`s — the member list and the invite
  form — and MUST NOT use `flush`. `flush` is for a body that is one construction;
  this is a list and a form, and the form would rebuild the padding `flush` removed.
- **FR-003**: `design/components.md` §`ui/Dialog` MUST gain the *interrupts /
  accompanies* rule in this slice's commit: a `Dialog` interrupts with one choice
  before what you were doing can continue; a `Drawer` accompanies as a companion
  workspace you go on working in; and a companion need not be editable, consulting
  being a form of accompanying. D4's *read-only work surface* clause MUST be
  absorbed into it as a sub-case rather than left standing as a third answer.
- **FR-004**: The slice MUST record that the access surface and its removal confirm
  land on opposite sides of that rule — the surface accompanies, the confirm
  interrupts — so the rule is demonstrated by the slice that writes it.

**The door**

- **FR-005**: Overview MUST carry an access row at both widths, stating the number
  of people with access and the reader's own role, with a breakdown of the other
  roles. It MUST be reachable by every role, including viewers.
- **FR-006**: On a phone the row MUST be a `CondensedListRow` beneath the catalog
  row, with a trailing chevron and no accent edge. On a desktop it MUST take the
  catalog row's own arrangement one row later, its action reading *Manage* for
  someone who can manage and *View* for a viewer.
- **FR-007**: The header's *Invite* button MUST be removed. It named the smaller
  half of the surface, hid the list from viewers, and gave one width two doors to
  one drawer.
- **FR-008**: Overview's meta line MUST give up its two access phrases at both
  widths. The row states them; a fact stated twice eventually disagrees with itself.

**The member list**

- **FR-009**: A member MUST be rendered as a `GearCard` — name, email as a 10 px
  mono spec line, controls in the card's own row.
- **FR-010**: Role chips MUST be neutral at every role. A viewer currently draws the
  amber *warning* badge; amber means *needs attention* and being a viewer is not a
  fault. The word is the data.
- **FR-011**: The owner's row MUST carry a role chip and no controls, and the
  reader's own row MUST be marked as theirs and carry no controls.
- **FR-012**: On a phone the card MUST stack to two lines, with the role control at
  40 px and the remove control a 44 × 44 target around a 16 px icon. Desktop keeps
  its denser controls. Both computed heights MUST match the approved mockup: 114 px
  in the hand, 68 px on a desk.

**Inviting**

- **FR-013**: The invite form MUST be one construction at both widths — a person
  field, a role field, then a full-width primary action — rather than three controls
  across one flex row. The role MUST read as belonging to the person being invited.
- **FR-014**: The invite form MUST be absent entirely for a viewer.
- **FR-015**: People already on the member list MUST NOT appear in the person picker.

**Removing and re-roling**

- **FR-016**: Removing a member MUST raise a `ui/ConfirmDialog` titled *Remove
  access*, whose sentence names the member and states that access ends immediately,
  that nothing already changed is undone, and that they can be invited again. Its
  confirming word MUST be *Remove*.
- **FR-017**: Changing a role MUST NOT ask for confirmation. It is reversible in the
  same control that performed it.

**Explanation**

- **FR-018**: The drawer MUST carry an `info` note with `noteId` `event-access`,
  holding the two durable rules — what contributor and viewer each mean, and that an
  invitation goes to an account rather than an email address.
- **FR-019**: The drawer MUST have no `footer`. Its only candidate sentence is an
  explanation read once, which is what `info` is for.

**Permission**

- **FR-020**: The drawer MUST be mounted with an explicit read-only flag derived
  from the reader's role, rather than relying on a hidden trigger. With the door now
  open to every role, the client-side gate MUST move from gating the door to gating
  the controls.
- **FR-021**: That gate MUST continue to match the server exactly: owners and
  contributors may invite, re-role and remove; viewers may only read. The existing
  defense-in-depth intent MUST survive the move.

### Key Entities

- **Event member**: a person's access to one event — who they are (name, email,
  picture), which of the three roles they hold, and whether that role is the owner's.
  Unchanged by this slice; only its presentation changes.
- **Known user**: anyone who has signed in at least once, and therefore the only
  people who can be invited. Unchanged by this slice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner on a 375 px screen can invite a colleague, correct a role and
  remove a member without leaving the phone — the reported defect is closed.
- **SC-002**: Every interactive control on the access surface meets the phone's 44 px
  minimum in the direction a thumb travels.
- **SC-003**: A viewer can see who has access at both widths, and cannot reach a
  control that would change anything.
- **SC-004**: There is exactly one door to the surface at each width, and it is the
  same door.
- **SC-005**: No member can be removed by a single tap; every removal passes through
  a statement of who loses what.
- **SC-006**: The access count and the reader's role each appear once per width.
- **SC-007**: The overlay rule in the design language reads as one test with no
  second clause, and sorts both of this slice's overlays without argument.

## Assumptions

- **Your own row carries no controls.** The approved design marks it as yours; it
  does not say whether it can be acted on. Leaving an event under your own power is
  listed as out of scope, and a contributor who removed their own row would lose the
  surface mid-action, so the consistent reading is that the controls are absent.
  This is the one behaviour in the slice inferred rather than drawn.
- The three questions the mockup left open are ruled as drawn (approved
  2026-07-31): the header button goes, the exhausted-picker sentence stays in place,
  and the phone's attachment rows take no heading.
- No backend change is required. The endpoints, their role gating and the owner-row
  protection are complete and tested from Slice 15.
- Inviting by email address, transferring ownership, leaving an event, showing who
  invited whom, and searching the person picker are all out of scope.
- The other seven `window.confirm` deletes belong to defect D6 and are untouched
  here; this slice adds one `ConfirmDialog` for its own removal only.
- Desktop control density is unchanged. The phone's 44 px minimum is the phone's;
  raising the desk to match it is not this slice's business.
