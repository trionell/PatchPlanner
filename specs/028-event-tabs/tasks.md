# Tasks: Four tabs, one shape

Seven phases, one commit each. `[P]` marks tasks that could run in parallel with
their siblings — they touch different files.

Gates after every phase: `npx tsc -b && npx eslint src --max-warnings 0 && npx vitest run`.

---

## Phase 1 · The summary derivation (US5)

- [x] **T001** `lib/eventSummary.ts`: the `EventSummary` and `ReadinessVerdict`
  interfaces from [data-model.md](./data-model.md) §1, every figure optional.
- [x] **T002** `daysToLoadIn`: `undefined` with no date; `0` for today; negative
  values are not returned — the caller gets a `dayLabel` string
  (`today` / `tomorrow` / `in 18 days` / `3 days ago`) beside the number (FR-063).
- [x] **T003** Audio figures: channels, outputs, sources, stageboxes, multis,
  console name, output devices, speakers. `undefined` when `patch` is.
- [x] **T004** `cablesPicked` via `lib/patchCapacity`, over input and output cables.
- [x] **T005** `signalGaps` via `buildInputChannelFlows` + `buildOutputChannelFlows`
  (FR-079), plus the hop total the Signal Flow strip needs.
- [x] **T006** Lighting figures via `dmxMap` / `dmxStatusState` (FR-080).
  `dmxCapacity` is universes **in use** × 512, never highest-numbered × 512.
- [x] **T007** Rental, equipment, plots, trusses and members figures — direct reads.
- [x] **T008** `readiness`: five verdicts, always in order, each with `tab`, `label`
  and `tone`, taking their words from the owning derivation (FR-067, R12).
- [x] **T009** [P] `lib/eventSummary.test.ts`: the nine cases in
  [quickstart.md](./quickstart.md).
- [x] **T010** [P] The SC-008 test: for one fixture set, assert the summary's gap
  count, DMX verdict and rental figures **equal** the values the owning functions
  return when called directly.

**Commit**: `feat: the event, as one derivation (US5)`

## Phase 2 · The hand-off (US1, US2, US3)

- [x] **T011** `ui/Tabs`: optional `value` / `onValueChange`; controlled when
  `value` is given, otherwise unchanged (FR-083). Comment says why the pair is
  optional rather than a second component.
- [x] **T012** `EventDetail`: desktop tabs driven from `?tab=`, defaulting to
  `overview` for absent or unknown (FR-084, FR-085). Mobile `?section=` untouched
  (FR-086).
- [x] **T013** A `useEventTab(eventId)` helper returning `{ tab, openTab }`, so a
  tab hands off without knowing about the router.
- [x] **T014** `LightingTab`: pass `onOpenPlot` (FR-087). Lighting's
  `Hang in plot` button renders for the first time.
- [x] **T015** Verify `Inventories.tsx` renders identically — it passes neither
  prop.

**Commit**: `feat: a tab can open another tab, and Lighting's hand-off works (US1–US3)`

## Phase 3 · Rental order (US1)

- [x] **T016** `event/RentalSheet.tsx`: the nine-column `SheetTable`, no control in
  a closed row (FR-005, FR-006).
- [x] **T017** The `+N` manual badge on the two quantity cells, with its `title`
  (FR-008). Reuse Slice 27's class string; do not retype it.
- [x] **T018** The `Stock` cell's over-stock state — cell red, row untinted
  (FR-009, FR-010) — and the `discontinued` pill (FR-011).
- [x] **T019** The row editor: `From the plan` read-only, `Manual audio`,
  `Manual light`, `Note`, the Equipment hand-off, conditional delete
  (FR-014 – FR-018).
- [x] **T020** The add editor at the foot: item picker, both quantities, note
  (FR-019).
- [x] **T021** [P] `event/RentalStatusRail.tsx`: three states, the always-present
  counts, the first problem, the filter (FR-021 – FR-024).
- [x] **T022** `RentalTab` rewritten as `PatchPanel`: bar in canonical order, three
  exports, `+ Manual line` (FR-001 – FR-004), search (FR-007).
- [x] **T023** The unplaced-lines and export-error blocks, at work-surface density
  (FR-025, FR-026).
- [x] **T024** Read-only: no `+ Manual line`, rows inert, no filter control
  (FR-020).
- [x] **T025** Delete the `Card` import, the manual form, the totals row and the
  `rounded-lg` block. The `isMobile` branch is moved verbatim, not edited.

**Commit**: `feat: the rental order is a sheet (US1)`

## Phase 4 · Equipment (US2)

- [x] **T026** `lib/equipmentRows.ts`: the `EquipmentRow` union and the merge —
  owned lines, then rented lines filtered to those with a manual part, sorted
  (data-model §3, FR-031). Pure, so it is tested without rendering.
- [x] **T027** [P] `lib/equipmentRows.test.ts`: ordering, the `8a·4l` badge text,
  over-owned detection, the empty case.
- [x] **T028** `event/EquipmentSheet.tsx`: six columns, the `Source` pill, the
  quantity badge, `Have` red when over (FR-029 – FR-033).
- [x] **T029** The editor: `Source` first and read-only on an existing row, the
  item picker following it, per-source quantity fields, the rental hand-off
  (FR-034 – FR-037).
- [x] **T030** [P] `event/EquipmentStatusRail.tsx` (FR-038).
- [x] **T031** `EquipmentTab` rewritten as one `PatchPanel` (FR-027, FR-028), with
  the actionable empty state for an empty owned catalog (FR-039) and read-only
  handling (FR-040).
- [x] **T032** Both `Card`s, both forms and both `rounded-lg` blocks deleted; the
  `isMobile` branch moved verbatim.

**Commit**: `feat: owned and rented are one list (US2)`

## Phase 5 · Signal flow (US3)

- [x] **T033** `event/ChainLine.tsx`: the hop sequence at the tokens' values —
  mono 11 px, arrows `zinc-600`, desk socket `amber-300`, missing link amber
  **with** a triangle (FR-047 – FR-050). Local to this tab; `ChainCell` is not
  reused (R8).
- [x] **T034** The labelled band: `MicroLabel`, count, hint (FR-044).
- [x] **T035** Both tables rebuilt on `SheetTable` with the columns in FR-045, bus
  chips as `Pill` (FR-046).
- [x] **T036** Search over channel name, number and hop labels, with per-band
  filtered counts (FR-051).
- [x] **T037** Row click opens the owning audio tab (FR-052), using Phase 2's
  helper.
- [x] **T038** [P] `event/SignalFlowStatusRail.tsx` (FR-053); delete the floating
  gap sentence (FR-054).
- [x] **T039** `SignalFlowTab` rewritten: one `PatchPanel` inside the existing
  `PrintSheet`, bar with Print (FR-041 – FR-043), every role served (FR-055).
- [x] **T040** Confirm the print sheet still emits both halves — the panel is
  `print:hidden` chrome around content that is not.

**Commit**: `feat: the signal chain reads hop by hop (US3)`

## Phase 6 · Overview (US4)

- [x] **T041** `event/NumbersBand.tsx`: five figures, mono 26 px, `MicroLabel`
  beneath, each cell a link, `—` for undefined (FR-060 – FR-062).
- [x] **T042** `event/RigRibbon.tsx`: canvas nodes one row high, console at
  `NODE_BORDER_DESK` **imported**, zero-count nodes omitted, the DMX `Meter`
  (FR-064 – FR-066).
- [x] **T043** `event/ReadinessRow.tsx`: one pill per area, each linking to its tab
  (FR-067).
- [x] **T044** [P] `event/EventDetailsDrawer.tsx`: the four fields at `size="md"`,
  save/cancel, the footer sentence, name required (FR-071 – FR-074, FR-076).
- [x] **T045** `OverviewTab` rewritten as one card with the seven bands
  (FR-056 – FR-059, FR-069), wired to `eventSummary`.
- [x] **T046** The inventory row: `EventInventoryCard`'s behaviour — owner gets
  `Manage`, everyone else `Browse` with the read-only dialog — as a row, not a card
  (FR-068).
- [x] **T047** Read-only: no `Edit details`, everything else identical (FR-075).
- [x] **T048** Delete `MiniStat` and its `rounded-lg` (FR-070).
  `EventInventoryCard.tsx` deleted; its browse dialog moved to
  `EventInventoryBrowser.tsx`, losing a `rounded-lg` on the way.

**Commit**: `feat: Overview states the event (US4)`

## Phase 7 · Gates and documentation (US6)

- [x] **T049** Run every gate in [quickstart.md](./quickstart.md), including the
  five boundary diffs (FR-088 – FR-092) and the two counting gates.
- [x] **T050** `design/audit.md`: A6 and A7 narrowed to the surfaces Wave 5 owns;
  A4's remaining count updated; Wave 4 marked done with a delta table.
- [x] **T051** `design/patterns.md`: the labelled band, and the hand-off's new
  mechanism, if either changed a value.
- [x] **T052** `ROADMAP.md` Slice 28 record and the dependency graph line.
- [x] **T053** `PROJECT.md` sections for the four tabs.
- [x] **T054** Republish `mockup.html` if the built surface diverged from it, so
  the drawing and the code agree.

**Commit**: `docs: Wave 4 is done`

---

## Notes

- **T017 and T042 are the two places to resist retyping a value.** The manual badge
  is Slice 27's; the desk border is `graph/tokens.ts`'s `NODE_BORDER_DESK`. P3
  exists because four copies of the micro-label became five.
- **T025, T032 say "moved verbatim"** for the `isMobile` branches on purpose. They
  are out of scope (FR-090) and the diff gate will catch an accidental edit.
- **T010 is the wave's load-bearing test.** Everything else is presentation.
