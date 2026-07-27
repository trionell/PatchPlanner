# Specification Quality Checklist: Lighting becomes a sheet

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-27
**Revised**: 2026-07-27, twice after review — first sharing, occupancy and the DMX
chain column; then the two bulk operations
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

### A warning was the wrong answer, and the review said so

The previous revision handled auto-assign dissolving a shared group by *warning*
about it in the drawer's footer, and listed fixing the behaviour as the next
slice. The reporter rejected that, correctly: a warning beside a button that
undoes what the sheet has just called legitimate is a trap with a label on it.

So auto-assign is rewritten in this feature (FR-031 – FR-042), and the rule is
stated in both directions — **what shared before still shares, and what did not
share before must not** — because only the first half is obvious, and an
implementation that packs sequentially without thinking about groups can satisfy
one and violate the other. FR-034 states the consequence that makes the whole
thing worth having: a group of twenty consumes its channels **once**.

Two further constraints came from the same review and are requirements rather
than implementation notes, because both are about the physical world:

- **No fixture may change universe** (FR-035). A universe usually corresponds to
  a cable run to one truss, so universe membership is an *input* to these
  operations and never an output.
- **Universes are processed independently** (FR-036). Today one over-full
  universe fails the entire rig, which leaves a planner unable to fix universe 1
  until they have fixed universe 2 — two things that have nothing to do with each
  other. A universe that cannot fit is now left exactly as it was and named.

**Optimise channels** is specified as auto-assign's sibling rather than as a
mode of it: identical packing, different ordering. Auto-assign imposes the rig's
order; optimise preserves whatever order the addresses are already in and only
closes the gaps. Stating it that way is what keeps them one pure function with
one parameter instead of two implementations that will drift.

### Three boundaries named rather than left implicit

- **The DMX chain column is deleted outright**, database column included, on the
  reporter's decision.
- **Optimise packs from address 1**, so a deliberate leading offset is not
  preserved. Recorded in Assumptions with the note that preserving the first
  group's address is a one-line change to the same function.
- **A universe below 1 is normalised to 1**, which is the single case where a
  fixture's universe changes under an operation that promises not to change it.
  It is normalising an impossible value, not moving between two real universes,
  and saying so is cheaper than leaving a reader to find the contradiction.

### Open risk for the plan

The backend footprint is no longer incidental, and the "no Go file touched" gate
Slices 25 and 26 both ran cannot be carried forward. The plan must state what
replaces it and must resolve three things:

1. **The migration** dropping `dmx_chain_parent_id`, and whether SQLite's
   `DROP COLUMN` is usable here or the table-rebuild pattern of migration 018 is
   needed, given the column is a self-referencing foreign key.
2. **Auto-assign is rewritten and a second endpoint joins it.** Both need a
   response richer than today's — which universes changed, which were skipped —
   and the packing itself should exist once, in one place, parameterised by
   ordering.
3. **The name stem and an optional model on a batch add**, which may require the
   bulk-add endpoint to carry a fixture name and accept a batch with no catalog
   model. The plan decides between extending the request and composing the batch
   from single creates.

FR-069 constrains all of this: the four conditions, the occupancy model and the
packing must be pure functions, testable without rendering and without a
database. The packing rule is now shared between a Go endpoint and a browser that
must predict its result, which is exactly the kind of duplication that drifts —
the plan should say which side owns it and how the other stays honest.
