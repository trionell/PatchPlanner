# Implementation Plan — the Trusses overlay

**Branch**: `039-plot-trusses-drawer`
**Spec**: [spec.md](./spec.md)
**Design**: [mockup.html](./mockup.html), approved 2026-07-31

No `research.md`. Nothing is open: the endpoints are complete from Slice 13, every
value comes from `design/`, and the mockup's three questions were ruled at approval
(overflow and the third bar row; the truss glyph; *Rotation* / *Rake*).

## Technical context

| | |
|---|---|
| Backend | **None.** `GET /events/{id}/stage-plots/{plotID}` already returns `trusses` with their pieces and fixtures; create/update/delete truss, create/delete piece, attach/detach fixture are complete and role-gated. No migration, no handler, no model field. |
| Testing | Vitest with `renderToStaticMarkup`. No DOM — an assertion asks *what is in the markup*, which is exactly this slice's real risk: a control present in a read-only view. The two derived sentences go to `lib/` so they are testable without a render. |
| New dependency | None |
| Scope | ~4 frontend files. One component rewritten, one call site changed in two branches, one new pure module with its tests. |
| `design/` | **Unchanged.** Every rule this slice applies is already written; the mockup reports finding none it needed that the language does not state. `git diff design/` must stay empty (SC-005). |

## Constitution check

- **V · Pragmatic simplicity — no component invented.** `ui/Drawer`, `ui/ConfirmDialog`,
  `MicroLabel`, `Pill`, `GearSpecs`/`Spec`, `Button`, `PanelAction` all exist. The slice
  composes them and adds no file to `ui/`.
- **V · No abstraction ahead of a second caller.** `TrussEditor` and `AttachedFixtureRow`
  stay local to `PlotTrussManager.tsx`; the read view is a branch inside them, not a
  second component. There is one caller and there will be one caller.
- **Pure logic in `lib/`, tested.** Two sentences are derived and must be assertable
  without a DOM: the length a truss will have after a piece is removed, and the drawer's
  subtitle. They go to `lib/stagePlot.ts`, which already owns `parseLengthFromName`.
- **A reach check is never a permission** (P9 / patterns.md §7g). `useIsMobile()` decides
  geometry. Role decides permission. This slice deliberately has the phone force
  `readOnly` — that is the **call site** composing a prop, not `isMobile` appearing
  inside a permission expression, and the distinction is the risk table's first row.
- **III · One rule, one place.** The rule lives in `design/components.md`, written by
  Slice 38. This slice cites it and does not restate it.

No violations. Complexity Tracking is empty.

## Phases

### Phase 1 — the derived sentences *(no UI change)*

`frontend/src/lib/stagePlot.ts` gains two pure functions and their tests:

```ts
/** The truss's total after `pieceId` is removed — the confirm's actual consequence. */
export function lengthWithoutPiece(truss: PlotTruss, pieceId: number): number

/** "3 trusses, shared by every plot in this event" — the drawer's subtitle. */
export function trussSubtitle(count: number): string
```

Why first: the delete confirms in Phase 3 read from these, and a sentence built
inside JSX can only be reached through a full render.

### Phase 2 — the drawer

`PlotTrussManager.tsx`, rewritten around `ui/Drawer`:

- `<Dialog title="Trusses">` → `<Drawer title="Trusses" width="wide" flush
  subtitle={trussSubtitle(trusses.length)} info={…} noteId="event-trusses">`.
  The body loses `max-h-[70vh] overflow-y-auto` — the drawer owns its own scroll.
- The four-sentence paragraph leaves the body and becomes `info`. The component takes
  the third sentence as a prop rather than branching on width itself, so *the mount*
  composes it (FR-009) and `isMobile` never enters this file.
- Per truss: a header band, then a `Pieces` band and a `Fixtures` band — `MicroLabel`
  over full-bleed rows separated by `border-b border-zinc-800/60`, `flush`'s own idiom
  (patterns.md §4, §7c). The new-truss form is last, under its own band.
- A `readOnly` truss states its values: name and height as text, `Pill` for *On this
  plot*, offset and lane as a spec line. **No `disabled` prop survives in this file**
  (FR-011, SC-004) — the read branch renders different nodes, it does not grey the
  same ones.
- Both `✕` controls become `Button variant="ghost" size="xs"` with an `h-4` icon and
  an `aria-label` naming the subject (FR-020).
- The legacy marker becomes a warning line on the piece's row (FR-022), shortened on
  the phone to the consequence alone (FR-023). `Spec` already renders `tone="warning"`
  in amber; the line splits into its label and value halves rather than gaining a new
  component.
- `Rotation (top)` / `Rotation (front)` become **`Rotation`** / **`Rake`** (approved
  Q3). The `aria-label`s follow.

### Phase 3 — the two confirms

- Delete truss: `window.confirm` (line 227) → `ui/ConfirmDialog`, title *Delete truss*,
  the sentence naming the truss, its pieces and its placements, and that the rig's
  fixtures stay.
- Remove piece: a new `ConfirmDialog`, title *Remove piece*, `confirmLabel="Remove"`,
  the sentence naming the truss's resulting length from `lengthWithoutPiece`.
- Detach: **no confirm** (FR-019).
- **State shape**: the pending state is the *row*, never a boolean — D2's decision 2,
  and both of these fire from inside a `.map()`. `pendingDelete: PlotTruss | null` and
  `pendingPiece: PlotTrussPiece | null`.
- **Mount**: both dialogs render as siblings *after* `<Drawer>`, never inside its
  scrolling body (FR-021). `Drawer`, `Sheet` and `Dialog` are all `z-50`, so DOM order
  is the whole mechanism.

### Phase 4 — the two call sites

`StagePlotTab.tsx`:

- **Desktop**: the toolbar's *Trusses…* button loses its `!readOnly` guard (FR-016).
  The existing `trussManager` element already passes `readOnly={readOnly}`.
- **Mobile**: the panel gains `overflow={[{ label: 'Trusses', icon: <TrussIcon/>, hint:
  '<n>', onClick }]}`. As the only entry `MobilePanel` already renders it as its own
  `h-11 w-11` target with its label as `aria-label` — no change to `MobilePanel`.
  The same `PlotTrussManager` element is mounted in the mobile return with
  **`readOnly` forced true** and the phone's third sentence.
- The status strip's `N trusses` stays a count (FR-015).

The truss glyph is a small inline SVG local to `StagePlotTab.tsx` — two chords and
their diagonals. `lucide-react` has no truss, and `StagePlotPalette.tsx` and
`StagePlotCanvas.tsx` already draw this rig's own shapes inline.

### Phase 5 — tests and gates

`PlotTrussManager.test.tsx` (new), `renderToStaticMarkup`:

1. A read-only render contains no `<input`, no `<select` and no *Add*/*Attach*/*Place*.
2. A read-only render still contains every truss name, total, height, piece and
   attached fixture's offset and lane.
3. An editable render contains the pickers and the forms.
4. `disabled` appears nowhere in the rendered markup (SC-004's assertion).
5. A legacy piece renders its warning line and no `title` attribute.

`stagePlot.test.ts` gains `lengthWithoutPiece` and `trussSubtitle`.

Then the Gates from CLAUDE.md, via the `validator` agent.

## Risks

| Risk | Mitigation |
|---|---|
| **The phone's forced `readOnly` gets spelled as a permission.** `isMobile && !canEdit` anywhere is P9's exact failure. | `PlotTrussManager` never imports `useIsMobile`. The mobile *mount* passes `readOnly`; the component only ever sees a prop. Grep for `useIsMobile` in the file as a gate. |
| **A confirm renders under the drawer that raised it.** All three surfaces are `z-50`. | Sibling-after mount (Phase 3), checked on a phone as well as a desk. |
| **`flush` removes the padding the bands need.** Six drawers have shipped inset; this is the second `flush` one. | Each band owns its own `px-4` / `px-3` (phone) and the rows are full-bleed to the hairline, which is what `flush` exists for. |
| **The read view drifts from the edit view** as two renders of the same data. | The branch is per band, inside one component, on one prop — not a second component and not a second file. |
| **`Rake` renames a shipped label.** | Approved at Q3. The field, its `aria-label` and the mockup all move together; no stored value or API name changes. |

## Out of scope

Editing on a phone (provisional — tied to the phone not placing plot elements). The
other seven `window.confirm` sites (D6). Grouping the list by placement, reordering
pieces, searching, the rental order, and the plot's missing phone Print.
