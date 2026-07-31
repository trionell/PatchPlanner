# Tasks — the Trusses overlay

**Branch**: `039-plot-trusses-drawer` · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Frontend only. No migration, no handler, no `design/` edit.

## Phase 1 — the derived sentences

- [ ] **T001** `lib/stagePlot.ts`: add `lengthWithoutPiece(truss, pieceId): number` —
  the total with that piece's length subtracted, never below 0. (FR-018)
- [ ] **T002** `lib/stagePlot.ts`: add `trussSubtitle(count): string` — *"3 trusses,
  shared by every plot in this event"*, singular at 1, and a sentence that still reads
  at 0. (FR-005)
- [ ] **T003** `lib/stagePlot.test.ts`: cover both — including a truss with no pieces,
  a piece id that is not in the truss, and the singular/zero cases.

## Phase 2 — the drawer

- [ ] **T010** `PlotTrussManager.tsx`: swap `ui/Dialog` for `ui/Drawer` — `width="wide"`,
  `flush`, `subtitle={trussSubtitle(...)}`, `noteId="event-trusses"`. Drop the body's
  `max-h-[70vh] overflow-y-auto pr-1`; the drawer owns its scroll. (FR-001, FR-002,
  FR-003, FR-005, FR-007)
- [ ] **T011** Move the four-sentence paragraph out of the body into `info`, rewritten
  as the approved three sentences. Take the **third** sentence as a prop
  (`closingNote?: ReactNode`) so the mount composes it and this file never learns the
  width. (FR-008, FR-009)
- [ ] **T012** Rebuild `TrussEditor` as three bands — header, `Pieces`, `Fixtures` —
  each a `MicroLabel` over full-bleed rows on `border-b border-zinc-800/60`, each band
  owning its own horizontal padding. (FR-004)
- [ ] **T013** The header band's placement control: `Pill` reading *On this plot* when
  placed, a `Place on this plot` button when not. Delete the `disabled` *On plot*
  button. (FR-012)
- [ ] **T014** Give every band a read branch that renders values rather than disabled
  controls — name, height, rotation, rake, offset, lane. **No `disabled` prop remains
  in this file.** (FR-011, FR-024, SC-004)
- [ ] **T015** Empty states: a truss with nothing hung on it says so under `Fixtures`;
  an attach picker with nothing to offer says so in place of its options; a read-only
  render with no trusses says there are none. (Edge cases)
- [ ] **T016** Both `✕` controls → `Button variant="ghost" size="xs"`, `h-4` icon,
  `aria-label` naming the subject (*Remove piece Prolyte H30V 200*, *Detach Robe
  Spiikie*). (FR-020)
- [ ] **T017** The legacy piece: replace the amber `(legacy)` span and its `title` with
  a warning line on the row — *not from the catalog · not on the rental order — re-pick
  it to count* — using `Spec tone="warning"` inside `GearSpecs`. Shorten it to the
  consequence alone when the view is read-only. (FR-022, FR-023)
- [ ] **T018** Rename `Rotation (top)` → **Rotation** and `Rotation (front)` → **Rake**,
  labels and `aria-label`s together. (approved Q3)

## Phase 3 — the two confirms

- [ ] **T020** Delete truss: replace `window.confirm` (line 227) with `ui/ConfirmDialog`
  — title *Delete truss*, the sentence naming the truss, its pieces, its placements,
  and that the rig's fixtures stay. Pending state is the **truss**, not a boolean.
  (FR-017)
- [ ] **T021** Remove piece: add a `ConfirmDialog` — title *Remove piece*,
  `confirmLabel="Remove"`, the sentence naming the resulting length from
  `lengthWithoutPiece` and that every plot showing it redraws. Pending state is the
  **piece**. (FR-018)
- [ ] **T022** Detach stays unconfirmed. (FR-019)
- [ ] **T023** Mount both dialogs as siblings **after** `<Drawer>`, outside its
  children. (FR-021)

## Phase 4 — the two call sites

- [ ] **T030** `StagePlotTab.tsx` desktop: remove the `!readOnly` guard from the
  *Trusses…* toolbar button. (FR-016)
- [ ] **T031** `StagePlotTab.tsx`: a small inline `TrussIcon` — two chords and their
  diagonals, `h-4 w-4`, `currentColor`. (approved Q2)
- [ ] **T032** `StagePlotTab.tsx` mobile: `overflow={[{ label: 'Trusses', icon:
  <TrussIcon />, hint: String(response.trusses.length), onClick: … }]}` on the
  `MobilePanel`. No change to `MobilePanel` — it already renders a lone action as a
  44 px target with the label as its `aria-label`. (FR-014)
- [ ] **T033** `StagePlotTab.tsx` mobile: mount `PlotTrussManager` with **`readOnly`
  forced true**, the phone's closing sentence, and no-op `onPlace`/`onRotate`. Leave
  the status strip's truss count alone. (FR-010, FR-015)

## Phase 5 — tests

- [ ] **T040** `PlotTrussManager.test.tsx` (new): read-only render contains no
  `<input`, no `<select`, no *Add* / *Attach* / *Place* / *Delete*.
- [ ] **T041** Read-only render still contains every truss name, total length, hang
  height, piece name and length, and each fixture's offset and lane.
- [ ] **T042** Editable render contains the pickers and both forms.
- [ ] **T043** `disabled` appears nowhere in either rendered markup. (SC-004)
- [ ] **T044** A legacy piece renders the warning line and no `title` attribute.
- [ ] **T045** Grep gate: `useIsMobile` does not appear in `PlotTrussManager.tsx`.

## Phase 6 — validation

- [ ] **T050** Run the Gates (`validator` agent).
- [ ] **T051** Confirm `git diff design/` is empty. (SC-005)
- [ ] **T052** Confirm no `window.confirm` remains in `PlotTrussManager.tsx`, and that
  the other seven sites are untouched. (SC-003, D6's boundary)
- [ ] **T053** Independent review (`reviewer` agent) against spec and mockup.

## Dependencies

T001–T003 before T020–T021 (the confirms read the sentences). T010 before the rest of
Phase 2. Phase 2 and 3 before Phase 4 (the mount passes props the component must
already take). Phase 5 after Phase 4.
