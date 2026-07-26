# Specification Quality Checklist: Audio patch shell, second pass

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

Four things were changed during validation rather than being waved through:

1. **A bug report is not a spec.** The reporter's four items name causes ("the row editor's PATCH omits `console_id`", "the update SQL writes NULL", "one-sided ports on the desk node"). Those are diagnoses of *this* codebase, and writing them into requirements would have fixed the shape of the solution before planning began. Every story was rewritten as the behaviour the planner sees, and the diagnoses were moved to research.md where they belong. The reporter's item numbers are kept in the story titles so the report and the work can still be matched up.

2. **Ordering by severity, not by the order reported.** The report leads with styling and puts the two correctness defects second and fourth. Two of the four cost the planner something real — entered information (item 2) and a promised capability (item 4) — so those became P1 and P2, and the appearance work became P3 and P4. This is only about ordering: all four are in scope for this slice, and P3 is the largest job in it.

3. **"Just like the mockup" had to be made checkable.** As written it is not a testable requirement, and read too literally it is the wrong one: the mockup renders the whole application scaled down inside a page, so its 20 px fields and 10.5 px type are a thumbnail, not a specification — copying those numbers would produce controls too small to use, which is the very complaint being fixed. The Assumptions section records that the mockup governs layout, hierarchy and design language, and that its sizes read as proportions. What is actually checkable became FR-017 to FR-021 and FR-027 to FR-029, plus SC-007 to SC-010.

4. **One symptom could not be reproduced from the description alone.** "The trash can icon stretches the entire height of the entire table" does not follow from the markup as written, so rather than guess at a cause, the Assumptions section records the reading used — the control is wrongly proportioned — and FR-029 replaces it with a labelled control, which removes the symptom whatever its cause turns out to be. If the underlying cause is a shared style, planning will find it.

Two further judgements worth recording:

- **FR-002 goes beyond the report.** The reporter saw a channel detach on save. Attaching a deskless row to the event's only desk on *every* save, not just on creation, is what makes a single-desk event unable to accumulate deskless rows at all — including any it accumulated before this fix, and any left behind by a caller that forgets. FR-003 keeps that from becoming a guess when there is more than one desk.
- **FR-006 is deliberately broader than FR-005.** The reporter hit one immovable box. Requiring *every* box to be draggable — including any whose position cannot be stored — turns a class of defect into a rule, instead of fixing the one instance found.
