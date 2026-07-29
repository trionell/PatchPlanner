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
| Table | `ui/SheetTable` | `ui/Table` |
| Chip | `Pill` (from `ui/SheetTable`) | `ui/Badge` |
| Label | `MICRO_LABEL` / `MicroLabel` | `FieldLabel` |
| Field | `<Input size="sm">` · `<Select size="sm">` | `<Input>` · `<Select>` (md) |
| Section heading | `DrawerSection` | `CardTitle` |

Both members of a pair live in one file wherever there are only two of them —
`MicroLabel` and `FieldLabel` are both in `ui/Label.tsx` — so picking the wrong tier
takes a deliberate act rather than an absent-minded import.

`ui/Table` and `ui/Badge` are deliberately untouched by the patch work: six other
tabs render them, and Slice 25 was scoped to leave those exactly as they were. That
scoping decision is now spent — [audit.md](audit.md) says what happens to them.

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

### `event/graph/` — the canvas

| Export | Notes |
|---|---|
| `tokens.ts` | `LANE_LABEL`, `NODE_*`, `PORT_ROW*`, `PHANTOM_BAR*`, `LANE_BAND_*`, `TAPE_NEUTRAL`, `SOURCE_ROW*`, and `MICRO_LABEL` re-exported from `ui/Label`. The one import for canvas values. |
| `NodeShell` | Absolutely positioned; `title`, `badge`, `footer`, `footerAlarm`, `dimmed`, `selected`, `desk`, drag/select/delete handlers. Border: `zinc-700` → `amber-500/55` if desk → `amber-500 + ring-2 ring-amber-500/30` if selected. |
| `PortDot` | 7 px paint inside a larger transparent button. Hollow → patched (`amber-500`) → coloured (the derived colour at 75 %) → selected (solid + `ring-2 ring-amber-500/40`). |
| `PortRow` / `SplitPortRow` | Fixed `18px`. `align="right"` reverses. A pass-through box is **one row per jack** with its two ports on opposite edges — never two independent columns that line up by luck. Optional `selected`/`onSelect` makes the label selectable while the dot still cables. |
| `PortWiring` | The seam that keeps these primitives domain-free: `isConnected`, `isPending`, `colorOf`, `keyOf`, and the handlers. Nothing in `graph/` knows what audio is. |
| `LaneBands` | Three tinted bands with their labels inside them. No dashed borders — a band is the marking. |
| `ZoomControl` | Two `h-7 w-7` ghost buttons around a mono percentage that resets on click. Lives **in the panel's bar**, never in a strip between bar and canvas. Owns the look; the caller may own the stepping via `onZoomIn`/`onZoomOut`/`onReset` — three canvases draw it and only two agree on what a step is. |
| `InspectorRail` | See §3. |

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

`pill` is a slot rather than a string because each side puts something different in
it — a source's kind, an output's type — both tinted by vocabulary the rail knows
nothing about.

The legend owns the **strokes**, the caller owns the **wording**: `cable` solid ·
`network` dashed `6 3` · `unpatched` dashed `4 3` in `#71717a` · `phantom` the red
bar. See P4's worked example in [principles.md](principles.md).

**The rail holds no draft.** The sheet's inline editor does; the rail commits per
field. That is not an inconsistency to fix later — a rail with a draft is a second
source of truth for a row the sheet may also be editing.

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
the rental order · 12 items"*.

### `ui/Tabs`

`TabList` `inline-flex flex-wrap gap-1` — no trough, per [patterns.md](patterns.md)
§6. `Tab` takes either a `value` (selected within an enclosing `Tabs`) or an
`active` prop plus its own `onClick`, for a selector that means the same thing but
keeps its choice elsewhere — the stage plot picker, whose choice also clears the
canvas selection.

A selector that means *what you are looking at* uses this component rather than
copying its classes. That is the whole reason `active` exists.

### `ui/Dialog`, `ui/Card`, `ui/Table`, `ui/Badge`

Navigation-surface components; values in [tokens.md](tokens.md). `Dialog` and
`Drawer` already share their header, padding and close conventions, and should
continue to.

`Dialog` is centred, `max-w-2xl`, and **stays centred at every width**. Wave 6a
gave it `Escape` and an internal scroll at the sheet's own `max-h-[85svh]`, both
things `Drawer` already had, so a tall overlay behaves the same way whichever
anchor it has.

The rule it settled, stated once so it stops being decided per call site:
**an overlay with fields is a `Sheet`; an overlay that is a sentence and two
buttons is a `Dialog`.** [audit.md](audit.md) M8 was never *"`Dialog` is the
wrong shape"* — it was *"`Dialog` is being used as the phone's edit form"*, and
six conversions fixed that at the call sites rather than by making `Dialog` into
something else.

The `Escape` handler now lives in `hooks/useEscapeToClose`, shared by `Drawer`,
`Dialog` and `Sheet`. Three callers, in one commit — Principle V forbids
abstracting ahead of a second caller; it does not ask for a third copy.

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
| `MobileEntityList` | A `MobilePanel` over `MobileEntityRow` — one component for channels, outputs and fixtures, because all three differ only in what `number`, `subtitle` and `color` mean. It takes the surface's `title` and its `strip`, and derives no verdict and applies no filter: the caller owns both, exactly as its desktop sheet does. |
| `CondensedListRow` | One row in a `MobilePanel`: leading tape edge, title, subtitle, trailing slot. Its `accentColor` draws the derived colour as a 3 px edge and a tint at `1a` — the sheet's tape bar in the geometry a phone row has. **`min-h-[44px]` with `leading-tight` is the stated value and the padding derives from it** ([tokens.md](tokens.md) §7); both lines truncate; no border, radius or ground of its own. |
| `MobileChannelEditSheet` · `MobileOutputEditSheet` · `MobileFixtureEditSheet` · `MobileEquipmentEditSheet` · `MobileRentalEditSheet` | The phone's row editor, one per entity, deliberately not one configurable form — the same reasoning as `GearList`. Add and edit are **one** construction in each (§2). A failed save keeps the sheet open with every value intact. Each takes `readOnly`: a role that may not edit still opens the sheet, because a phone row is a truncation and the values are the point of opening it ([audit.md](audit.md) M4). |
| `MobileOverviewPanel` | Overview's phone composition — a two-column figure grid with the countdown spanning, both rig ribbons as horizontally panning drawings, and the five readiness verdicts as 44 px rows that state *and* route. One caller, deliberately: a 120-line phone composition inside a desktop tab is how a phone value gets copied onto a desk. It derives nothing — `lib/eventSummary` computes both halves of every row for the desktop already. |
| `MobilePicker` | *Choose one of N*, on a phone: a bar control naming the current choice, opening a sheet of 52 px rows with the sidebar's 2 px amber left edge. Every desktop *choose one of N* — a rail, a tab strip, a list down the left — becomes this, because a column is the one thing a 375 px screen has not got. It goes in `MobilePanel`'s **`actions`**, never its overflow. Extracted at its second caller (the plot picker and the vocabulary rail), the rule `ui/PanelRail` was made to follow. |

**`ui/MobilePanel`.** The phone's frame — bar, rows, strip — and P1 at 375 px.
Built in Wave 6b, where it replaced nine `space-y-*` stacks of free-standing
bordered cards, which is what made a phone list read as a column of inputs and left
nowhere for a status strip to close ([audit.md](audit.md) M1, M3).

Props: `title`, `search` + `onSearch`, `actions`, **`overflow`**, `primaryAction`,
`strip`, `children`. **It decides nothing about its rows** — the same refusal that makes
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
