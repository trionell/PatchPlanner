<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/030-events-timeline/plan.md`

The overall implementation roadmap (all feature slices, their order, and
dependencies) is in `ROADMAP.md` at the repository root.
<!-- SPECKIT END -->

## Frontend design language

Before building or changing any UI, read `design/`. It is the canonical target
visual language for the whole application, taken from the audio Inputs/Outputs
tabs (sheet, flow, and the Rig/Buses drawers).

- `design/principles.md` — the rules that settle an argument about a screen
- `design/tokens.md` — colour roles, the two density tiers, type, radii
- `design/components.md` — which building block to reach for
- `design/patterns.md` — how a whole surface is assembled
- `design/audit.md` — where the app diverges today, and the convergence order
- `design/design-language.html` — the same language drawn as specimens, for
  human review; published as an Artifact, revised by editing the file

Look values up in `design/`, not in `specs/*/contracts/*.md`. The slice contracts
record why a value was chosen at the time and stay accurate as history; `design/`
is what the code must match now. A slice that changes a value updates `design/` in
the same commit.
