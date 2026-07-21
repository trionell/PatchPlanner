# Feature Specification: Public Start Page

**Feature Branch**: `020-start-page-redesign`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "I want a more proper start page for patch planner now that I have deployed it in production. Give it a cool look with some information of what the tool is and what it can do. Also add a disclaimer that it's in closed beta for now. Include the login to the tool somewhere conventiant. Make a mockup before writing the spec"

A visual mockup was produced and approved before this spec was written; the
approved mockup is the source of truth for layout, tone, and content
decisions recorded below.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Learn what PatchPlanner is and sign in (Priority: P1)

A visitor who is not signed in arrives at PatchPlanner's public web address.
Instead of being dropped straight into a bare sign-in form, they see a page
that explains what the product is and can sign in from it.

**Why this priority**: This is the core ask — replace the current "redirect
straight to sign-in" experience with a real front door. Without this, none
of the other stories matter.

**Independent Test**: Visit the root address while signed out; confirm the
page explains the product and that completing sign-in from it lands the
visitor in the working application.

**Acceptance Scenarios**:

1. **Given** a visitor who is not signed in navigates to the site's root
   address, **When** the page loads, **Then** they see the product name, a
   description of what it does, and a visible way to sign in.
2. **Given** a visitor on the start page, **When** they choose to sign in
   and complete the existing Google sign-in flow, **Then** they land in the
   authenticated application, same as today.
3. **Given** a visitor who is already signed in, **When** they navigate to
   the site's root address, **Then** they see their dashboard directly, not
   the start page (unchanged from current behavior).

---

### User Story 2 - Understand the closed-beta status (Priority: P2)

A visitor sees, without having to look for it, that PatchPlanner is
currently invite-only, and can find a way to ask for access.

**Why this priority**: Sets expectations correctly (avoids confusion or
support requests from visitors who can't yet get in) and gives interested
visitors a next step. Secondary to the baseline informational/sign-in
experience.

**Independent Test**: Land on the page and confirm the closed-beta notice is
visible without scrolling or clicking, and that a request-access contact
method is present.

**Acceptance Scenarios**:

1. **Given** any visitor on the start page, **When** the page first loads,
   **Then** a closed-beta disclaimer is visible without scrolling.
2. **Given** a visitor who wants access, **When** they look for how to ask
   for it, **Then** a way to request access is available on the page.

---

### User Story 3 - Evaluate what the tool can do (Priority: P3)

A visitor scrolls past the introduction to see a summary of PatchPlanner's
main capabilities, to decide whether it's worth requesting access.

**Why this priority**: Builds credibility and informs the decision to
request access, but the page still delivers its core value (explain +
sign in) without it.

**Independent Test**: Scroll past the introduction and confirm each major
capability area of the product is represented with a short description.

**Acceptance Scenarios**:

1. **Given** a visitor scrolls past the introduction, **When** they reach
   the capability summary, **Then** they see distinct, short descriptions
   covering the product's main capability areas (patch lists, signal-flow
   graph, lighting/DMX rig, rental order & export, inventories, print/trace
   sheets).

---

### Edge Cases

- A visitor with an expired or invalid session lands on the root address:
  treated as not signed in, sees the start page.
- A visitor follows a direct link straight to the existing sign-in screen
  (bypassing the start page): existing sign-in behavior is unaffected.
- A visitor on a small (mobile-width) screen: the page stays readable and
  every control, including sign-in, stays reachable.
- A visitor with a reduced-motion preference set: any decorative animation
  on the page is disabled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST show an informational start page at the
  site's public root address to visitors who are not signed in.
- **FR-002**: The start page MUST state what PatchPlanner is and summarize
  its main capabilities (patch lists, signal-flow graph, lighting/DMX rig,
  rental order & export, inventories, print/trace sheets).
- **FR-003**: The start page MUST display a closed-beta disclaimer that is
  visible on first load, without requiring the visitor to scroll or take
  any action.
- **FR-004**: The start page MUST provide a way for a visitor to request
  beta access.
- **FR-005**: The start page MUST provide a sign-in control that starts the
  existing Google sign-in flow, reachable from more than one point on the
  page (at minimum, near the top and again further down) so it's never more
  than a short scroll away.
- **FR-006**: Completing sign-in from the start page MUST take the visitor
  into the authenticated application, unchanged from current sign-in
  behavior.
- **FR-007**: A visitor who is already signed in and navigates to the
  site's root address MUST see the authenticated application directly, not
  the start page.
- **FR-008**: The start page MUST stay legible and usable on mobile-width
  screens.
- **FR-009**: The start page MUST disable decorative animation for visitors
  who have a reduced-motion preference set.
- **FR-010**: The start page's look and feel MUST be visually consistent
  with the rest of the application (existing dark theme and product mark),
  matching the approved mockup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of signed-out visitors to the root address see the start
  page rather than being sent straight to a bare sign-in form.
- **SC-002**: A visitor can reach a sign-in control and start the Google
  sign-in flow within one click from anywhere on the start page.
- **SC-003**: The closed-beta disclaimer is visible on first paint at both
  desktop and mobile widths, with zero additional scrolling or interaction.
- **SC-004**: Signed-in visitors see no change at the root address — 100%
  land directly on their dashboard, as before.
- **SC-005**: The page renders without layout breakage across common
  viewport widths (roughly 375px–1440px).

## Assumptions

- The existing Google sign-in mechanism and session handling are unchanged;
  this feature only adds a public informational page in front of them.
- Beta access requests are handled outside the product for now (e.g., an
  email contact), not an in-app request form or waitlist database.
- Visual design follows the approved mockup: it reuses the application's
  existing dark theme and product mark rather than introducing a new logo
  or brand identity.
- Start page content summarizing capabilities is drawn from the product's
  current feature set and may need updating as features change; it is
  static content, not generated from live product data.
- The application continues to require JavaScript to run, consistent with
  its existing single-page-app delivery.
