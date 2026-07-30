# Specification Quality Checklist: The canvases

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-29
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

Four items needed a second pass and are recorded because the reasoning is the kind that
gets lost:

1. **Implementation detail in requirements.** FR-013 and FR-033 name shared *components*
   ("the zoom control component", "the node shell, the port dot, the port row") rather
   than behaviours. Kept deliberately, and this is a standing exception in this project:
   every phase of Wave 6 has carried a "what must not change" block naming files, because
   the wave's one hard guarantee is that the phone does not take the desktop with it, and
   a guarantee stated behaviourally cannot be asserted by a diff. See the same block in
   Slices 33, 34 and 35.

2. **Success criteria and the 820 px number.** SC-001 to SC-003 are stated as what a user
   can see and reach, not as zoom levels. The 820 × 640 figure appears only in Context and
   Assumptions, where it is a fact about existing stored data rather than a target.

3. **"3 px" in FR-015 and "1.4" in FR-010** are numbers a tester needs and cannot infer.
   They are thresholds a scenario can be written against, not implementation choices —
   1.4 is *how many taps from fit to 100 %*, which SC-002 states as the outcome.

4. **Edge cases were thin on the first pass** and gained the rotation case, the
   already-visible-match case, the second-tap-while-open case and the printing case, all
   of which are reachable states that the acceptance scenarios did not cover.
