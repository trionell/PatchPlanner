# Specification Quality Checklist: The mockup's visual language, for real

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

Four things were resolved during validation rather than waved through.

1. **"Must follow the mockup" is not by itself testable, and the report says two things that pull against each other** — follow it in every respect, but it need not be pixel-perfect "since that's hardcoded". Taken as pixels the instruction is self-defeating: the mockup renders the whole application scaled down (11 px base, 20 px fields, 8.5 px labels), so copying its numbers would produce controls smaller than the ones already complained about in the previous round. The Assumptions section states the reading used — proportions, hierarchy, type roles, colours and spacing rhythm are binding; absolute pixel values are not; where a mockup value *is* a ratio, the ratio is the requirement — and FR-010 to FR-035 each name a property that can be checked by eye against the mockup rather than measured against it.

2. **The report names causes, which do not belong in requirements.** "Discards the node it was given", "the input graph derives a port's colour, the output graph never did", "both canvases duplicate their own NodeShell/PortDot/PortRow" are diagnoses of this codebase, and three of them are correct. They are recorded in research.md; the stories state what the planner sees. The one that survived as a requirement is FR-036, because "the two graphs share what draws them" is a property of the result and not only of the route to it — it is what stops item 5 recurring.

3. **Two items are worth more than the report gives them.** Item 1 was written as one button not working; the underlying need is that a selection belongs to the tab, so FR-002 also requires it to survive switching view in *either* direction, and FR-004 requires a selected source far down a long rail to be scrolled to — a selection that cannot be seen is not one. Item 2 was written as missing colour; FR-009 additionally requires colour to be derived rather than stored and to mean the same on both graphs, which is what makes the two tabs teach the same lesson.

4. **One thing the mockup does not answer, decided rather than asked.** The mockup draws no inspector on the outputs graph, but item 1 requires Edit in Flow to land somewhere on that tab too. Resolved by scope: the outputs graph gains selection, so the button lands and the box is marked, and a full outputs inspector with editable fields is listed Out of Scope. This is stated in the Assumptions rather than left for the reader to notice.

Also recorded: the mockup's toolbar carries the tab's own name, which the app also shows in the tab strip above it. That is a duplication in the mockup, and it is followed anyway — the name is what anchors the panel now that the panel has a top edge of its own. Small enough not to be worth a question, big enough to be worth writing down.
