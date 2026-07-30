# Data model: The canvases (Wave 6d)

**No stored entity, no field, no query, no endpoint.** The canvas draws what
`GET /events/{id}/audio-patch` already returns and the inspector writes through the
mutations the rail already owns. This document covers the only model this slice has,
which is **derived view state** — who owns each piece of it and why.

---

## §1 · View state, and where each piece lives

| State | Owner | Persisted | Why there |
|---|---|---|---|
| `view: 'sheet' \| 'flow'` | the tab, via `usePatchView` | `localStorage`, per event and per tab | Already exists and already persists. The phone is a second reader, not a second store — it is one user's viewing preference with no meaning to anyone else sharing the event. |
| `selection` | the tab | no | Already exists. Held by the tab rather than the canvas so it survives the view toggle in both directions (Slice 25 FR-002). The phone needs exactly that, because the sheet is mounted beside the canvas rather than inside it. |
| `zoom: number \| null` | the tab | no | Already exists as `number`. `null` is new and means *fit, not yet measured* — see §2. |
| `fit: number` | the tab | no | **New.** Reported up by the canvas, which is the only thing that knows its own box. |
| `search` | the tab | no | **Moved.** The tab already held one for its desktop branch; `MobileEntityList` held a second. One surface had two queries. |
| pan offset | the DOM | no | It is `scrollLeft`/`scrollTop` on the viewport. Not React state, because the platform owns the gesture (research R4) and mirroring it into state would fight it every frame. |
| pinch mid-gesture | a ref inside `usePinchZoom` | no | Pointer bookkeeping, never rendered. |
| the pan guard's `moved` | a ref inside the canvas | no | Read once, on `pointerup`. State would re-render the graph on every pointer move. |

---

## §2 · The zoom triple, and the one invariant it has

```
effectiveZoom = zoom ?? fit
```

- `zoom === null` — *the user has not chosen one.* The phone starts here; the desktop
  never does, because its initial zoom is `1` and always has been.
- `fit` — the largest scale at which the whole graph fits both axes, `(0, 1]`, measured
  from the live viewport (research R2). `1` until the first measurement.

**The invariant**: `fit ≤ effectiveZoom ≤ 1` on a phone, and `0.5 ≤ zoom ≤ 1.5` on a
desk, unchanged.

**On re-measurement** — a rotation, the bar wrapping to a second row, the withheld-gesture
note being opened or closed — `fit` changes and `zoom` is **clamped into the new range,
not reset**. Resetting would throw away a working zoom every time the phone turned, and
turning the phone is what someone does to see more of the graph.

---

## §3 · The graph's coordinate space, and the one thing that differs by reach

The graph is drawn in a logical space and the rendered box is that space scaled.

| | Desk | Hand |
|---|---|---|
| Logical width | `max(820, measuredWidth) / zoom` | **`820`, fixed** |
| Logical height | `640 / zoom` | **`640`, fixed** |
| Rendered box | logical × `zoom` | logical × `effectiveZoom` |
| Node positions | the stored `position_x` / `position_y`, unchanged | **identical** |

**This is the whole of the difference**, and it is `patterns.md` §7f's sentence in code:
on a desk zoom changes the *layout* — zooming out gives the processing lane more logical
room in the same panel, which its own comment says it is for — and in a hand zoom moves
the *window* and moves nothing within it (research R1).

Node positions are the same numbers at both widths. Nothing in this slice writes one.

---

## §4 · What the canvas reports upward

Two callbacks, both new, both optional so the desktop call sites are unchanged if they
pass neither.

| Callback | When | Used for |
|---|---|---|
| `onFitChange(fit: number)` | after every viewport measurement, when the value changes | the tab adopts or clamps `zoom` (§2) and the bar's readout labels its reset target |
| *(none for pan)* | — | the viewport's scroll offset is read directly when focusing, never mirrored |

---

## §5 · Derived reads, and the rule they follow

Nothing on this surface is computed twice. Every number the phone shows is the number the
desktop shows, from the same function:

| Shown | From |
|---|---|
| the status strip's verdict | `lib/patchCapacity` — `inputPatchStatus` / `outputPatchStatus`, already the phone's source since 6c |
| which nodes and rows dim | `lib/patchSearch`'s `matchesSearch`, already the canvas's source |
| **which node the window moves to** | the same `matchesSearch`, walked in the canvas's own `layout` order — **new**, in `lib/canvasFocus.ts`, and deliberately not a second predicate |
| a run's colour | `lib/inputGraph` / `lib/outputGraph`, unchanged |
| what a source reaches | `lib/inputSignalFlow`, unchanged |

The one genuinely new derivation is `fitScale`, and it derives from the viewport rather
than from the plan — it is a fact about the screen, which is why it is the only thing in
this slice that a desktop and a phone can legitimately disagree about.
