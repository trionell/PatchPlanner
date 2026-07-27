# Research: The pages, and what is left over

---

## R1 · Why this endpoint, when Wave 4's was withdrawn

**Decision.** The usage count is computed in Go, on the existing response. Wave 4's
event summary is computed in TypeScript, with no endpoint at all.

Those look contradictory and are the same rule twice: **the derivation lives once,
where the data already is.**

| | Wave 4's summary | Wave 5's usage count |
|---|---|---|
| What it is | four graph walks over payloads the browser already holds | a `COUNT(*)` over eight plan tables |
| Who can compute it | the browser, from data it must fetch anyway | only the database |
| Second implementation? | yes — Go would be a copy of `dmxMap` and the flow builders | **no** — `countReferenceUsage` already exists |
| Failure if duplicated | Overview says *addressed*, Lighting says *2 errors* | n/a |

The clincher is the last row of the middle column. `countReferenceUsage` has
guarded deletes since Slice 17; this wave *calls* it. Reimplementing the count in
the browser would mean shipping the vocabulary-to-table map to the client and
keeping it in step with the schema — which is the mistake, in the other direction.

**Not a new endpoint, either.** It is a field on a response the page already
fetches. A separate `GET …/usage` would be a second round trip for a number that
belongs to the value it qualifies.

## R2 · The rail is a column, not a drawer

**Decision.** Categories and vocabularies are columns of the panel, bordered on
the edge they share with the sheet — the mirror of the stage plot's palette
(`design/patterns.md` §4). Category *management* is a drawer.

The distinction is what the thing is *for*:

- **A filter must be entirely visible.** Twelve categories currently show about
  four, because each tile carries a rename, a delete, a picker-role select and a
  count stacked in its corner. A filter you have to scroll to use is not doing its
  job, and the fix is to take everything that is not filtering out of it.
- **A category is declared once and referenced by every item**, which is the drawer
  rule stated exactly. So renaming, retyping, deleting and picker-role assignment
  go in a drawer, and the rail is left doing one thing.

**Rejected: categories in a drawer entirely.** You cross-reference the filter
against the list constantly; a drawer that must be reopened for every category is
worse than the tiles.

## R3 · Extracting the rail before its second caller

`ui/PanelRail` is written in Phase 2 and used in Phases 3 and 5. That is a
deliberate exception to Principle V, and it is only defensible because **both
callers land in this wave, two phases apart**.

The mitigation is written into the plan: if Phase 5 wants a different shape, the
rail is inlined back into Phase 3 and the component deleted, rather than growing a
prop to cover both. An abstraction with one real caller and one contorted one is
worse than two columns.

## R4 · DMX modes move from a dialog into the editor

**Decision.** `RowEditor`'s `notice` slot, which Wave 3 added for Lighting's
address prompt.

A mode belongs to an item. Opening a dialog *from a row* to edit part of that row
is the pattern this whole convergence has been removing — it is the same shape as
Lighting's two fixture dialogs, and Slice 27 deleted those.

The sheet also gains a `Modes` column, so which items carry modes is visible
without opening anything. Today finding out costs one click per item.

**The notice is a list, not a field**, which is what the slot is for: a full-width
block inside the editor's own flex flow, so it cannot land on top of a field at
some window width.

## R5 · Import becomes a drawer

**Decision.** File picker, blank template, format note and last result, in one
drawer.

Import is the one operation on the page with something to *explain*: the server
detects whether a file is an LL price list or a generic list, and today that
explanation is a `title` tooltip on the button. The result is a bare green
paragraph above the layout that shifts everything down when it appears, and the
error is a second one below it.

A drawer holds all four, explains the formats before you pick a file, and stops
the page from jumping.

## R6 · The dashboard's hero border

**Decision.** `border-amber-500/55` — `NODE_BORDER_DESK`, the canvas's own mark
for *the box every other box is arranged around*.

On the flow canvas that is the desk. On this page it is the next show, and the
claim is the same, so the mark is the same rather than a new one. P4 is satisfied
because the words *Next show* sit above it: the border is never the only carrier.

## R7 · Where the pulse goes, and where it does not

**Decision.** On the dashboard hero's ribbon runs, staggered. Nowhere else.

`design/tokens.md` §6 permits exactly two animations and names the second:
*"the one signal-flow pulse (`.pp-pulse-dot`), which is already wrapped in
`@media (prefers-reduced-motion: no-preference)`. Any new animation gets the same
wrapper."*

That pulse exists today only on the signed-out start page. Bringing it to the
signed-in landing page is the same animation in the same wrapper — the language's
own allowance, spent on the one page nobody works on. Wave 4's Overview ribbon
deliberately has none, because Overview is inside the event and a tool that
animates while a technician is counting channels is in the way.

The implementation is a horizontal keyframe on a run's `::after`, not `offset-path`
as the start page uses, because a run here is a straight 2 px div rather than an
SVG path. Same visual claim, appropriate mechanism.

## R8 · Dated rows instead of cards

**Decision.** The dashboard's event lists are rows on a rule, with the date in
`font-mono tabular-nums` as the left column.

"Less card-y" is the instruction, and the reason a dated list is better here than
a grid of boxes is that the date is what you are scanning for. Mono figures in a
fixed column make that a column you can run your eye down; a card grid makes it
twelve places to look.

Past events keep their own block, dimmed, because finding last year's file for the
same festival is a real reason to open this page and is currently impossible
without scrolling a grid of identical boxes.

**Events keeps its card grid**, and that is not inconsistent: P1 exempts a list of
independent objects by name, and on the Events page the object *is* the subject.
On the dashboard the subject is *when*.

## R9 · The start page, exempted

**Decision.** Recorded in `design/audit.md` and `design/principles.md`. One radius
corrected; nothing else.

P2 currently lists "the start page" among the navigation surfaces, which settles
its *density* and has been read as claiming it is inside the language. It is not:
`rounded-2xl` cards, two radial-gradient grounds, a 44 px mono display heading and
an animated patch bay are a different brief. A landing page must be memorable to
someone who has never seen the product; the application must disappear behind the
patch.

The alternative — flatten it to the ladder — would make the audit's grep come out
clean at the cost of the only page whose job is to be memorable.

**One thread runs the other way**, and it is worth recording: the start page owns
the `pp-pulse-dot` animation the language sanctions by name, and R7 brings it
inside. Exempting a surface from the language does not mean nothing may come out
of it.

## R10 · `Button`'s classes, exported

**Decision.** `buttonClasses({ variant, size })` exported from `ui/Button`, used by
Login's sign-in anchor.

Login's control is an `<a>` — it navigates to an OAuth URL — so it cannot be a
`<button>`, and today it carries the primary button's classes **retyped**. That is
P3's failure mode exactly: a shared style copied instead of imported is how the
micro-label ended up with four definitions and two sizes.

**Rejected: an `as` prop on `Button`.** Polymorphic components are a large typing
change to a component seven surfaces use, for one caller. Exporting the class
function is three lines.

## R11 · Order of work

**Decision.** Usage count → rail → inventories → owned gear → vocabularies →
dashboard → small ones → docs.

The count first because the vocabulary panel renders it and nothing else depends on
it. The rail second because two phases consume it. Inventories before vocabularies
because it is the harder of the two rail callers, so if the abstraction is wrong,
it is wrong early. The dashboard late because it consumes Wave 4's `eventSummary`
and nothing in this wave.
