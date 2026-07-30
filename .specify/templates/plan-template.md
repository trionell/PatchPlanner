# Implementation Plan — [FEATURE]

**Branch**: `[###-feature-name]`
**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)
[**Design**: [mockup.html](./mockup.html), revision [N], approved — omit if no UI]

## Technical Context

State only what is **true of this slice and not already true of the project**.
The stack, the test harness, the phone breakpoint, the gate commands and the
repository layout are in `CLAUDE.md`; restating them here creates a second copy
that can disagree with the first, which has happened.

| | |
|---|---|
| Language | [only if this slice departs from the CLAUDE.md stack] |
| Backend | [the shape of the backend change — "none", or the migration and whether it alters schema] |
| Testing | [what the harness makes hard for *this* slice, and the consequence — e.g. "no DOM, so the arithmetic must be pure functions in `lib/` to be testable at all"] |
| New dependency | [None, or the name and the Complexity Tracking justification] |
| Scope | [what changes — files, surfaces, endpoints. A rough count, not a list] |

Design values come from `design/`, not from slice contracts. If this slice
changes one, say which document and section, and update it in the same commit.

Mark anything genuinely unknown as **NEEDS CLARIFICATION**; do not guess and do
not pad the table with rows that only repeat the project defaults.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

Name the principles this slice could plausibly break and say how it does not.
A check that could be pasted into any slice's plan is not a check — cite the
specific decision that satisfies each one.

- **[Principle or rule]** — [the decision in this slice that satisfies it]

Violations go in Complexity Tracking below, not here.

## Phases

Numbered phases, each a commit-sized step with its own reason for existing.
Say what changes and what deliberately does not. Include the signature of any
new pure function — that is the part the tests bind to.

### Phase 0 — [name] *(scope note, e.g. "no UI change")*

## Risks

| Risk | Why it is real here | What contains it |
|---|---|---|
| | | |

## Complexity Tracking

Fill **only** if the Constitution Check found a violation. If it found none,
write one line saying so and move on.

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
