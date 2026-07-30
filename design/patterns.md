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
- **Where one page's tabs each own a panel, their bars match.** Inventories is
  the instance: *Rental catalogs* is a navigation surface and *Owned gear* is a
  work surface, and the tier difference belongs in the **rows**, where it means
  something. The bar is chrome. Two `+` buttons one step apart in the same
  position on sibling tabs read as an accident, because they are one — the
  catalog list's bar is `xs` like its sibling's, above rows that stay `text-sm`.
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

**A drawer's frame is navigation tier; its contents take the tier of the surface
that references them.** The frame is `text-lg` over `px-5 py-4`, and everything
inside it is the work surface's: `DrawerSection` with a `MicroLabel` heading,
`GearCard` at `px-2.5 py-2`, `GearSpecs` at 10 px mono, `Button size="xs"`,
`Input size="sm"`. Rig, Buses, Universes, Categories and the catalog's own
manage drawer are all built this way, and none of `design/` said so until Slice
32's mockup was drawn at the navigation tier twice and rejected twice. The
reason is not aesthetic: what is declared in a drawer is referenced from a
sheet, so it is drawn at the density of the thing that reads it.

**And no section inside a drawer takes a height of its own.** The body is
already `flex-1 overflow-y-auto`; a `max-h` on a section reproduces §4's
category-rail failure by another route — a private scrollbar inside a scrolling
overlay. The manage drawer's *Used on* section lists forty events if there are
forty, and the body scrolls.

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
filters by category with it, the vocabulary panel picks a vocabulary with it, and
the event's read-only browse of someone else's catalog filters by category with it
too — the same rows, the same rail, one of them owned and one of them not, which
is the point (ROADMAP D4).

**A rail inside a `Drawer` is still a rail.** It goes in a `flush` body so it can
be bordered on the edge it shares with the sheet rather than floating 20 px inside
one. **`min-h-full` goes on the `PanelCols`, never on the rail** — the columns are
`items-stretch`, so the rail is already as tall as they are and a `min-h` on it
resolves against a content-height parent and does nothing. On the container it is
what makes that border reach the foot of the drawer when the chosen category holds
four items. Either way the rail is given no height of its own, and the drawer's
body is the one thing that scrolls.

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

## 4c · The spine

A list of dated things, where the date is what you are scanning for. Events is
the instance.

```
┌──────────────────────────────────────────────────────────────┐
│ Events  [Upcoming|Past|All]  [ search… ]        [＋ New event]│  bar
├──────────────────────────────────────────────────────────────┤
│ ‹ 2026 ›  ▁▁▁▂▁▁█▁▂▁▁▁  J F M A M J J A S O N D    15 in 2026 │  year track
├──────────────────────────────────────────────────────────────┤
│  2026                                                        │  year numeral
│   AUG ──────────────────────────────────────────────── 2     │  month
│    14 │● Sommarfest Gävle    Gasklockorna         in 17 d    │
│   FRI │                                                      │
│ TODAY ├──────────────────────────────────────────────────────│  today rule
│ 18–20 ▐ Bruksrock   Avesta   on site 17–21        in 7 wk    │  capsule
│FRI–SUN│                                                      │
├──────────────────────────────────────────────────────────────┤
│ 29 events · 1 running · 9 to come · 18 done      2 clashes    │  strip
└──────────────────────────────────────────────────────────────┘
```

- **The gutter carries every time label; the column carries content.** Day
  number, weekday, month headings and the year all sit in a fixed 84 px column,
  right-aligned. Nothing else does.
- **The year is a 26 px `text-zinc-800` numeral** — big enough to land as you
  scroll past, dark enough that you never read it on purpose. It is the inverse
  of §4b's numbers band: there the big mono figure is the answer, here it is the
  ruler. That is what keeps one page from having two things shouting.
- **The spine is one hairline**, the content column's own `border-l
  border-zinc-800`, with a mark per row sitting on it. A dot on a line is the
  canvas's own grammar; P5 reserves circles for *patchable ports*, which is a
  rule about the canvas, and there are no ports here.
- **Shape carries the span** (P5). One day is a 7 px dot; several days is a
  7 × 24 px capsule at the same x, whose inner fill is the show days inside the
  on-site span. A span must not be a differently-tinted dot, for the same reason
  48 V is a bar.
- **Strictly chronological, oldest first.** Reading down is moving forward. The
  alternative — future above the rule ascending, past below it descending — puts
  the two rows nearest today at opposite ends of the page, and needs a special
  case for an event that is running, which belongs on both sides of the rule.
- **Today cuts across in amber, with the word in the gutter** (P4), and is where
  the page is positioned on arrival — without smooth scrolling, because a list
  that animates into place while you are reading it is in the way.
- **Undated rows go last**, under their own heading, with `—` in the gutter.
  They have not been placed in time, so they sit after it.
- **A row opens beneath itself** into a summary, which is §2 with the editor
  replaced by what §2 already prescribes for a surface whose every value is
  derived: a destination instead. One row at a time.
- **The overview strip above the list is a readout, not a control.** It redraws
  against the search, which is why it is above the rows rather than in the bar.

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
| phone | the same `h-14`, at `px-4`, title `text-sm font-semibold` — §7a |

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

## 7 · The phone

Everything above, at arm's length (P9). The phone is not a section of the
application — it is the application, composed for one hand, and every pattern in
§§1–4c has a form here. Values are in [tokens.md](tokens.md) §7; components in
[components.md](components.md) §5.

The one thing that decides a phone layout is that **a column is not available**.
A sheet's twelve columns, a canvas beside a rail, a drawer over the sheet it is
read against — all three are the same move, laying two things side by side so one
can be read against the other. On a 375 px screen that move is gone, and every
sub-pattern below is what replaces it: stack it, put it behind a tap, or say it
is a desk job.

### 7a · The shell

| Part | Value |
|---|---|
| header | `h-14 flex-none border-b border-zinc-800 bg-zinc-950/95 backdrop-blur px-4`. Not `sticky`: it is a row of a fixed-height column, so it cannot scroll |
| header content | brand mark, page title `text-sm font-semibold`, avatar at `h-7 w-7` |
| body | `px-4 py-4`, `flex-1 min-h-0`. **The panel scrolls**, not the page — see §7b |
| bottom nav | `h-14 flex-none border-t border-zinc-800 bg-zinc-950`, plus the safe inset. A **sibling in the column**, not an overlay, so the body reserves nothing for it |

The sidebar has no phone form and needs none: it is four destinations, and four
destinations are a bottom bar. What it keeps is P8 — the nav is on the **same
ground as the content**, marked by its rule, and the active item is
`text-amber-400` with no fill. The desktop's 2 px left edge has no bottom-bar
equivalent, so the colour carries it alone; this is the one place the accent marks
position rather than action, and it is legible only because the bar holds four
slots and nothing else on the phone is amber except a primary button.

**`More` is an overflow, not a menu.** Three of the four slots are destinations
because three labelled 44 px targets fit across 375 px; the fourth takes the rest —
My Defaults, and sign-out, which the desktop keeps in the header. Which items land
there is a consequence of the count, not a judgement about them, and a fifth
destination would change the arithmetic rather than join the sheet.

### 7b · The panel, at 375 px

P1 does not have a width condition. A phone surface is one bordered thing:

```
┌─────────────────────────────┐
│ Audio Inputs      [🔍] [＋] │  bar — wraps to two rows before it scrolls
├─────────────────────────────┤
│▎12  Kick In              ✎  │
│     Beta 91A · SB1 in 12    │  rows, 44 px, in the frame
│▎13  Snare Top            ✎  │
│     e906 · SB1 in 13        │
├─────────────────────────────┤
│ ● 3 gaps · 16 ch · SD10     │  strip — the same verdict as the desk
└─────────────────────────────┘
```

- **The bar keeps §1's order** — title, `flex-1`, the surface's own selector, search, the
  overflow, primary action — and wraps rather than scrolls. Every control in it is 44 px
  ([tokens.md](tokens.md) §7).

- **The bar has 317 px**, and that number decides the rest: 375, less the body's `px-4` on
  both sides, less the panel's two borders, less the bar's own `px-3`. A title and three
  targets is 246 px; a title and five is 350.

- **So the bar has an overflow, and what goes in it is a rule rather than a judgement.**
  Specified here in Wave 6b, built in 6c, when five surfaces acquired controls at once:

  > A control that changes **what you are looking at** stays in the bar.
  > A control that **does a thing and is finished** goes in the overflow.

  It is not a size test, so it cannot drift when a title changes, and it settles all nine
  surfaces without any of them measuring anything. Visible: a category, a vocabulary, a
  plot, a view, 6d's `Sheet │ Flow`. In the overflow: Open Rig, Buses, Universes, Print,
  the three rental exports.

  The overflow is a `⋯` opening a sheet of 52 px labelled rows — `SectionSwitcher`'s shape,
  because the phone has one list-of-destinations idiom and it already had one. **One action
  does not earn a menu**: an overflow holding exactly one control renders as that control's
  own 44 px target, so Signal Flow's Print is one tap and Audio Inputs' three are two. The
  panel decides that, never a caller. An action a role may not perform is **absent**, and
  which those are is the desktop's existing answer, not a new one.
- **Search is a target, not a field.** It opens the bar's second row, which is what
  *wraps to two rows* means. A field that is always open costs 44 px on every screen to
  serve something done on some of them, and it is what leaves a 375 px bar with room for
  nothing else. Opening focuses the field; `Escape`, the clear control, or an emptied
  field closes the row and clears the query — **a closed row and a non-empty query must
  not coexist**, or the list is filtered by something the user cannot see.
- **A search box that filters nothing is absent**, as on the desktop.
- **The strip is not optional here.** It is the only thing on the phone that says
  whether the plan holds, and the phone is where someone is standing in the room
  the plan describes. A surface that has a strip on the desk has one in the hand.
- **And on a phone the strip is the control.** The desktop's filter button is a size
  below `xs` for a good reason — a control inside a strip must not set the height of the
  bar closing the panel — and that makes it a 24 px target in the hand, where giving it
  44 would double the height of the one element on the one surface where height is rows.
  So the strip's root *becomes* the button: full width, 44 px, at the bottom edge the
  thumb is already on, filtering to exactly what it just reported. The sentence and the
  control are the same object. A strip with nothing to filter to — *complete*,
  *addressed*, *all covered* — draws no chevron and is not a control; neither is one
  whose caller passed no handler, which is how a read-only role already sees every one
  of them.
- **The panel scrolls, not the page.** The shell is one fixed-height column (`100svh`,
  `svh` and not `dvh`), the panel fills the body, and **only its rows region moves** — so
  the bar and the strip are on screen at every scroll position, which is what a strip is
  for on the device where someone is standing in the room the plan describes.

  Wave 6b built this and reverted it in the same slice, having got one half of the rule.
  It has two, and they pull in opposite directions:

  | The flex item's own `overflow` | Automatic minimum size | What goes wrong |
  |---|---|---|
  | `visible` | its **content** | refuses to shrink, pushes the column past the viewport |
  | `hidden` · `auto` · `scroll` | **`0`** | may collapse below its content — and with `hidden`, no scrollbar reveals it |

  6b hit the second: `Card` and `PatchPanel` both carry `overflow-hidden`, so the three
  surfaces that were not panels — Overview, event Settings and *My Defaults* — collapsed
  silently. So the split is by **role**, not by element:

  - everything that is not the rows region is **`flex-none`** — header, switcher, bar,
    strip, nav;
  - the rows region is **`flex-1 min-h-0 overflow-y-auto`**: `min-h-0` so it may shrink,
    `overflow-y-auto` and never `hidden` so what does not fit stays reachable. That
    pairing is what was missing.

  **Every signed-in phone surface is a panel or a canvas**, which is what makes this
  safe; a surface that is neither is a surface that will collapse.

### 7c · The row

A sheet row's columns become a title and a subtitle, ranked. Nothing shrinks
([tokens.md](tokens.md) §7).

**A row is 44 px, and that is the stated value** — `min-h-[44px]` with `leading-tight`,
the padding derived. It is not a card: no border, no radius, no ground of its own, and a
hairline rather than a gap to the next one. That is what makes eight of them read as one
list rather than eight objects, and it is also what pays for the type: the card's own
2 px of border and 4 px of gap are the difference between a 48 px pitch at 13/11 and a
45 px pitch at 14/12. **Both lines truncate** — a row that grows to fit its content
breaks the pitch the list is read at, which is the one thing a fixed row height is for.

> **One stated exception, and it is a constraint rather than a licence.** The signal
> chain wraps, because on Signal Flow the chain **is** the content rather than a summary
> of it, and `Beta 91A → SB1 in 1 → Mu…` has lost the answer to the only question that
> surface is ever asked. The reason is the test: a subtitle that *summarises* a row still
> truncates. Wave 6c, and it is the only row in the application that grows.

| | Carries |
|---|---|
| leading edge | the derived colour, as `border-l-[3px]` and a `1a` tint — the tape bar's data in the row's own geometry |
| title | the number in mono amber, then the name |
| subtitle | the next two facts, joined by `·` — source and routing on a channel; universe, address and mode on a fixture |
| trailing | one state or one affordance, never both |

Choosing what the subtitle carries is the phone's real design work, and it is the
same question §4b asks about the numbers band: *what does someone need to know
without opening it?* On a channel that is where the signal comes from and where it
lands, because those are what a patch is. Everything else waits behind the tap.

**A row is always tappable.** What the tap does depends on the role; that it
responds does not (P9). A viewer taps to read.

### 7d · The sheet, and its three jobs

One bottom sheet (`ui/Sheet`) does on a phone what three things do on a desk: the
**row editor** of §2, the **drawer** of §3, and the **inspector** of §4. It rises
from the edge the thumb is on — a centred dialog puts the confirm button under the
keyboard.

**The sheet is the frame; the tier of its contents is not the sheet's to decide.**
§3 already settles this for the desktop drawer — *frame navigation tier, contents
the tier of the surface that references them* — and the phone changes nothing
about it except the geometry of what gets pressed
([tokens.md](tokens.md) §7, amendment 2). So a phone drawer looks like a drawer:
`MicroLabel` section headings, `GearCard`s, `GearSpecs` at 10 px mono, `Pill`
chips, one filled primary among `outline` and `ghost` — all of it at `h-10` and
44 px instead of `h-8` and `h-7`.

That is the whole of the difference. A sheet built out of sentence-case labels and
generic mobile form fields is a different application wearing this one's colours.

**And each job keeps its own commit behaviour**, because the sheet is a container
and containers do not have opinions about drafts:

| Job | Contents | Commits |
|---|---|---|
| Row editor | `RowEditor` / `GearForm` fields | a draft, confirmed — one **Save** |
| Drawer | `DrawerSection` + `GearCard`s | per card: each opens its own `GearForm`, which is the same construction again |
| Inspector | `InspectorRail`'s `Field`s | per field (`components.md` §3 — the rail holds no draft) |

- **Fields stack**, two side by side only where they are one idea — stagebox and
  input number, universe and address. The inspector keeps its label-beside-control
  `Field` grid, because that is what the component is.
- **A failed save keeps the sheet open with every value intact**, error inline
  above the fields. Already true, and worth stating: a phone edit happens in a
  loading bay on a bad connection, and losing it retypes the form.
- The sheet scrolls inside itself; the page behind it does not.

**The footer holds the confirm, full width, and nothing else.** Settled in Wave
6a, against a specimen that drew `Save`, `Cancel` and `Delete` in one row. At
375 px three controls and two gaps leave the confirm about 185 px of a 343 px
row and put a destructive control 10 px from it, in the corner a thumb rests
on — so *full width* was not what that produced, and §2's *delete kept apart
from confirm* was a rule written for a mouse that matters more here, not less.

| | Where | Why |
|---|---|---|
| **Confirm** | the footer, `w-full`, alone, named for the operation — *Save channel* | It is the one control you came for, and the footer is the thumb's own zone |
| **Delete** | the **foot of the body**, left-aligned, ghost + `red-400` | It scrolls with the content, so it is never under a thumb at rest. In a single column that is what "apart" can mean |
| **Cancel** | **absent** | The close target, the scrim and the platform's back gesture are three ways out already. A fourth is not reassurance; it is a third of the confirm's width |

The cost is that delete scrolls away on a long form, and that is the right
trade: **delete is not a thing you should be able to reach without having read
the form.**

### 7e · The section switcher

Nine tabs do not fit, so the phone names the current section and opens the list on
a tap. It is `ui/Tabs`'s job in a different shape — *what you are looking at* — so
it takes no trough, and the current section is amber in the open list, not on the
closed control. **A control that is amber whether or not anything is selected has
spent the accent on furniture** (P4).

It lists sections and nothing else. A phone-only badge grading each section's
completeness is the P9 violation in its purest form: it invents a vocabulary the
desktop does not have, to describe the state of the *build* rather than the state
of the *show*, and it tells a viewer that Audio Inputs is "Editable".

### 7f · A canvas in the hand

Both canvases render on a phone. This reverses the rule that stood here, which
made the Flow canvas desktop-only — the surface a technician most wants on site is
the picture of where the signal goes.

| | Phone |
|---|---|
| Pan | one finger, both axes, unbounded — **the platform's own scrolling**, not a handler |
| Zoom | pinch, and the bar's `ZoomControl` at a 44 px target. Opens **where you left it**, resets to *fit*, steps ×1.4 |
| Select | tap a node or a rail row — the label, never the 7 px dot. A press that moves 3 px was a pan |
| Inspect **and edit** | the rail's contents in a bottom sheet (`components.md` §5) |
| Search | dims the rest, and **moves the window to the first match** |
| Place · patch · drag | **absent** — see 7g |

The pan is the platform's *because* of that last row: withholding the gestures that
would compete for the same finger is what leaves one-finger scrolling free, with
momentum and rubber-banding and everything else a hand-written pan gives up. **The
withholding is not a restriction the phone accepts; it is what makes the pan good.**

Everything drawn stays exactly as it is drawn: 7 px ports, 18 px port rows, derived
cable colours, the dashed network hop. Nothing is re-sized for the phone, because
nothing on the canvas is a target except the node (P9, *drawing is not targeting*).
Ports are never truncated, here least of all.

The **lane bands are gone**, at both reaches. They were three tinted regions named
*Stage / Rig / Console*, computed from the canvas width — and a band saying *Rig* is
a claim about where nodes are. Once nothing constrains where a node may sit, the
claim is decoration that can be false. The cables already carry direction.

**The canvas is a viewport, and nothing is pinned to its edges.** The graph has one
local coordinate system; pan and zoom move the window onto it and move nothing
within it. So on a phone there are **no rails** — not the sources rail, not the
inspector, not a legend anchored to a corner. Panning to the sources means the desk
leaves the screen, which is the point: a 375 px window over a 20-node graph is
useful exactly because it can be pointed somewhere.

This is why the desktop's two columns split differently here. The **sources rail is
in canvas space** — it is drawn among the nodes, not beside them — so it pans and
zooms with everything else and needs no phone decision at all. Since Slice 37 it is
also placed at the coordinates it holds rather than at the canvas's edge, and it does
not scroll inside itself: a capped, internally-scrolling rail on a plane is a second
viewport nested in the first, where the finger that meant to pan scrolls the rail
instead. The **inspector rail is a real column** (`w-60 shrink-0 border-l`), and a
column is the one thing a phone does not have (§7), so it becomes the sheet.

A canvas whose edges carry fixed furniture is a canvas with less canvas, on the
device that has least of it. A viewport that keeps a rail pinned while the graph
slides under it also breaks the one thing the canvas is *for*: everything on it is
in one coordinate system, and its position means something.

**Zoom means the same thing at both reaches, and this section spent four waves
saying so while the code did the opposite.** Both canvases used to compute their
logical space as `panelWidth / zoom` and pin two rails to its edges. Wave 6d found
the first half and fixed it for the phone only, by pinning the phone's space at
`820 × 640`; Slice 37 found what that left behind. A middle lane defined as *what is
left between two pinned rails* came out **92 px wide on a phone**, for nodes that are
200 px wide, so every node in it was clamped onto one pixel — and the same pinning
had been writing browser-window widths into the position columns for as long as the
canvases had existed.

| | Desk | Hand |
|---|---|---|
| The space | **one plane, as large as the graph placed on it** | the same plane |
| Its origin | **derived from the content**, so a node may sit at a negative coordinate | the same |
| Zoom is | a **viewport** change | a **viewport** change |
| A stored position | one place | **the same place** |

There is no row in that table where the two differ, which is the whole point. A
coordinate is not a fraction of a window.

**Nothing is pinned, so nothing is bounded.** A node dragged left of the sources or
above the top extends the plane rather than being refused: a floor at zero is an
arbitrary limit, and the stage plot has never had one. Panning is native scrolling and
a scroll container has no negative side, so the *origin* is derived from the content
instead of being fixed at `0,0`. That is an implementation detail with one visible
consequence to get right — the origin moves when a node is dragged past the edge, and
the scroll offset has to be compensated in the same frame or the graph lurches under
the finger holding it.

**A surface opens where it was last left, per event and per surface, on that device.**
Not at *fit*: for a real graph *fit* lands near 20 % on a phone, where a 200 px node
draws 42 px wide and no label in it is legible. Slice 36 reasoned to the opposite
conclusion from a nominal `820 × 640` rectangle, which the plane replaced with the
graph's own extent.

So *fit* is a **control**, and it is what the readout resets to at both reaches —
measured from the content's bounding box, so it frames the graph that exists rather
than a rectangle somebody guessed. It is how you get your bearings after panning into
empty space, and it is the opening state only for a device that has never opened the
surface before. A reset target that is not obvious has to say what it is, which is why
the phone's readout carries the word.

The remembered view is **device-local** (`useFlowView`), not a column. Zoom and pan
are one person's view of one screen — the same class of state as the Sheet/Flow choice
`usePatchView` already keeps in `localStorage` for these two tabs. In the database it
would let a phone decide where a desk opens, for everyone sharing the event.

**And on a phone, search aims the window.** Both canvases already dim every
non-matching node rather than hiding it — removing a node removes edges that exist,
so a partly-filtered patch reads as an unpatched one. On a 1180 px desk that is a
highlight. In a 341 px window over an 820 px graph the match may be dimmed-in
somewhere you cannot see, so **the first match is brought into view**. The rule is
not about reach and is not guarded on it: a 60-channel graph scrolls on a desk too.
One predicate both dims and aims, because a second one is how the dimmed set and the
window's target come to disagree.

**The inspector sheet edits.** It is `InputFlowInspector` and `OutputFlowInspector`
unchanged — kind, mic, **stand**, 48 V, connector, width — committing per field as
the rail does on a desk (`components.md` §3). Changing which stand a source is on
while standing next to the source is the phone's best case, not an edge case, and
nothing about it is direct manipulation.

**The inspector sheet takes no scrim.** It is the one sheet read *against* what is
behind it — you tapped the node to find out about the node, and dimming it to show
its own fields answers the wrong question. Every other sheet gets the scrim in
[tokens.md](tokens.md) §7, because a form is read instead of the surface, not
against it.

### 7g · What stays a desk job

Exactly one thing, stated once so it stops being decided per tab: **direct
manipulation of a spatial artifact.** Dragging a cable from one port to another,
and positioning an element on a scale drawing. Both are a mouse's precision over a
picture, and both have a desk-shaped answer already.

The line is the **gesture**, not the object and not the screen. Everything an
element *is* — its name, its kind, its mic, its stand, its notes, its address — is
a form over a row, and forms are what a phone is good at. So the same stage plot
that will not let you move a riser will let you tap it and rename it; the same flow
canvas that will not let you patch will let you change what is on the end of the
cable that is already there.

Everything else that is a form over a row has a phone form, whether or not it is
built yet: equipment lines, rental quantities, event settings, overview details,
inventory items, and the rig, buses and universes drawers — a stagebox that
arrives on site is declared on site.

A surface withholding a gesture says so, in the panel, in one sentence naming the
reason, and names what is still available:

> *Placing elements is a desk job — open this plot on a computer. Tap anything on
> it to read or edit what it is.*

That sentence is the whole of the treatment. It is not a banner, not a dialog, and
not a disabled control (P7); it sits where the editor would be, and the read view
above it is complete for everyone.

**And it can be put away.** Read once, it is a paragraph in the way — so it is a
`ui/InfoNote`: open by default, closing to a single `i` that reopens it, and the choice
remembered. That is not a weakening of the rule. The requirement is that the reason be
**readable**, not that it be unavoidable; a tooltip would fail it, because a tooltip has
no target on a touch screen. The same component is what the drawers use for *what this
action does*, which is the other kind of thing that has to be said once and then never
again to the person who has read it.

**`!isMobile` never appears in a permission expression.** A capability is a role
question. Whether a surface has built its phone editor yet is a fact about the
surface, and it belongs in the sentence above — where the user can read it.

### 7h · Printing from a phone

A phone branch that renders `print:hidden` and nothing else prints a blank page.
The print sheet is not chrome — it belongs to the tab, at every width, and the
branch renders it exactly as the desktop branch does (§8).

Every phone surface reaches the export it has: PDF and `.xlsx` are downloads, and
downloads are the one thing a phone does as well as a desk.

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
