# Specification Quality Checklist: The nine surfaces

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

**Validation run 1 — three issues found and fixed:**

1. *No implementation details* — the first draft named component files
   (`MobileEntityList`, `StatusStrip`) in the functional requirements. Component names
   are the implementation's answer, not the requirement. FR-007, FR-009 and FR-028 were
   rewritten to state the behaviour; the file names live in the plan.
2. *Testable and unambiguous* — FR-018's rule (*"changes what you are looking at"* vs
   *"does a thing and is finished"*) is a judgement, so it was given the worked
   classification in the mockup (§04) and the acceptance scenarios name the concrete
   assignment for all nine surfaces rather than restating the rule.
3. *Technology-agnostic success criteria* — SC-004 originally read *"`!isMobile` appears
   in no permission expression"*. That is a grep, not an outcome; it stays as **FR-001**
   where it belongs, and SC-004 now states the user-facing consequence with the search as
   its verification method.

**Two things deliberately kept that read like implementation detail:**

- The **375 × 667** reference viewport and the **317 px** bar width. These are the
  measurable constraints the whole slice is designed against — a success criterion of
  *"lists remain usable"* is not verifiable and this project has an audit finding
  (`M2`, `F3` of Slice 34) about exactly that kind of unfalsifiable value.
- The **requirement conflict** with Slice 21 FR-012 is stated in the spec rather than
  resolved silently in the plan, because superseding a shipped requirement is a product
  decision and the record of it is the point.

**One dependency worth restating for the planner**: US7 (the fixed-height shell) cannot
land before US4 and US5, because the shell's failure mode is caused by surfaces that are
not panels. This is a real ordering constraint, not a preference.
