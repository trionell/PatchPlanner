# Tasks: The phone's panel

**Feature**: 034-phone-panel · Wave 6b
**Input**: [spec.md](spec.md) · [plan.md](plan.md) · [research.md](research.md) · [contracts/mobile-panel.md](contracts/mobile-panel.md)

Four phases, matching the spec's four stories. Each phase ends green and is
independently shippable.

**Gates after every phase** (quickstart.md): `tsc -b` · `eslint src` · `vitest run` ·
`vite build`.

---

## Phase 1 · Foundational — the frame and the row (US1 + US2)

**Goal**: `ui/MobilePanel` exists, a row is a row, and the three `MobileEntityList`
surfaces are panels. Closes `M1` and `M2`; delivers the reading half of `M3` on three
surfaces.

**Independent test**: Audio Inputs, Audio Outputs and Lighting Rig at 375 px are each one
bordered frame with a titled bar and rows inside it. Eight rows visible at 375 × 667.

- [X] T001 Create `frontend/src/components/ui/MobilePanel.tsx` — frame, bar, search row, rows region, strip slot — to the values in `contracts/mobile-panel.md`. The strip renders as a **sibling** of the rows region.
- [X] T002 [P] Rewrite `frontend/src/components/mobile/CondensedListRow.tsx`: drop the border, radius and raised ground; `min-h-[44px]` with `leading-tight`; `text-sm` / `text-xs`; leading edge as a `w-[3px]` element with the tint on the content; both lines truncate.
- [X] T003 Write `frontend/src/components/ui/MobilePanel.test.tsx` pinning P1, P2 and P6 from research R9 — one frame, the strip is a sibling of the scrolling region, no primary element for a role that cannot act.
- [X] T004 [P] Write `frontend/src/components/mobile/CondensedListRow.test.tsx` pinning P3 — emits `min-h-[44px]` and `leading-tight`, emits neither `text-[13px]` nor `text-[11px]`, and does not emit `bg-zinc-900` or `rounded-md` on its root.
- [X] T005 Rewrite `frontend/src/components/mobile/MobileEntityList.tsx` as a `MobilePanel`: takes `title` and `strip`, search becomes the panel's, the add control becomes `primaryAction` at 44 px, the row's pencil goes to `h-4`.
- [X] T006 [P] `frontend/src/lib/mobileChannelList.ts` — add `hasGap` to `MobileChannelListItem`, derived in the same pass as the labels (research R7).
- [X] T007 [P] `frontend/src/lib/mobileOutputList.ts` — same for `MobileOutputListItem`.
- [X] T008 [P] Extend `frontend/src/lib/mobileChannelList.test.ts` to cover `hasGap` (P7).
- [X] T009 [US1] `AudioInputsTab.tsx` phone branch — pass `title="Audio Inputs"` and the search placeholder through the list.
- [X] T010 [P] [US1] `AudioOutputsTab.tsx` phone branch — same, `title="Audio Outputs"`.
- [X] T011 [P] [US1] `LightingTab.tsx` phone branch — same, `title="Lighting"`.
- [X] T012 Gates.

---

## Phase 2 · The strip states, and the strip acts (US3)

**Goal**: the four rails have a phone form, and on a phone the strip is the control.
Closes `M3`.

**Independent test**: on a patch with gaps, tapping the strip filters the rows to the
gaps; on a complete patch the strip draws no chevron and does not respond.

- [ ] T013 Extract `inputPatchStatus` and `outputPatchStatus` into `frontend/src/lib/patchCapacity.ts` from the inline construction in `InputSheet.tsx` and `OutputSheet.tsx` (research R6, declared delta 1).
- [ ] T014 Update `InputSheet.tsx` and `OutputSheet.tsx` to call them. No rendered difference.
- [ ] T015 [P] Extend `frontend/src/lib/patchCapacity.test.ts` to cover both extracted functions.
- [ ] T016 `PatchStatusRail.tsx` — phone branch: `text-xs`, no `h-6` control, root becomes a `<button>` at `min-h-[44px]` when a filter handler is present, `only gaps ›` / `show all ›` at the trailing edge, `Open Rig` absent.
- [ ] T017 [P] `LightingStatusRail.tsx` — same shape, its own filter.
- [ ] T018 [P] `EquipmentStatusRail.tsx` — same shape.
- [ ] T019 [P] `RentalStatusRail.tsx` — same shape.
- [ ] T020 Write `frontend/src/components/event/StatusRailMobile.test.tsx` pinning P4 and P5 — `<button>` on a phone with a handler, `<div>` on a desktop, `<div>` with no chevron in a clean state at either width, and the desktop markup unchanged.
- [ ] T021 [US3] `AudioInputsTab.tsx` — phone branch gains `gapsOnly` state, filters the list by `hasGap`, and passes `PatchStatusRail` as `strip`.
- [ ] T022 [P] [US3] `AudioOutputsTab.tsx` — same.
- [ ] T023 [P] [US3] `LightingTab.tsx` — phone branch gains `LightingFilter` state, calls `dmxMap(fixtures)`, passes `LightingStatusRail` as `strip`.
- [ ] T024 Gates, plus the `twMerge` comparison of every desktop class string on the four rails (research R10).

---

## Phase 3 · Every phone list is a panel (US4)

**Goal**: the remaining six lists. `M1` everywhere.

**Independent test**: all nine phone lists render inside one bordered frame; none draws a
free-standing row card.

- [ ] T025 [US4] `EquipmentTab.tsx` phone branch → `MobilePanel` with `title="Equipment"`, search, `EquipmentStatusRail` as `strip` and its filter state. `!isMobile` untouched (`M4` is 6c).
- [ ] T026 [US4] `RentalTab.tsx` phone branch → `MobilePanel` with `title="Rental order"`, search, `RentalStatusRail` as `strip`. **Delete the hand-built total row.**
- [ ] T027 [P] [US4] `pages/Events.tsx` `MobileEvents` → `MobilePanel` with `title="Your events"`, the existing search as the panel's, `New event` as `primaryAction`, and the month headings and today rule as headings inside the frame.
- [ ] T028 [P] [US4] `pages/Dashboard.tsx` phone branch → `MobilePanel` with `title="Your events"` and `New event` as `primaryAction`. No search — it is a short list.
- [ ] T029 [P] [US4] `pages/Inventories.tsx` catalog list → `MobilePanel` with `title="Rental catalogs"`, search and `New`.
- [ ] T030 [US4] `pages/Inventories.tsx` item list → `MobilePanel` with `title="Items"`, search, and the category filter target in `actions` (research R8).
- [ ] T031 Gates.

---

## Phase 4 · The documents

**Goal**: `design/` matches the code in the same slice that changed it, and the three
findings are recorded where the next agent will find them.

- [ ] T032 `design/tokens.md` §7 — the row's line states `min-h-[44px]` + `leading-tight` and drops `px-3 py-2.5` (**F3**); the off-ladder list **withdraws `py-1.5`** and says why; the bar's control target is stated at 44 px.
- [ ] T033 [P] `design/patterns.md` §7b — the search behaviour, the bar's 44 px targets, and the strip-as-control rule; §7c — the row states a height.
- [ ] T034 [P] `design/components.md` §5 — the **`MobilePanel` gap closes**, replaced by the component's description; the row's entry updated.
- [ ] T035 `design/audit.md` — `M1`, `M2` and `M3` move to Part 1b with Wave 6b; `M2`'s entry records the `py-1.5` withdrawal; **F2** recorded as a correction to the wave table; the Wave 6 phase table updated to *6b done*.
- [ ] T036 [P] `design/design-language.html` §8 — the panel specimen's bar redrawn at 44 px; the section switcher's per-section counts **removed** (**F1**); the four closed findings marked in §9.
- [ ] T037 [P] `ROADMAP.md` — Slice 34.
- [ ] T038 Final gates, the scope assertions from quickstart.md, and `go vet` / `go test` to prove the backend was not touched.

---

## Dependencies

```
Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4
   │            │
   │            └── T013/T014 (lib extraction) block T021/T022 only
   └── T001 blocks T005; T002 blocks T005
```

Within a phase, `[P]` tasks touch different files and may run together. T009–T011,
T016–T019, T021–T023 and T027–T029 are the four parallel sets.

## Notes

- The gate is `tsc -b`, never `tsc --noEmit` — the root `tsconfig.json` is
  references-only and `--noEmit` passes unconditionally (constitution).
- Nothing here is visually verified. Every height is arithmetic over stated values; the
  handset pass is `quickstart.md`'s rows 7–9.
