# Tasks — the Trusses overlay

**Branch**: `039-plot-trusses-drawer` · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Frontend only. No migration, no handler, no `design/` edit.

## Phase 1 — the derived sentences

- [x] **T001** `lib/stagePlot.ts`: add `lengthWithoutPiece(truss, pieceId): number` —
  the total with that piece's length subtracted, never below 0. (FR-018)
- [x] **T002** `lib/stagePlot.ts`: add `trussSubtitle(count): string` — *"3 trusses,
  shared by every plot in this event"*, singular at 1, and a sentence that still reads
  at 0. (FR-005)
- [x] **T003** `lib/stagePlot.test.ts`: cover both — including a truss with no pieces,
  a piece id that is not in the truss, and the singular/zero cases.

## Phase 2 — the drawer

- [x] **T010** `PlotTrussManager.tsx`: swap `ui/Dialog` for `ui/Drawer` — `width="wide"`,
  `flush`, `subtitle={trussSubtitle(...)}`, `noteId="event-trusses"`. Drop the body's
  `max-h-[70vh] overflow-y-auto pr-1`; the drawer owns its scroll. (FR-001, FR-002,
  FR-003, FR-005, FR-007)
- [x] **T011** Move the explanation out of the body into `info`, rewritten
  as the approved three sentences. Take the **third** sentence as a prop
  (`closingNote?: ReactNode`) so the mount composes it and this file never learns the
  width. (FR-008, FR-009)
- [x] **T012** Rebuild `TrussEditor` as three bands — header, `Pieces`, `Fixtures` —
  each a `MicroLabel` over full-bleed rows on `border-b border-zinc-800/60`, each band
  owning its own horizontal padding. (FR-004)
- [x] **T013** The header band's placement control: `Pill` reading *On this plot* when
  placed, a `Place on this plot` button when not. Delete the `disabled` *On plot*
  button. (FR-012)
- [x] **T014** Give every band a read branch that renders values rather than disabled
  controls — name, height, rotation, rake, offset, lane. **No `disabled` prop remains
  in this file.** (FR-011, FR-024, SC-004)
- [x] **T015** Empty states: a truss with nothing hung on it says so under `Fixtures`;
  an attach picker with nothing to offer says so in place of its options; a read-only
  render with no trusses says there are none. (Edge cases)
- [x] **T016** Both `✕` controls → `Button variant="ghost" size="xs"`, `h-4` icon,
  `aria-label` naming the subject (*Remove piece Prolyte H30V 200*, *Detach Robe
  Spiikie*). (FR-020)
- [x] **T017** The legacy piece: replace the amber `(legacy)` span and its `title` with
  a warning line on the row — *not from the catalog · not on the rental order — re-pick
  it to count* — using `Spec tone="warning"` inside `GearSpecs`. Shorten it to the
  consequence alone when the view is read-only. (FR-022, FR-023)
- [x] **T018** Rename `Rotation (top)` → **Rotation** and `Rotation (front)` → **Rake**,
  labels and `aria-label`s together. (approved Q3)

## Phase 3 — the two confirms

- [x] **T020** Delete truss: replace `window.confirm` (line 227) with `ui/ConfirmDialog`
  — title *Delete truss*, the sentence naming the truss, its pieces, its placements,
  and that the rig's fixtures stay. Pending state is the **truss**, not a boolean.
  (FR-017)
- [x] **T021** Remove piece: add a `ConfirmDialog` — title *Remove piece*,
  `confirmLabel="Remove"`, the sentence naming the resulting length from
  `lengthWithoutPiece` and that every plot showing it redraws. Pending state is the
  **piece**. (FR-018)
- [x] **T022** Detach stays unconfirmed. (FR-019)
- [x] **T023** Mount both dialogs as siblings **after** `<Drawer>`, outside its
  children. (FR-021)

## Phase 4 — the two call sites

- [x] **T030** `StagePlotTab.tsx` desktop: remove the `!readOnly` guard from the
  *Trusses…* toolbar button. (FR-016)
- [x] **T031** `StagePlotTab.tsx`: a small inline `TrussIcon` — two chords and their
  diagonals, `h-4 w-4`, `currentColor`. (approved Q2)
- [x] **T032** `StagePlotTab.tsx` mobile: `overflow={[{ label: 'Trusses', icon:
  <TrussIcon />, hint: String(response.trusses.length), onClick: … }]}` on the
  `MobilePanel`. No change to `MobilePanel` — it already renders a lone action as a
  44 px target with the label as its `aria-label`. (FR-014)
- [x] **T033** `StagePlotTab.tsx` mobile: mount `PlotTrussManager` with **`readOnly`
  forced true**, the phone's closing sentence, and no-op `onPlace`/`onRotate`. Leave
  the status strip's truss count alone. (FR-010, FR-015)

## Phase 5 — tests

- [x] **T040** `PlotTrussManager.test.tsx` (new): read-only render contains no
  `<input`, no `<select`, no *Add* / *Attach* / *Place* / *Delete*.
- [x] **T041** Read-only render still contains every truss name, total length, hang
  height, piece name and length, and each fixture's offset and lane.
- [x] **T042** Editable render contains the pickers and both forms.
- [x] **T043** `disabled` appears nowhere in either rendered markup. (SC-004)
- [x] **T044** A legacy piece renders the warning line and no `title` attribute.
- [x] **T045** Grep gate: `useIsMobile` does not appear in `PlotTrussManager.tsx`.

## Phase 6 — validation

- [x] **T050** Run the Gates (`validator` agent).
- [x] **T051** Confirm `git diff design/` is empty. (SC-005)
- [x] **T052** Confirm no `window.confirm` remains in `PlotTrussManager.tsx`, and that
  every other site is untouched — fifteen live calls remain, not D6's stated eight.
  (SC-003, D6's boundary)
- [x] **T053** Independent review (`reviewer` agent) against spec and mockup. Found six
  fidelity misses — the missing *New truss* band, an *Add* that should read *Add truss*,
  a two-thirds legacy sentence, a total printed twice at the desk, a `Pill` ink off
  `tokens.md`'s chip formula, and a `touch` doc that overstated its own contract. All
  six fixed; four optional notes taken too.
- [x] **T054** **Browser walk (FR-025) — passed 2026-08-05.** The behaviours
  `renderToStaticMarkup` cannot reach were verified in a real browser: inline commit on
  name / height / rotation / rake / offset, the length auto-suggested from a catalog
  piece's name, lane selection, placement, and the `lighting-rig` + `rental-summary`
  invalidations that keep the Lighting tab's truss column and the rental order current.
  The two confirms stack above the drawer and above the phone sheet, and the phone's
  overflow entry is a 44 px target.
