# Contract: the four surfaces

Which brick, and the handful of things specific to these tabs. Values come from
[design/](../../../design/); this says *where*.

Read with [mockup.html](../mockup.html), which draws all of it.

---

## 1 · Rental order

### The bar

```
Rental order  [ 🔍 Find an item… ]  [Export .xlsx] [Export PDF] [Export LL.xlsx]  ⟵⟶  [+ Manual line]
```

- No view toggle (one view), **no Print** (the PDF export is the paper, R5).
- `Export LL.xlsx` only when `inventoryQuery.data?.sourceFormat === 'll'`, exactly
  the condition the tab uses today.
- `+ Manual line` is the only filled button; absent for a read-only role.

### The sheet — nine columns

| # | Head | Cell | Notes |
|---|---|---|---|
| 1 | `Item` | `SheetCell` | name `text-zinc-100`; `Pill` `discontinued` after it when `is_discontinued` |
| 2 | `Description` | `SheetCell` | `max-w-56 truncate text-zinc-500` |
| 3 | `Audio` | `NumCell` | `+N` badge when manual > 0 |
| 4 | `Light` | `NumCell` | as above |
| 5 | `Qty` | `NumCell` | `total_quantity` |
| 6 | `Stock` | `NumCell` | `text-red-400` + `title` when `is_over_stock` |
| 7 | `Price` | `NumCell` | 2 dp |
| 8 | `Subtotal` | `NumCell` | 2 dp |
| 9 | `Note` | `SheetCell` | `max-w-48 truncate text-zinc-500` |

The `+N` badge is Slice 27's shared-address badge, unchanged:
`font-mono text-[10px] text-zinc-400 bg-zinc-800 rounded-sm px-1 ml-1.5`, `title`
reading *8 from the plan · 2 added by hand*.

### The editor

`event/RowEditor`. Fields in order:

| Field | Width | Control |
|---|---|---|
| From the plan | `default` | read-only text, `font-mono text-zinc-400` |
| Manual audio | `count` | `Input size="sm" type="number"` |
| Manual light | `count` | `Input size="sm" type="number"` |
| Note | `grow` | `Input size="sm"` |

`handoff={{ label: 'Equipment', text: 'See on Equipment', onSelect }}`.
`onDelete` only on a manual-bearing line, and it removes the **manual part**, so
its label is `Delete` and the confirm sentence names what survives.

The add editor is the same construction with `Item` (a `Select` over the event
inventory) first and no delete.

### The strip — `event/RentalStatusRail`

Built like `LightingStatusRail`: top border only, ground *and* rule tinted,
`px-3 py-2 text-[11px]`.

| State | Tint | Pill |
|---|---|---|
| over stock | `border-red-400/40 bg-red-500/[0.05]` | `N over stock` red |
| discontinued only | `border-amber-500/40 bg-amber-500/[0.05]` | `N discontinued` amber |
| clean | `border-zinc-800 bg-zinc-950/60` | `in stock` emerald |

Always, after the pill: line count · pieces · total ex VAT · manual count ·
discontinued count. Then, in the two problem states, the first problem in full and
the filter control (`h-6 px-2 text-[11px]`, as `PatchStatusRail`'s are).

## 2 · Equipment

### The bar

```
Equipment  [ 🔍 Find a line… ]   ⟵⟶  [+ Line]
```

### The sheet — six columns

| # | Head | Cell | Notes |
|---|---|---|---|
| 1 | `Item` | `SheetCell` | `text-zinc-100` |
| 2 | `Source` | `SheetCell` | `Pill` — `owned` `bg-zinc-700 text-zinc-100`, `rented` `bg-amber-500/15 text-amber-300` |
| 3 | `Type` | `SheetCell` `text-zinc-500` | `category_type` for owned, `category_name` for rented |
| 4 | `Qty` | `NumCell` | rented lines carry a badge `2a` / `1l` / `8a·4l` |
| 5 | `Have` | `NumCell` | owned only; `text-red-400` when over; `—` for rented |
| 6 | `Note` | `SheetCell` | truncated |

`rented`'s amber is *not* a warning — it is a vocabulary tint, and the word does
the work (P4). It matches `return` in `lib/vocabularyTint`, which is the same
"comes from elsewhere" sense.

### The editor

| Field | Owned | Rented |
|---|---|---|
| `Source` | select (add) / read-only (edit) | same |
| `Item` | owned catalog | event inventory |
| `Qty` | ✓ | — |
| `Audio` / `Light` | — | ✓ |
| `Note` | ✓ | ✓ |

`handoff` on a rented line only: `{ label: 'Rental', text: 'See on rental order' }`.

### The strip — `event/EquipmentStatusRail`

`N over owned` red · else `N lines` neutral. Always: lines · owned · rented.
Problem state names the first over-owned line and offers the filter.

## 3 · Signal flow

### The bar

```
Signal flow  [ 🔍 Find a channel or a device… ]   ⟵⟶  [Print]
```

No primary action: nothing on this tab is created.

### The bands

A full-width row between the two tables:

```
flex items-center gap-2 border-y border-zinc-800 bg-zinc-950/60 px-3 py-1.5
```

carrying `MicroLabel` (`Inputs` / `Outputs`), a count in
`font-mono text-[10px] text-zinc-600`, and — at `ml-auto` — the hint
*click a row to open it on Audio Inputs* in `text-[11px] text-zinc-600`.

### The tables

`Ch` 44px · `Name` 180px · `Buses` 190px · `Signal chain` — and
`Out` · `Name` · `Signal chain`.

Bus chips are `Pill`, tinted from the bus's own `color` via `busTint` exactly as
today; only the size changes.

### The chain

```
font-mono tabular-nums text-[11px] text-zinc-300
```

| Part | Value |
|---|---|
| arrow | `text-zinc-600`, `px-0.5` |
| detail (`(48V)`, `L`/`R`) | `text-zinc-500` |
| console's own socket | `text-amber-300` |
| missing link | `text-amber-400 font-medium` + `AlertTriangle h-3.5 w-3.5` |

A stereo channel's two paths stack, each on its own line.

### The strip — `event/SignalFlowStatusRail`

`N gaps` amber · else `all routed` emerald. Always: inputs · outputs · hops.
Problem state names the first gap and offers `Show only gaps`.

## 4 · Overview

Not a `PatchPanel`: a form's worth of content at navigation-tier sizing. One
`Card`, `rounded-xl`, divided by `border-t border-zinc-800`.

| Band | Content |
|---|---|
| head | name `text-lg font-semibold`; venue · date `text-sm text-zinc-400`; `Edit details` `Button size="sm" variant="outline"` at `ml-auto` |
| notes | `border-l-2 border-zinc-800 pl-3 text-sm text-zinc-400`, absent when empty |
| numbers | `bg-zinc-950/60`, five cells split by `border-l border-zinc-800` |
| ribbons | audio, then lighting, `px-5 py-4` |
| readiness | one `Pill` per area, each preceded by a `MicroLabel` |
| inventory | `MicroLabel` · name + source file + item count · `Manage`/`Browse` |
| footer | `bg-zinc-950/60 text-xs text-zinc-500`: created · members · your role |

### The numbers band

Figure `font-mono tabular-nums text-[26px] font-semibold text-zinc-100`, its unit
in `text-sm text-zinc-500`, `MicroLabel` beneath. Whole cell is a link.

`—` for an undefined figure, in `text-zinc-600` (FR-062).

### The ribbon

A node is the canvas's node, one row high:

```
rounded-[7px] border border-zinc-700 bg-zinc-850 px-2.5 py-1
shadow-[0_2px_8px_rgba(0,0,0,0.4)]
```

count `font-mono tabular-nums text-xs text-zinc-100`, label `MicroLabel`. The
console carries `border-amber-500/55` — `NODE_BORDER_DESK`, imported, not retyped.
Runs between nodes: `h-0.5 flex-1 min-w-4 rounded-sm bg-zinc-700`.

A node whose count is zero is **omitted** (FR-066).

### The drawer

`ui/Drawer` `narrow`, title *Event details*, subtitle *Name, venue, date and
notes*. Fields at `size="md"`, one per row. `Save` primary, `Cancel` ghost.
Footer: *Renaming an event never changes its patch, its rig or its rental order.*

The drawer chrome is shared with Rig/Buses/Universes; its **contents** are
navigation-tier because four fields are not a work surface. `design/principles.md`
P2 decides density by asking about the surface's job, not per component.

## 5 · `ui/Tabs`, widened

One optional pair, additive:

```ts
export function Tabs({
  defaultValue, value, onValueChange, children, className,
}: {
  defaultValue: string
  value?: string
  onValueChange?: (value: string) => void
  children: ReactNode
  className?: string
})
```

Controlled when `value` is given; the internal state and every existing call site
are otherwise unchanged. `Inventories.tsx` passes neither and renders identically.

`EventDetail` reads `?tab=`, falls back to `overview` for absent or unknown, and
writes it with `replace: false` so the back button walks tabs.

## 6 · What must not change

Asserted by the gates in [quickstart.md](../quickstart.md), not by inspection:

- `components/ui/` — everything but `Tabs.tsx`.
- `components/event/graph/`, `AudioPatchShell`, `InputSheet`, `OutputSheet`,
  `LightingSheet`, `StagePlotTab` and their canvases.
- `components/mobile/` and every `isMobile` branch.
- `components/print/`.
- `backend/` in its entirety.
