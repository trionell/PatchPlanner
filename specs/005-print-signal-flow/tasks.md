# Tasks: Print & Signal Flow

**Input**: Design documents from `/specs/005-print-signal-flow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/print-signal-flow-ui.md, quickstart.md

**Tests**: Vitest unit tests for the signal-flow chain builder (requested by plan.md /
research.md R6). Print CSS is verified manually per quickstart.md.

**Organization**: Frontend-only slice — no backend, migration, or API tasks. Phases map
to the three user stories after a small shared print foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = print input patch, US2 = print outputs & lighting, US3 = signal flow

## Phase 1: Setup

No setup tasks — no new dependencies, tooling, or project structure changes (plan.md
Technical Context).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared print plumbing every story depends on: base print CSS, hidden app
chrome, the Print button, and the sheet wrapper with the event header.

- [ ] T001 [P] Add `@media print` base rules to `frontend/src/index.css`: `@page { margin: 12mm }`, force white background / black text on `:root`/`body`, `tr { break-inside: avoid }` inside `.print-sheet` tables (research.md R2)
- [ ] T002 [P] Hide app chrome in print in `frontend/src/components/Layout.tsx`: `print:hidden` on the sidebar `<aside>` and sticky `<header>`, `print:ml-0` on the content wrapper
- [ ] T003 [P] Create `frontend/src/components/print/PrintButton.tsx`: small button (Printer icon from lucide-react, label "Print") calling `window.print()`; itself `print:hidden`
- [ ] T004 [P] Create `frontend/src/components/print/PrintSheet.tsx`: wrapper `hidden print:block print-sheet` (optional `visibleOnScreen` prop for the signal-flow tab) that renders sheet title + event name · venue · date from `useQuery(['event', eventId])` (research.md R5), an "Nothing planned on this sheet." line when `empty`, and children as the sheet body — black-on-white typography per contracts/print-signal-flow-ui.md

**Checkpoint**: Foundation ready — user story phases can start.

---

## Phase 3: User Story 1 — Print the input patch sheet (Priority: P1) 🎯 MVP

**Goal**: Print button on the Audio Inputs tab produces a paper-friendly input patch
sheet with the event header and every planned channel (FR-001, FR-004–FR-006, FR-010–011).

**Independent Test**: quickstart.md §1 — plan input channels, press Print on the Inputs
tab, verify preview: all channels, no chrome/controls, light background, repeating
headers, Ctrl+P equivalent, empty-event message.

- [ ] T005 [US1] Create `frontend/src/components/print/InputPatchSheet.tsx`: static table `Ch# | Name | Type | Connector | Source | Stand | Cable | Length | 48V | Routing | DCA | Notes` per contracts/print-signal-flow-ui.md — Source resolves `mic_item_id` via passed-in inventory items with `mic_label` fallback (reuse the lookup pattern from `AudioInputsTab.tsx`); Routing renders `SB <name> ch <n>` / `Multi <name> ch <n>` / `direct`; rows sorted by `channel_number`
- [ ] T006 [US1] Wire into `frontend/src/components/event/AudioInputsTab.tsx`: add `<PrintButton />` beside the tab's header controls and render `<PrintSheet>` + `<InputPatchSheet>` from the already-loaded audio-patch and inventory queries
- [ ] T007 [US1] Manual verification per quickstart.md §1 (print preview: completeness, chrome-free, pagination, empty state, legacy values print as shown)

**Checkpoint**: US1 delivers standalone value — the MVP of this slice.

---

## Phase 4: User Story 2 — Print the output patch and lighting rig (Priority: P2)

**Goal**: Same print mechanism on the Outputs and Lighting tabs (FR-002–FR-006,
FR-010–011); each tab prints only its own sheet.

**Independent Test**: quickstart.md §2 — Print on each tab shows the complete sheet for
that tab only.

- [ ] T008 [P] [US2] Create `frontend/src/components/print/OutputPatchSheet.tsx`: static table `Out# | Name | Type | Destination | Amp | Speaker | Cable | Length | Notes` — Destination per `destination_type` (`local` / `SB <name> ch <n>` / `Multi <name> ch <n>`); amp/speaker names resolved from inventory items; rows sorted by `output_number`
- [ ] T009 [P] [US2] Create `frontend/src/components/print/LightingRigSheet.tsx`: static table `# | Fixture | Truss | Universe | Address | Mode | Ch | Power | Notes` — Fixture = `inventory_item_name ?? custom_name`; Power = `grid <connector-in>` or `chain ← <parent position>` (+ connector-out when set); rows sorted by `position_index`
- [ ] T010 [US2] Wire into `frontend/src/components/event/AudioOutputsTab.tsx`: `<PrintButton />` + `<PrintSheet>` + `<OutputPatchSheet>` from existing queries
- [ ] T011 [US2] Wire into `frontend/src/components/event/LightingTab.tsx`: `<PrintButton />` + `<PrintSheet>` + `<LightingRigSheet>` from existing queries
- [ ] T012 [US2] Manual verification per quickstart.md §2 (both sheets complete, no cross-tab content)

**Checkpoint**: All three planning tabs print.

---

## Phase 5: User Story 3 — Trace an input channel's signal flow (Priority: P3)

**Goal**: Read-only Signal Flow tab showing source → cable → stagebox/multi → console per
input channel with flagged gaps, itself printable (FR-007–FR-010).

**Independent Test**: quickstart.md §3 — fully-routed channel reads end-to-end; a
channel missing routing is flagged and counted; direct-to-console shows no false gap;
nothing is editable; the view prints.

- [ ] T013 [US3] Create `frontend/src/lib/signalFlow.ts`: `ChannelFlow`/`FlowHop` types and pure `buildChannelFlow(input, stageboxes, stageMultis, micNameById)` implementing the derivation rules in data-model.md (source fallback chain, cable + length detail, stagebox/multi/direct path, incomplete-routing flags, `hasGap`)
- [ ] T014 [US3] Create `frontend/src/lib/__tests__/signalFlow.test.ts`: Vitest cases — complete chain, missing source flagged, legacy `mic_label` source unflagged, direct-to-console unflagged, stagebox chosen without channel flagged, channel number without box/multi flagged, multi routing rendered, sorted by channel number
- [ ] T015 [US3] Create `frontend/src/components/event/SignalFlowTab.tsx`: read-only view (visible on screen AND printable via `PrintSheet` `visibleOnScreen`) — summary line ("All channels fully routed" / "N channel(s) have gaps"), one row per channel `Ch# | Name | Source → Cable → Path → Console` with ⚠-flagged gaps per contracts/print-signal-flow-ui.md, `<PrintButton />`, no mutation calls; reuses `['audio-patch', eventId]` + inventory items queries
- [ ] T016 [US3] Add the "Signal Flow" tab to `frontend/src/pages/EventDetail.tsx` (after Lighting Rig)
- [ ] T017 [US3] Manual verification per quickstart.md §3 (trace, gap flagging + count, direct-to-console, read-only, print)

**Checkpoint**: All user stories complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Update `README.md`: add print & signal-flow bullets to the features list (no API table changes — no new endpoints)
- [ ] T019 [P] Mark PROJECT.md §3.7 and §3.4 as implemented and check off Slice 5 in `ROADMAP.md`
- [ ] T020 Run full gates: `cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run && npm run build`; `cd backend && go vet ./... && go test ./...` and `golangci-lint run` must stay green (no backend changes)

---

## Dependencies

```text
Phase 2 (T001–T004, all parallel)
   ├─→ US1: T005 → T006 → T007          🎯 MVP
   ├─→ US2: T008 ∥ T009 → T010, T011 → T012
   └─→ US3: T013 → T014 ∥ T015 → T016 → T017
Phases 3–5 are mutually independent (different sheets/tabs; only shared files are the
foundation ones). US1 → US2 → US3 is the priority order, not a hard dependency.
Polish: T018 ∥ T019 → T020 last.
```

## Parallel Execution Examples

- **Foundation**: T001, T002, T003, T004 all touch different files — one pass.
- **US2 sheets**: T008 and T009 in parallel, then T010/T011 wire-ups.
- **US3**: T014 (tests) and T015 (tab component) in parallel once T013 exists.
- **Polish**: T018 and T019 in parallel.

## Implementation Strategy

MVP = Phase 2 + US1 (input patch sheet) — the sheet most often handed to crew. US2 reuses
the exact mechanism for two more sheets. US3 adds the only real logic in the slice
(`buildChannelFlow`), covered by unit tests before/alongside the UI. Stop-and-verify
checkpoints are the quickstart print previews per story.
