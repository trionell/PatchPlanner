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
  turns a scannable list into a form, which is what the lighting fixture table
  currently is.
- One row edits at a time.
- The editor is the same construction used to **add** a row, which is what makes
  adding and editing look like the same operation.
- Where a row's deeper structure lives on another view, the editor offers a
  hand-off — *Edit in Flow →* — carrying the selection with it.

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

## 5 · States

| State | Treatment |
|---|---|
| Loading | `<p className="text-sm text-zinc-400">Loading …</p>` in place of the content. No spinner, no skeleton — queries here resolve locally. |
| Error | `rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300`, inline above the content it concerns. Never a toast; the user needs to see it next to what failed. |
| Empty, actionable | One sentence saying what to do, and the control that does it. *"Your owned-gear catalog is empty — add items on the Inventory page first."* |
| Empty, expected | `—` in `text-zinc-600`. A cell with nothing in it says so; it does not sit blank. |
| Undeclared | Nothing at all. A capacity of 0 means nobody has said yet: it renders `—`, draws no meter, and **must never warn**. This is distinct from empty, and conflating them is how a desk nobody has measured appears to be over capacity. |
| Read-only | Controls absent (P7). A banner states the role once — `ReadOnlyBanner` — rather than each control explaining itself. |

## 6 · App chrome

Chrome recedes (P8). The current chrome advances: it is lighter than the content
area, and it announces the page three times in three sizes before you reach a panel
whose own title is 14 px.

### Sidebar — `components/Layout.tsx`

| Part | Target | Today |
|---|---|---|
| frame | `w-60 border-r border-zinc-800 bg-zinc-950` | `bg-zinc-900` — **lighter than the content area, so it advances** |
| padding | `px-3 py-5` | `px-4 py-6` |
| brand | icon in `rounded-md bg-amber-500/15 p-2`, name `text-sm font-semibold`, tagline `text-xs text-zinc-500` | name at default size, tagline `text-zinc-400` |
| nav item | `flex items-center gap-3 border-l-2 px-3 py-2 text-sm` | ✅ unchanged |
| nav item, active | `border-amber-500 bg-zinc-850 text-amber-400` | ✅ unchanged |

The active marker stays a **2 px left edge, not a filled pill**. It is the quietest
mark that survives peripheral vision, and it keeps the amber fill meaning "the
primary action" rather than "the page you are on".

### Header

| Part | Target | Today |
|---|---|---|
| frame | `sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur px-8 py-3` | `py-5` |
| title | `text-base font-semibold text-zinc-100` | `text-2xl` |
| mobile | `px-4 py-3`, title `text-sm font-semibold` | `text-base` |

The mockup's own bar title is 13 px at an 11 px base — `text-base` is that carried
across. A 24 px page title above a 14 px panel title inverts the hierarchy.

### Event tab strip — `ui/Tabs`

| Part | Target | Today |
|---|---|---|
| `TabList` | `inline-flex flex-wrap gap-1` — **no trough** | `rounded-lg border border-zinc-700 bg-zinc-900 p-1` |
| `Tab` | `rounded-md px-3 py-1 text-sm transition-colors` | `rounded-md px-4 py-2 text-sm` |
| active | `bg-amber-500 text-zinc-950 font-semibold` | `bg-amber-500 text-zinc-950` |
| inactive | `text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100` | `text-zinc-300 hover:bg-zinc-800` |

Losing the trough is the point. Page-level tabs select *what you are looking at*;
the trough belongs to an in-panel toggle selecting *how you are looking at one
thing* (§1). Two controls that look identical currently mean those two different
things.

### Event heading

Between the header and the tab strip, the event name renders again at `text-xl`.
Target: `text-lg font-semibold` with venue and date at `text-sm text-zinc-400` —
one step below the panel it introduces, one step above nothing.

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
