# Research: The canvases (Wave 6d)

Decisions taken before implementation, each with what was rejected. The visual language
is settled in [`design/`](../../design/) and nothing here restates it — these are the
questions the code asks that the documents do not answer.

---

## R1 · The desktop's zoom is a layout change. The phone's must be a viewport change.

**Decision**: On a phone the graph's logical size is **pinned** at `820 × 640`, and zoom
scales the rendered box only. On a desk it keeps today's behaviour exactly.

**Why this is not a preference.** Both canvases compute

```ts
const canvasWidth  = wrapperWidth / zoom      // wrapperWidth is already max(820, measured)
const canvasHeight = CANVAS_HEIGHT / zoom
```

and place the desk lane at `canvasWidth − NODE_WIDTH − 24`. So zooming **out** on a desk
*grows the coordinate space* — the processing lane gets more logical room inside the same
panel, which is what its own comment says it is for. That is right for a desk, where the
panel is 1180 px and the graph is being composed.

In a hand it is exactly wrong. The measured width is 341, which the existing clamp raises
to 820, so at the fit zoom of 0.42 `canvasWidth` would become **1952** and the desk lane
would slide out to `x = 1728`. Zooming out to see the whole graph would push the graph
away as fast as you zoomed.

`patterns.md` §7f already names the distinction without knowing it was in the code:
*“the canvas is a viewport… pan and zoom move the window onto it and move nothing within
it.”* This is that sentence, implemented.

**Rejected**: lowering `CANVAS_MIN_WIDTH` for the phone. It is where every stored
`position_x` in the database already is; changing it re-lays-out every desktop graph.

**Rejected**: a `fixedWidth` prop passed from the two tabs. Two call sites answering the
same question is how `NodeShell` acquired two copies. The canvas calls `useIsMobile()`
itself — the `ui/Drawer` precedent, and the fifth use of it in this wave.

---

## R2 · Fit is measured, not assumed, and it lives in `lib/`

**Decision**: `lib/canvasFit.ts` exports one pure function.

```ts
export function fitScale(viewportW: number, viewportH: number, graphW: number, graphH: number): number
```

It returns the largest scale at which the graph fits both axes, floored to two decimals
so the readout does not jitter, clamped to `(0, 1]`. The canvas measures its wrapper with
the `ResizeObserver` it already has and reports the result upward.

**Why a pure function.** The constitution puts derivations in `lib/` so they are testable
without rendering, and this one has four edge cases worth a test each: a viewport wider
than the graph (cap at 1), a viewport of zero (the first frame, before layout), a very
short viewport, and the rounding that decides whether the readout says 42 % or 41.9 %.

**Why measured rather than the 0.42 the mockup computed.** The canvas region's height is
whatever is left after a bar that is one row in Sheet and two in Flow, a strip that some
surfaces have and some do not, and a withheld-gesture note that may be open or closed. A
constant would be wrong on the first surface that differs, and silently.

---

## R3 · Who owns zoom, and what `fit` does to that

**Decision**: the tab keeps owning `zoom`, as it does today, and gains `fit`. The canvas
reports fit through a new optional `onFitChange`.

```
tab:    zoom: number | null      // null = "fit, not yet measured"
        fit:  number             // 1 until the canvas has measured
canvas: effective = zoom ?? fit
```

On the first measurement the tab adopts fit; on later measurements — a rotation, the
bar wrapping to a second row — it **clamps the current zoom into the new range rather
than resetting it**, so a working zoom survives a rotation (spec edge case).

**Why not move zoom into the canvas.** The control is in the panel's bar, and the bar
belongs to the shell. That split is Slice 25 FR-020 and it is why `zoom` is a tab's state
in the first place; a phone does not get to re-answer it.

**Rejected**: a sentinel `0` instead of `null`. `zoom={0}` divides by zero in a formula
two files use, and one wrong guard makes the graph disappear rather than misbehave
visibly.

---

## R4 · Panning is the platform's, and that is what withholding buys

**Decision**: the phone wraps the canvas in the same `overflow: auto` box the desktop
already uses, and **adds no gesture handler for panning at all**.

Native scroll gives both axes, momentum, rubber-banding, and every accessibility and
platform behaviour a hand-written pan does not. It is available only because §7g
withholds cabling and node dragging — the two gestures that would otherwise compete for
the same finger. So the withholding is not merely a restriction the phone accepts; it is
what makes the pan good.

`touch-action: pan-x pan-y` is set on the viewport so the pinch handler can claim two
fingers without the browser's own page zoom taking them.

**Rejected**: a pointer-based pan like `StagePlotCanvas`'s. That canvas needs one because
its pan is stored in the plot's own view state and shared with a coordinate readout. This
one has no such need, and hand-writing momentum is how a phone canvas feels wrong.

---

## R5 · Tap versus pan, without touching a shared primitive

**Decision**: a **pan guard** local to each canvas. `pointerdown` on the viewport records
the origin; `pointermove` past 3 px sets `moved`; every `onSelect` the canvas passes down
is wrapped so it no-ops while `moved` is set.

This is Slice 35's finding applied where the handler already is. That slice found the
same defect on the stage plot — *“a thumb on a riser opened the riser instead of panning,
and the plot could only be moved from empty floor”* — and fixed it with a 3 px threshold
in a state machine. Here the threshold is all that is needed, because the pan itself is
the platform's.

**Rejected**: `data-select-key` attributes and a `closest()` lookup on `pointerup`. It
would need `NodeShell` to emit an attribute, and `NodeShell` is a shared drawing
primitive that FR-033 pins. The guard needs nothing from it.

**Rejected**: trusting the browser to suppress `click` after a scroll. It usually does
and does not always, and *usually* is not a specification.

---

## R6 · Moving the window is arithmetic, not `scrollIntoView`

**Decision**: `lib/canvasFocus.ts` — a pure function from a node's logical position, the
zoom, and the viewport's size to a scroll offset.

```ts
export function focusOffset(node: {x: number; y: number}, opts: {
  zoom: number; viewportW: number; viewportH: number; nodeW: number; clearBottom?: number
}): { left: number; top: number }
```

Two callers, and the second is why it is a function rather than a call:

- **search** (FR-030) centres the first match, at every width;
- **selection on a phone** (FR-019) puts the selected node in the part of the window the
  inspector sheet does not cover, which is `clearBottom`.

**Why not `element.scrollIntoView({ block: 'nearest' })`.** The canvas already knows
every node's position — it computes `layout` for the drawing — so a DOM query is a second
source of truth for something already derived, and `nearest` cannot express *“clear of
the bottom 45 %”*. The one existing caller of `scrollIntoView` in this area,
`SourceRow`'s, stays: it scrolls a row inside the rail's own list, which is a different
scroll container and has no arithmetic available.

**Which node is “the first match”** is decided by `lib/canvasFocus.ts` too, from the same
`matchesSearch` predicate the dimming already uses, walked in layout order. Deriving it
twice is how the dimmed set and the focused node would come to disagree.

---

## R7 · The inspector's phone form is a new frame, not a changed rail

**Decision**: a new `graph/InspectorFrame` that *renders* `InspectorRail` and
`InspectorHeader` on a desk and `ui/Sheet` with `scrim={false}` in a hand. Both flow
inspectors use it. `InspectorRail` itself is **not touched**.

```tsx
export function InspectorFrame({ heading, pill, onClose, children }) {
  if (useIsMobile()) return <Sheet open scrim={false} onClose={onClose} title={…}>{children}</Sheet>
  return <InspectorRail><InspectorHeader label={heading} pill={pill} onClose={onClose} />{children}</InspectorRail>
}
```

**Why this shape.** The desktop return is byte-identical *by construction* rather than by
care — it is the same two components in the same order, which is a stronger guarantee
than any diff. And `InspectorRail` keeps working for its third caller, `StagePlotTab`,
which passes a `className` and supplies no header at all; making `heading` and `onClose`
part of the rail would have made them optional there and turned one component into two
shapes.

**Why the header moves from a child to a prop.** On a phone those three things — the
kind, the vocabulary pill, the way out — are exactly what `ui/Sheet`'s own header
carries. `components.md` §5 wrote that down before this slice existed: *“`title` (a node:
the inspector puts a `MicroLabel` and a `Pill` there)”*.

**Rejected**: branching inside each inspector. Two files wiring the same sheet is two
files to keep in step, and the two flow inspectors are the pair this project has already
watched drift.

---

## R8 · One zoom control, and the copy 6c made goes

**Decision**: `graph/ZoomControl` branches on `useIsMobile()` and renders three 44 px
targets. `StagePlotTab`'s hand-built phone cluster is deleted and replaced by it. One new
optional prop, `resetLabel`, renders a second line under the percentage on a phone only.

The stage plot resets to 100 % and passes no label; the flow canvases reset to fit and
pass `"fit"`. **A control whose reset target is not obvious has to say what it is**, and
the flow canvases' is the first one that is not.

**Why the copy has to go now rather than later.** 6c built it because the shared control
is `h-7 w-7` and `tokens.md` §7 amendment 1 forbids a 28 px target in the hand. That was
correct with one phone canvas. With three it is the condition that produced two
`NodeShell`s, and this document has now recorded the same shape five times in one wave.

**Desktop guarantee**: the control's desktop return is unchanged, asserted by rendering
it at four zoom levels before and after and diffing the markup.

---

## R9 · Which control size the inspector's fields take

**Decision**: `graph/InspectorRail` exports `useInspectorControlSize()`, returning
`'sm'` on a desk and `'md'` in a hand. Each inspector calls it once and spreads the
result.

`tokens.md` §7 amendment 2 is the rule — *type is read, geometry is touched* — and the
rail is the one place in the application where it is not already satisfied by a default:
`Input`, `Select` and `Button` default to the phone's `h-10`, but the rail deliberately
overrides them to `sm` and `h-7` because a 240 px column cannot afford 40 px rows.

**Rejected**: `size={isMobile ? 'md' : 'sm'}` written out at each of the ~16 controls.
Sixteen copies of one rule is fifteen chances to miss one, and a missed one is invisible
in review.

**Rejected**: making `Input`/`Select` branch internally. That changes every control in
the application to serve two components in one of them.

---

## R10 · One panel, two views

**Decision**: `MobileEntityList` keeps owning the phone's frame for both views. It gains
four pass-throughs — `actions`, `titleAdornment`, controlled `search`/`onSearch` — and
`children`, which **replace the rows** when present.

**Why one component rather than a second panel for Flow.** Two `MobilePanel` instances
would remount the bar on every toggle, so the search row would close and the overflow
sheet would lose its state on a control whose whole job is *what you are looking at*.
One frame is also what makes the toggle mean *another view of this*, rather than
*somewhere else*.

**Why the search query moves to the caller.** The tab already holds a `search` state for
its desktop branch and `MobileEntityList` held a second one, so the phone and the desk
had two queries for one surface. Lifting it removes that duplicate and is what lets the
canvas read the term the bar is showing. The *filtering* rule stays inside the component,
so the three callers do not each write it.

**Rejected**: a `renderContent(query)` render prop. It puts a function where a node will
do, for one caller.

---

## R11 · What the phone withholds, and the name it withholds it by

**Decision**: the canvases withhold the spatial gestures by branching on
`useIsMobile()` internally, in exactly one expression each, and the branch is named in
the code by what it withholds rather than by the device.

Three gestures go: port-to-port cabling (`onPortPointerDown`, `onPortClick`'s connect
half), node dragging (`onDragStart`), and the cable info dialog's **Disconnect** — which
is reachable only from a port and so goes with the ports.

**The cable picker and the cable info dialog get no phone form**, because neither is
reachable: both open from a port, and a port is not a target. That is recorded in the
spec's Out of Scope rather than left as a gap someone re-discovers.

`readOnly` stays exactly what it is — a role — and the two never mix. FR-026 and the
wave's standing rule (`!isMobile` in no permission expression) are asserted by a grep in
the quickstart.

---

## R12 · Pinch

**Decision**: a two-pointer handler on the viewport that scales about the midpoint of the
contacts, clamped to `[fit, 1]`, written once in a hook — `hooks/usePinchZoom.ts` — and
used by both canvases.

The focal-point arithmetic is the whole of it and it is easy to get subtly wrong: the
logical point under the midpoint has to be the same before and after, which means
adjusting `scrollLeft`/`scrollTop` in the same frame as the scale. Two copies of that is
two chances to be one frame late.

**Rejected**: native `touch-action: pinch-zoom`. It zooms the *page*, not the canvas, so
the bar and the strip would zoom with it and the panel would leave the screen.

---

## R13 · What is asserted rather than assumed

Every phase of this wave has carried this block, and each one has caught something.

| Claim | How |
|---|---|
| Frontend only | `git diff -- backend/` is empty |
| No shared drawing primitive changed | `git diff -- components/event/graph/NodeShell.tsx PortDot.tsx PortRow.tsx LaneBands.tsx tokens.ts` is empty |
| `InspectorRail`'s stage-plot caller is unaffected | `git diff -- components/event/graph/InspectorRail.tsx` shows **additions only** (the size hook), and `StagePlotTab`'s rail markup renders identically |
| Both flow inspectors' desktop markup is unchanged | rendered at every selection kind, before and after, and diffed |
| `ZoomControl`'s desktop markup is unchanged | rendered at four zoom levels, before and after, and diffed |
| No reach check in a permission expression | `grep -rn '!isMobile' frontend/src` returns nothing |
