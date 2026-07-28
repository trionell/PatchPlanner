# PatchPlanner — Design Language

The target visual language for the whole application, taken from the surface that
currently gets it right: the audio Inputs and Outputs tabs — their Sheet and Flow
views, and the Rig and Buses drawers.

These documents exist because the frontend has drifted. Slices 23–26 built a
deliberate, documented language for the audio patch surface while the other seven
tabs kept the one they were born with, and there is now no single place that says
which of the two is the target. This is that place.

## The documents

| | Document | Answers |
|---|---|---|
| 01 | [principles.md](principles.md) | The rules that settle an argument about a screen. Read this one first; the rest are its consequences. |
| 02 | [tokens.md](tokens.md) | The values. Colour roles, the two density tiers, the type scale, radii, borders, shadow. |
| 03 | [components.md](components.md) | Which building block to reach for, and its binding values. |
| 04 | [patterns.md](patterns.md) | How a whole surface is assembled — panels, drawers, rails, editors, states, chrome, print. |
| 05 | [audit.md](audit.md) | Where the application diverges today, and the order to converge it in. |

Plus one visual companion:

| | Document | Answers |
|---|---|---|
| — | [design-language.html](design-language.html) | The same language **drawn** rather than described — every surface as a specimen, for review by looking. Published at [claude.ai/code/artifact/8e651965](https://claude.ai/code/artifact/8e651965-34c8-43fb-a5d9-a1ad36a8246d). |

The HTML page renders 01–05 and adds nothing to them. If a value on it looks
wrong, the fix belongs in `tokens.md` or `components.md` **and then** on the page —
never on the page alone. It is an HTML fragment (the Artifact publisher supplies
the `<head>`), so edit the file and republish to the same URL to revise it.

## Status

**Descriptive for the audio patch surface, prescriptive for everything else.**

Nothing in 01–04 is aspirational: every value is either already shipped on the
audio tabs or is a direct carry of a value that is. Where a document states a rule
the audio surface itself breaks, it is marked and listed in [audit.md](audit.md) —
the reference surface is the best thing in the codebase, not a perfect one.

**The phone is the exception, and it is prescriptive throughout.**
`components/mobile/` was built in Slice 21, two slices before this language
existed, and Waves 0–5 converged the desktop around it without touching it. So
[principles.md](principles.md) P9, [tokens.md](tokens.md) §7,
[components.md](components.md) §5 and [patterns.md](patterns.md) §7 describe what
the phone must become, and [audit.md](audit.md) M1–M12 is the distance from there
to what it is.

**Three of those documents' rules were not merely unbuilt but wrong**, and are
corrected rather than enforced:

- The phone keeps **the app's one label voice**. A sheet holding a drawer's or an
  editor's fields renders the same mono micro-label the desktop does — *type is
  read, geometry is touched* ([tokens.md](tokens.md) §7, amendment 2).
- The Flow canvas is **viewable** on a phone, as a viewport with nothing pinned to
  its edges. The picture of where the signal goes is what a technician wants on
  site.
- What stays at the desk is a **gesture**, not an object: placing and patching.
  Tapping a source to change its mic stand is phone work.

## How this relates to the slice contracts

`specs/025-patch-visual-language/contracts/visual-language.md` and
`specs/026-output-flow-inspector/contracts/inspector-rail.md` are the two documents
these supersede as the place to **look up** a value.

They are not deleted and should not be. A slice contract records what one slice
established and why, at the time, against the checks that slice was reviewed on —
that is a historical record and stays accurate forever. What it cannot be is
canonical, because the moment a second slice touches the same value you get the
chain that already started: Slice 25 §7 carries a "superseded, in one direction
only" banner pointing at Slice 26. Two links is a footnote. Six is the drift these
documents exist to stop.

So:

- **Looking up what a value is** → these documents.
- **Understanding why it is that** → the slice contract, linked from here.
- **Changing a value** → change it here and in the code in the same commit. A
  design document that lags the code is worse than none, because it is quoted.

The one authority above these documents is
[`.specify/memory/constitution.md`](../.specify/memory/constitution.md). Where a
design rule and a constitutional principle appear to conflict, the constitution
wins and the design rule is wrong. In practice they do not conflict: several rules
here are Principle II ("never branch on a category name") and Principle V
("pragmatic simplicity") applied to pixels.

## The mockup

The approved direction is the artifact
[**Audio tabs — Sheet + Flow, in detail**](https://claude.ai/code/artifact/f90ed9ba-5dff-49de-b9ad-3cf9ca555d2e).

It is a reference, not a spec, and it is read with one correction applied
throughout: **it renders the whole application scaled down at an 11 px base against
this app's 14 px.** Every type-relative value in it is carried across at roughly
×1.27, never copied. Values that are not type-relative — a border width, a corner
radius, an alpha, a 7 px port dot — are the mockup's own and are used unchanged.

Three field-test rounds have since adjusted a handful of the carried values. Where
the built value and the strict ratio disagree, **the built value is canonical**: it
is the one a technician has used. The ratio governs values not yet built.
