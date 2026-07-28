# Specification Quality Checklist: The Events timeline, and events that have length

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Two iterations were needed.

**Iteration 1 — implementation detail leaked from the mockup.** The approved mockup is
pixel-level by nature, and the first draft carried its values into the requirements: an
84 px gutter, a 26 px year numeral, a `160ms grid-template-rows 0fr→1fr` transition,
`dayOfYear/365`, `partitionEvents`, `RigRibbon`, `lib/eventSummary`, column names,
`GET /events/{id}/summary`. All were rewritten as the behaviour they exist to produce —
FR-021 now says a multi-day row differs "by shape, not by colour alone" rather than naming a
capsule size; FR-025 says the summary "MUST be the same derivations the event's own tabs
use" rather than naming the module. The values themselves are not lost: they are recorded in
the mockup and in `design/`, which is where the project keeps them, and the plan will point
at both.

**Two exceptions were kept deliberately**, and both are user-facing decisions rather than
implementation choices:

- **FR-005** names `start_date` and `startDate` and requires the rename to be its own
  commit. That is a decision the user took explicitly during mockup review, and stating it
  as "the first date should be named consistently with the others" would lose the
  instruction. It is recorded as a requirement so it cannot be quietly dropped.
- **FR-044** requires `design/` to be updated in this slice. That is this project's own
  governing rule (CLAUDE.md: "a slice that changes a value updates `design/` in the same
  commit"), so leaving it implicit would risk it not happening.

**Iteration 2 — one success criterion was not measurable.** "The page feels faster" became
SC-007, stated as a claim about what is requested and when.

No `[NEEDS CLARIFICATION]` markers were needed: the three open questions from the mockup
were answered by the user before specification began (default view All, unfold kept, track
kept), and the two carried into revision 3 were answered as well (rename the column, defer
rental pricing).
