# Interface Contract: the bar's overflow, and the phone shell

**Feature**: 035-phone-surfaces · Wave 6c

The UI contracts this slice adds or changes. Values here are the ones the code must match
**today**; the standing rule is that `design/` is authoritative and this file is history
once the slice lands (`CLAUDE.md`).

---

## 1 · `ui/MobilePanel` — the overflow

Added to 6b's five props. Everything else in
[`034-phone-panel/contracts/mobile-panel.md`](../../034-phone-panel/contracts/mobile-panel.md)
still holds.

```ts
export interface PanelAction {
  label: string
  icon?: ReactNode
  hint?: string
  onClick: () => void
}

interface MobilePanelProps {
  // …6b's five, unchanged…

  /**
   * Bar controls that change WHAT YOU ARE LOOKING AT — a category, a
   * vocabulary, a plot, a view. Visible, in the bar. A node, because their
   * shapes are the surface's own business. (6b's prop, meaning unchanged.)
   */
  actions?: ReactNode

  /**
   * Bar controls that DO A THING AND ARE FINISHED — Open Rig, Print, an
   * export. A typed list, because the sheet they open is always the same
   * shape and six callers building it is how two of them differ (research R1).
   */
  overflow?: PanelAction[]
}
```

### The rule, stated once

> A control that changes **what you are looking at** stays in the bar.
> A control that **does a thing and is finished** goes in the overflow.

| | `actions` (visible) | `overflow` |
|---|---|---|
| Inventories | category filter | — |
| Settings · My Defaults | vocabulary picker | — |
| Stage Plots | plot picker, `Top · Front · Side`, zoom | — |
| Audio Inputs | — | Open Rig, Groups & DCAs, Print patch sheet |
| Audio Outputs | — | Open Rig, Print |
| Lighting | — | Universes, Print |
| Signal Flow | — | Print |
| Rental | — | Export .xlsx, Export PDF, Export price list |
| Equipment · Overview · Events · Dashboard | — | — |
| *6d* | `Sheet │ Flow` | — |

### What the panel renders

| `overflow.length` | Bar | Sheet |
|---|---|---|
| `0` or absent | nothing | none |
| `1` | that action's own target, `h-11 w-11`, `aria-label` = its `label` | none |
| `2+` | a `⋯` target, `aria-label="More actions"` | opens on tap |

| | Value |
|---|---|
| Overflow target | `h-11 w-11` around an `h-4 w-4` icon — the bar's one control size |
| Sheet | `ui/Sheet`, `flush`, `title` = the panel's `title` |
| Action row | `flex min-h-[52px] w-full items-center gap-3 border-b border-zinc-800/60 px-3 text-left` |
| Row icon | `h-4 w-4 text-zinc-400`, drawn — the row is the target |
| Row label | `text-sm text-zinc-100`, `flex-1` |
| Row hint | `text-xs text-zinc-500`, `flex-none` |

The 52 px row and its hairline are `SectionSwitcher`'s, deliberately: the phone has one
list-of-destinations shape and this is the second thing to use it.

### The arithmetic this exists to satisfy

The bar has **317 px** — 375, less the body's `px-4` twice, less the panel's two borders,
less the bar's own `px-3`. With the overflow, the widest bar in the application is
**246 px** (a 90 px title, three 44 px targets, two 8 px gaps). Without it, Audio Inputs
would be **350 px** and would wrap.

**A bar may still wrap**, and one does: Stage Plots (§3 below). `flex-wrap` stays on the
bar and `patterns.md` §7b's *"wraps to two rows before it scrolls"* is unchanged.

---

## 2 · The phone shell — a fixed-height column

Replaces `patterns.md` §7a's *"The page scrolls, not the surface"* and closes 6b's
deferral.

```
Layout, phone            h-[100svh] flex flex-col overflow-hidden bg-zinc-950
├─ header                h-14 flex-none  (sticky no longer needed — it cannot scroll)
├─ main                  flex-1 min-h-0 overflow-hidden px-4 py-4
│    └─ EventDetail      flex h-full flex-col gap-3
│         ├─ switcher    flex-none        ← back target + SectionSwitcher, 44 px
│         └─ section     flex-1 min-h-0
│              └─ panel  flex h-full min-h-0 flex-col overflow-hidden
│                   ├─ bar    flex-none
│                   ├─ rows   flex-1 min-h-0 overflow-y-auto
│                   └─ strip  flex-none
└─ MobileNav             h-14 flex-none, static, + env(safe-area-inset-bottom)
```

**Two invariants, and they are the contract:**

1. **Exactly one element scrolls** — the rows region. Nothing else in the column carries
   `overflow-y-auto`, `overflow-y-scroll` or `overflow-auto`.
2. **Every other child of the column is `flex-none`.** Anything that may grow and also
   carries `overflow-hidden` can collapse below its content with no scrollbar, which is
   the exact defect that made 6b revert this.

**Removed**: `Layout`'s `pb-[calc(3.5rem+env(safe-area-inset-bottom))]` on the phone body.
The nav is a sibling now, so there is nothing to reserve for. The inset stays on the nav
and is still **added to** its own padding, never absorbed (`M10`).

**`min-h-screen` → `h-[100svh]`**: `svh` and not `dvh` for the reason `tokens.md` §7
already gives about the sheet — `dvh` is live, so the whole column would resize under the
thumb as browser chrome collapses.

---

## 3 · The phone header's title

```ts
// components/Layout.tsx
const match = useMatch('/events/:id')
const eventId = match ? Number(match.params.id) : NaN
const eventQuery = useQuery({
  queryKey: ['event', eventId],
  queryFn: () => getEvent(eventId),
  enabled: Number.isFinite(eventId),
})
const title = eventQuery.data?.name ?? getPageTitle(location.pathname)
```

| | Value |
|---|---|
| Slot | the existing `text-sm font-semibold text-zinc-100` beside the brand mark |
| Overflow | `truncate min-w-0` — a long name loses its tail |
| Fallback | `getPageTitle`, unchanged, including while loading and on error |
| Desktop | **untouched.** The desktop header is a different element and already prints the name on the page |

`['event', id]` is the key and fetcher `EventDetail` already uses, so this shares one cache
entry and one request (research R12).

---

## 4 · `event/StatusStrip` — a fifth caller

No API change. `SignalFlowStatusRail` becomes its fifth caller (F1), passing:

| | Value |
|---|---|
| `tint`, gaps > 0 | `border-amber-500/40 bg-amber-500/[0.05]` |
| `tint`, otherwise | `border-zinc-800 bg-zinc-950/60` |
| `filter` | `{ label: 'Show N', onClick }` when `gaps > 0` or the filter is on; absent otherwise and absent for a read-only role |

Both tints are the values the rail already hand-writes, moved rather than re-chosen.

**The check**: `SignalFlowStatusRail`'s **desktop** return must be byte-identical before
and after — every state rendered and the markup diffed, which is what 6b did to the other
four (research R9).

---

## 5 · `StagePlotInspector` — one optional prop

```ts
interface StagePlotInspectorProps {
  // …unchanged…
  /**
   * Whether the spatial rows — Position, Size, Rotation, Tilt — are rendered.
   * `false` only from the phone's sheet: placing is a desk job (patterns §7g),
   * and nine numeric fields is most of a 375 px sheet. Default `true`, so the
   * desktop is not touched.
   */
  spatial?: boolean
}
```

`spatial={false}` renders one note in their place: *"Position and size are set on a
computer."* The component's root is already a bare `<section className="flex flex-col
gap-3">` — the `w-60 shrink-0 border-l` frame belongs to `StagePlotTab` — so it needs no
split to live in a sheet.

---

## 6 · The withheld-gesture sentence

One shape, one place in the panel, on every surface that withholds a gesture. Today there
is exactly one.

| | Value |
|---|---|
| Position | inside the panel, below the bar, above the body — *where the editor would be* |
| Frame | `flex gap-2 border-b border-zinc-800/60 bg-zinc-950/35 px-3 py-2.5` |
| Type | `text-xs leading-relaxed text-zinc-400`, the reason in `text-zinc-300 font-medium` |
| Words | *"Placing elements is a desk job — open this plot on a computer. Tap anything on it to read or edit what it is."* |

**It does not vary with role**, it is not a banner, not a dialog and not a disabled control
(`patterns.md` §7g). It names the reason and what is still available, and the read view
above it is complete for everyone.

---

## 7 · The signal-flow row, and its stated exception

| | Value |
|---|---|
| Row | `flex items-stretch border-b border-zinc-800/60`, `min-h-[44px]` |
| Line 1 | `text-sm font-medium text-zinc-100`, number in mono amber — truncates |
| Line 2 | `ChainLine`, `font-mono text-[11px]` — **wraps** |
| Gap | the chain's own error tone, wording unchanged from the desktop |

**The exception is written into `design/` in the same commit** (`tokens.md` §7,
`patterns.md` §7c), worded as a constraint rather than a licence:

> The chain wraps because it **is** the content. A subtitle that summarises a row still
> truncates — that is what a fixed row pitch is for.

---

## 8 · What must not change

| | Assertion |
|---|---|
| Every desktop surface | no markup change, for any state |
| `SignalFlowStatusRail` desktop | byte-identical, verified by diff over all states |
| `StagePlotInspector` desktop | byte-identical — `spatial` defaults to `true` |
| `backend/`, `frontend/src/api/` | `git diff` empty |
| Density tiers | no new value outside the two tiers in any phone branch |
| Rows visible at 375 × 667 | no fewer than before this slice |
