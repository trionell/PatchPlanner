# Specification Quality Checklist: Lighting becomes a sheet

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-27
**Revised**: 2026-07-27, after review — sharing, occupancy, and the DMX chain column
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

### The first draft was wrong about the domain, and that is the finding

It said, flatly, that two fixtures whose address spans intersect is an error. It
is not: twenty identical pars patched to one address so one fader drives them is
how environment and architectural lighting is rigged, and loads on a dimmer
channel are the same arrangement. A tool that called that an error would have
been wrong about the most ordinary thing on the surface, and — worse — would have
trained the planner to ignore the strip, which would have cost the *real* clashes
their only chance of being noticed.

The correction is not a special case bolted on. It restructures the requirement
into **four conditions** (FR-019 – FR-025) that a single universe can hold at
once: shared, clash, out of bounds, unaddressed. FR-024 makes their independence
a requirement rather than an implementation detail, and US2 scenario 6 tests the
case that would otherwise be got wrong — a fixture that is simultaneously a
member of a shared group *and* party to a clash with a third fixture.

**A spec that is checkable can still be wrong about the world.** Every version of
the clash requirement was testable; the first one was testable and false. That is
worth recording because no checklist item catches it.

### Three other items needed a second pass

1. **"No implementation details" reads differently for a design slice.** The
   subject of this feature *is* the interface, so the spec names interface
   concepts — a sheet, a row editor, a strip, a density tier. It does not name a
   component, a file or a hook, which is the line that matters: every requirement
   is checkable by looking at the screen. The exceptions are FR-052 – FR-054 and
   FR-059, which constrain *where* work may happen. Those are deliberate: they
   are the boundary that keeps a regression attributable to this wave.

2. **Occupancy had to be defined against three separate ways of being wrong.**
   Double counting when channels are shared (FR-027), losing the channels of a
   span that runs past 512 (FR-028), and reporting a free *total* where only a
   free *run* answers the question (FR-029, FR-030). The third is the one that
   would have shipped unnoticed: 494 free channels scattered in gaps of four
   reads as plenty of room and will not take a 16-channel fixture.

3. **Sharing is derived, not stored.** A group is already fully described by its
   members' addresses; a stored marker would be a second place to say the same
   thing and therefore a second thing to keep in sync. The cost is that a
   bulk-add run twice looks deliberate, mitigated by the strip counting shared
   groups in **every** state (FR-031) so the condition is never silent.

### Two boundaries named rather than left implicit

- **Auto-assign separates shared groups**, as it always has, and this feature
  does not change that — it makes it visible in the drawer's footer before the
  button is pressed (FR-048). Now that the tool blesses sharing, silently
  destroying a group would be a trap of our own making, so the warning is a
  requirement and not a nicety. Fixing the behaviour is listed in Out of Scope as
  the next slice.
- **The DMX chain column is deleted outright**, database column included, on the
  reporter's decision. That single change is what makes this wave not
  frontend-only: the "no Go file touched" gate Slices 25 and 26 both ran cannot
  be carried forward, and the plan must state its replacement.

### Open risk for the plan

The name stem and an optional model on a batch add may require the bulk-add
endpoint to carry a fixture name and to accept a batch with no catalog model.
With the migration already in scope this is no longer a question of whether the
backend is touched, only of how much. The plan must decide between extending the
request and composing the batch from single creates, and must say which.
