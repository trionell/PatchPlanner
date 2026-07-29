# Tasks — the flow canvas as a plane

Branch `037-flow-canvas-plane`, cut from the unmerged `036-phone-canvas`.
Spec [spec.md](./spec.md) · Plan [plan.md](./plan.md) · Research [research.md](./research.md)

## Phase A — investigation *(done before the mockup)*

- [x] **T001** Reproduce the report by arithmetic rather than by guess: `92 px` lane, factor
      of twelve against the desk.
- [x] **T002** Read the real stored positions from a **copy** of the database. Found the
      second, larger defect: four window widths recorded as node coordinates.
- [x] **T003** Confirm the stage plot's model (`viewBox`, unbounded, negative-capable) and
      why the flow canvas cannot adopt it literally.

## Phase B — design *(approved)*

- [x] **T004** `mockup.html` revision 1, published, four questions.
- [x] **T005** Answers recorded as revision 2, including the storage reversal that took the
      backend out of the slice.

## Phase C — the shared arithmetic

- [x] **T006** `lib/canvasPlane.ts` — `planeOrigin`, `originShift`, `panToScroll`,
      `scrollToPan`. Pure, because the harness cannot see anything else.
- [x] **T007** `canvasPlane.test.ts` — 15 cases, including the two that would have shipped:
      a positive-only graph must keep the empty space it was arranged inside, and the
      shift must reverse when the plane shrinks back.
- [x] **T008** `hooks/useFlowView.ts` + `parseFlowView` exported for test, 6 cases.
- [x] **T009** `hooks/usePlaneView.ts` — restore-and-save, one hook for both canvases
      because the three-render ordering is the whole difficulty (R10).

## Phase D — the canvases

- [x] **T010** `InputGraphCanvas`: constants, `fit` from measured content, plane origin.
- [x] **T011** `InputGraphCanvas`: the channel rail reads and stores its own x.
- [x] **T012** `InputGraphCanvas`: drag unclamped; the drag-local `origin` renamed `start`
      so two meanings of that word cannot share a function.
- [x] **T013** `InputGraphCanvas`: measurement effect and origin-compensation effect.
- [x] **T014** `InputGraphCanvas`: node offsets, the two focus effects, the render.
- [x] **T015** `InputGraphCanvas`: the rail's cap, `onScroll` and `railScroll` removed.
- [x] **T016–T021** The same six, mirrored in `AudioOutputsTab`'s `OutputGraphCanvas`,
      plus the `'y-only'` drag mode deleted.
- [x] **T022** `LaneBands.tsx` deleted; `LANE_LABEL` and `LANE_BAND_*` pruned from
      `tokens.ts` with a note saying why.
- [x] **T023** Both tabs: `fitFloor = fit` at both widths, and the desktop's zoom readout
      resets to *fit*. **Not in the plan** — it fell out of the desktop cost.

## Phase E — the data

- [x] **T024** `047_flow_plane_positions.up.sql` — the previously-pinned nodes only.
- [x] **T025** `.down.sql` as a documented no-op.
- [x] **T026** Rehearsed on a copy: rails to 24/1400, destinations to 1400, the LR
      Amplifier still at 743, the DIs untouched.

## Phase F — documentation

- [x] **T027** `patterns.md` §7f rewritten: one plane, no bound, the remembered view, fit
      as a control. The Desk/Hand table now has no row where the two differ.
- [x] **T028** `components.md` — `LaneBands` row removed, `ZoomControl` updated,
      `canvasPlane` and `usePlaneView` added, and the no-nested-viewport rule stated.
- [x] **T029** `audit.md` — **M13**, and a superseded note on M6.
- [x] **T030** `design-language.html` — bands removed from both specimens, M13 card, the
      wave card, and the footer's closing note.
- [x] **T031** `ROADMAP.md` — Slice 37, **D3**, dependency arrow.
- [x] **T032** `quickstart.md` — the manual pass, §C being the part no gate can cover.

## Phase G — validation

- [x] **T033** `tsc -b`, `eslint src`, **525 tests**, `vite build`, `go vet`, `go test` —
      all green.
- [x] **T034** Scope greps: no `canvasWidth` in code, no clamp, no zone helpers, no
      `LaneBands`. The reach-vs-permission grep now prints **1**, down from 2, with the
      written answer still beside it.
- [ ] **T035** `reviewer` sub-agent.
- [ ] **T036** The manual pass in `quickstart.md`. **Cannot be done in this toolchain** —
      no browser, no DOM, no gesture. §C and §E are judgements, not checks.

## Deliberately not done

- **D2** — the flow inspectors' `window.confirm`. Still a desktop-visible change to a
  destructive path.
- **D3** — the stage plot's shared view. Found while deciding this slice's storage, and
  recorded rather than fixed: the fix touches a surface this slice does not own.
- **A1** — the Sources rail and the two orphan pseudo-nodes still have no column to store
  a position in, so they open at a constant. Giving them one is a migration and a Go
  change, which the approved scope excludes. Stated in the spec rather than faked.
