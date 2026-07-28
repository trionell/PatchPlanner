# 04 · Patterns

How a whole surface is assembled. [components.md](components.md) says which brick;
this says which building.

---

## 1 · The work panel

The shape every data-dense tab converges on.

```
┌───────────────────────────────────────────────────────────────┐
│ Title   [Sheet|Flow]  [ search… ]  [Rig] [Buses]  ⟵⟶  [Print] [+ Row] │  bar
├───────────────────────────────────────────────────────────────┤
│                                                               │
│   the sheet, or the canvas                                    │  content
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ ● complete   16 channels   SD10   SB1 8/32   14 cables picked  │  strip
└───────────────────────────────────────────────────────────────┘
```

**The bar, left to right.** Title, then view toggle, then search, then the drawers,
then extras (zoom, in Flow), then `flex-1`, then Print, then the one primary
action. Same order on every tab; only the nouns change.

- The **title repeats the tab name above it**, deliberately. It is what anchors a
  panel that now has a top edge of its own.
- The **view toggle is a segmented control** — a trough
  (`inline-flex rounded-md border border-zinc-700 bg-zinc-900 p-0.5`) holding two
  `ghost`/`default` buttons. Page-level tabs get no trough (§6); an in-panel
  toggle does. The trough is what says *these two are alternatives for this panel*.
- The **primary action is last and is the only filled button on the surface.**
- Everything a restricted role cannot do is **absent**, not disabled (P7). The
  caller passes no handler.
- **A tab with no print sheet puts its exports in the Print slot.** The rental
  order is the instance: three `xs outline` buttons, because the PDF export *is*
  its paper. A bar carrying three secondary actions is the exception, not the
  rule, and the reason has to be that the tab's whole output is those files.

**Toggling a view preserves state.** The selected row or node survives the switch,
so Flow opens on the channel you were editing; search stays applied and dims
non-matching nodes rather than hiding them; the chosen view is remembered per tab,
per event. A toggle that resets the selection is the bug this pattern was built to
fix — selection lives in the **tab**, not in the canvas, because a canvas that owns
its selection privately is unmounted while the sheet shows.

**The strip closes the panel from inside**, top border only, and states whether the
plan holds. It belongs to the sheet, not to the panel — the canvas has none.

## 2 · Sheet and editor

A sheet is read, not edited, until a row is clicked.

Clicking a row opens an editor **in a row directly beneath it**, spanning every
column. The row above takes `bg-amber-500/[0.04]` and loses its bottom border, so
the two read as one block. The editor is a `GearForm`: a left amber edge, fields
that wrap, confirm at `ml-auto`, delete kept apart from confirm.

- Nothing in a sheet row is a form control. A cell that is permanently an `<input>`
  turns a scannable list into a form. The lighting fixture table was the last one
  that did this — thirteen columns and twenty-four live controls — and Wave 3
  converted it.
- One row edits at a time.
- **A sheet whose every value is derived has no editor**, and says so by offering
  a destination instead. Signal Flow is the instance: nothing on it is stored, so
  a row click opens the tab where the chain is actually built. That is a
  statement about the data, not a missing feature.
- The editor is the same construction used to **add** a row, which is what makes
  adding and editing look like the same operation.
- Where a row's deeper structure lives on another view, the editor offers a
  hand-off carrying the selection with it: *Edit in Flow →* on the audio sheets,
  *Hang in plot →* on Lighting, whose truss is decided on the stage plot,
  *See on rental order →* and *See on Equipment →* between the two tabs that
  render the same manual line. The prop is `handoff={{ label, text, onSelect }}`
  for that reason — a destination-specific name in the type would be wrong on
  four of the five.
- **A hand-off is a URL.** The event tab lives in `?tab=`, read and written by
  `useEventTab()`, so going somewhere else survives a reload, can be pasted to a
  colleague, and the back button returns. It also carries *only* the tab: finding
  the row once you are there is still yours. Selection inside a destination
  panel is that panel's business.
- Where confirming a value would collide with something already there, the editor
  **asks in place** rather than refusing or silently accepting. Lighting's address
  prompt is the instance: a full-width block in the editor's own amber body
  (`RowEditor`'s `notice` slot), never a dialog, offering the answers that are
  actually available. Which answers appear is itself information — *share address*
  only on an exact match, *make room* unless it would not fit, *place anyway*
  always, because nothing here is ever blocked.

## 3 · Drawer over stacked cards

Anything that is *declared once and referenced often* — the rig, the buses,
vocabularies, settings — belongs in a drawer, not in a card stacked above the
content that references it.

The audio tabs used to render five or six card headers before the channel list.
Now there is one bar and two buttons, and the rig opens **over** the sheet the user
is cross-referencing. The sheet's layout never shifts, and narrowing the window
cannot squeeze the table.

Inside: sections in **signal order**, each full width, each a `DrawerSection` of
`GearCard`s. Never two sections side by side — that is what left the stagebox and
multi fields too narrow to type into.

The footer states what the contents *mean*, not how many there are twice over:
*"Every row here is one line on the rental order · 12 items."*

## 4 · Canvas and inspector

```
┌────────────────────────────────────────┬──────────────┐
│  STAGE      │  RACK      │  DESK       │  OUTPUT    ✕ │
│  ┌───────┐     ┌──────┐     ┌───────┐  │  ┌─────────┐ │
│  │ node  │────▶│ node │────▶│ desk  │  │  │ fields  │ │
│  └───────┘     └──────┘     └───────┘  │  ├─────────┤ │
│                                         │  │ note    │ │
│  lane bands, labels inside them         │  │ legend  │ │
└────────────────────────────────────────┴──────────────┘
```

- **Three lanes**, tinted bands with their labels inside them. A band is the
  marking; there are no dashed lane borders.
- **A node is a box of ports at fixed pitch.** Header, ports, footer. The desk
  wears an amber border because it is the box every other box is arranged around.
- **A run's colour is derived** (P6) and says which channel it reaches or which
  output it carries. Dash pattern is a **separate** encoding — solid is a cable,
  `6 3` is a network hop — so colour and medium never have to share a channel.
- **The rail is a left border, not a card.** It sits beside the canvas, is fixed
  width, and the canvas gives up the space.
- **Two gestures per row:** the label selects, the dot cables. Conflating them is
  why the output rows could be cabled but not inspected.
- **Zoom lives in the panel's bar.** It used to sit in a strip between the bar and
  the canvas, which is what broke the one-frame reading.

### The filter rail, as the fourth

`ui/PanelRail` is the same construction once more: `w-56 shrink-0`, bordered on
the edge it shares with the sheet, scrolling on its own. The inventory catalog
filters by category with it and the vocabulary panel picks a vocabulary with it.

**A filter has to be entirely visible**, which is the whole reason it exists. The
inventory page's categories used to show about four of twenty-seven, because each
tile carried a rename, a delete, a picker-role select and a count stacked in its
corner. Everything that was not filtering moved into a drawer — a category is
*declared once and referenced by every item*, which is §3 stated exactly — and
`PanelRailRow` takes no children and no action slot so it cannot happen again.

**And it gets no height of its own.** `PanelCols` stretches the rail to the
panel; a `max-h` on top of that reproduces the failure by another route, which is
what a leftover `max-h-[70vh]` did to the same twenty-seven categories — cut off
at the fold, in a private scrollbar, on a page with room to spare below. The rail
is as tall as the sheet beside it and scrolls only when its own rows outrun that.
A cap is right only if the panel is pinned to the viewport, and none of them are.

The three columns of a panel, in one sentence: **the palette offers, the rail
filters, the inspector edits.**

### The stage plot, as the third instance

The pattern is not only for sheets and flow graphs. Stage Plots is one `PatchPanel`
whose content is **three columns**: the palette on a `border-r`, the canvas, and the
inspector rail on its `border-l`. The palette is the mirror of the rail — a column of
the panel, bordered on the edge it shares with the canvas, never a card beside it.

Its bar carries a second trough, and that one is correct: Top / Front / Side *are*
alternative views of one thing. Which plot you are looking at is not, so the plot
picker is a row of `Tab`s with no trough (§6).

The canvas is `h-[70vh] min-h-[560px]`. A canvas height is a fraction of the
viewport or a stated constant — never `100vh` minus the sum of the chrome above it,
which is a number that goes stale the first time the chrome changes and did.

## 4b · The summary surface

One tab per event answers *how is this show doing*, and it is neither a sheet nor
a canvas. Overview is the instance, and the shape generalises to any landing
screen over work that lives elsewhere.

```
┌────────────────────────────────────────────────────────────┐
│ Event name                                    [Edit details]│
│ Venue · Saturday 14 August 2026  (in 17 days)              │
├────────────────────────────────────────────────────────────┤
│ │ notes, quoted                                            │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│    18    │  32 / 16 │    64    │   128    │     24190 kr   │  numbers
│ DAYS…    │ CHANNELS │ FIXTURES │ CABLES…  │ RENTAL, EX VAT │
├──────────┴──────────┴──────────┴──────────┴────────────────┤
│ AUDIO    [12 sources]──[2 SB]──[SD10]──[3 dev]──[16 out]   │  ribbon
│ LIGHTING [64 fixtures]──[3 universes]──[4 truss]  ▓▓▓░ 1104│
├────────────────────────────────────────────────────────────┤
│ READY?  audio ●routed  lighting ●addressed  rental ●1 over │  readiness
└────────────────────────────────────────────────────────────┘
```

- **Navigation tier, one frame.** A `Card`, divided by rules rather than by gaps.
  The bands are `bg-zinc-950/60` — the inset role — so they recede into the card
  rather than stacking on it.
- **The numbers band is the one place type gets big.** `font-mono tabular-nums
  text-[26px]`, five figures, each a link to the tab that derives it. It works
  *because* everything else is 10–14 px; it is scale contrast, not decoration. An
  undefined figure is `—`, never `0` (§5, Undeclared).
- **The ribbon is the canvas, one row high.** Real nodes at `rounded-[7px]` with
  `NODE_BORDER`, the console at `NODE_BORDER_DESK`, runs between them. It answers
  *what shape is this show* in the app's own picture of itself rather than
  introducing a chart. A node whose count is zero is omitted, not drawn empty.
- **Readiness is every strip's verdict, gathered.** Same words, same tints, from
  the same derivations — so this is not a second opinion about the plan.
- **Editing is a drawer, and the surface has no form control.** That is what keeps
  it a summary. It also gives P7 for free: a viewer is passed no handler and the
  rest of the screen is identical for them.
- **Nothing animates.** This is a working screen inside the event, and
  [tokens.md](tokens.md) §6 is explicit that a tool which animates while a
  technician is counting is in the way.

## 5 · States

| State | Treatment |
|---|---|
| Loading | `<p className="text-sm text-zinc-400">Loading …</p>` in place of the content. No spinner, no skeleton — queries here resolve locally. |
| Error | `rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300`, inline above the content it concerns. Never a toast; the user needs to see it next to what failed. |
| Empty, actionable | One sentence saying what to do, and the control that does it. *"Your owned-gear catalog is empty — add items on the Inventory page first."* |
| Empty, expected | `—` in `text-zinc-600`. A cell with nothing in it says so; it does not sit blank. |
| Undeclared | Nothing at all. A capacity of 0 means nobody has said yet: it renders `—`, draws no meter, and **must never warn**. This is distinct from empty, and conflating them is how a desk nobody has measured appears to be over capacity. Overview's numbers band draws the same distinction at 26 px: an event with no patch has not got zero channels, it has no patch. |
| Read-only | Controls absent (P7). A banner states the role once — `ReadOnlyBanner` — rather than each control explaining itself. |

## 6 · App chrome

Chrome recedes (P8). Built in Wave 1; the values below are what the code does.

### Sidebar — `components/Layout.tsx`

| Part | Value |
|---|---|
| frame | `fixed inset-y-0 left-0 w-60 border-r border-zinc-800 bg-zinc-950` |
| padding | `px-3 py-5` |
| brand | icon in `rounded-md bg-amber-500/15 p-2`, name `text-sm font-semibold`, tagline `text-xs text-zinc-500` |
| nav item | `flex items-center gap-3 border-l-2 px-3 py-2 text-sm` |
| nav item, active | `border-amber-500 bg-zinc-850 text-amber-400` |

The sidebar is the **same ground as the content**, separated by its rule rather than
by being lighter. It used to be `bg-zinc-900`, which made the navigation the
brightest column on every screen.

The active marker is a **2 px left edge, not a filled pill**. It is the quietest
mark that survives peripheral vision, and it keeps the amber fill meaning "the
primary action" rather than "the page you are on".

### Header

| Part | Value |
|---|---|
| frame | `sticky top-0 z-20 flex h-14 items-center border-b border-zinc-800 bg-zinc-950/95 backdrop-blur px-8` |
| title | `text-base font-semibold text-zinc-100` |
| mobile | `px-4 py-3`, title `text-sm font-semibold` |

The mockup's own bar title is 13 px at an 11 px base — `text-base` is that carried
across. A 24 px page title above a 14 px panel title inverts the hierarchy.

**`h-14` is stated, not emergent**, and that is the point: the height was previously
the sum of a padding and a font size, and `StagePlotTab`'s sticky toolbar hard-coded
the 73 px that sum produced. A height a child positions against has to be a value
someone chose. It is `top-14` at the one call site.

### Event tab strip — `ui/Tabs`

| Part | Value |
|---|---|
| `TabList` | `inline-flex flex-wrap gap-1` — **no trough** |
| `Tab` | `rounded-md px-3 py-1 text-sm transition-colors` |
| active | `bg-amber-500 font-semibold text-zinc-950` |
| inactive | `text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100` |

Losing the trough is the point. Page-level tabs select *what you are looking at*;
the trough belongs to an in-panel toggle selecting *how you are looking at one
thing* (§1). Two controls that looked identical meant those two different things.

`flex-wrap` because there are nine tabs: without the trough there is nothing to
scroll inside, so they wrap.

### Event heading

Between the header and the tab strip, `text-lg font-semibold` with venue and date at
`text-sm text-zinc-400` — one step below the panel it introduces, one step above
nothing.

## 7 · Mobile

The Flow canvas is desktop-only, and that is a decision rather than a limitation: a
patch graph on a phone is unreadable at any density. Mobile keeps the list-and-sheet
editor, a bottom nav (`MobileNav`), and per-entity edit sheets.

Mobile is **not** a third density tier. It uses navigation-surface sizing
throughout — a touch target does not shrink because the data is dense — with
`py-2.5`/`py-3` rows and `h-5 w-5` icons. Anything sized for a mouse
(`h-3.5 w-3.5` icons, 7 px port dots, `text-[10px]` labels) does not appear on
mobile at all.

## 8 · Print

Print sheets (`components/print/`) are a separate visual language and stay that
way: black on white, `9pt` tables, `break-inside: avoid` on rows.

The rules that carry across are the structural ones, not the visual ones. A chain
prints as `ChainText` — the same derivation as `ChainCell`, without the colour
encodings, because colour cannot be relied on from a printer.

App chrome and editing UI are removed with `print:hidden`; the forced black-on-white
rules in `index.css` are `!important` because the elements underneath carry
dark-theme utility classes. Any new print surface follows the same two mechanisms —
`print:hidden` on chrome, `.print-sheet` on the paper.
