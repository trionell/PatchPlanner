# Interface Contract: `ui/MobilePanel` and the phone's row

**Feature**: 034-phone-panel · Wave 6b

The UI contracts this slice adds or changes. Values here are the ones the code must
match **today**; the standing rule is that `design/` is authoritative and this file is
history once the slice lands (`CLAUDE.md`).

---

## `ui/MobilePanel`

```ts
interface MobilePanelProps {
  /** The surface's name. Repeats the section above it, deliberately (patterns §1). */
  title: string
  /** The query. Omit both to render no search control (patterns §7b). */
  search?: string
  onSearch?: (value: string) => void
  /** Placeholder for the search field, e.g. "Find a channel…". */
  searchPlaceholder?: string
  /**
   * Surface-specific bar controls, placed between the flexible gap and the
   * primary action. Print, the rental exports, a category filter, and — from
   * 6d — the Sheet | Flow toggle. A node, so the panel never grows a prop per
   * surface (research R1).
   */
  actions?: ReactNode
  /** The one filled control on the surface, last in the bar. Absent for a role that cannot act (P7). */
  primaryAction?: ReactNode
  /** The surface's status rail. Absent where the desktop surface has none. */
  strip?: ReactNode
  /** The rows. The panel adds no padding and no gap around them. */
  children: ReactNode
}
```

### What the panel owns

| | Value |
|---|---|
| Frame | `flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/40` |
| Bar | `flex flex-none flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2` |
| Bar title | `text-sm font-semibold text-zinc-100`, then `flex-1` |
| Bar control | `h-11 w-11` around an `h-4 w-4` icon — 44 px, the value `ui/Sheet`'s close takes |
| Search row | `flex flex-none items-center gap-2 border-b border-zinc-800 px-3 pb-2`, holding `Input size="md"` |
| Rows region | `flex-1 overflow-y-auto overscroll-contain` — **no padding, no gap** |
| Strip slot | Rendered as a **sibling** of the rows region, not inside it |

### What the panel does not own

Anything about the rows: their shape, their data, their tier, their empty state. The
panel is handed children and renders a frame around them — the same refusal that makes
`ui/Sheet` a component rather than a `className` (`components.md` §5).

It does not own the query, the filter, or any row state. It owns exactly one piece of
state: whether the search row is open.

### Bar order

Title · `flex-1` · search target · `actions` · `primaryAction`. Same order on every
surface; only the nouns change (`patterns.md` §1, §7b).

### Search behaviour

| Event | Result |
|---|---|
| Target tapped | Row opens, field focused |
| `Escape` in the field | Row closes, query cleared |
| Clear control tapped | Row closes, query cleared |
| Field emptied by typing | Row stays open |
| No `search`/`onSearch` given | No target, no row |

A non-empty query can never coexist with a closed row, so a filter is never applied
invisibly (FR-013).

---

## `mobile/CondensedListRow` — the row

```ts
interface CondensedListRowProps {
  title: ReactNode
  subtitle?: ReactNode
  /** One state or one affordance, never both (patterns §7c). */
  trailing?: ReactNode
  /** The entity's derived colour, drawn as a leading edge and a tint. */
  accentColor?: string
  onClick?: () => void
  className?: string
}
```

| | Value | Was |
|---|---|---|
| Root | `flex min-h-[44px] w-full items-stretch border-b border-zinc-800/60 text-left` | `rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5` |
| Content | `flex min-w-0 flex-1 flex-col justify-center px-3 py-1.5` | — |
| Title | `truncate text-sm font-medium leading-tight text-zinc-100` | `text-[13px]` |
| Subtitle | `truncate text-xs leading-tight text-zinc-400` | `text-[11px]` |
| Leading edge | `w-[3px]` element carrying `accentColor`; content ground takes `${accentColor}1a` | the whole row took the tint, via its own background |
| Element | `button` when `onClick`, else `div` | unchanged |

**The stated value is the height.** `min-h-[44px]` with `leading-tight` on both lines;
`py-1.5` is what falls out of it and is not the rule (**F3**, research R2). A row must
never grow to fit its content — both lines truncate.

**Pitch**: 45.5 px, against today's 48 px. The row is not taller; the card's own border
and the gap to the next one are what paid for a step up in type.

---

## The four status rails — the phone form

`PatchStatusRail` · `LightingStatusRail` · `EquipmentStatusRail` · `RentalStatusRail`.

**No prop changes.** Each branches on `useIsMobile()` internally, the way `ui/Drawer`
does (research R4), so no surface rendering one needs to know the viewport.

| | Desktop | Phone |
|---|---|---|
| Text | `text-[11px]` | `text-xs` |
| Padding | `px-3 py-2` | `px-3 py-2`, with `min-h-[44px]` when it is a control |
| Element | `div`, containing an `h-6` button when a filter is offered | **`button`** when a filter is offered, else `div` |
| Filter control | `size="xs"` button, `h-6 px-2 text-[11px]` | none — the strip is the control |
| Affordance | the button's label | `only gaps ›` / `show all ›` at the trailing edge, in the state's own hue |
| `Open Rig` | present | **absent** — the drawer is not mounted on a phone until 6c (`M5`) |
| What it says, derives, and tints | — | **identical** (P9, FR-028) |

A rail with nothing to filter to — *complete*, *addressed*, *all covered* — draws no
chevron and is not a control, at either width. A rail given no handler (a read-only role)
is a sentence.

---

## `lib/patchCapacity` — two additions

```ts
export function inputPatchStatus(input: InputPatchStatusInput): PatchStatus
export function outputPatchStatus(input: OutputPatchStatusInput): PatchStatus
```

`PatchStatus` itself is unchanged. These are the construction that lives inline in
`InputSheet` and `OutputSheet` today, extracted at its second caller so the phone branch
can reach it (research R6, `components.md` §6).

## `lib/mobileChannelList` · `lib/mobileOutputList` — one field

`MobileChannelListItem` and `MobileOutputListItem` gain `hasGap: boolean` — true when the
resolved chain has no ultimate source. Derived, never stored, never sent (data-model §1).
