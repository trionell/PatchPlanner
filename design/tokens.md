# 02 · Tokens

The values. Everything here is expressed as Tailwind utilities, because that is
what the codebase is reviewed in — a theme object read by name would make holding
the markup up against the mockup harder, not easier (`graph/tokens.ts` says this in
its own header, and it is right).

Where a token has a canonical export, the export is named. **Import it; do not
retype it.** (Principle P3.)

---

## 1 · Ground and rules

The application is one committed dark ground with layers cut into it by
translucency, not by a palette of six greys.

| Role | Value | Used for |
|---|---|---|
| **Ground** | `bg-zinc-950` (`#09090b`) | The page. Set on `body` and `:root` in `index.css`. |
| **Panel** | `bg-zinc-950/40` | A work panel's interior — barely lighter than the ground, so the border does the work. |
| **Card** | `bg-zinc-850` (`#1f2028`) | A navigation-surface card, and a canvas node. The one custom colour in `tailwind.config.ts`. |
| **Inset** | `bg-zinc-950/60` | Anything recessed *within* a panel: sheet headers, note boxes, rail headers and footers, the status strip. |
| **Control** | `bg-zinc-900` | Input, select, textarea, segmented-control trough. |
| **Raised** | `bg-zinc-800` | A node badge, a secondary button, a hover state. |
| **Overlay scrim** | `bg-zinc-950/70` (drawer) · `bg-zinc-950/80` (dialog) | Behind an overlay. |

### Rules (borders)

| Role | Value | Used for |
|---|---|---|
| **Frame** | `border-zinc-700` | The outer edge of a panel, card, node, dialog, drawer, control. The only rule strong enough to bound a thing. |
| **Divider** | `border-zinc-800` | Every internal division: bar↔content, header↔body, section↔footer, note boxes. |
| **Row** | `border-zinc-800/60` | Between rows in a sheet or list. Quieter than a divider, because there are two hundred of them. |
| **Hairline stripe** | `bg-white/[0.014]` | Alternate sheet rows. Deliberately at the edge of perceptible — an aid you find when you look for it, never a pattern. |
| **Lane band** | `bg-white/[0.022]` outer · `bg-white/[0.012]` middle | The flow canvas's lanes. A band *is* the marking; there are no dashed lane borders. |

> One border width everywhere: `1px`. Emphasis is added with a ring
> (`ring-2 ring-amber-500/30`), never with a thicker border — a 2 px border changes
> the box's size and shifts every port dot inside it off its cable.

## 2 · Ink

| Role | Value | Used for |
|---|---|---|
| **Primary** | `text-zinc-100` | Titles, node headers, the value you are editing. |
| **Body** | `text-zinc-200` · `text-zinc-300` | Sheet cells (`200`); port rows and chain hops (`300`). |
| **Secondary** | `text-zinc-400` | Supporting text, subtitles, legend meanings, inactive tabs. |
| **Muted** | `text-zinc-500` | Micro-labels, placeholders, counts, notes columns, the chain's tail. |
| **Faint** | `text-zinc-600` | Lane labels, hidden-row counts, an em-dash standing in for no value. |
| **Arrow / separator** | `text-zinc-600` | The `→` between chain hops — quieter than the hops it separates. |

## 3 · Density tiers

Two calibrations of one vocabulary. Which one applies is decided by P2's question,
not per component.

| | **Work surface** | **Navigation surface** |
|---|---|---|
| Base text | `text-xs` (12px) | `text-sm` (14px) |
| Small text | `text-[11px]` | `text-xs` |
| Micro-label | `text-[10px]` mono, `tracking-[0.14em]`, uppercase | `text-xs` sans, `text-zinc-300`, sentence case |
| Surface title | `text-sm font-semibold` | `text-lg font-semibold` |
| Section heading | micro-label | `text-sm font-medium` |
| Input / Select | `size="sm"` → `h-8 px-2 text-xs` | `size="md"` → `h-10 px-3 text-sm` |
| Button | `size="xs"` → `h-7 px-2.5 text-xs` | `size="sm"` → `h-8 px-3` · `size="md"` → `h-10 px-4` |
| Table row | `px-2 py-1` | `px-3 py-3` |
| Table header | `px-2 py-1.5` micro-label on inset | `px-3 py-3 text-zinc-400 font-medium` |
| Chip | `Pill` → `px-1.5 py-px text-[10px]` | `Badge` → `px-2.5 py-0.5 text-xs` |
| Container padding | `p-2.5` · `px-3 py-2` | `px-5 py-4` |
| Stack gap | `gap-1.5` · `gap-2` · `gap-2.5` | `gap-3` · `gap-4` · `space-y-6` |
| Icon | `h-3.5 w-3.5` | `h-4 w-4` |

**Fixed geometry** — work surfaces only, and not on the tier ladder because these
are structural rather than typographic:

| | Value | Why fixed |
|---|---|---|
| Port row height | `18px` | A column of ports only reads as a rack if the pitch is constant. |
| Source rail row | `20px` **per port** | Computed, never a class. A stereo source is two slots tall; two competing height utilities in one class string resolve to whichever Tailwind emits last, which is how the stereo rows once shipped at mono height with their dots overlapping. |
| Inspector label column | `44px` | Fits every label either inspector uses. A label that does not fit is a label to shorten — widening this moves every control on both rails. |
| Inspector rail width | `w-60`, `shrink-0` | The canvas gives up space; the rail does not compress. |
| Port dot | `7px` painted, inside a larger transparent hit area | The paint and the target are different elements on purpose. Putting the border and background on one padded element renders a 15 px dot, which is what the third field test reported as "too big". |
| Tape bar | `w-[3px]` | Same width in the sheet, the node header and the rail. |
| Phantom bar | `h-[3px] w-2` | See P5. |
| Capacity meter | `h-[3px]` | |

## 4 · Type

One family for prose, one for anything a technician counts.

```
sans   Inter, system-ui, -apple-system, "Segoe UI", sans-serif      (:root)
mono   ui-monospace, SFMono-Regular, Menlo, Consolas, monospace     (font-mono)
```

**Mono is not decoration.** It is used for exactly four things:

1. **Micro-labels** — uppercase, `tracking-[0.14em]`, quiet.
2. **Numbers that line up** — always with `tabular-nums`. Channel numbers, port
   counts, capacities, DMX addresses, the zoom percentage.
3. **Signal chains** — `ChainCell`, `ChainText`, the "lands on" note. A chain is a
   fixed-pitch string a technician reads hop by hop.
4. **Equipment identifiers** — model names and spec values in `GearSpecs`.

Everything else is sans. Prose in mono is the single fastest way to make a planning
tool look like a terminal emulator.

| Token | Value | Export |
|---|---|---|
| Micro-label | `font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500` | `MICRO_LABEL` in `graph/tokens.ts` |
| Lane label | `font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600` | `LANE_LABEL` |
| Numeric cell | `font-mono tabular-nums text-zinc-400` | `NumCell` in `ui/SheetTable.tsx` |
| Chain line | `font-mono text-[11px] text-zinc-300` | `ChainCell` |

## 5 · Accent and semantics

| Hue | Means | Where |
|---|---|---|
| `amber-500` | **Focus and action.** Primary button, active tab, selected node, open row, the desk, an active form's left edge. | Everywhere — see P4 for the limit. |
| `amber-500/55` | The desk's border — present but not selected. | `NODE_BORDER_DESK` |
| `amber-300` | A chain hop through the desk's own socket, i.e. the one hop that is **not** a billable cable. | `ChainCell` |
| `red-500` / `red-400` | Destructive action · over capacity · a missing link in a chain · 48 V phantom power. | Reserved; nothing else. |
| `emerald-500` | Complete. | Status pill only. |
| `sky-400` (`#38bdf8`) | The legend's sample stroke — stands for "a colour", not for any channel's colour. | `InspectorRail` |
| `zinc-600` (`#71717a`) | A patched run reaching nothing. | Legend, dead cables |
| `#3f3f46` | An unassigned tape. Still reads as a tape. | `TAPE_NEUTRAL` |

### Vocabulary colours

A value from a database vocabulary (signal type, output type, bus, role) is tinted
by one formula, so a user-added value that has no dedicated entry falls back to the
neutral style rather than branching anything (Principle II):

```
ground   <hue>-500/15
ink      <hue>-300
```

Assigned hues, from `ui/Badge.tsx`: `mic` sky · `line` violet · `di` emerald ·
`return` amber · `aux` pink · `foh` cyan · `monitor` emerald · `sub` red ·
`matrix` indigo · `stereo` purple · `iem` orange. Unknown → `bg-zinc-700
text-zinc-100`.

Bus and tape colours are **not** in this table: they come from the `channel_colors`
reference vocabulary and are applied inline as hex. A component must never map a
bus name to a hue.

### Alert tints

Three states, tinting the ground *and* the bounding rule, so the state reads from
the edge of vision rather than only on reading:

| State | Rule | Ground |
|---|---|---|
| complete | `border-zinc-800` | `bg-zinc-950/60` |
| gaps | `border-amber-500/40` | `bg-amber-500/[0.05]` |
| over capacity | `border-red-400/40` | `bg-red-500/[0.05]` |

Selected row / open editor: `bg-amber-500/[0.04]`. Selected rail row:
`bg-amber-500/10`. Inline error block: `border-red-800 bg-red-950/50 text-red-300`.

## 6 · Radius, shadow, motion

| Element | Radius |
|---|---|
| Panel, card, dialog | `rounded-xl` (12px) |
| Canvas node | `rounded-[7px]` — the mockup's own, and not type-relative |
| Button, input, select, tab, gear card | `rounded-md` (6px) |
| Note box | `rounded-[5px]` |
| Bars: tape, phantom, meter | `rounded-sm` (2px) |
| Chip, pill, avatar, port dot | `rounded-full` |

`rounded-lg` is **not** in the ladder. Its 30 current uses are the drift; each is
either a panel (`xl`) or a control (`md`). See [audit.md](audit.md) A4.

| Element | Shadow |
|---|---|
| Canvas node | `shadow-[0_2px_8px_rgba(0,0,0,0.4)]` |
| Drawer, dialog | `shadow-2xl` |
| Panel, card | none — the border bounds it |

**Motion.** There is almost none, deliberately: a planning tool that animates while
a technician is counting channels is in the way. The permitted set is
`transition-colors` on hover and focus, and the one signal-flow pulse
(`.pp-pulse-dot`), which is already wrapped in
`@media (prefers-reduced-motion: no-preference)`. Any new animation gets the same
wrapper.

**Focus.** Every interactive element shows focus. Buttons:
`focus-visible:ring-2 focus-visible:ring-amber-500`. Inputs and selects:
`focus:border-amber-500`. A control that removes the outline without replacing it
is a bug, not a style.
