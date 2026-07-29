# 05 · Audit

Where the application stands against [principles.md](principles.md) today, and the
order to converge it in.

A-counts are from `frontend/src` at the merge of Slices 23–26 (`aa4baef`);
M-counts, which are the phone's, are at `bfb62a2`. Every one is reproducible with
the command given, so this document can be re-run rather than believed. A finding
closed by a wave moves to Part 1b with the wave that closed it; the counts on the
findings still open will move as the waves land.

---

## Part 1 — Findings

**Every finding is closed** — the desktop's twelve and the phone's twelve, each in
Part 1b with the wave that closed it. **Part 1 is empty**, and this is the first time
that has been true since the document was written.

The phone's twelve went in four phases: M7, M8, M10 and M12 by Wave 6a (Slice 33);
M1, M2 and M3 by Wave 6b (Slice 34); M4, M5, M9 and M11 by Wave 6c (Slice 35); and
**M6 by Wave 6d (Slice 36)**, which is the only phase that built a capability rather
than converting one.

A finding closing is not the same as a surface being finished, and the honest note is
this: what these documents now describe is what the tree contains. What they cannot
describe is what a hand finds. Every phase of Wave 6 has ended with a field test, and
three of the four found something the document had asserted and nobody had checked —
a sum that was never built, an inset that had always been zero, a rail nobody counted.

The wave's shape was one finding wearing twelve names, and the name is a date:
`components/mobile/` was built in **Slice 21**, two slices before the language
existed. Waves 0–5 then converged nine tabs and five pages around it without touching
it — Wave 4 says so in writing (*"the phone branches, the print sheets and the whole
backend are untouched"*), and that was the right call at the time, because a wave that
mixes a refactor with a redesign makes a regression unattributable.

M-counts were from `frontend/src` at `bfb62a2` and reproduce the same way the A-counts
do. The branch count is the one number that **rose** across the wave, and that is the
right direction: a phone branch is a composition the phone needed and did not have.

```
grep -rn "if (isMobile)\|isMobile ?" --include='*.tsx' frontend/src | wc -l
#  41       (was 13 at bfb62a2, before 6b)
```

**And one of this document's own greps stopped working, which is worth recording rather
than quietly replacing.** §7g's rule is *"`!isMobile` never appears in a permission
expression"*, and the check for it was `grep -rn "!isMobile"` returning nothing. Wave 6d
made that grep return four hits, none of them a permission: two name the withheld
gesture (`const spatial = !isMobile`) and two say *only on a phone, scroll the selection
clear of the sheet*. The rule is intact; the proxy for it is not.

That is A12's lesson from a third direction — a grep that matches a **token** finds
instances, not the reason there are instances. The check that means what the rule means
is whether a reach term ever shares an expression with a role term:

```
grep -rn "isMobile" --include='*.tsx' --include='*.ts' frontend/src | grep -c "readOnly"
#  0        a reach check is never a permission (P9, §7g)
```

## Part 1b — Closed

### M6 · The Flow canvas is in the hand · Wave 6d

The rule this document and [patterns.md](patterns.md) §7 both carried — *"a patch graph
on a phone is unreadable at any density"* — is **reversed**, on the report that the
picture of where the signal goes is exactly what is wanted on site. Both canvases mount;
only the editing gesture is withheld.

**The finding underneath it was a line neither document had looked at.** Both canvases
compute their logical space as `panelWidth / zoom`, so zooming *out* on a desk **grows
the coordinate space** — the processing lane gets more logical room inside the same
panel, which its own comment says is the point. In a hand that is not merely unhelpful,
it is backwards: the panel is 341 px, so at the scale where the whole graph fits, the
space would become ~1950 and the desk lane would slide out past `x = 1730`. **Zooming
out to see the whole graph would push the graph away as fast as you zoomed.** §7f had
described the phone's behaviour correctly for four waves — *"pan and zoom move the
window onto it and move nothing within it"* — without anyone noticing the code said the
opposite. It says both now, one per surface, in a table.

**And the open question this document deferred to this phase is answered.** It was filed
as a preference — *pan-and-zoom, or fit-to-width?* — and it is arithmetic. 100 % opens
onto the Stage lane with nothing on screen saying a desk exists; fitting the *width*
alone needs a scale below the shared control's floor. The second dimension settles it:
the graph is 640 tall and the canvas region about 300, so at ~42 % it fits **both axes,
whole, once**. Fit is the opening state, pan-and-zoom is the working state, and the one
control whose meaning changes is the readout — 100 % on a desk is where you can read, and
in a hand it is where you are lost.

**Out of that came the design work of the slice, which no finding had named.** On a
341 px window over an 820 px graph the hard thing is not reading a box, it is finding
one. Both canvases already dimmed non-matching nodes rather than hiding them; one call
turns a highlight into a direction, and it is **not guarded on reach**, because a
60-channel graph scrolls on a desk too. One predicate both dims and aims — a second is
how the dimmed set and the window's target come to disagree.

**The withholding is what makes the pan good**, which is the reverse of how §7g reads.
The canvas is handed no gesture handler at all, so one finger is left to the platform's
own scrolling — momentum, both axes, rubber-banding — and pinch is the only thing
written by hand. A phone canvas that implemented its own pan would be worse in a way no
document would have caught.

**Two duplications went with it, and both were the same shape.** `ZoomControl`'s targets
are 28 px, which `tokens.md` §7 amendment 1 forbids in the hand, so 6c hand-built a
second cluster inside `StagePlotTab`; and 6c hand-built a segmented view control there
too. Both are shared components now and both copies are deleted. That is the **fifth**
and **sixth** time in this wave that a branch inside a shared component gave several
surfaces a phone form at once — after `ui/Drawer` (6a), `StatusStrip` (6b),
`VocabularyPanel` and the drawers (6c) — and the lesson has stopped being a surprise:
**the phase that needs a thing twice is the phase that should own it.**

`ui/Sheet`'s `scrim={false}` finally has a caller. It was built in 6a for exactly this
and went four phases unexercised, which is a long time for a branch to go untested.

### M4 · A viewport was used as a permission · Wave 6c

`EquipmentTab`, `RentalTab` and `StagePlotTab` each `&&`-ed the viewport into the role, so
every downstream check read *you may not* when the truth was *nobody built it*. All three
are role-only now, and the phone forms that made necessary exist: an equipment line and a
rental quantity are forms over rows, and `patterns.md` §7g names **exactly one** desk job,
which is neither of them. **Slice 21's FR-012 is superseded**, on the record, because it
was written in the slice that introduced the phone at all — before anything on it could
edit.

**The sharper half was one line**, and it is the one worth remembering:
`MobileEntityList`'s `onClick={readOnly ? undefined : …}` is the same expression six
desktop sheets use and is correct on all six, because a desktop row already shows every
column. On a phone the row is a **truncation**, so it meant a viewer could not read the
patch at all. Rows are tappable for every role now, and the three existing edit sheets
gained a read-only form so the tap lands somewhere. That is why P9 states the reading rule
separately from P7.

Stage Plots keeps its one withheld gesture and now says so in `patterns.md` §7g's own
words, where **Viewer only** used to sit — three words that told an owner they were a
viewer. Placement is withheld by wiring the canvas no handlers; the sentence does not vary
with role, because it is about the surface.

### M5 · The rig can be declared from a phone · Wave 6c

The smallest fix in the wave, and the reason is worth recording: **all three drawers had
had a phone form since 6a and nobody had ever seen it.** `RigDrawer`, `BusesDrawer` and
`UniversesDrawer` are built on `ui/Drawer`, whose phone branch is *inside the component*,
so all three have been bottom sheets at 375 px since Slice 33 — and all three tabs returned
their phone branch before reaching them. The whole of the fix is rendering them and adding
an overflow entry. **No drawer file was edited.**

That is the third time this wave that a phone branch inside a shared component gave several
surfaces a phone form for free — `ui/Drawer` in 6a, `StatusStrip` in 6b, `VocabularyPanel`
in 6c — and it is the argument for putting the branch in the component rather than at the
call site.

Which entries a viewer sees is the **desktop's** existing answer: it passes no `onOpenRig`
for a viewer, so a viewer's overflow is Print alone. The phone does not re-open a role
question; it only stopped answering a reach question as if it were one.

### M9 · Overview and Settings have a phone form · Wave 6c

Both rendered desktop markup at 375 px. **Overview was the design work of the slice**: its
composition is five 26 px figures side by side, a rig drawn as the flow canvas one row
high, and five verdicts on one line — and every part of that is a *read across*, which a
phone has not got. So the three bands were decided separately, by what each one is: a
figure stays a figure (`tokens.md` §7 — *density comes from stacking, never from
shrinking*) in a two-column grid with the countdown spanning; a ribbon stays a drawing and
**pans**; and a verdict becomes a **row**. The last is the one worth arguing for: on a desk
`ReadinessRow` is a convenience because the tab strip is right there, and on a phone the
tab strip is behind a tap, so five 44 px rows that both state the verdict and open the
section are the most useful object on the device.

**Settings was one branch for two surfaces.** It lives inside `VocabularyPanel`, so event
Settings and `/my-defaults` cannot drift — which matters here more than usual, because the
whole point of the personal template is that it looks like the event's copy. The rail
becomes `MobilePicker`, extracted at its second caller.

Overview and Settings are also two of the three surfaces that made 6b revert the shell.

### M11 · A phone prints · Wave 6c

`print:hidden` was doing its job; the bug was that it was the *only* thing in three phone
branches. The print sheet is a **sibling** of the wrapper now, which is exactly the desktop
return's shape. Signal Flow already printed, and was the only one of the four that did —
which is a decent argument that the other three were an oversight rather than a decision.

**Print** joins the bar's overflow on every surface that has a sheet, and the rental
exports with it: §7h's *every phone surface reaches the export it has* is not satisfied by
a sheet reachable only through a browser's share menu.


### M1 · The phone has no frame · Wave 6b

```
grep -rn "PatchPanel\|PanelRail\|StatusRail" frontend/src/components/mobile/ | wc -l
#  0
```

Every phone surface is a bare `space-y-*` stack: a heading row, a search input,
then rows as free-standing `rounded-md border border-zinc-800 bg-zinc-900` cards
on the page ground. That is P1's named violation — *a stack of rounded cards
separated by gaps* — and it is the exact shape Waves 3–5 spent five slices
removing from the desktop. It also puts the row on `bg-zinc-900`, which is the
**Control** role ([tokens.md](tokens.md) §1): the list reads as a column of
inputs.

The fix is [patterns.md](patterns.md) §7b and the `MobilePanel` gap in
[components.md](components.md) §5 — now the only gap in that document, since
Wave 6a built the other one.

### M2 · The row was off both ladders, and the document was worse than the code · Wave 6b

```
grep -rno "text-\[13px\]\|h-9 \|w-9\|py-1\.5" frontend/src/components/mobile/ | wc -l
#  9        (and text-[13px] has 8 uses in the tree, all of them on a phone)
```

`CondensedListRow` is `px-2.5 py-1.5` with a `text-[13px]` title over a
`text-[11px]` subtitle; `MobileEntityList`'s search is `h-9` beside an `h-9 w-9`
add button. None of `13px`, `9`, `py-1.5` is in either tier. They sit between two
values that already mean something, which is how a third ladder starts.

**The document was the bigger problem.** §7 stated that mobile "uses
navigation-surface sizing throughout" and that anything mouse-sized "does not
appear on mobile at all" — while the code shipped a `h-3.5` pencil on every row
and a `MicroLabel` on three phone surfaces. A rule nothing obeys is not a rule,
and this one had been quoted. [tokens.md](tokens.md) §7 now states the ladder and
names these five values as off it, and the micro-label half of the rule is
**corrected rather than enforced** — see M12 in Part 1b, which is the same
mistake read from the other end, and which Wave 6a closed. The five values named
here are still open: they live in `CondensedListRow` and `MobileEntityList`,
which are 6b's.

### M3 · No phone surface stated whether the plan holds · Wave 6b

```
grep -rl "StatusRail" frontend/src/components/event/ | wc -l
#  4 rails: Patch, Lighting, Rental, Equipment — rendered on the phone: 0
```

The strip is the sentence that says *3 gaps* or *over capacity*, and the phone is
where someone is standing in the room the plan describes. The rental tab has a
hand-built total row at `bg-zinc-900` — a strip in intent, in the control colour,
outside the component that already does this four times.

**Closed by Slice 34.** `ui/MobilePanel` is the frame; `CondensedListRow` is a row
rather than a card; the four status rails branch inside themselves and render on the
phone. **All nine phone lists** are in a panel — the three audio/lighting surfaces,
Equipment, the rental order, the events timeline, the dashboard's events, and both
Inventories lists. The rental tab's hand-built total row is deleted: it was a strip in
intent, in the Control role's colour, outside the component that already did this four
times.

**M2's list is one shorter than it was, and the withdrawal is the finding.** Settling
the bar's target size meant multiplying out a row for the first time, and it did not
add up. [tokens.md](tokens.md) §7 stated `px-3 py-2.5`, `text-sm` over `text-xs`, and
"44 px tall" in one table row; at the framework's default line boxes that padding makes
a **56 px** row, which at 375 × 667 costs **two rows of data**. Nothing had ever built
it — the drawn specimen and the shipped code independently reached 44 px, and both
disagreed with the table for five waves.

So `py-1.5` comes **off** the off-ladder list. It was never the defect: it is what makes
44 px with two lines of `leading-tight`, and it is what the corrected rule arrives back
at. The defect was the two type sizes it was holding. The row's line now states a
**height** and lets the padding derive, which is what §7's fixed geometry already does
for the header, the nav and the body's bottom padding — and `CondensedListRow.test.tsx`
asserts it, so the next edit reaching for `py-2.5` trips over a test rather than
shipping.

**And the strip is the control.** The rails' desktop filter buttons are a size below
`xs` for a good reason and a 24 px target for a bad one; on a phone the strip's root
becomes the button, full width at 44 px, filtering to exactly what it just reported.
A strip with nothing to filter to draws no chevron and is not a control — **unless its own
filter is on**, or fixing the last gap would leave the list filtered to nothing with the
control gone. A filter has to outlive the condition it filtered on, and the desktop had
the same latent trap. The desktop
return of all four rails was verified byte-identical by rendering every state before and
after and diffing the markup.

**And one thing the phase tried, reverted, and handed to 6c.** A panel that *fills the
body* — scrolling only its rows, so the bar and the strip stay on screen — is what a
strip is for, and it needs the shell to be a fixed-height column. 6b built that and took
it out again in the same slice: a column makes every child a flex item, and **a flex item
whose root is a scroll container has an automatic minimum size of zero**, so the three
phone surfaces that are not panels yet — `OverviewTab`'s `Card`, and `PatchPanel` as
reached by event Settings and by `/my-defaults`, which is in the bottom nav — were
compressed below their content and clipped, with no scrollbar anywhere. It is 6c's,
because 6c is what makes those three panels.

**Done in 6c**, and the reason it failed once is worth keeping: the rule has *two* halves.
A flex item whose own overflow is `visible` gets an automatic minimum size of its
**content**, so it refuses to shrink and pushes the column past the viewport; one whose
overflow is not `visible` gets **zero**, so it may collapse — and with `hidden` there is no
scrollbar to say so. 6b had the shrinking without the scrolling. The split is by role now:
everything that is not the rows region is `flex-none`, and the rows region is
`flex-1 min-h-0 overflow-y-auto`.

**One thing changed that no finding had named:** `useIsMobile` guards a missing `window`.
Without it, every component that branches on reach is unrenderable by this project's own
test method, which is why `ui/Drawer` has never had a test.

### M8 · The phone's sheet was a centred dialog · Wave 6a

```
grep -rn "<Dialog" frontend/src/components/mobile/ frontend/src/pages/Inventories.tsx | wc -l
#  0        (was 5)
```

`ui/Sheet` exists. `ui/Dialog` gained `Escape` and an internal scroll at the
sheet's own `85svh` — both strict additions, both things `Drawer` already did —
and **stays centred at every width**, because M8 was never *"`Dialog` is the
wrong shape"*. It was *"`Dialog` is being used as the phone's edit form"*, and
that is fixed at the call sites.

`MobileNav`'s inline bottom sheet is the component now. The pattern had existed
in the tree without being one, which is the condition A1 and A3 were both filed
under, and it took a third instance of that exact condition before anyone wrote
it down.

**`ui/Drawer` anchors itself**, which was not the plan and is the part worth
keeping. Six drawers — Rig, Buses, Universes, Categories, Import, the catalog's
manage drawer — acquired a phone form from four lines inside one component,
without one of their own files appearing in the diff. Branching at the call
sites would have asked the same question six times, which is how `NodeShell`,
`PortDot` and `PortRow` each ended up with two copies and cost Slice 25 to undo.

### M12 · The phone's forms spoke a second label voice · Wave 6a

```
grep -rho "<FieldLabel>" frontend/src/components/mobile/ | wc -l
#  0        (was 18)
```

All eighteen are `FieldStack`, which is the label the Rig drawer renders above
the same fields on a desk. §7 amendment 2 is what made it cheap — *type is read,
geometry is touched* — and the geometry needed no work at all: `Input`, `Select`
and `Button` already default to the `h-10` a phone wants. **Only the voice
changed.**

`FieldStack` gained one width, `full`. `grow` could not be reused because its
`flex-1` grows the *height* inside a `flex-col`. One entry in an existing map,
rather than a second component that renders a micro-label above a control —
which would have been A1 and A12 for the third time, a synonym no grep catches.

**A defect fell out of the fix.** `FieldLabel` was used as a *sibling* of its
control in all three sheets, so it labelled nothing; `FieldStack` wraps the
control in its own `<label>`. The phone's forms acquired real label association
as a consequence of a tier correction, which is the argument for tier
corrections in one line.

### M7 · A phone-only vocabulary, in a reserved hue · Wave 6a

```
grep -rn "sky-" frontend/src/components/ frontend/src/pages/
#  0
```

`MobileCapability` and the badge are gone, and nothing replaced them. The three
token violations went with it: the reserved `sky`, the **sixth** micro-label
definition — written as `text-[10px] font-bold uppercase tracking-wide`, a third
synonym neither the A1 nor the A12 grep would have found — and the
`border-amber-500/60` a closed control wore permanently.

The current section is marked by the **sidebar's own 2 px left edge**, in the
open list. That is the one piece of vocabulary the desktop's navigation and the
phone's can genuinely share, and it arrived by deleting an invented one rather
than by inventing another.

The lesson is about the type, not the pixel: the field's own doc comment said
*"informational only; never overrides a user's actual role-based permission."*
**A field whose comment says it may not be believed is a field with no reader.**

### M10 · The body's bottom padding was a guess · Wave 6a

```
grep -rn "pb-20" frontend/src/components/Layout.tsx
#  0
```

`MobileNav` states `h-14`; `Layout` derives `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`
from it; the phone header takes the same `h-14` while the file is open, before
anything positions against it rather than after.

**The finding was worse than filed, and only looking at the keyboard found it.**
`index.html` had no `viewport-fit=cover`, and without it iOS lays the page out
inside the safe area and every `env(safe-area-inset-*)` evaluates to `0`. So the
two insets `MobileNav` had carried since Slice 21 were **inert, on the device
they were written for, from the day they landed** — and `pb-20` was not merely a
guess at a sum, it was a guess at a sum one of whose terms was always zero.

Nothing about that is visible in a desktop browser at 375 px, which is why five
waves of review did not catch it, and it is why fixing the meta tag is what
turned M10 from dormant into urgent: the moment the inset becomes real, `pb-20`
under-clears the nav on exactly the devices the inset exists for. Closing half of
it would have left the live half.

### A6b · The last card list · Slice 32

A6 closed in Wave 5 with two card lists deliberately left standing, under P1's
exception for a list of genuinely independent objects: `Events`, and the
inventory list. Slice 30 spent the first. **Slice 32 spends the second, and P1's
exception now has no instances in the tree.**

```
grep -rn "rounded-xl border border-zinc-700 bg-zinc-850" --include='*.tsx' frontend/src
#  1 hit: ui/Card.tsx, the component itself     (was 2 — the other was a row)
grep -rln "from '.*ui/Card'" frontend/src
#  1 file: OverviewTab, which renders one card, not a list of them
```

The rule stays exactly as written — a list of independent objects *may* be a
grid — and its worked example becomes a closed case rather than a live one. Both
times, nothing was in violation and nothing a grep could find was wrong; both
times the answer came from asking what the surface was *for*. Here it was for
knowing which catalog your shows run on, which the page could not answer at all:
the count existed only inside `DeleteInventory`, to refuse with.

**Two rules came out of the slice rather than into it**, both now in
[patterns.md](patterns.md) §3, and both discovered by drawing a mockup wrong:

1. A drawer's frame is navigation tier and its **contents are the work
   surface's**. Two revisions of the mockup drew `h-10` fields inside a drawer
   before the reference — Rig, Buses, Universes — settled it. Nothing in these
   documents had said it, and P2's list of navigation surfaces names "drawer
   forms", which reads as the opposite.
2. **No section inside a drawer takes a height of its own.** §4's category-rail
   finding was about a rail; the same mistake was one `max-h` away in a drawer.

### A4 · `rounded-lg` is not in the radius ladder · Waves 1–5

```
grep -rho "rounded-\(xl\|lg\|md\)" --include='*.tsx' frontend/src | sort | uniq -c
#  56 rounded-md    0 rounded-lg   14 rounded-xl      (was 54 / 30 / 4)
```

Two textual occurrences remain and **both are inside comments** — `PatchPanel`'s,
describing the three-card layout it replaced, and `StartPage`'s, recording its
exemption. Nothing renders one.

**A4 was never a radius finding**, and that is the thing worth keeping. Seven of
its real uses were the same layout idiom — *a bordered block of fields floating
above a table* — which Waves 4 and 5 **deleted** rather than corrected, when the
row editor replaced it. Four were genuine one-line corrections. The radius was
how a layout habit showed up in a grep.

That is A12's lesson from the other side: a grep that matches a *value* finds
instances, not the reason there are instances.

### A6 · Card stacks · Waves 1–5

Every one converted. `LightingTab` (Wave 3); `OverviewTab`, `EquipmentTab`,
`RentalTab`, `SignalFlowTab` (Wave 4); `Inventories`' detail, `OwnedGearManager`,
`SettingsTab` and `MyDefaults` (Wave 5).

The card **lists** stayed lists, which was always the point of P1's exception:
`Events`, and the inventory list. The dashboard's five cards went entirely — it
was never a list of independent objects, it was one account described five times.

**`Events`' exemption is spent (Slice 30).** It was invoked correctly — a list
of genuinely independent objects is exactly what P1 exempts — and it settled the
*frame* while never asking what the page was *for*. Finding one show among a
hundred is what it is for, and a grid in creation order answers neither *which
is next* nor *where is last year's file for this festival*. The page is now one
panel containing a dated spine ([patterns.md](patterns.md) §4c), and the
inventory list is the only card list left.

The lesson generalises, and it is the mirror of A4's: **a rule that correctly
permits something is not a reason to keep it.** P1's exception says a list of
independent objects *may* be a grid; it never said a grid was the best answer
for one. Nothing in the audit could have caught this, because nothing was in
violation — it took asking what the surface was for.

### A7 · Work-surface data on the navigation-surface table · Waves 3–5

Rental order lines, equipment lines, lighting fixtures, signal chains, inventory
items and owned gear are all `SheetTable` now. The last of them —
`Inventories`, at 308 rows in the sample catalog — was the largest table in the
application by row count and the list the whole rental order derives from.

Zebra striping is gone from every surface a technician scans.

### A9 · Navigation-tier chips inside work surfaces · Waves 0, 4, 5

The duplication half closed in Wave 0 (`lib/vocabularyTint`, read by both tiers).
The sizing half closed as each surface converted: `Pill` in the Rig and Buses
drawers, on Signal Flow's bus chips, on Equipment's source column, on the
inventory and vocabulary sheets.

`Badge` is now used only where it belongs — dialogs, the Events grid, the
dashboard's role marker, and the phone.

### A1 · The micro-label had four definitions and two sizes · Wave 0

One definition, in `ui/Label.tsx`: `MICRO_LABEL` and the `MicroLabel` that renders
it. `SheetHeadCell`, `OutputSheet` and `GearList` import it; `graph/tokens.ts`
re-exports it so canvas code keeps one import for canvas values.

It moved out of `graph/tokens.ts` because it was never a canvas value — four call
sites across three layers were reaching into a canvas-only module for it, which is
the layering inversion `components.md` §5 exists to prevent.

### A2 · Nineteen buttons overrode their own size · Wave 0

`xs: 'h-7 px-2.5 text-xs'` added; 17 of the 19 overrides deleted.

The two that remain are `PatchStatusRail`'s, which are `h-6 px-2 text-[11px]` — a
control *inside* the strip, which has to match the strip's own type and must not
set the height of the bar closing the panel. A fifth `Button` size for two
co-located call sites in one component would be the abstraction, not the fix
(Principle V); they are `xs` plus an explicit delta, with the reason in the code.

### A3 · There was no `Textarea` · Wave 0

`ui/Textarea.tsx`, `sm` / `md` like `Input`, with `min-h` rather than `h` — a note
field is resized by the person writing the note. `OverviewTab` uses it.

### A11 · Fifty-seven inline form labels · Wave 0

`FieldLabel` in `ui/Label.tsx`, beside `MicroLabel` so that picking the wrong tier
takes a deliberate act. All 57 replaced across 10 files.

Not a `tier` prop on `FieldStack`, which was the other option considered:
`FieldStack` also owns column widths that only mean something inside a drawer's
wrapping form row, so a navigation-tier `FieldStack` would carry an API it must
never use.

### A5 · The chrome announced the page three times · Wave 1

Header title `text-2xl` → `text-base`, event name `text-xl` → `text-lg`, the tab
strip's trough gone, sidebar `bg-zinc-900` → `bg-zinc-950`. The loudest type on an
event page was the word "PatchPlanner". Values in [patterns.md](patterns.md) §6.

The header's height is now **stated** as `h-14` rather than emerging from a padding
plus a font size. That was not cosmetic: `StagePlotTab`'s sticky toolbar hard-coded
`top-[73px]`, the number that sum happened to produce, so shrinking the header
would have left the toolbar floating 17 px below where it belongs. A height a child
positions against has to be a value someone chose.

### A10 · A third toolbar idiom · Wave 2

`StagePlotTab` had neither a `PatchPanel` bar nor a `CardHeader`, and its plot
selector sat in a trough — which says *these are alternative views of one thing*,
and sibling plots are not that. The selector is now drawn as the page tabs above it
are, using `ui/Tabs`'s own `Tab`; the toolbar is the panel's bar in §1's order.

The tab is one frame: bar, then palette | canvas | inspector rail as three columns
of the same panel, where it used to be a floating sticky toolbar above three
separate rounded cards with gaps between them.

### A12 · A fifth micro-label the A1 grep never saw · Wave 2

A1 counted definitions matching `tracking-[0.1Ne m]`. Nine more were written as
Tailwind's named `tracking-widest` with `font-semibold` instead of mono — four in
`StagePlotInspector`, two in `StagePlotPalette`, two in `PlotTrussManager`, one in
`StagePlotTab`. All are `MicroLabel` now.

The lesson is about the audit, not the code: a grep that matches a *value* misses
every synonym of it. The check that would have caught this is "how many things
render an uppercase 10 px label", which no grep answers.

### A8 · The lighting fixture table was a form, not a sheet · Wave 3

The largest single gap in the application between the target language and the
code: thirteen columns, twenty-four permanently-live `Input`s and `Select`s, and
no read state at all, so the table could not be scanned. A6 and A7 were true of
the same surface — a `Card` stack, on the navigation tier — and all three are
closed on it together, because they were one problem wearing three names. A6 and
A7 stay open for the surfaces waves 4 and 5 own.

It is now `PatchPanel` → `SheetTable` → `RowEditor` → `LightingStatusRail`, with
nine columns, no control in any closed row, and a `Drawer` for the universes. Row
height went from ~90 px to 25 px.

The counts, before and after, on the surface itself:

| | Was | Now |
|---|---|---|
| Columns | 13 | 9 |
| Live controls in the closed sheet | 24 | 0 |
| Dialogs | 2 | 0 |
| Same-weight buttons in the toolbar | 4 | 1 primary |
| Fixtures visible at 900 px | ~7 | ~28 |

**What made this a slice rather than a restyle** is the thing the audit did not
predict: nothing in the application had ever had an opinion about a rig's DMX
addressing. Auto-assign packed each universe from address 1, so its own output was
always clean and a clash could only ever arrive by hand-editing afterwards —
silently. `lib/dmxMap.ts` and `lib/dmxPlan.ts` are that opinion, as pure functions
with 49 tests and no DOM.

The other surprise was in the opposite direction: **the backend got smaller.**
`AutoAssignDMX` was deleted rather than rewritten, because the browser has to
derive the map anyway and the three operations are that map plus an ordering. Go
kept the guarantee — one transactional endpoint that applies a plan whole or not
at all — and TypeScript kept the arithmetic (`specs/027-lighting-sheet/research.md`
R3).

---

## Part 2 — Convergence order

Six waves. Each is a slice, in the order that maximises what the next one can lean
on. **No wave mixes a refactor with a redesign**, so a visual regression is always
attributable to the wave that caused it — the same reasoning that made Slice 26
rewire the inputs inspector onto the shared rail *before* building the output one.

### Wave 0 · Close the primitive gaps — **done**

A1, A2, A3, A11, and the duplicated half of A9. New: `ui/Label.tsx`,
`ui/Textarea.tsx`, `lib/vocabularyTint.ts`. Gone: `lib/patchTints.ts`.

This wave was planned as "no visual change". It isn't quite, and the honest
accounting matters more than the slogan — a later wave's regression is only
attributable if this list is exact. The whole visible delta is:

| Where | Change |
|---|---|
| Rig/Buses drawer section buttons (10) | `px-2` → `px-2.5`, the bound `xs` value — 1 px per side |
| `StagePlotInspector`'s Add / Cancel (2) | `h-6 px-3` → `h-7 px-2.5`, matching the `h-7` selects directly above them in the same form |
| Drawer micro-labels | `text-[9px]` → `text-[10px]` |
| `ZoomControl` (2) | `text-sm` → `text-xs` on buttons that contain only an icon — nothing renders differently |

Everything else is byte-identical after `twMerge`: `AudioPatchShell`'s three
buttons, `PatchStatusRail`'s two, `SheetHeadCell`, `Badge`, and every one of the
57 labels.

Gates run: `tsc -b`, `eslint`, `vitest` (179 pass), and the class strings compared
by computing `twMerge` on the before and after of each converted button rather than
by reading them — which is what caught the four rows above.

### Wave 1 · Chrome — **done**

A5, and A4 where it touches chrome. Smallest diff, largest perceived change. Every
later wave is now reviewed against a header that has stopped shouting.

Unlike Wave 0 this one *is* a redesign, so the whole point is that it changes what
you see. What it must not do is change any **tab**, and it doesn't — the only files
touched outside `Layout`, `ui/Tabs`, `SectionSwitcher` and `Login` are the two that
had hard-coded the chrome's dimensions:

| | Was | Now | Why it had to move |
|---|---|---|---|
| `StagePlotTab` sticky toolbar | `top-[73px]` | `top-14` | 73 px was the old header's height, written as a literal |
| `StagePlotCanvas` height | `calc(100vh-330px)` | `calc(100vh-295px)` | 35 px less sits above it — header 73→56, tab strip 46→28. Left at 330 the page grows a scrollbar it never had |

Both numbers were derived from the line-heights and paddings Tailwind actually
emits, not from memory — `text-xl` and `text-lg` share a 28 px line box, so the
event heading contributes nothing to the delta despite being a visible change.
Neither could be *measured*: there is no browser in the toolchain, so the stage plot
canvas is the one thing in this wave worth a human glance.

### Wave 2 · Stage plots — **done**

A10, A12, and A4 on this surface. The pattern transferred to a canvas that is
neither a sheet nor a list, and `PatchPanel` itself needed **no change** — but two
things around it did, which is exactly what this wave was ordered early to find:

| Component | Change | Why the third canvas forced it |
|---|---|---|
| `graph/ZoomControl` | optional `onZoomIn`/`onZoomOut`/`onReset` | Stage plots zoom ×1.25 over 0.05–20 and re-centre as they go, because that canvas is a scale drawing: a plotter gets from a whole stage down to one truss clamp. The audio canvases step ±0.1 over 0.5–1.5. Same look, different arithmetic — so the component owns the look and the caller may own the stepping, the same split `Legend` already uses. The audio call sites are untouched. |
| `graph/InspectorRail` | optional `className` | The flow canvases lay their row out `items-start`, so the rail is its own height and the row grows. The stage plot canvas is a fixed fraction of the viewport and stretches the rail, which then has to scroll. Both are right for their canvas. |
| `ui/Tabs` → `Tab` | optional `active`, context now optional | The plot selector means what the page tabs mean, so it should *be* one rather than copy its classes. It cannot use the context because picking a plot also clears the canvas selection. |

The canvas also lost `h-[calc(100vh-295px)]` for `h-[70vh] min-h-[560px]` — the
number Wave 1 had to re-tune, now gone rather than corrected. It was a sum of
chrome heights encoded in a string; the replacement cannot go stale, and it is the
idiom the mobile branch of the same tab already used.

**Not done, deliberately:** the bar is dense — view toggle, zoom, grid, grid size,
two snap toggles, trusses, scale note, print, fullscreen — and wraps to two rows on
a narrow window. Moving the grid and snap settings into the rail would fix that and
is probably right, but it changes where a plotter reaches for a tool mid-draw. That
is a workflow decision, and this wave is a restyle.

### Wave 3 · Lighting — **done**

A6, A7, A8, and its own spec: `specs/027-lighting-sheet/`. The audit called it
"a workflow change, not a restyle", and that turned out to understate it — the
restyle was the smaller half.

| | Change | Why the rig forced it |
|---|---|---|
| `event/RowEditor` | `onDelete` optional; `onEditInFlow`/`editInFlowLabel` → `handoff { label, text, onSelect }`; new `notice` slot | Lighting hands off to the **stage plot**, not to Flow, so a prop named `onEditInFlow` was a lie in the type. The add editor has nothing to delete. The collision prompt needs a full-width block *inside* the editor's flex flow, so it cannot land on a field at some width. |
| everything else in `ui/` | **none** | asserted, not assumed: `git diff --stat -- components/ui components/event/graph` is empty for the whole wave |

`Meter` is the one place the wave wanted a change and did not take it. A universe
with nothing addressed in it must draw no bar (FR-070), and `Meter` withholds
itself only for an undeclared *capacity* — which is a different condition, since a
universe's capacity is always 512. The caller withholds it instead. Changing a
component four tabs share, to express a condition only one of them has, would have
been the abstraction rather than the fix.

**Not done, deliberately:** neither bulk operation can be undone, neither reorders
the rig, and neither can be run on a single universe. All three are listed in the
spec's Out of Scope with the reasoning.

### Wave 4 · The remaining event tabs — **done**

A6, A7 and A4 on `RentalTab`, `EquipmentTab`, `SignalFlowTab` and `OverviewTab`;
spec in `specs/028-event-tabs/`. The audit predicted "the same shape as Wave 3 and
much smaller", which held for three of the four and was wrong about the fourth.

| | Was | Now |
|---|---|---|
| Bordered frames across the four tabs | 5 stacked `Card`s | 3 panels + 1 card |
| Navigation-tier `ui/Table`s | 4 | 0 |
| Permanently-open add forms | 2 | 0 |
| Controls visible in a closed sheet | 2 per manual/owned row | 0 |
| `rounded-lg` | 5 | 0 |
| Facts Overview shows about the event | 7 | 24 |

**`OverviewTab` was the one the audit read wrong.** It was filed as "a form rather
than a sheet, needs the navigation tier applied consistently" — a styling note.
The user's answer to the mockup rejected that framing outright: *editing happens
in a drawer and the tab just shows the information*. That is not a restyle, and it
turned the smallest item in the wave into the largest. The tab is now a numbers
band, the rig drawn as the flow canvas one row high, and every work panel's own
verdict collected in one line.

Two things the wave found rather than planned:

**`RowEditor`'s hand-off had never rendered.** Wave 3 built the `handoff` slot and
`LightingSheet`'s `onOpenPlot` prop, and `LightingTab` never passed it, because
`EventDetail`'s desktop `Tabs` was uncontrolled and no child could reach the
selection. Wave 4 needed the hand-off three times, so `Tabs` gained an optional
controlled mode and the selection moved into `?tab=`. Lighting's *Hang in plot*
button renders for the first time.

**The summary is a derivation, not an endpoint.** The mockup proposed
`GET /events/{id}/summary` and the spec withdrew it: *2 gaps* is a walk over the
cable graph and *addressed* is a partition of identical spans, so a Go copy would
be a second implementation whose failure mode is Overview disagreeing with the
strip on the tab it links to. `lib/eventSummary.ts` calls the owning functions
instead, and 23 tests assert the agreement rather than hoping for it.

`components/ui/` changed in exactly one file, `Tabs.tsx`, and only by addition —
asserted by a diff. The canvases, the audio sheets, `LightingSheet`, Stage Plots,
the phone branches, the print sheets and the whole backend are untouched.

### Wave 5 · Pages and residue — **done**

A4, A6, A7 and A9, on `Inventories`, `OwnedGearManager`, `SettingsTab`,
`MyDefaults`, `Dashboard`, `Events`, `Login` and `StartPage`; spec in
`specs/029-pages-and-residue/`.

The audit called these "mostly already right", and for four of the eight that
held. It was wrong about three, and the third is the one it did not see at all.

| | Was | Now |
|---|---|---|
| `Card`s across the converted surfaces | 27 | 0 |
| Always-open add forms | 5 | 0 |
| Dialogs on the inventory page | 2 | 1 (the phone's filter) |
| Categories visible at once | ~4 of 12 | 12 |
| Inventory items on a 900 px screen | ~9 | ~30 |
| `rounded-lg` in the tree | 12 | 0 (two comments) |

**The inventory catalog was the miss.** It is the largest table in the
application by row count — 308 items in the sample price list, and the list the
entire rental order derives from — and the audit filed the page under "pages,
mostly already right". A6 named "the `Card`-based pages" without noticing that one
of them was a work surface wearing three cards.

**The dashboard was the second.** It was filed as a trim: delete three badges that
repeat their own labels and a card holding one button. The answer to the mockup
went further — *less card-y, and make it exciting, since that is the logged-in
landing page* — and the page lost cards entirely. The next show is drawn at full
size with its rig ribbon and readiness; everything else is a spine of dates.

**Two things came out of the wave rather than into it.**

`ui/PanelRail` was extracted before its second caller existed, which is a
deliberate exception to Principle V, defensible only because both callers landed
in the same wave two phases apart. The rule written into the plan was: if the
second caller needs a different shape, inline it back and delete the component.
It did not.

And the **In use** column is the mirror of a decision Wave 4 made the other way.
Overview's figures were derivations the browser already computes, so no endpoint;
a vocabulary value's usage is a `COUNT` over eight plan tables only the database
can see, and `countReferenceUsage` had guarded deletes since Slice 17. It is
*called*, not copied, so the number shown and the refusal that follows cannot
disagree — asserted directly by a Go test over every seeded value.

**Not done, deliberately:** no sorting or bulk edit on the inventory sheet
(import is the bulk path, which is how 308 items arrive), no rail on the phone,
and the start page is exempt (below).

### Wave 6 · The phone — **done**

M1–M12, and the one surface Waves 0–5 deliberately did not touch. It is ordered
last for the reason it was skipped: every wave before it was changing the thing
the phone would have had to converge *onto*, and converging twice is how a value
ends up with three definitions.

Two primitives come first, because nine surfaces need them and none of the nine
is worth doing twice:

| Phase | What | Why it is first |
|---|---|---|
| 6a | `ui/Sheet`, and `Drawer`'s phone anchoring — **done**, Slice 33 | M8, and **M12, M7 and M10 with it**. Five call sites were waiting on it, and the correct implementation already existed inline in `MobileNav`. |
| 6b | `ui/MobilePanel` — bar, rows, strip — **done**, Slice 34 | M1, M2, M3. The frame had to exist before a surface could be put in it, and the strips it ends with already existed. Nine lists in six files, because the row is shared. |
| 6c | The nine surfaces — **done**, Slice 35 | M4, M5, M9, M11, **and three the document did not have**: a fifth status rail (F1), the bar's overflow specified in 6b and never built (F2), and a constant named after something 6a deleted (F3). It also collects the fixed-height shell 6b built and reverted. |
| 6d | The canvases — **done**, Slice 36 | M6, the last finding in the wave. Ordered last because it is the only phase that is a **new capability** rather than a conversion, and because 6c had to settle what a phone bar and a phone sheet are before a canvas could use both. It also deleted **two** controls 6c had hand-built, for want of a phone form the shared component now has. |

**The wave table above under-assigned the wave**, and it has now done so twice.

In 6a, M8 was the only finding it named; M7, M10 and M12 were listed in Part 1 and
assigned to nothing, while all three lived *inside the six files 6a rewrites*. In 6b
the same shape appeared from the other direction: 6c reads *"the nine surfaces"*, and
those are the nine event **sections** — so the phone lists on **Dashboard, Events and
Inventories** belonged to no phase at all, while holding **four of the seven call
sites of the row 6b rewrote**. Leaving them would have meant a slice that ships two
kinds of row, and the second one is what every new list copies. 6b took them.

Both corrections are recorded here rather than in either phase's spec, because the
mistake was this document's, and it is the same mistake: **a finding with no phase is
a finding nobody has agreed to close** — and neither is a surface that no finding
happens to name.

**And 6c found the third instance of it, which is the sharpest.** This document and
`components.md` §5 both said *four status rails*. There are five:
`SignalFlowStatusRail` hand-built the shell's markup — the same base classes, the same
two tints, its own copy of the deliberately-below-`xs` control — and was missed because
it is the one rail whose surface was **not among 6b's nine lists**. So `M1` was still
standing on exactly one surface four waves after it was filed, on the surface nobody
counted. Joining the shell also closed a latent bug the hand-built version had: it hid
its control the moment the last gap was fixed, leaving a user who had filtered to the
gaps looking at an empty list with no way back — the same trap 6b had already found and
closed on the other four.

Two smaller ones came with it. **The bar's overflow** (§7b) was specified in 6b and never
implemented, because in 6b nothing overflowed; 6c is the phase that needed it, and Audio
Inputs' bar would have carried 350 px of controls in 317. And
**`MOBILE_SECTION_CAPABILITIES`** was still named after the badge 6a deleted — kept
deliberately then, so a rename would not be mixed into a deletion, and renamed now that
the deletion is legible on its own.

**What this wave must not do** is take the desktop with it. Every M finding is
inside `components/mobile/`, a phone branch, or `Layout`'s phone return — with two
exceptions that are shared code and have to be handled as additions, the way Wave
2 handled `ZoomControl` and `InspectorRail`:

- `ui/Dialog` gains `Escape` and internal scroll (M8) — **done**. Both were strict
  additions, and both are things `Drawer` already does. The one visible desktop
  delta in the phase, stated in advance: a dialog taller than `85svh` now scrolls
  instead of overflowing off both ends.
- `graph/InspectorRail`'s contents must be renderable without its `w-60 border-l`
  frame (`components.md` §5). Wave 2 already split this component along exactly
  this seam once, for the stage plot.

**The open question this wave was to answer, and the answer.** It was filed as a
preference — whether a phone canvas wants the desktop's pan-and-zoom or a fit-to-width
default with zoom as the exception — and deferred to 6d on the grounds that nobody had
held a 60-channel patch graph on a phone.

It turned out to be **arithmetic**, and both options were wrong. The graph's logical
space is 820 × 640 and the phone's panel is 341 wide: 100 % opens onto the Stage lane
with nothing on screen saying a desk exists, and fitting the *width* needs a scale
below the shared control's floor. What settles it is the axis the question never
mentioned — the canvas region is about 300 px tall, so at ~42 % the graph fits **both
axes, whole, once**. Fit is the opening state, pan-and-zoom is the working state, and
the reset target is fit rather than 100 %.

**The lesson is about the deferral, not the answer.** A question filed as *needs a
field test* went four phases without anyone multiplying out the two numbers that
decided it — and this is the second time in this wave that has happened
([tokens.md](tokens.md) §7's 56 px row was the first, and Slice 34 found it the same
way). *Some* of it did need a hand: whether the whole graph at 42 % is worth having, or
merely small, is not a number. But that is a much smaller question than the one that was
deferred, and it could have been asked four phases earlier.

---

## Part 2b — What this language does not cover

**The signed-out start page (`pages/StartPage.tsx`) is exempt**, recorded here in
Wave 5 rather than left as a permanently open finding.

It shares the brand mark, the amber accent and the type families with the
application, and nothing else: its `rounded-2xl` cards, radial-gradient grounds,
44 px mono display heading and animated patch bay are a different brief. A landing
page must be memorable to someone who has never seen the product; the application
must disappear behind the patch. One language cannot serve both without one of
them losing.

Converging it would have made this document's greps come out clean at the cost of
the only page whose job is to be memorable.

One thread runs the other way and is worth recording: the start page owns the
`pp-pulse-dot` animation [tokens.md](tokens.md) §6 sanctions by name, and Wave 5
brought it inside, to the signed-in dashboard. **Exempting a surface from the
language does not mean nothing may come out of it.**

## Part 3 — Keeping this true

- A slice that changes a value in [tokens.md](tokens.md) or
  [components.md](components.md) updates the document **in the same commit**. A
  design document that lags the code is worse than none, because it is quoted.
- A slice that closes a finding here strikes it from Part 1 and says which wave it
  was.
- A slice that establishes a *new* value writes it here first, and its own contract
  links back rather than restating it. That is the loop these documents exist to
  close: Slice 25 §7 → Slice 26 §1 → the next one would have been a third link in a
  chain nobody reads to the end.
- **A slice that changes a surface changes its phone form in the same slice**, or
  writes down that it did not and why. This is the rule the M findings exist
  because nobody had: eleven of them are one skipped step repeated across five
  waves, each skip individually correct. The cost of deferring is not the deferred
  work — it is that the deferral stops being visible after the second time.
