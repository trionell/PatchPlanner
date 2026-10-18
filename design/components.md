# 03 · Components

What to reach for. **Every component below exists today, and nothing here is
proposed.** There were two gaps when the phone entered this document; Wave 6a built
`ui/Sheet` and Wave 6b built `ui/MobilePanel`.

The rule that decides between the two columns is P2's question, applied to the
surface — never to the component in isolation. A `Badge` inside a work panel is
wrong even though `Badge` is correct; the work panel's chip is `Pill`.

---

## 1 · The tier pairs

Six concepts have two implementations on purpose. Picking the wrong one is the most
common way a new screen ends up looking like it belongs to a different application.

| Concept | Work surface | Navigation surface |
|---|---|---|
| Frame | `ui/PatchPanel` | `ui/Card` + `CardHeader` / `CardTitle` / `CardContent` / `CardFooter` |
| Table | `ui/SheetTable` | — see below |
| Chip | `Pill` (from `ui/SheetTable`) | `ui/Badge` |
| Label | `MICRO_LABEL` / `MicroLabel` | `FieldLabel` |
| Field | `<Input size="sm">` · `<Select size="sm">` · `<RecordField size="sm">` | `<Input>` · `<Select>` · `<RecordField>` (md) |
| Section heading | `DrawerSection` | `CardTitle` |

Both members of a pair live in one file wherever there are only two of them —
`MicroLabel` and `FieldLabel` are both in `ui/Label.tsx` — so picking the wrong tier
takes a deliberate act rather than an absent-minded import.

**The table pair is not a pair any more — `ui/Table` is deleted** (ROADMAP D4
converted its last caller, Wave 4 having taken the other six). `ui/SheetTable` is
now the application's only table, at either tier, and a navigation-tier one is
made by overriding its padding — which `SheetHeadCell` was already doing for the
catalog list before any of this ([tokens.md](tokens.md) §3).

The row above says *see below* rather than naming a replacement, because there is
nothing to pick between: **a table of records is a work surface.** That is what
five waves of converting them found, and the deleted component is what kept
offering the other answer. If a genuinely navigational table ever turns up — a
short summary of somewhere else to go — it is `SheetTable` with the navigation
tier's padding, not a second component.

`ui/Badge` is untouched and keeps several callers: a role chip on a dashboard card
is a navigation surface and always was.

## 2 · Work-surface components

### `ui/PatchPanel` — the frame

```tsx
<PatchPanel bar={<>…</>}>{content}</PatchPanel>
```

One bordered, once-rounded frame. The bar is
`flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2.5`; the
content gets **no border, padding or radius of its own**.

There is no `status` slot, and that is not an oversight: the strip belongs to the
sheet (the canvas has none), so a slot here would be an unused API.

### `ui/SheetTable` — the sheet

| Export | Value |
|---|---|
| `SheetTable` | `w-full border-collapse` |
| `SheetHead` | `bg-zinc-950/60` |
| `SheetHeadCell` | micro-label, `whitespace-nowrap border-b border-zinc-800 px-2 py-1.5 text-left` |
| `SheetRow` | `border-b border-zinc-800/60`; `striped` → `bg-white/[0.014]`; `open` → `bg-amber-500/[0.04]` and **no bottom border**, so the row and its editor read as one block; otherwise `hover:bg-zinc-800/40` |
| `SheetCell` | `px-2 py-1 align-middle text-xs text-zinc-200` |
| `NumCell` | `SheetCell` + `font-mono tabular-nums text-zinc-400` |
| `TapeBar` | `mr-1.5 inline-block h-3.5 w-[3px] rounded-sm align-middle`, colour or `#3f3f46` |
| `Pill` | `inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium` — caller supplies the tint |
| `PhantomBar` | `h-[3px] w-2 rounded-sm bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.65)]` |

The tape bar sits immediately before the name, not as a shadow on the number cell —
that is where the tape is on the actual channel strip, so it reads as a property of
the channel rather than a decoration of the table.

### `ui/GearList` — the drawer language

Primitives, deliberately not one configurable `<EntityList fields={…}>`: a desk has
four counts and an owned-or-rented item, a multi has a length in metres, a device
has a connector per side. A component general enough for all of it would be harder
to read than the sections it replaced.

| Export | What it is |
|---|---|
| `DrawerSection` | Heading + count + add control on one line, then the list. Always full width; no section is ever placed beside another. |
| `GearCard` | One declared item. `accent` tints it amber — the Consoles section uses it so desks read as the thing the rig hangs off. |
| `GearTop` | Summary line: badge, name, catalog item, actions. **No form control ever appears here** — fields exist only once Edit is pressed. |
| `GearSpecs` / `Spec` | The capacity line, mono, `text-[10px]`. What makes "is this box big enough?" answerable at a glance. |
| `Meter` | `h-[3px]`, amber, `red-400` past 100 %. Draws **nothing** when capacity is 0 — an undeclared count must never appear full or empty. |
| `GearForm` | Add and edit are one construction, which is what makes them look like the same operation. `border-l-2 border-amber-500 bg-amber-500/[0.04]`, fields wrap. |
| `FieldStack` | Label above control — a `MicroLabel`, and a real `<label>` wrapping the control. Widths `default` `w-40` · `grow` · `count` `w-20` · `short` `w-28` · `full` `w-full`. Never a fixed column track — that is what compressed these into unusability in the first place. `full` is the phone's, added in Wave 6a: `grow`'s `flex-1` grows the *height* inside the `flex-col` a bottom sheet stacks its fields in. |
| `FormActions` | `ml-auto`: confirm, and a labelled delete kept apart from it. |

**A derived count is a `Spec`, never a field** (Slice 47, B3). When a count can be
read from something already declared — a desk's model — the card shows it as a
`Spec` and the form shows it in a read-only block naming its source (*from M32R*). A
count is a `FieldStack width="count"` only where nothing declares it: a Generic
desk. The Consoles section is the first instance; a stagebox model would be the
second.

### `event/graph/` — the canvas

| Export | Notes |
|---|---|
| `tokens.ts` | `NODE_*`, `PORT_ROW*`, `PHANTOM_BAR*`, `TAPE_NEUTRAL`, `SOURCE_ROW*`, and `MICRO_LABEL` re-exported from `ui/Label`. The one import for canvas values. `LANE_LABEL` and `LANE_BAND_*` went with the bands in Slice 37. |
| `NodeShell` | Absolutely positioned; `title`, `badge`, `footer`, `footerAlarm`, `dimmed`, `selected`, `desk`, drag/select/delete handlers. Border: `zinc-700` → `amber-500/55` if desk → `amber-500 + ring-2 ring-amber-500/30` if selected. |
| `PortDot` | 7 px paint inside a larger transparent button. Hollow → patched (`amber-500`) → coloured (the derived colour at 75 %) → selected (solid + `ring-2 ring-amber-500/40`). |
| `PortRow` / `SplitPortRow` | Fixed `18px`. `align="right"` reverses. A pass-through box is **one row per jack** with its two ports on opposite edges — never two independent columns that line up by luck. Optional `selected`/`onSelect` makes the label selectable while the dot still cables. |
| `PortWiring` | The seam that keeps these primitives domain-free: `isConnected`, `isPending`, `colorOf`, `keyOf`, and the handlers. Nothing in `graph/` knows what audio is. |
| `ZoomControl` | Two `h-7 w-7` ghost buttons around a mono percentage that resets on click — and **three `h-11` targets in a hand**, from a branch inside the component. Lives **in the panel's bar**, never in a strip between bar and canvas. Owns the look; the caller may own the stepping via `onZoomIn`/`onZoomOut`/`onReset` — three canvases draw it and only two agree on what a step is. `resetLabel` names what tapping the percentage does, **phone only** — the desktop return has no caption slot, so passing it there is inert. Since Slice 37 the flow canvases reset to *fit* at **both** reaches, because a plane can be wider than a desk's window too. Wave 6c hand-built a second cluster inside `StagePlotTab` for want of a 44 px form; 6d put the branch here and deleted it. |
| `InspectorFrame` | The rail on a desk, `ui/Sheet` with `scrim={false}` in a hand — see §3. |
| `lib/canvasPlane` | The plane's arithmetic: `planeOrigin`, `originShift`, `panToScroll`, `scrollToPan`. Pure, because both canvases share it and the origin compensation is the one thing in Slice 37 that is easy to get wrong and invisible in a render test. |
| `usePlaneView` | Opens a canvas where it was last left and remembers where that is, device-local per event and per surface. One hook, not one per canvas: restoring takes **four** steps — wait for the graph's own data, ask the tab for the scale, wait for the plane to have a size, then set the offset — and each has to check the previous happened. The first is the one that was costing users their view: neither tab gates its canvas on the query, and the constant pseudo-nodes give the plane a real but tiny extent while one is in flight, so a restore against it is clamped and the debounced save writes the clamped offset back. |
| `InspectorRail` | See §3. |

**A rail does not scroll inside itself.** The Sources rail was capped at
`max-h-[420px] overflow-y-auto`, with a counter bumped on scroll to re-attach the
cables landing on it. On a plane that is a second viewport nested inside the first —
the finger that meant to pan scrolls the rail instead — so Slice 37 removed the cap
and the counter with it. The rail stays *consolidated* (one node listing every source,
not a card each: 32 cards is ~1,700 px of lane); what went is the cap, not the rail.

**Ports are never truncated.** The mockup ends a long list with `⋯ N more`; the
reporter overruled it. A planner has to see every jack, so boxes grow and the
canvas scrolls. `MoreRow` and `visiblePorts` were deleted rather than left unused.

### `event/ChainCell` — a signal chain

`flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-zinc-300`.

| Part | Value |
|---|---|
| arrow | `→` as text, `text-zinc-600` |
| hop, clickable | `border-b border-dotted border-zinc-600`, hover `text-zinc-100 border-zinc-400` |
| hop, through the desk's own socket | `text-amber-300 border-b border-dotted border-amber-500/50` |
| hop, missing | `text-red-400`, no underline — nothing to click |
| tail | `text-zinc-500`, no underline |
| hidden count | `⋯N` at `text-[10px] text-zinc-500` |

The amber is not decoration. A hop through the desk's own socket is the one hop on
a chain that is **not** a billable cable; `patchSheet` already marks it
`kind: 'desk'`.

### `event/PatchStatusRail` — the strip

Closes the panel from inside, top border only, `px-3 py-2 text-[11px]`. Three
states in order of how much attention they need: over capacity, gaps, complete.
Tints per [tokens.md](tokens.md) §5.

Over capacity is only reachable once an event declares a console — until then the
tool has never been told how big the desk is, and inventing a capacity would be
worse than saying nothing.

## 3 · `graph/InspectorRail` — the rail both canvases use

| Export | Value |
|---|---|
| `InspectorRail` | `<aside>` · `flex w-60 shrink-0 flex-col gap-2.5 border-l border-zinc-800 p-2.5` — a left border, not a card floating on the canvas. Takes `className` for the one thing that legitimately differs: a canvas laid out `items-start` lets the rail set the row's height, a canvas with a fixed height stretches it and needs `overflow-y-auto` |
| `InspectorHeader` | `flex items-center gap-1.5`: micro-label, a `pill` slot, close `X` at `h-3.5 w-3.5`, `ml-auto`, `aria-label="Close inspector"` |
| `Field` | `<label>` · `grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2` — label **beside** the control |
| `Note` | `flex flex-col gap-1 rounded-[5px] border border-zinc-800 bg-zinc-950/60 p-1.5`, for things read rather than edited |
| `Legend` | A `Note` whose rows are a `22×4` SVG stroke sample plus the caller's wording |
| `InspectorFrame` | What *holds* the rail: `InspectorRail` + `InspectorHeader` on a desk, `ui/Sheet` with `scrim={false}` in a hand. Takes `heading`, `pill` and `onClose` — the three things the sheet's own header carries |
| `useInspectorControlSize` | `'sm'` on a desk, `'md'` in a hand, in `graph/inspectorTier.ts`. The rail is the **one** surface where a phone's control geometry is not already the default: `Input`, `Select` and `Button` all default to `h-10` and the rail overrides them down, because a 240 px column cannot afford 40 px rows. A phone has no column |

`pill` is a slot rather than a string because each side puts something different in
it — a source's kind, an output's type — both tinted by vocabulary the rail knows
nothing about.

The legend owns the **strokes**, the caller owns the **wording**: `cable` solid ·
`network` dashed `6 3` · `unpatched` dashed `4 3` in `#71717a` · `phantom` the red
bar. See P4's worked example in [principles.md](principles.md).

**The rail holds no draft.** The sheet's inline editor does; the rail commits per
field. That is not an inconsistency to fix later — a rail with a draft is a second
source of truth for a row the sheet may also be editing. **It is also why the phone's
inspector has no footer and no Save**: a confirm would imply a draft that does not
exist.

**`InspectorFrame` renders the rail rather than reimplementing it**, so the desktop
return is identical *by construction* — the same two components in the same order.
That is why the phone form is a new component and not a branch inside `InspectorRail`:
the rail has a third caller, `StagePlotTab`, which passes a `className` and supplies no
header at all, and making the header part of the rail would have made it optional there
and turned one component into two shapes. The header moves from a child to a prop
because on a phone those three things — what the rail is showing, its vocabulary chip,
the way out — are exactly what `ui/Sheet`'s own header carries, which this document
said before the frame existed.

## 4 · Shared components

### `ui/Button`

```
default      amber-500 fill, zinc-950 text          the primary action, one per surface
secondary    zinc-700 fill
outline      zinc-700 border on zinc-900            toolbar controls, drawer opens
ghost        transparent                            icon actions, view toggles, quiet actions
destructive  red-500 fill                           confirmed deletes only
```

Sizes are `xs` `h-7 px-2.5 text-xs` · `sm` `h-8 px-3` · `md` `h-10 px-4` ·
`lg` `h-11 px-5`. `xs` is the work surface's — panel bars, drawer sections,
inspectors — and every other size is the navigation surface's.

There is deliberately no size below `xs`. `PatchStatusRail`'s two controls are
`h-6 px-2 text-[11px]`, written as an explicit delta on `xs`: a control *inside* a
strip must match the strip's own type and must not set the height of the bar that
closes the panel, and two co-located call sites in one component are not the
scattered-copies problem `xs` was added to end.

### `ui/Input`, `ui/Select`

`sm` `h-8 px-2 text-xs` · `md` `h-10 px-3 text-sm`, on
`rounded-md border-zinc-700 bg-zinc-900 focus:border-amber-500`.

`sm` is opt-in rather than the default, because it is the work-surface tier and the
navigation surfaces legitimately want `md`.

### `ui/RecordField`

`sm` `h-8` · `md` `h-10`, on `ui/Button variant="outline"`'s frame, `justify-between`
with a chevron at the end. It sits in a `FieldStack` beside `Input` and `Select`,
and takes the same two tiers for the same reason.

**It names what it holds rather than holding a value**, which is the whole
difference between it and `Select`. Three states, and they are its entire
contract: empty it **invites**, in the placeholder's muted ink; holding one record
it **names it and its qualifier** — `name · qualifier`, ink then muted; holding
several it **counts them**. It opens whatever overlay the caller passes and never
opens one itself.

It exists because a `Select` option is one string, and one string cannot tell
apart fifteen catalog items all called `Mikrofonkabel` that differ only by a
description. Where the thing being chosen is a **record** rather than a value —
it has a name, a qualifier that disambiguates it, and more facts than a label can
carry — this is the control, and the choosing happens in the overlay where those
facts have room.

**A count, not a list, when it holds several.** Truncating five names into a
160 px field is the original disease with extra steps; the caller states them in
full in the block below it. **And there is no clear control** — a field that names
a record cannot be emptied, only replaced, and the editor it sits in already has a
Cancel.

### `ui/Textarea`

`sm` `min-h-20 px-2 py-1.5 text-xs` · `md` `min-h-32 px-3 py-2 text-sm`, on the same
frame as `Input`. `min-h` rather than `h`: a note field is resized by the person
writing the note.

### `ui/Label`

`MICRO_LABEL` (the class string) and `MicroLabel` (the element) for work surfaces;
`FieldLabel` — `mb-1 block text-sm text-zinc-300`, a real `<label>` — for
navigation surfaces. One file, both tiers, for the reason in §1.

### `ui/Drawer`

Right-anchored overlay. `wide` (`max-w-3xl`, the Rig) · `narrow` (`max-w-md`,
Buses). Backdrop click and `Escape` close it; nothing renders when closed.

An overlay rather than a flex sibling, deliberately: it opens over the sheet the
user is cross-referencing, so the sheet's layout never shifts and narrowing the
window cannot squeeze the table.

Header `px-5 py-4` with a `text-lg` title and an optional subtitle; body
`px-5 py-4` stacking sections with one gap owned by the drawer (`gap-5`), not by
each section's own margin; optional footer `px-5 py-3 text-xs text-zinc-500` — used
to state what the drawer's contents *mean*, e.g. *"Every row here is one line on
the rental order · 12 items"*, in **one line** and no more (see the footer/`info`
rule below); optional `info`, beside the title, for everything longer.

**`flush` drops that padding and that gap, at both widths** — for a body that is
one construction rather than a stack of `DrawerSection`s. Two things need it and
they are the same thing at two reaches: a `PanelCols` whose rail is bordered on
the edge it shares with the sheet ([patterns.md](patterns.md) §4), and the run of
full-bleed rows that rail becomes on a phone (§7c). Both are wrong inset by 20 px,
and both are wrong with 20 px between them. It is `ui/Sheet`'s own prop,
forwarded — unlike `width`, which is deliberately not.

**The test is whether it is worth re-reading — not how long it is.** The two look
interchangeable and are not. A footer states what
the contents *are* — *"Every row here is one line on the rental order · 12
items"* — and is worth a glance every visit. An explanation of what the drawer
*does* is read once and costs its space forever after: on a phone, where the
drawer is a bottom sheet, a two-sentence footer is a fifth of the screen you
cannot put away. That is what `ui/InfoNote` is for, and `info` is where it goes.
Slice 31 filed two such explanations into `footer` and had to be told; the rule
had been stated only from the `InfoNote` end, which is the end you are not
reading when you are writing a drawer.

**Length is not a proxy for it, and this rule used to say it was.** It opened
*"`footer` is a line; anything longer is `info`"*, which is the first thing anyone
reads and is the wrong test — Event details' *"Renaming an event never changes its
patch, its rig or its rental order"* fits on one line and is still read once and
never again, so it is `info` (D5's follow-on, 2026-07-31). Two readers in a row
checked it against the headline, called it compliant and moved on. The remaining
prose footer in the application is Rig's *"Every row here is one line on the rental
order · 12 items"*, which stays a footer for the reason above and not for its
length: it states what the contents are, and it carries a count that changes while
you work.

**A note is remembered under `noteId`, never under the title.** `info` and
`noteId` arrive together — the type requires each of the other — because an
explanation you can put away is one something has to remember, and the name it is
remembered by is the call site's to give: kebab-case, after what the drawer *is*.
A title cannot serve. It is a label: it is chosen for the header, it repeats —
two drawers are called *Pricing*, what a hire costs and what a supplier charges —
and since Slice 32 it is sometimes a record's name. Keyed by the title, the two
*Pricing* drawers shared one remembered choice, so opening the `i` on one made the
other volunteer a sentence nobody asked for; and a drawer titled with a catalog's
name gave every catalog a private copy of one shared explanation, orphaned the
moment it was renamed (ROADMAP D5). The identity is `event-pricing` and
`catalog-pricing`, which is the distinction the two titles never carried.

**An editable number sits at the right edge, with what it means to its left.**
Both because a phone's right edge is where the thumb already is, and because a
drawer that also *states* numbers — the rental order's ledger, whose labels are
left and whose figures are right — otherwise reads in two directions at once.
The field keeps its `MicroLabel` above it; the sentence beside it is the hint,
not the label. Same at both widths: this is one of the few places where the
phone's ergonomics and the desktop's alignment want the same thing, so neither
gets a branch.

**A read-only work surface is not a special case.** It used to be written here as a
third answer beside §`ui/Dialog`'s two, because *an overlay with fields is a
`Sheet`; a sentence and two buttons is a `Dialog`* had no room for a catalog you
are consulting while working on something else. The rule there is now *interrupts
vs accompanies*, and consulting **is** accompanying — so this paragraph is a
sub-case of that clause rather than a ruling of its own, and this section loses a
paragraph instead of gaining one (Slice 38). The instance is unchanged: the event's
read-only browse of someone else's inventory (ROADMAP D4), a `Dialog` for four
slices, which is how it also came to have no phone form.

### `ui/Tabs`

`TabList` `inline-flex flex-wrap gap-1` — no trough, per [patterns.md](patterns.md)
§6. `Tab` takes either a `value` (selected within an enclosing `Tabs`) or an
`active` prop plus its own `onClick`, for a selector that means the same thing but
keeps its choice elsewhere — the stage plot picker, whose choice also clears the
canvas selection.

A selector that means *what you are looking at* uses this component rather than
copying its classes. That is the whole reason `active` exists.

### `ui/Dialog`, `ui/Card`, `ui/Badge`

Navigation-surface components; values in [tokens.md](tokens.md). `Dialog` and
`Drawer` already share their header, padding and close conventions, and should
continue to.

`Dialog` is centred, `max-w-2xl`, and **stays centred at every width**. Wave 6a
gave it `Escape` and an internal scroll at the sheet's own `max-h-[85svh]`, both
things `Drawer` already had, so a tall overlay behaves the same way whichever
anchor it has.

**A `Dialog` may pin a footer** (Slice 47, A1): `footer` renders `flex-none
border-t border-zinc-800` below the body that scrolls, as `ui/Sheet`'s does, so the
action stays on screen however long the body grows — a model switch's preview with
five lines put its button below the fold on a short laptop screen. Callers without
one are unchanged: their buttons stay the body's last child. Its close target is
44 px in a hand ([tokens.md](tokens.md) §7, A2).

The rule, stated once so it stops being decided per call site. **It turns on what
the overlay is _for_, not on what it contains:**

> **A `Dialog` interrupts.** One choice has to be made before what you were doing
> can continue — pick the cable, confirm the delete — so it takes the centre,
> blocks the surface behind it, and leaves as soon as it is answered.
>
> **A `Drawer` accompanies.** It is a companion workspace beside the thing you are
> working on: it opens over the surface without replacing it, and you go on working
> in it rather than answering it.
>
> **A companion does not have to be editable.** A `Drawer` is equally the place to
> *see more* — the detail, the breakdown, the list the surface behind it only
> counts. Consulting is accompanying; it is the same shape with nothing to change.
> **On a phone that is the common case**: the canvas or the row is the work, the
> drawer is where its values are legible, and several are read-only outright.

That sorts every overlay in the application without a second clause.
**`ui/ConfirmDialog` is the purest `Dialog`** — a single choice, and nothing
continues until it is made. **The cable pickers stay `Dialog`s**
(`InputGraphCanvas.tsx`, `AudioOutputsTab.tsx`, and the two *Cable* dialogs beside
them) even though they hold a field: they are one choice raised mid-patch, and
centred is where the pointer already is — a right-anchored drawer would make a
picker travel to the edge of the screen and back for every cable, which is
`Drawer`'s own ergonomic argument read from the other end. **Trusses and the event
access list are `Drawer`s**: nothing is waiting on either.

**Where two pickers sit on either side of the line, the size of what is being
picked from decides it.** The cable pickers offer a vocabulary of eight — it is
*answered*, in one glance, and it is a `Dialog`. The equipment item picker offers
a catalog of 338 across 27 categories, which is *worked in*: you filter it, search
it by name and description, and accumulate several items before confirming. An
overlay you tick five things in is not an interruption by any reading, and the
read-only browse of those exact rows was already a `Drawer` on this reasoning
(ROADMAP D4). The test is unchanged; this only says which side a picker falls on
when it stops being one glance.

**Slice 38 is where both halves were demonstrated at once**, which is why it is the
slice that wrote this down. Its access list *accompanies* — you open it to work in
it, and the surface behind it is untouched — while the removal confirm it raises
*interrupts*, because a member is either removed or not and nothing proceeds until
that is answered. One surface, both answers, and the test tells them apart without
appeal to whether either one holds a field.

**The rule this replaces asked the wrong question.** It read *an overlay with
fields is a `Sheet`; an overlay that is a sentence and two buttons is a `Dialog`*,
which asked what an overlay **contains** — and so misfiled both directions at once:
the cable pickers have fields while being interruptions, and the read-only
companions have none while being workspaces. It also left the fielded case pointing
at `Sheet`, which is the phone's anchor and has no desktop form, so the desktop
shape of a working overlay was never actually named. `EventMembersDialog` and
`PlotTrussManager` both sat in that gap for slices.

[audit.md](audit.md) M8 was never *"`Dialog` is the wrong shape"* — it was
*"`Dialog` is being used as the phone's edit form"*, and six conversions fixed that
at the call sites rather than by making `Dialog` into something else.

The `Escape` handler now lives in `hooks/useEscapeToClose`, shared by `Drawer`,
`Dialog` and `Sheet`. Three callers, in one commit — Principle V forbids
abstracting ahead of a second caller; it does not ask for a third copy.

### `ui/ConfirmDialog`

**The purest `Dialog`**, named: a destructive confirm, in this language rather than
the browser's. It is what §`ui/Dialog`'s rule describes with nothing else attached
— one choice, and nothing continues until it is made. **A `window.confirm` is not a
component**
— the same argument Slice 32 used to remove the application's only
`window.prompt`, and it applies harder on a phone, where the browser's dialog
interrupts the sheet the user is reading.

It is `max-w-md`, not `Dialog`'s `max-w-2xl` (`ChainCell` already narrows the
same way), a `ghost` **Cancel** beside a `destructive` confirm — the one place
that variant is for — and `Escape`, the scrim and the × all cancel, because the
safe answer is the one that costs nothing to repeat.

Cancel is present here and absent from `ui/Sheet`'s footer
([patterns.md](patterns.md) §7d), and the two rules do not conflict: a sheet's
close target abandons an edit you can re-open, while here the two buttons *are*
the question, and a question with one answer is not one.

Three callers — the two flow inspectors, converted together (ROADMAP D2), and
removing someone's access to an event (Slice 38), which had no confirm at all and
fired on one tap of a bare icon. The remaining `window.confirm` call sites are
ROADMAP D6; *convert it when the surface is next opened* is how they were meant to
go, and Slice 38 is that rule working — the surface was opened, so the confirm came
with it.

`Badge` and `Pill` both read their tint from `lib/vocabularyTint.ts`, so the two
sizes of one chip cannot disagree about what colour a `monitor` is. It takes any
vocabulary string and falls back to the neutral style for values it has no entry
for — a user-added output type must render, not crash and not force a new variant.
Never `switch` on the value at the call site.

Every entry in that map is `<hue>-500/15` over `<hue>-300` ([tokens.md](tokens.md)
§5). An entry that departs from the formula is a bug, not a new colour.

## 5 · Phone components — `components/mobile/`

Reached only from inside a `useIsMobile()` branch ([tokens.md](tokens.md) §7).
Everything here is the navigation tier at a 44 px target; nothing here is a third
set of values.

| Export | What it is |
|---|---|
| `MobileNav` | The bottom bar that replaces the sidebar: three destinations and a **More** overflow, which is a `Sheet`. `h-14`, **stated**, because `Layout`'s body padding derives from it. Active is `text-amber-400` with no fill — the sidebar's restraint, which has no left edge to use here. Carries the safe-area inset. |
| `SectionSwitcher` | The phone's tab strip: one control naming the current section, opening a `Sheet` listing the nine. It is the phone's form of `ui/Tabs`, so it says *what you are looking at* and takes no trough (§4, `ui/Tabs`). The current section is marked in the **open list** by the sidebar's own 2 px amber left edge, never on the closed control. It lists sections and nothing else — the capability badge it used to render was deleted in Wave 6a ([audit.md](audit.md) M7). |
| `MobileEntityList` | A `MobilePanel` over `MobileEntityRow` — one component for channels, outputs and fixtures, because all three differ only in what `number`, `subtitle` and `color` mean. It takes the surface's `title` and its `strip`, and derives no verdict and applies no filter: the caller owns both, exactly as its desktop sheet does. **`children` replace the rows**, which is how the audio tabs' Flow view is drawn instead of listed: it is the same set of things either way, so it is one panel and not two — two would remount the bar on every toggle, closing the search row and losing the overflow sheet's state. Its search is **controlled where the surface owns a query** and its own otherwise; both audio tabs already held one for their desktop branch, so lifting it removed a second query for one search rather than adding a prop. |
| `MobileSegmented` | *Which of these two or three am I looking at*, when they all fit: the stage plot's **Top · Front · Side**, the audio tabs' **Sheet │ Flow**. `MobilePicker`'s sibling for the case with few enough answers to show at once, and like it a §7b *changes what you are looking at* — so it stays visible in the bar. Extracted at its second caller, the rule `ui/PanelRail` was made to follow. The selection is amber-filled, which is the second place the accent marks **position** rather than action, legible for `MobileNav`'s reason: two or three slots and nothing else nearby is amber. |
| `CondensedListRow` | One row in a `MobilePanel`: leading tape edge, title, subtitle, trailing slot. Its `accentColor` draws the derived colour as a 3 px edge and a tint at `1a` — the sheet's tape bar in the geometry a phone row has. **`min-h-[44px]` with `leading-tight` is the stated value and the padding derives from it** ([tokens.md](tokens.md) §7); both lines truncate; no border, radius or ground of its own. |
| `MobileChannelEditSheet` · `MobileOutputEditSheet` · `MobileFixtureEditSheet` · `MobileEquipmentEditSheet` · `MobileRentalEditSheet` | The phone's row editor, one per entity, deliberately not one configurable form — the same reasoning as `GearList`. Add and edit are **one** construction in each (§2). A failed save keeps the sheet open with every value intact. Each takes `readOnly`: a role that may not edit still opens the sheet, because a phone row is a truncation and the values are the point of opening it ([audit.md](audit.md) M4). |
| `MobileOverviewPanel` | Overview's phone composition — a two-column figure grid with the countdown spanning, both rig ribbons as horizontally panning drawings, and the five readiness verdicts as 44 px rows that state *and* route. One caller, deliberately: a 120-line phone composition inside a desktop tab is how a phone value gets copied onto a desk. It derives nothing — `lib/eventSummary` computes both halves of every row for the desktop already. |
| `MobilePicker` | *Choose one of N*, on a phone: a control naming the current choice, opening a sheet of 52 px rows with the sidebar's 2 px amber left edge. Every desktop *choose one of N* — a rail, a tab strip, a list down the left — becomes this, because a column is the one thing a 375 px screen has not got. Never in the overflow: choosing changes *what you are looking at*. Two variants, and which one is a question about the surface. **`field`** sits among the bar's targets, capped, where the panel has a name of its own — the plot picker beside *Stage Plots*. **`title`** *is* the panel's name, where the surface genuinely is one of N at a time: the vocabularies have a rail on the desktop and none on a phone, so naming the panel *Vocabularies* and truncating *which one* to 112 px named the wrong thing and hid the useful half. Extracted at its second caller, the rule `ui/PanelRail` was made to follow. |

**A third placement, and it takes `title`** (ROADMAP D4). A picker at the head of a
`flush` `ui/Sheet` body, where a desktop `PanelRail` filters a surface that is *in*
an overlay rather than in a panel: the event's read-only catalog browse is the
instance. It is neither of the two cases above — the sheet's header already names
the inventory, which is `field`'s stated condition, but there is no bar for `field`
to sit among and 112 px would truncate *All categories* to the same nothing the
vocabularies' did. So the rule is by **what is left to name**, which is what both
existing cases were really deciding: the header names the *thing*, the picker names
*which part of it you are looking at*, and that is a name, so it takes the title's
own width.

Its bar is the only geometry this adds, and it is stated once: `sticky top-0`, the
sheet's own `bg-zinc-900`, `px-3`, a `border-b border-zinc-800`, the 44 px picker
and a mono count of the filtered rows pushed to the far end. Sticky because a
filter you have scrolled past is one you have to scroll back to, and a catalog is
308 rows. It is not a `MobilePanel` bar — there is no panel — and it holds a
selector and a count and never an action.

**`ui/MobilePanel`.** The phone's frame — bar, rows, strip — and P1 at 375 px.
Built in Wave 6b, where it replaced nine `space-y-*` stacks of free-standing
bordered cards, which is what made a phone list read as a column of inputs and left
nowhere for a status strip to close ([audit.md](audit.md) M1, M3).

Props: `title` (a node — see `MobilePicker` below), `titleAdornment`, `search` +
`onSearch`, `actions`, **`overflow`**, `primaryAction`, `strip`, `children`.
`titleAdornment` holds one thing belonging to the *name* rather than to the bar — today
an `InfoToggle`, which rides inside the title's own line and so costs no row. **It decides nothing about its rows** — the same refusal that makes
`ui/Sheet` a component rather than a `className`.

**`actions` and `overflow` are the two halves of one rule**, and the split is stated in
[patterns.md](patterns.md) §7b: a control that changes *what you are looking at* stays
visible, and one that *does a thing and is finished* goes behind the `⋯`. They are typed
oppositely on purpose — `actions` is a **node**, because a selector's shape is the
surface's own business; `overflow` is a **typed list**, because the sheet it opens is
always the same run of labelled rows, and six callers each building that sheet is how two
of them end up different. That is `ui/GearList`'s rule applied in both directions.

The two things every phone bar has are props, because at 375 px there is room for a
title and three targets, and that scarcity is what would otherwise tempt nine call
sites into nine compromises. Everything only some surfaces have — Print, the rental
exports, the Inventories category filter, and 6d's `Sheet | Flow` toggle — arrives
through **`actions`**, so the component never grows a prop per surface. That is
`PatchPanel`'s shape with the universal parts carved out, and it is the split that
keeps nine bars in one order while still admitting the six things only one surface
needs.

It **fills the body and scrolls only its rows**, so the bar and the strip are on
screen at every scroll position — true as of Wave 6c, which is also when every phone
surface became a panel or a canvas, the condition that makes it safe. The panel is a
`flex-1 min-h-0` item of its container; its rows region is `flex-1 min-h-0
overflow-y-auto` and everything else in it is `flex-none`
([patterns.md](patterns.md) §7b). The rows region owns no padding and no gap: rows are
separated by a hairline, not by air.

**The five status rails have a phone form, inside themselves.** `PatchStatusRail`,
`LightingStatusRail`, `RentalStatusRail`, `EquipmentStatusRail` and — from Wave 6c —
`SignalFlowStatusRail` each branch on
`useIsMobile()` through the shared `event/StatusStrip` shell — the `ui/Drawer`
precedent, so five surfaces acquired a phone strip without one of them being edited
for it. **It was four until Wave 6c**, in this document and in the code:
`SignalFlowStatusRail` hand-built the same tinted `border-t` div outside the shell,
and was missed because Signal Flow's phone branch was not one of 6b's nine lists
([audit.md](audit.md) F1). What a rail says, how it derives it and which of its states tint are
identical at both widths (P9). What changes is `text-xs` instead of `text-[11px]`,
and that **the strip itself becomes the filter control** — see
[patterns.md](patterns.md) §7b.

**`ui/InfoNote`.** An explanation you can put away — one `i` target closed, the sentence
it always was open, and the choice remembered per note. It exists because two kinds of
prose had accumulated: what a drawer's own actions do (Universes, Buses), and why a
surface withholds a gesture ([patterns.md](patterns.md) §7g). Both are read once and then
cost their space on every visit — on a phone, a fifth of the screen. **Not a tooltip**: a
tooltip has no target on a touch screen, and §7g requires the reason to be readable.
`ui/Drawer` takes it as `info`, beside the title; a panel places it itself.

**`ui/Sheet`.** The bottom sheet, and the phone's sibling of `ui/Drawer`:
anchored to the bottom edge, `rounded-t-xl`, `max-h-[85svh]` with the body
scrolling inside it, `Escape` and backdrop to close, `env(safe-area-inset-bottom)`
under the confirm row. Built in Wave 6a, where it replaced the five `Dialog`s
standing in for it and the one real bottom sheet written inline inside
`MobileNav`'s **More** menu.

Six props and no more — `open`, `onClose`, `title` (a node: the inspector puts a
`MicroLabel` and a `Pill` there), `subtitle`, `children`, `footer`, `scrim`,
`flush`. No `variant`, no `size`, no `onSave`, no field layout.

It does three jobs, and it decides nothing about any of them — which is the reason
it is worth a component rather than a `className` on `Dialog`. **A sheet holds
another pattern's contents at that pattern's own tier**
([patterns.md](patterns.md) §7d), so what goes in keeps its type and gives up only
the geometry a finger has to hit:

- **The row editor** is `RowEditor` / `GearForm`, so it inherits that pattern's
  rules: one row at a time, add and edit one construction, delete kept apart from
  confirm ([patterns.md](patterns.md) §2), a draft confirmed by one **Save**.
- **The drawer** is `DrawerSection` + `GearCard` + `GearSpecs`, unchanged — mono
  micro-label headings, 10 px mono spec lines, `Pill` chips, one filled primary
  among `outline` and `ghost`. The Rig, Buses and Universes drawers are the same
  component tree they are on a desk, at `h-10` instead of `h-8`.
- **The plot inspector** is `StagePlotInspector` unchanged, in a sheet. Its root is
  already a bare `<section>` — the `w-60 border-l` frame belongs to `StagePlotTab` — so it
  needed no split. One optional prop, `spatial`, defaulting `true`: the phone passes
  `false` and the Position, Size, Rotation and Tilt rows are replaced by a note. That is a
  **composition** decision about a 375 px sheet, not a permission and not role-dependent —
  what a phone withholds is the *gesture* of placing something on a scale drawing
  ([patterns.md](patterns.md) §7g), and everything an element *is* stays editable at every
  width.
- **The canvas inspector** is `InspectorRail`'s contents: `Field`, `Note` and
  `Legend` are already width-independent, including `Field`'s
  `grid-cols-[44px_minmax(0,1fr)]` label-beside-control. What does not travel is
  the `w-60 shrink-0 border-l` frame, because a phone has no column to give up. No
  new inspector — a different container for the one that exists, **editing exactly
  what the rail edits and committing per field**.

The one thing `Sheet` does own is the shell: the anchor, the radius, the scrim
(and its one exception), the internal scroll, `Escape`, and the safe-area inset
under whatever the last row is.

**The scrim's exception is structural, not chromatic.** `scrim={false}` renders
**no backdrop element at all**. A transparent full-screen layer would satisfy
§7f's sentence and lose its point: it still swallows every touch, so the canvas
the inspector is read against would be frozen. It follows that such a sheet is
genuinely not modal — `aria-modal` follows `scrim`, focus is not trapped, and
there is no tap-outside-to-close because there is nothing outside to tap.

**And it has a caller now.** `scrim={false}` was built in Wave 6a for the canvas
inspector and had none until Wave 6d, which is a long time for a branch to go
unexercised. What it buys is the thing the sentence promises: with the inspector open
the canvas behind it still pans, because there is no layer to swallow the touch.

**Its first caller found the other half of that.** This document has said *"the
safe-area inset under whatever the last row is"* since 6a, and the code applied it only
in the **footer** branch — so every sheet without a footer put its last control under the
home indicator: the canvas inspector, whose delete sits at the foot of the scrolling body
(§7d), and the bar's own overflow, which is a run of rows and nothing else. The document
was right and the code was not, which is the reverse of the two times this project found
the opposite, and `Sheet.test.tsx` now asserts both branches.

**`ui/Drawer` is `Sheet` on a phone.** The branch is in the component, so all
six drawers — Rig, Buses, Universes, Categories, Import, the catalog's manage
drawer — got a phone form in Wave 6a without one of their files being touched.
`width` is not forwarded: a phone has one width, and a sheet that accepted it
would carry an API it must never use. Six call sites each answering that
question is how `NodeShell` ended up with two copies.

## 6 · Naming

- A component whose job is one canvas's version of a shared thing is prefixed with
  that canvas: `InputFlowInspector`, `OutputFlowInspector`. "The flow inspector"
  and "the output one" misdescribes both.
- Shared primitives live in `components/ui/` (app-wide) or
  `components/event/graph/` (canvas-only). A primitive that two canvases both need
  goes in `graph/`, once — the two canvases each keeping a private copy of
  `NodeShell`, `PortDot` and `PortRow` is exactly how they drifted far enough for a
  field test to tell them apart, and undoing it cost a slice.
- Pure derivations go in `lib/` (`patchSheet.ts`, `outputInspector.ts`,
  `patchCapacity.ts`), not inside components, so they are testable without
  rendering.
