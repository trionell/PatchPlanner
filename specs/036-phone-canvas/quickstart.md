# Quickstart: verifying the canvases

**Feature**: 036-phone-canvas · Wave 6d

Two halves, as every phase of this wave has had. The **gates** are mechanical and run in
this toolchain. The **handset pass** is a human's, and it matters more here than in any
previous phase: this is the only phase that adds a capability rather than converting one,
and the question it exists to answer — *is the whole graph at fit worth having?* — was
deferred to a field test by name.

---

## Gates

Run from the repository root. All must pass before the slice is called done.

```bash
cd frontend && npx tsc -b                 # NOT --noEmit — the root tsconfig is references-only
cd frontend && npx eslint src
cd frontend && npx vitest run
cd frontend && npx vite build
cd backend  && go vet ./... && go test ./...
```

The backend gates prove the slice did not touch it, not that it changed.

### Scope assertions

```bash
# FR-034 — frontend only.
git diff --stat -- backend/ frontend/src/api/                  # empty

# FR-033 — no shared drawing primitive changed.
git diff --stat -- frontend/src/components/event/graph/NodeShell.tsx \
                   frontend/src/components/event/graph/PortDot.tsx \
                   frontend/src/components/event/graph/PortRow.tsx \
                   frontend/src/components/event/graph/LaneBands.tsx \
                   frontend/src/components/event/graph/tokens.ts   # empty

# FR-033a — InspectorRail gains the size hook and nothing else.
git diff -- frontend/src/components/event/graph/InspectorRail.tsx   # additions only

# FR-026 and the wave's standing rule — a reach check is never a permission.
#
# NOT `grep "!isMobile"`, which is what previous phases used and what this slice
# breaks: `const spatial = !isMobile` names a withheld GESTURE, and two more say
# "only on a phone, scroll the selection clear of the sheet". None is a permission.
# The check that means what the rule means is whether a reach term ever shares an
# expression with a role term (audit.md Part 1, and A12's lesson a third time).
grep -rn "isMobile" --include='*.tsx' --include='*.ts' frontend/src | grep -c "readOnly"   # 0

# FR-013a — one zoom control, not two. Both hits are the two reaches of the same
# component, in the same file; the point is that no caller draws its own.
grep -rln "Zoom out" --include='*.tsx' frontend/src | grep -v test      # 1 file: ZoomControl.tsx
grep -rn "h-11 w-11" frontend/src/components/event/StagePlotTab.tsx     # nothing

# The canvases branch inside themselves, once each, and it is not a permission.
grep -c "useIsMobile" frontend/src/components/event/InputGraphCanvas.tsx   # 1
grep -c "useIsMobile" frontend/src/components/event/AudioOutputsTab.tsx    # 2 (tab + canvas)
```

### The three byte-identical checks

Everything this slice touches that a **desktop** surface renders is asserted the way 6b
asserted its four rails and 6c asserted its two: render every state before and after and
diff the markup. That is stronger than comparing class strings through `twMerge`, because
it catches element order.

| Component | States rendered | Expected |
|---|---|---|
| `ZoomControl` | zoom `0.5 · 1 · 1.5`, with `onZoomChange` and with explicit handlers, with and without `resetLabel` | **byte-identical** — `resetLabel` renders on a phone only |
| `InputFlowInspector` | each selection kind (`source` · `stagebox` · `stage_multi` · `device` · `console_local` · `channel`), read-only and not, mic and line | **byte-identical** — the frame renders the same rail and header in the same order |
| `OutputFlowInspector` | each selection kind, read-only and not | **byte-identical** |

`InspectorFrame`'s desktop return is byte-identical *by construction* rather than by care:
it renders `InspectorRail` and `InspectorHeader`, in that order, with the same props the
inspectors passed before. Nothing was copied out of either. The check is run anyway,
because "by construction" is a claim and this project has twice found one that was not
true (`tokens.md` §7's 56 px row; Slice 34's shell entry).

### The unit tests worth having

Two of the four new modules are pure and carry the edge cases that are invisible in a
render test:

| File | Asserts |
|---|---|
| `lib/canvasFit.test.ts` | a viewport of `0 × 0` on the first frame yields a usable value rather than `Infinity` or `NaN`; a viewport wider **and** taller than the graph caps at `1`; the binding axis is whichever is tighter; the two-decimal floor |
| `lib/canvasFocus.test.ts` | the first match is taken in layout order, not in data order; a node already fully visible produces the offset it is already at; `clearBottom` moves a node clear of the sheet; a node at the far right clamps rather than overshooting; no match returns nothing |
| `ZoomControl.test.tsx` | the phone form's three targets are ≥ 44 px, and `resetLabel` is absent from the desktop form |
| `InspectorFrame.test.tsx` | the desktop return contains the rail's `w-60 border-l` frame; the phone return contains no backdrop element and no footer |

---

## The handset pass

There is no browser in this toolchain, so everything below is a human's, on a real phone,
signed in against a real event with at least sixteen channels, a stage box and a desk.

**The question the wave deferred to this phase is first**, and it is a judgement rather
than a check.

### A · The opening state (US1, SC-001, SC-002)

1. Open Audio Inputs. Tap **Flow**.
2. **Is the whole graph on the screen?** Every source, every box, the desk, every run.
3. **Is it worth having, or is it just small?** This is the question. If it is only
   small, the answer is a working zoom as the opening state and fit as a reset target
   only, which is one changed line.
4. Tap `＋` three times. Confirm the readout reaches 100 % (SC-002's *at most three*).
5. Tap the percentage. Confirm it returns to the whole picture in **one** tap, centred.
6. Drag with one finger. It should feel like scrolling, with momentum, in both axes, and
   should not stop at the edge of the drawing.
7. Pinch. The point between the fingers should stay under them.
8. Rotate the phone. The zoom should be **kept**, not reset.

### B · The tap (US2, SC-004)

9. Tap a source's row in the sources rail. The inspector rises. **The graph behind it is
   not dimmed.**
10. **Drag the canvas while the sheet is open.** It must pan. If it does not, `scrim`
    is leaking a backdrop and R7's whole argument is wrong.
11. Change the stand. There is no **Save**; it commits. Confirm on a desk.
12. Tap a 7 px port dot. **Nothing must happen** — not a selection, not a connection,
    not a dialog.
13. Put a thumb on a *node* and drag. It must pan, and must not select (the 3 px guard).
14. Tap a node near the bottom edge. It must scroll clear of the sheet.

### C · Finding one box (US3, SC-003)

15. Zoom to 100 % and pan to the far left.
16. Open the search row and type part of a channel name at the far right.
17. **The window must move to it**, and everything else must go quiet. Nothing hides.
18. Type nonsense. The window must not move.
19. **On a desk**: do the same on a graph wider than the panel. It must behave identically
    — this behaviour is not guarded on reach (FR-030).

### D · The sentence, and the bar (US4, FR-021, FR-022)

20. The panel states *“Patching is a desk job — open this event on a computer. Tap any
    box to read or edit what it is.”*
21. Close it. It becomes an `i` in the title's line and the panel gains no row. Reload:
    it stays closed.
22. The bar in Flow carries the title, `Sheet │ Flow`, search and `⋯` on one row and the
    zoom on a second. **There is no `＋`.**
23. Toggle to **Sheet**. The `＋` is back and the zoom is gone.
24. The strip states the same verdict in both views, and in Flow it does not filter.

### E · Outputs (US5)

25. Repeat A–D on Audio Outputs. Any behaviour that differs is a defect, not a design.

### F · Role (SC-006)

26. Sign in as a **viewer**. Every box opens; every field reads; nothing writes. The
    overflow holds Print alone. The sentence is unchanged.

### G · Printing, and the desk (FR-032, SC-008)

27. Print from Flow on a phone. The print sheet must be produced, and the view toggle
    must appear nowhere on it.
28. Open both audio tabs on a desk at ≥ 768 px and confirm nothing has changed except
    that a search term now brings its first match into view.

---

## What a failure here means

| Symptom | Where to look first |
|---|---|
| The graph pushes away as you zoom out | R1 — the logical space is still `wrapperWidth / zoom` on the phone path |
| The canvas will not pan with the sheet open | R7 / `ui/Sheet` — `scrim={false}` is rendering a backdrop after all, which would be 6a's bug surfacing on its first caller |
| A thumb on a box opens the box instead of panning | R5 — the pan guard's ref is being read after it was cleared |
| The readout jitters while pinching | R2 — the two-decimal floor is being applied to the effective zoom rather than to fit |
| The panel's rows region scrolls *and* the canvas scrolls | the canvas child is not exactly the height of the rows region; see the flex rule in `patterns.md` §7b, both halves |
| A desktop inspector moved by a pixel | R7 — something was copied out of `InspectorRail` rather than rendered through it |
