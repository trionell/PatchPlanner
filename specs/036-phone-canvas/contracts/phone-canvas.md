# Contract: the Flow canvas in the hand

The component-level contract for Wave 6d. Values are looked up in
[`design/`](../../../design/) — [`patterns.md`](../../../design/patterns.md) §7b/§7f/§7g,
[`tokens.md`](../../../design/tokens.md) §7,
[`components.md`](../../../design/components.md) §5 — and are **not** restated here. This
document records the API each component gains and the invariant behind it, which is what
a reviewer needs and `design/` deliberately does not carry.

---

## §1 · `event/graph/ZoomControl` — one control, two reaches

```ts
interface ZoomControlProps {
  zoom: number
  onZoomChange?: (zoom: number) => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onReset?: () => void
  /** NEW. A word under the percentage, on a phone only, naming what tapping it does. */
  resetLabel?: string
}
```

**The branch is inside the component** (`useIsMobile()`), so the three canvases get a
phone form from one place. Desktop: `h-7 w-7` ghost buttons, unchanged. Phone: three
targets of at least 44 px, the middle one carrying the percentage over `resetLabel`.

| Invariant | |
|---|---|
| The desktop rendering is unchanged | asserted by rendering four zoom levels before and after and diffing |
| `resetLabel` renders **only** on a phone | a desk shows a percentage that resets to 100 %, which needs no caption |
| The component owns the look; the caller owns the stepping | Wave 2's split, unchanged — this slice adds a third caller, not a third look |

**Callers**: the two audio tabs (`resetLabel="fit"`, step ×1.4 over `[fit, 1]`) and
`StagePlotTab` (no label, step ×1.25 over `[0.05, 20]`). `StagePlotTab`'s hand-built
phone cluster is **deleted** — it is the copy this consolidates.

---

## §2 · `event/graph/InspectorFrame` — the rail, or the sheet

```ts
interface InspectorFrameProps {
  /** What the rail is showing: "Source", "Stagebox", "Desk"… */
  heading: string
  /** The vocabulary chip each side tints differently. Optional. */
  pill?: ReactNode
  onClose: () => void
  children: ReactNode
}
```

Desk: `<InspectorRail><InspectorHeader …/>{children}</InspectorRail>`.
Hand: `<Sheet open scrim={false} onClose title={<MicroLabel/> + pill}>{children}</Sheet>`.

| Invariant | |
|---|---|
| The desktop return is byte-identical **by construction** | it renders the same two components in the same order; nothing is copied |
| `InspectorRail` is not modified | its third caller, `StagePlotTab`, keeps a component with one shape |
| **No footer, no confirm** | the rail holds no draft and commits per field at every width (`components.md` §3); a **Save** would imply one exists |
| `scrim={false}` | the one sheet read *against* what is behind it (`patterns.md` §7f) — no backdrop element, no focus trap, no tap-outside |

Also exported from `InspectorRail.tsx`:

```ts
/** 'sm' on a desk, 'md' in a hand — tokens.md §7 amendment 2, in one place. */
export function useInspectorControlSize(): 'sm' | 'md'
```

The rail is the only surface in the application where the phone's control geometry is not
already the default: `Input`, `Select` and `Button` default to `h-10`, and the rail
overrides them to `sm` because a 240 px column cannot afford 40 px rows. A phone has no
column, so the override does not apply.

---

## §3 · The two canvases — what reach changes, and nothing else

Both `InputGraphCanvas` and `OutputGraphCanvas` call `useIsMobile()` internally. Two new
optional props, and every existing one is unchanged.

```ts
  /** NEW. The largest scale at which the whole graph fits, reported after each measure. */
  onFitChange?: (fit: number) => void
```

`zoom` widens to `number | null`, where `null` means *fit, not yet measured*.

| | Desk | Hand |
|---|---|---|
| Logical space | `max(820, measured)/zoom × 640/zoom` | **`820 × 640`, fixed** |
| Zoom means | a **layout** change — zooming out gives the processing lane more logical room | a **viewport** change — the window moves, the graph does not |
| Wrapper | `height: 640`, `overflow: auto` | `flex-1 min-h-0`, `overflow: auto`, `touch-action: pan-x pan-y` |
| Pan | the platform's | the platform's |
| Pinch | — | `usePinchZoom`, about the contacts' midpoint |
| Port `onClick` / `onPointerDown` | wired | **absent** |
| Node `onDragStart` | wired | **absent** |
| Node / rail-row `onSelect` | wired | wired, behind the pan guard |
| Cable picker · cable info dialog | wired | **unreachable** — both open from a port |
| Search | dims non-matches | dims non-matches |
| Search moves the window | **yes** (new, unconditional) | **yes** |

**The pan guard**: `pointerdown` records the origin, `pointermove` past 3 px sets a ref,
and every `onSelect` is wrapped so it no-ops while the ref is set. Slice 35 found this
defect on the stage plot and fixed it the same way. It needs nothing from any shared
drawing primitive, which is what keeps FR-033 true.

---

## §4 · `mobile/MobileEntityList` — one frame, two views

Four additions, all optional, all pass-through except the last.

```ts
  /** Bar controls that change what you are looking at — here `Sheet │ Flow` and the zoom. */
  actions?: ReactNode
  /** One thing belonging to the title — the withheld-gesture `i`. */
  titleAdornment?: ReactNode
  /** Controlled search. Omit both and the component keeps its own, as Lighting does. */
  search?: string
  onSearch?: (value: string) => void
  /** Drawn instead of listed: when present, this replaces the rows. */
  children?: ReactNode
```

| Invariant | |
|---|---|
| **One `MobilePanel`, both views** | two instances would remount the bar on every toggle, closing the search row and the overflow sheet — on a control whose whole job is *what you are looking at* |
| The filtering rule stays inside | three callers must not each write it |
| The query is the surface's, not the component's | the tab already held one for its desktop branch; the phone held a second, so one surface had two queries for one search |
| `onAdd` is the caller's decision per view | Flow passes none (FR-022) |

---

## §5 · `lib/` — the two pure functions, and why they are pure

```ts
// lib/canvasFit.ts
export function fitScale(vpW: number, vpH: number, graphW: number, graphH: number): number

// lib/canvasFocus.ts
export function firstMatch(layout: NodeLayout[], matches: (n: NodeLayout) => boolean): NodeLayout | undefined
export function focusOffset(
  node: { x: number; y: number },
  opts: { zoom: number; viewportW: number; viewportH: number; nodeW: number; clearBottom?: number },
): { left: number; top: number }
```

The constitution puts derivations in `lib/` so they are testable without rendering, and
both of these have edge cases that are invisible in a component test: a viewport of zero
on the first frame, a graph smaller than its window, a match already fully visible, and a
node at the far edge where clamping decides whether the window overshoots.

`clearBottom` is the height the inspector sheet covers. It is why this is arithmetic
rather than `scrollIntoView({ block: 'nearest' })`, which cannot express *clear of the
bottom 45 %* — and the canvas already knows every node's position, so a DOM query would be
a second source for something already derived.

---

## §6 · The one sentence, and where it goes

> *Patching is a desk job — open this event on a computer. Tap any box to read or edit
> what it is.*

`ui/InfoNote`, open by default, closing to the `i` in the panel title's own line, the
choice remembered — 6c's construction, unchanged. Two words differ from the stage plot's
and both are load-bearing: **“this event”**, because the graph belongs to the event and
both audio tabs share the rig, and **“any box”** rather than *anything on it*, because on
this canvas the ports are drawn and are not targets.

It does not vary with role. It is about the surface.
