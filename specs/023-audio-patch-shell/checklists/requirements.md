# Specification Quality Checklist: Audio Patch Shell — Sheet, Flow, Drawers & the Console

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-26
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

Validation run 2026-07-26, one iteration. Findings and how they were resolved:

1. **Implementation names leaked in the first draft.** The chain-cell and
   colour requirements originally cited `buildInputChannelFlow`,
   `derivedPortColor` and `reachableChannels` — carried over from the mockup,
   which was written for a developer audience. Rewritten as behaviour ("the
   full signal path in signal order", "all reachable channels agree on a
   colour"); the function names now belong to plan.md, where they are the
   correct level of detail.
2. **Three decisions were open in the mockup** ("worth a decision before pass
   3"): console cardinality, where port counts come from, and whether an owned
   console counts on the order. All three were settled with the user on
   2026-07-26 before this spec was written and are recorded in Assumptions with
   their rationale, so no [NEEDS CLARIFICATION] marker was needed.
3. **"Cluttered" was the whole input and is not testable.** Turned into
   SC-001 through SC-003, which measure what clutter costs: rows below the
   fold, clicks to the graph, and whether the pre-show check needs more than
   one screen.
4. **Two requirements guard against regression rather than adding behaviour**
   (FR-008 mobile untouched, FR-025/SC-010 existing events unchanged). Kept as
   requirements because this feature relocates a large amount of working UI and
   introduces the schema's first console table — both are places where "nothing
   changed" has to be asserted to be true.

Scope note: US1/US2 are frontend-only. US3 carries the single schema change
(migration 042) and the rental-order arm. US4 is presentation of data that
already exists. Each is independently shippable in that order.
