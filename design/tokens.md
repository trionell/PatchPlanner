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
not per component. **A phone takes the right-hand column with three amendments**,
which is §7 — it is not a third tier.

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
| Table header | `px-2 py-1.5` micro-label on inset | `px-3 py-2` micro-label on inset — see below |
| Chip | `Pill` → `px-1.5 py-px text-[10px]` | `Badge` → `px-2.5 py-0.5 text-xs` |
| Container padding | `p-2.5` · `px-3 py-2` | `px-5 py-4` |
| Stack gap | `gap-1.5` · `gap-2` · `gap-2.5` | `gap-3` · `gap-4` · `space-y-6` |
| Icon | `h-3.5 w-3.5` | `h-4 w-4` |

**A column header is a micro-label in both tiers.** The tier decides its
padding, not its font: `SheetHeadCell` is the one implementation, imported with
a padding override where the rows are navigation tier (the catalog list). This
row used to read `text-zinc-400 font-medium` on the right-hand side, which
described `ui/Table` — a component one surface still renders — and reading it
as guidance for a *new* table is how the catalog list shipped with the only
sans header in the application.

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
| Micro-label | `font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500` | `MICRO_LABEL` in `ui/Label.tsx`, re-exported by `graph/tokens.ts` |
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

Assigned hues, from `lib/vocabularyTint.ts` — read by `Badge` and by `Pill`'s
callers, so the two chip tiers cannot disagree: `mic` sky · `line` violet · `di` emerald ·
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

**A collision between two events is amber and a word, never red.** Two shows
sharing days is a *fact about a plan, not an error in it* — you may be sending a
colleague, or be a viewer on someone else's file — so it gets the accent's "look
here" and never the reserved hue. Red stays for destructive actions, over
capacity, a broken link in a chain and 48 V. The carrier is the word
(`overlaps` / `on-site clash`) plus a 2 px brace joining the rows; amber is the
emphasis on top of it, in that order (P4). Nothing about a collision blocks a
save, warns on one, or asks for confirmation.

## 6 · Radius, shadow, motion

| Element | Radius |
|---|---|
| Panel, card, dialog | `rounded-xl` (12px) |
| Canvas node | `rounded-[7px]` — the mockup's own, and not type-relative |
| Button, input, select, tab, gear card | `rounded-md` (6px) |
| Note box | `rounded-[5px]` |
| Bars: tape, phantom, meter | `rounded-sm` (2px) |
| Chip, pill, avatar, port dot | `rounded-full` |

`rounded-lg` is **not** in the ladder, and as of Wave 5 nothing renders one. Its
30 uses were the drift: seven were the same bordered-block-of-fields idiom the
row editor replaced and were deleted with it, and the rest were each either a
panel (`xl`) or a control (`md`). See [audit.md](audit.md) A4 — the finding turned
out to be about a layout habit rather than a radius.

| Element | Shadow |
|---|---|
| Canvas node | `shadow-[0_2px_8px_rgba(0,0,0,0.4)]` |
| Drawer, dialog | `shadow-2xl` |
| Panel, card | none — the border bounds it |

**Motion.** There is almost none, deliberately: a planning tool that animates while
a technician is counting channels is in the way. The permitted set is
`transition-colors` on hover and focus, the one signal-flow pulse, and the
timeline's unfold — each always wrapped in
`@media (prefers-reduced-motion: no-preference)`. Any new animation gets the
same wrapper.

**The unfold** (Slice 30) grows a row's summary from the row it belongs to:
`display: grid` transitioning `grid-template-rows` from `0fr` to `1fr` over
150 ms, content in an `overflow: hidden` child, written with Tailwind's
`motion-safe:` variant — which *is* that media query. It is the only technique
that animates to a content-determined height without measuring it in JavaScript,
and under a reduced-motion preference it degrades to an instant open for free.
Opening animates and closing does not, because the summary unmounts in the same
commit and takes its queries with it.

The pulse stays off the Events page. One show pulsing is a hero; twenty-eight
rows with a light running through each is a Christmas tree, on the one page
whose whole job is scanning for a date.

The pulse has two implementations and one claim — *a signal travelling a run*:

| Where | Class | Mechanism |
|---|---|---|
| Start page's patch bay | `.pp-pulse-dot` | a dot on an SVG `offset-path` |
| Dashboard's next-show ribbon | `.pp-run` | a dot translated along a 2 px div, staggered by `--pp-delay` |

Both are on **landing** pages. Neither appears on a surface anyone works on —
Overview draws the same ribbon as the dashboard and deliberately does not animate
it, which is the line: a page you arrive at may move, a page you work in may not.

That difference is a `pulse` prop on one `RigRibbon`, not two copies of the
ribbon. It was two, and both copies drifted into the same geometry bug before
anyone noticed either: **where a surface differs from another only by whether it
moves, the motion is the parameter.**

**Focus.** Every interactive element shows focus. Buttons:
`focus-visible:ring-2 focus-visible:ring-amber-500`. Inputs and selects:
`focus:border-amber-500`. A control that removes the outline without replacing it
is a bug, not a style.

## 7 · Reach

One more question, asked once per surface and answered by a **hook rather than by
a media query**:

> **Is this being read at arm's length, on a screen held in one hand?**

`useIsMobile()` — `(max-width: 767px)`, one definition, sitting on the project's
existing `md` breakpoint. It returns a boolean a component *branches* on. That is
deliberate and it is not a shortcut: the phone renders a different composition of
the same data — a list where the desktop has a sheet of twelve columns, a bottom
sheet where it has an inline row editor, a tapped node where it has a hover — and
no number of `md:` prefixes turns one of those into the other. Responsive
utilities still do the small work *inside* a branch; the branch itself is a
decision about composition.

### The phone takes the navigation column of §3

Not a third tier. The same values with **two amendments** — the 44 px minimum, and
the micro-label heading — restated in full here because the table is what gets
read:

| | Phone | |
|---|---|---|
| Row | `px-3 py-2.5`, two lines | title `text-sm`, subtitle `text-xs` — 44 px tall |
| **Minimum tap target** | **44 px** | amendment 1. Below it, a control is a suggestion |
| Input · Select · Textarea | `md` (`h-10`) | never `sm` — `h-8` is a mouse's height |
| Button | `sm` in a bar · `md` for a form's confirm | never `xs`; the **variant** is unchanged |
| Icon, tappable | `h-4 w-4` in text · `h-5 w-5` in the bottom nav | never `h-3.5` |
| Icon, drawn | whatever the desktop draws | it is not a target |
| Chip · label | whatever the surface's tier uses | amendment 2 — see below |
| Heading over a run of rows | `MicroLabel` + a `border-zinc-800` rule | the app's one label voice, at every width |

**Density on a phone comes from stacking, never from shrinking.** A sheet's twelve
columns become a title and a subtitle joined by `·`, in that order of importance;
what will not fit is dropped rather than set smaller. Shrinking type to fit a
column count is how a phone ends up with values in neither tier.

### Amendment 2 · Type is read, geometry is touched

> **A surface on a phone keeps its tier's type and gives up its tier's geometry.**

This is the rule the old §7 got backwards, and it is the one that decides what a
phone drawer looks like. P3 says the app has **one label voice**, and it does not
acquire a second one at 767 px: `FieldStack` renders a `MicroLabel` above every
field in the Rig drawer and in every row editor, so a phone sheet holding those
same fields renders the same mono, uppercase, `tracking-[0.14em]` label. So does
`GearSpecs` at 10 px mono, and so does `Pill` where the desktop draws a `Pill`.

What changes is only what a finger has to hit:

| | Desktop, in a drawer | Phone, in a sheet |
|---|---|---|
| Section heading | `MicroLabel` | **same** |
| Field label | `MicroLabel` (`FieldStack`) | **same** |
| Spec line | `text-[10px]` mono | **same** |
| Chip | `Pill` | **same** |
| Input · Select | `size="sm"` — `h-8` | `h-10` |
| Button | `size="xs"` — `h-7` | `h-10`, same variant |
| Row / card padding | `px-2.5 py-2` | `px-3 py-2.5`, min 44 px |

Ten-pixel mono is not a target and never was — it is a label beside a control, and
labels are read. The 44 px minimum applies to **things you press**, which is why
those are the only rows that move. A phone form built from `FieldLabel` and 14 px
sentence case is not "more legible"; it is a second application's form, wearing
this application's colours.

`FieldLabel` keeps exactly the job it has on the desktop — navigation-surface
forms, where the desktop uses it too: event details, settings, login. The tier
decides, not the width (P2), and the phone does not re-open that question.

Events' month rules and the dashboard's *Your events* are the same rule seen from
the heading side, and they were correct all along against a document that forbade
them.

**Off the ladder, and named here so they stop being copied:** `text-[13px]`,
`text-[11px]` as a row subtitle, `h-9`, `w-9`, `py-1.5`. Every one lives only in
`components/mobile/`, and every one sits between two values that already mean
something. See [audit.md](audit.md) M2.

### Fixed geometry

| | Value | Why fixed |
|---|---|---|
| Header | `h-14` — the desktop's own | One number for the app's top edge. A second one earns nothing and goes stale separately. |
| Bottom nav | `h-14`, plus `env(safe-area-inset-bottom)` | Four `44px` targets need `h-14` to breathe; the inset is added, not absorbed. |
| Page padding | `px-4 py-4` | |
| Body's bottom padding | the nav's height **plus** the inset, derived | `pb-20` is a guess at a number the nav owns. This is `top-[73px]` again ([audit.md](audit.md) A5), on the other edge of the screen. |
| Bottom sheet | `rounded-t-xl`, bottom corners square | It is anchored to an edge, so it has two corners. |
| Sheet height | `max-h-[85svh]`, no minimum | `svh` and not `dvh`: `dvh` is live, so the sheet would resize under the thumb as browser chrome collapses while a long form is being read. Not `vh` either — that is the *largest* viewport, so with the address bar showing the confirm can start below the fold. |
| Sheet close target | `h-11 w-11` around an `h-5 w-5` icon | 44 px. A bare `×` glyph is a 14 px target, which is amendment 1 broken by the control that gets pressed when a form is abandoned. |
| Overlay scrim | `bg-zinc-950/80` | The dialog's, not the drawer's: a sheet covers most of the screen. **One exception** — the canvas inspector takes none ([patterns.md](patterns.md) §7f), and taking none means **no backdrop element at all**, so the canvas behind stays live and the sheet is not modal. |

**Anything anchored to the bottom edge carries `env(safe-area-inset-bottom)`** —
the nav, a bottom sheet, and a sheet's confirm row. A control the home indicator
sits on is a control that misses. It is **added to** the element's own padding,
never absorbed by it: `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]`, not
`pb-[env(safe-area-inset-bottom)]`, or a device without an inset loses the
padding the control needed anyway.

> And the inset only exists if the document asks for it. `index.html`'s viewport
> meta carries **`viewport-fit=cover`**; without it iOS lays the page out inside
> the safe area and every `env(safe-area-inset-*)` evaluates to `0`. That was
> true here from Slice 21 to Slice 33 — two call sites, inert, on the device
> they were written for ([audit.md](audit.md) M10).

### What the phone does not re-decide

Colour, derivation, shape and wording are width-independent (P9). A tape colour is
the same hex, drawn as a `w-[3px]` bar on a sheet row and as the same 3 px on a
list row's leading edge — one derivation, two geometries. A missing link is
`red-400` and says what is missing. A collision is amber and a word. **48 V is a
bar in the hand too**, for exactly the reason it is one on the desk (P5).

The fixed geometry of §3 — the 7 px port dot, the 18 px port row, the 3 px tape —
is **drawing**, and it survives on a phone unchanged. What does not survive is
using it as a target (P9).
