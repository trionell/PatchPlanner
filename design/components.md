# 03 · Components

What to reach for. Every component below exists today; nothing here is proposed
except the three marked **gap**.

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
| `FieldStack` | Label above control. Widths `default` `w-40` · `grow` · `count` `w-20` · `short` `w-28`. Never a fixed column track — that is what compressed these into unusability in the first place. |
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
| `ZoomControl` | Two `h-7 w-7` ghost buttons around a mono percentage that resets on click. Lives **in the panel's bar**, never in a strip between bar and canvas. |
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
| `InspectorRail` | `<aside>` · `flex w-60 shrink-0 flex-col gap-2.5 border-l border-zinc-800 p-2.5` — a left border, not a card floating on the canvas |
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

### `ui/Dialog`, `ui/Card`, `ui/Table`, `ui/Badge`, `ui/Tabs`

Navigation-surface components; values in [tokens.md](tokens.md). `Dialog` and
`Drawer` already share their header, padding and close conventions, and should
continue to.

`Badge` and `Pill` both read their tint from `lib/vocabularyTint.ts`, so the two
sizes of one chip cannot disagree about what colour a `monitor` is. It takes any
vocabulary string and falls back to the neutral style for values it has no entry
for — a user-added output type must render, not crash and not force a new variant.
Never `switch` on the value at the call site.

Every entry in that map is `<hue>-500/15` over `<hue>-300` ([tokens.md](tokens.md)
§5). An entry that departs from the formula is a bug, not a new colour.

## 5 · Naming

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
