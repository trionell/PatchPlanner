# Specification Quality Checklist: Lighting becomes a sheet

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-27
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

Three items needed a second pass, and one of them is a standing tension worth
recording rather than resolving.

1. **"No implementation details" reads differently for a design slice.** The
   subject of this feature *is* the interface, so the spec names interface
   concepts — a sheet, a row editor, a strip, a drawer, a density tier. It does
   not name a component, a file, a hook or an endpoint, which is the line that
   matters: every requirement is checkable by looking at the screen. The one
   exception is FR-044/FR-045, which constrain *where* work may happen (no
   migration, derivations outside the components). Those are deliberate — they
   are the boundary that makes the wave attributable if something regresses, and
   the same boundary Slices 25 and 26 asserted with a gate.

2. **The first draft of the clash requirement said "overlapping addresses" and
   stopped.** That is not checkable: it left open whether a fixture with no
   address overlaps everything or nothing, and whether a span past 512 counts.
   FR-021 and FR-022 now say both, and US2's scenarios 2, 3 and 8 test the three
   degenerate cases (no address, past 512, zero channel count) individually.

3. **Universe occupancy had to be defined against double counting.** With an
   overlap present, summing channel counts reports a universe fuller than it is —
   the very situation where the number is being read most carefully. FR-027 makes
   counting each channel once a requirement rather than an implementation
   preference.

Two boundaries are named in Assumptions rather than left implicit, because both
are places a later reader would otherwise assume an oversight:

- **The DMX chain column is removed from the interface but its stored field is
  left alone.** Deleting dead UI is this wave's business; deciding whether DMX
  chaining should be modelled is not.
- **Auto-assign's all-or-nothing failure is not reopened.** The drawer makes the
  512-channel ceiling visible, which is what makes that failure legible. Whether
  it should instead assign what it can is a separate question, and answering it
  inside a design-convergence wave would put a behaviour change where a
  regression could not be attributed.

One assumption carries a genuine risk to the plan and is flagged there rather
than hidden: **the name stem on a batch add may require the bulk endpoint to
carry a fixture name and to accept a batch with no catalog model.** Every other
part of this feature is frontend-only. The plan must decide between extending the
request or composing the batch from single creates, and must say which — the
"frontend only" gate the last two slices ran cannot simply be copied forward.
