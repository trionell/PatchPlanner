# Implementation Plan — the flow canvas as a plane

**Branch**: `037-flow-canvas-plane` (cut from `036-phone-canvas`, which is unmerged)
**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)
**Design**: [mockup.html](./mockup.html), revision 2, approved

## Technical context

| | |
|---|---|
| Language | TypeScript 5, React 18, Vite, Tailwind, TanStack Query |
| Backend | **One SQL migration, no Go change.** Migration 047 is `UPDATE`s only — no schema change, no model field, no handler. |
| Testing | Vitest with `renderToStaticMarkup`. No DOM, no RTL — so the plane arithmetic must be **pure functions in `lib/`** to be testable at all. |
| New dependency | None |
| Reach | `useIsMobile()`, `(max-width: 767px)` |

Design values come from `design/`, not from slice contracts. This slice changes §7f and §7h, so it
updates them in the same commit.

## Constitution check

- **Pure logic in `lib/`, tested.** The origin, the extent, the compensation delta and the fit input
  all become pure functions — the only way they are testable under `renderToStaticMarkup`.
- **One rule, one place.** R10: both canvases call the same module. The known failure mode on this
  pair is a change landing in one and not the other.
- **A reach check is never a permission.** Unchanged from 036 and re-grepped (see quickstart).
- **No behaviour asserted that the tests cannot see.** Scroll compensation and momentum are
  DOM-only; they go in the handset pass, named, not claimed as covered.

## Phases

### Phase 0 — the shared module *(no UI change)*

`frontend/src/lib/canvasPlane.ts`:

```ts
export interface PlanePoint { x: number; y: number }
export interface PlaneOrigin { x: number; y: number }

/** The plane's top-left in logical coordinates: the least-placed node, less a margin. */
export function planeOrigin(points: PlanePoint[], margin?: number): PlaneOrigin

/** How far a scroll offset must move to keep the content still when the origin shifts. */
export function originShift(before: PlaneOrigin, after: PlaneOrigin, zoom: number): PlanePoint
```

Extent is **measured**, not computed: absolutely-positioned children contribute to a positioned
ancestor's `scrollWidth`/`scrollHeight`, so the content div reports its own size exactly, with no
need to duplicate each node's port-count-to-height arithmetic. `planeOrigin` handles the empty case
(no nodes → `{0, 0}`).

Tests: `canvasPlane.test.ts` — empty, single node, negative x, negative both axes, the margin, and
the shift delta at zoom ≠ 1.

### Phase 1 — the remembered view

`frontend/src/hooks/useFlowView.ts`, modelled on `usePatchView.ts` (same key shape, same
`try/catch`, same "preference simply doesn't persist" comment):

```ts
useFlowView(eventId: number, tab: 'inputs' | 'outputs'):
  [FlowView | null, (view: FlowView) => void]      // FlowView = { zoom, panX, panY }
```

`null` means *never opened here* — the caller opens at *fit*. Writes are debounced by the caller,
not the hook, so a pan does not write 60 times a second.

Tests: `useFlowView.test.ts` — round trip, absent key, malformed JSON, and a throwing `localStorage`.

### Phase 2 — the canvases *(the bulk)*

Applied identically to `InputGraphCanvas.tsx` and `AudioOutputsTab.tsx`'s `OutputGraphCanvas`:

1. Delete `zoneChannelsX` / `zoneDestinationsX` / `zoneProcessingBounds` / `clampProcessingX`, and
   every `canvasWidth` / `canvasHeight` term. `CANVAS_MIN_WIDTH` goes; `CANVAS_HEIGHT` survives only
   as the desktop **region** height (A4).
2. Rails read their stored coordinates instead of `ZONE_SOURCES_X` / `canvasWidth − 224`, and gain
   the same `onDragStart` every other node has — still `spatial`-gated, still two statements.
3. Node rendering offsets by the origin: `left: node.x − origin.x`, `top: node.y − origin.y`.
4. Node drag loses its clamp and its `Math.max(8, …)` floor; it persists raw logical coordinates.
5. `useLayoutEffect` on the origin applies `originShift` to `scrollLeft`/`scrollTop` (R4).
6. `LaneBands` removed from both, then the file deleted.
7. The rail's `max-h-[420px] overflow-y-auto` and the whole `railScroll` path removed (R8).

The cable-path effect already measures ports through `getBoundingClientRect` relative to the
container, so it needs no origin term — it never knew the logical coordinates in the first place.

### Phase 3 — fit and the opening state

`fitScale` is unchanged; its arguments become the measured content box. The tab shells
(`AudioInputsTab.tsx`, `AudioOutputsTab.tsx`) seed `zoom`/pan from `useFlowView`, falling back to
*fit*, and write back debounced at 800 ms (`StagePlotTab`'s figure).

### Phase 4 — the data tidy

`backend/migrations/047_flow_plane_positions.{up,down}.sql`. `UPDATE`s only, per FR-015. `down` is a
documented no-op: the values it would restore were window widths, not placements (A3).

### Phase 5 — documentation

`design/patterns.md` §7f (the canvas is a plane, not a fitted rectangle) and §7h; `design/audit.md`
(the finding, and D3 for the stage plot); `design/components.md` §5 (`LaneBands` gone, the rail's
cap gone); `design/design-language.html`; `ROADMAP.md` (Slice 37, D3).

## Risks

| Risk | Handling |
|---|---|
| Origin compensation visibly jumps during a drag | Named test on the pure delta; the DOM half is §C of the handset pass |
| A change lands in one canvas and not the other | R10 — shared module; a grep assertion in the quickstart |
| Rails become draggable onto each other | Accepted; it is the same freedom every other node has |
| The Sources rail has nowhere to store a position | A1 — stays at a constant, recorded as a follow-up rather than faked |
| `scrollWidth` measurement loops | Content does not depend on the box size, so it converges in one pass |
