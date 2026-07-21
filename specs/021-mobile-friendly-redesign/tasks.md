---

description: "Task list for Mobile-Friendly Redesign (Slice 21)"
---

# Tasks: Mobile-Friendly Redesign

**Input**: Design documents from `/specs/021-mobile-friendly-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mobile-ui-contract.md, quickstart.md

**Tests**: Not explicitly requested in spec.md. Two pure-logic units introduced by this feature (`useIsMobile`, the pinch-zoom delta helper) get Vitest coverage per plan.md's Technical Context → Testing decision; no other test tasks are included.

**Organization**: Tasks are grouped by user story (from spec.md) to enable independent implementation and testing of each story. This is a frontend-only feature — every path below is under `frontend/`; `backend/` is untouched.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency)
- **[Story]**: Which user story this task belongs to (US1–US5, per spec.md priorities)
- Exact file paths are included in every task

---

## Phase 1: Setup

**Purpose**: Scaffolding shared by every later phase.

- [X] T001 Create the `frontend/src/components/mobile/` directory with an empty `index.ts` barrel export, the home for every new mobile-only component in this feature. (Barrel populated once every component exists — see end of Phase 8.)
- [X] T002 [P] Create `frontend/src/types/mobile.ts` defining the `MobileCapability` union (`'editable' | 'read-only' | 'viewer'`), the `MobileSectionCapability` type, and the fixed 9-row capability matrix constant, exactly as specified in `data-model.md`'s "New frontend-only view models" section and `contracts/mobile-ui-contract.md`'s capability matrix table.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story phase below depends on.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [X] T003 Create the `useIsMobile()` hook in `frontend/src/hooks/useIsMobile.ts`, wrapping `window.matchMedia('(max-width: 767px)')` with a change-event subscription, per `research.md` R1. Returns a boolean, re-renders the consumer on breakpoint crossing.
- [X] T004 [P] Create the `CondensedListRow` presentational component in `frontend/src/components/mobile/CondensedListRow.tsx` (title, subtitle, optional trailing content) implementing the tight row spacing/type-scale established in the reviewed mockups, per `research.md` R6 and `contracts/mobile-ui-contract.md`.

**Checkpoint**: `useIsMobile` and `CondensedListRow` exist — every user story phase below can now start.

---

## Phase 3: User Story 1 - Make on-site patch and rig changes from a phone (Priority: P1) 🎯 MVP

**Goal**: An engineer at the venue can find and edit an audio channel's routing/color/notes or a lighting fixture's DMX address/universe/ID from a phone, and add a new channel or fixture, without a laptop.

**Independent Test**: On a phone-width viewport, open Audio Inputs, search for a channel, edit its source and stagebox input, save, and confirm desktop shows the same change. Repeat for a Lighting Rig fixture's DMX address. Add one new channel and one new fixture from mobile and confirm both appear on desktop.

### Implementation for User Story 1

- [X] T005 [P] [US1] Create the channel list-item derivation helper in `frontend/src/lib/mobileChannelList.ts`: given the `getAudioPatch` response already fetched by the tab, produce `MobileChannelListItem[]` (channel number, name, color, resolved source label, resolved routing label) reusing the existing backward-walk `nodeName`/`inputSignalFlow.ts` helpers so the resolution logic matches the desktop graph/patch-sheet exactly, per `data-model.md`.
- [X] T006 [P] [US1] Create `MobileChannelList` in `frontend/src/components/mobile/MobileChannelList.tsx`: condensed, color-striped rows (via `CondensedListRow`) built from `MobileChannelListItem[]`, a client-side search-by-name/number input, a tap handler to select a channel, and an add-channel action that is hidden entirely (not just disabled) when `readOnly` is true, per `contracts/mobile-ui-contract.md` and FR-015.
- [X] T007 [US1] Create `MobileChannelEditSheet` in `frontend/src/components/mobile/MobileChannelEditSheet.tsx`: a bottom-sheet form with name, color (reusing `ColorSelect`), source/mic assignment, stagebox/input routing, and notes fields. On save: PATCH the channel's own fields via the existing `updateInputChannel` mutation, and resolve any routing change by deleting the channel's current incoming `InputCable` (if any) and creating a new one via the existing `createInputCable`/`deleteInputCable` functions, per `research.md` R3. On a failed save, keep the sheet open with an inline error and preserve the user's in-progress edits (FR-017). (Depends on T005.)
- [X] T008 [US1] Wire `AudioInputsTab` (`frontend/src/components/event/AudioInputsTab.tsx`) to render `MobileChannelList` + `MobileChannelEditSheet` instead of `BusSection`/`ChannelSection`/`StageboxMultiSection`/`InputDeviceSection`/`SourceSection`/the graph-or-table toggle when `useIsMobile()` is true, passing through the existing `readOnly` prop unchanged. (Depends on T003, T006, T007.)
- [X] T009 [P] [US1] Wire `AudioOutputsTab` (`frontend/src/components/event/AudioOutputsTab.tsx`) to the output-side equivalent of the same list/sheet pair (using `updateAudioOutput` and the output-cable functions in place of the input-side calls), gated the same way behind `useIsMobile()`. (Depends on T003, T006, T007.)
- [X] T010 [P] [US1] Create `MobileFixtureList` in `frontend/src/components/mobile/MobileFixtureList.tsx`: condensed rows (via `CondensedListRow`) built directly from each fixture's `fixture_number`, `custom_name`/inventory item name, `dmx_universe`, `dmx_start_address`, `dmx_channel_mode`, a client-side search input, a tap handler, and an add-fixture action hidden entirely when `readOnly`, per `data-model.md`'s `MobileFixtureListItem`.
- [X] T011 [US1] Create `MobileFixtureEditSheet` in `frontend/src/components/mobile/MobileFixtureEditSheet.tsx`: a bottom-sheet form for fixture ID (`fixture_number`), fixture/mode (reusing the existing fixture-mode lookup query desktop's Add Fixture dialog already uses), DMX universe, and DMX start address, saving via the existing fixture update/create calls (direct field PATCH — no cable resolution needed, per `research.md` R4). Preserve in-progress edits on a failed save. (Depends on T010.)
- [X] T012 [US1] Wire `LightingTab` (`frontend/src/components/event/LightingTab.tsx`) to render `MobileFixtureList` + `MobileFixtureEditSheet` instead of the desktop fixture table when `useIsMobile()` is true, passing through the existing `readOnly` prop unchanged. (Depends on T003, T010, T011.)

**Checkpoint**: User Story 1 is fully functional and independently testable — on-site audio and lighting edits work from a phone even before mobile navigation (US2) exists, since the existing (unimproved) mobile tab strip can still reach these tabs.

**Implementation note**: `MobileChannelList` and `MobileFixtureList` were built as one shared component, `MobileEntityList` (`frontend/src/components/mobile/MobileEntityList.tsx`) — inspecting the two target UIs side by side showed they're the identical shape (searchable, condensed, color-optional, tap-to-edit rows with a hidden-when-`readOnly` add button), so one component serves Audio Inputs, Audio Outputs, and Lighting Rig rather than three near-duplicates. `MobileOutputEditSheet` was added (not originally listed) as the output-side twin of `MobileChannelEditSheet`, since audio routing's from/to direction differs enough between inputs and outputs that they warranted separate sheet components even though the list view is shared.

---

## Phase 4: User Story 2 - Navigate the whole app from a phone (Priority: P2)

**Goal**: Every part of the app — dashboard, events list, and all nine event sections — is reachable from a phone-width viewport, with each section's mobile capability visible before it's opened.

**Independent Test**: On a phone-width viewport, sign in, reach the dashboard, open an event, and switch between at least three sections using the section switcher, confirming the switcher lists every section's capability.

### Implementation for User Story 2

- [X] T013 [P] [US2] Create `MobileNav` in `frontend/src/components/mobile/MobileNav.tsx`: a fixed bottom tab bar with Dashboard, Events, Inventories, and an overflow "More" entry (My Defaults + sign-out), using `NavLink`/`useLocation` the same way the existing sidebar in `Layout.tsx` does.
- [X] T014 [US2] Wire `Layout` (`frontend/src/components/Layout.tsx`) to render `MobileNav` in place of the fixed sidebar and header when `useIsMobile()` is true, leaving the desktop branch of the component untouched. (Depends on T003, T013.)
- [X] T015 [P] [US2] Create `SectionSwitcher` in `frontend/src/components/mobile/SectionSwitcher.tsx`: a current-section pill that opens a bottom sheet listing all 9 sections from the `MobileSectionCapability` matrix (T002), each labeled with its capability badge (editable/read-only/viewer), with a tap handler to select a different section. (Depends on T002.)
- [X] T016 [US2] Wire `EventDetailPage` (`frontend/src/pages/EventDetail.tsx`) to render `SectionSwitcher` in place of `TabList`/`Tab` when `useIsMobile()` is true, keeping every existing `TabPanel` and its data-fetching completely unchanged, and to pre-select the section indicated by the current URL rather than defaulting to Overview (FR-016/edge case). (Depends on T003, T015.)
- [X] T017 [US2] Confirm/adjust the Overview section (`frontend/src/components/event/OverviewTab.tsx`) renders as a single-column form with normal-sized (not condensed) fields below the mobile breakpoint, since it's a simple form, not a dense list.
- [X] T018 [P] [US2] Apply `CondensedListRow` to the Dashboard's recent-events list in `frontend/src/pages/Dashboard.tsx` when `useIsMobile()` is true. (Depends on T004.)
- [X] T019 [P] [US2] Apply `CondensedListRow` to the Events list in `frontend/src/pages/Events.tsx` when `useIsMobile()` is true. (Depends on T004.)

**Checkpoint**: User Stories 1 and 2 both work independently — the app is now fully navigable on a phone, and Story 1's editing surfaces are reachable through the new switcher instead of the old tab strip.

---

## Phase 5: User Story 3 - Check the stage plot and signal flow on site without risking a change (Priority: P3)

**Goal**: Stage Plots and Signal Flow render as pan/zoom-only viewers on a phone — no drag/resize/rotate/add/delete affordance reachable.

**Independent Test**: On a phone-width viewport, open a Stage Plot, pan and zoom it, and confirm no editing control is present or triggerable by touch. Repeat for Signal Flow.

### Implementation for User Story 3

- [X] ~~T020 [P] [US3] Create the pinch-zoom delta helper~~ — **dropped during implementation**: `StagePlotTab` already has a working zoom `+`/`−` button pair (`zoomBy`, calling the same `onViewStateChange` wheel-zoom uses); tapping a button is exactly as good as pinch for this use case, so no custom multi-touch gesture math was built (research.md R5, revised).
- [X] ~~T021 [US3] Integrate the pinch-zoom helper into `StagePlotCanvas`~~ — not needed, see T020.
- [X] ~~T022 [US3] Integrate the pinch-zoom helper into `InputGraphCanvas`~~ — not applicable at all: `InputGraphCanvas` is never rendered by the Signal Flow section (see T024) or by mobile Audio Inputs/Outputs (US1 replaces that whole area with `MobileEntityList`), so it needed no mobile treatment.
- [X] T023 [US3] Wire `StagePlotTab` (`frontend/src/components/event/StagePlotTab.tsx`) to render a trimmed mobile toolbar (zoom only) and `StagePlotCanvas` with `readOnly` forced `true` for every role (Stage Plots is a viewer for everyone on mobile, not just viewer-role users) and no palette/inspector/truss-manager mounted, when `useIsMobile()` is true. Plot create/rename/delete controls are also hidden on mobile (`editingAllowed = !readOnly && !isMobile`).
- [X] ~~T024 [US3] Wire `SignalFlowTab` to render `InputGraphCanvas`~~ — **redefined during implementation**: `SignalFlowTab` turned out to already be a separate, permanently-read-only table report (never renders `InputGraphCanvas` at all). Actual fix: wrapped its two `<Table>`s in `overflow-x-auto` (`frontend/src/components/event/SignalFlowTab.tsx`) — a pattern used everywhere else in the codebase but missing here — so a wide table scrolls instead of breaking layout, applied universally (not gated behind `useIsMobile()`, since it's strictly beneficial at any width).

**Checkpoint**: User Stories 1–3 all work independently — diagrams are safely viewable on site alongside the editable audio/lighting lists.

---

## Phase 6: User Story 4 - Check equipment and rental order lists on a phone (Priority: P4)

**Goal**: Equipment and Rental Order render as dense, read-only lists on a phone.

**Independent Test**: On a phone-width viewport, open Equipment and Rental Order for an event with existing items and confirm both render as condensed, read-only lists with no add/edit/delete affordance.

### Implementation for User Story 4

- [X] T025 [P] [US4] Apply `CondensedListRow` to `EquipmentTab` (`frontend/src/components/event/EquipmentTab.tsx`) when `useIsMobile()` is true, grouped by category as today, with no add/edit/delete control rendered on mobile regardless of the user's role. (Depends on T003, T004.)
- [X] T026 [P] [US4] Apply `CondensedListRow` to `RentalTab` (`frontend/src/components/event/RentalTab.tsx`) when `useIsMobile()` is true, same read-only treatment. (Depends on T003, T004.)

**Checkpoint**: User Stories 1–4 all work independently.

---

## Phase 7: User Story 5 - Manage simple vocabulary lists from a phone (Priority: P5)

**Goal**: Settings (per-event vocabulary) and My Defaults stay fully editable on a phone, using the same condensed row language as the rest of the mobile UI.

**Independent Test**: On a phone-width viewport, add, rename, and delete a vocabulary row in My Defaults, then repeat inside an event's Settings tab; confirm both persist and neither affects the other.

### Implementation for User Story 5

- [X] T027 [P] [US5] Confirm/adjust `SettingsTab` (`frontend/src/components/event/SettingsTab.tsx`) vocabulary rows use `CondensedListRow`-equivalent spacing below the mobile breakpoint while keeping every add/rename/delete control visible and functional. (Depends on T004.)
- [X] T028 [P] [US5] Confirm/adjust `MyDefaults` (`frontend/src/pages/MyDefaults.tsx`) vocabulary rows the same way. (Depends on T004.)

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Consistency and validation across every story above.

- [X] T029 [P] Apply `CondensedListRow` to the `Inventories` page's list rows in `frontend/src/pages/Inventories.tsx` when `useIsMobile()` is true, matching the density established for Equipment/Rental Order (this page wasn't covered by a specific user story but uses the same list pattern). (Depends on T004.)
- [X] T030 Audit every mobile add/edit affordance introduced in T006, T007, T010, T011, T015–T017 and confirm each is hidden — not merely disabled — for a viewer-role user, matching FR-015 and the project's established "hide, don't just block" convention.
- [X] T031 [P] Add Vitest coverage for the routing-diff helpers `computeRoutingSave`/`computeOutputRoutingSave` (`frontend/src/lib/mobileChannelList.test.ts`) — the one piece of genuinely new, non-trivial logic this feature introduces (per plan.md's Technical Context → Testing decision; supersedes the dropped pinch-zoom helper originally planned here, see T020's note above).
- [X] T032 Run `npm run typecheck && npm run lint && npm test` in `frontend/`, and `go vet ./... && go test ./...` in `backend/` to confirm zero backend regressions and a clean frontend gate; fix anything that fails.
- [X] T033 Walk `quickstart.md` steps 2–4 manually: confirm desktop-width layouts are pixel-unchanged after resizing back above the breakpoint (SC-004), walk the full capability matrix at phone width, and repeat as a viewer-role member to confirm every "editable" section renders read-only for that role.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001 creates the directory T004's file lives in) — BLOCKS every user story phase.
- **User Stories (Phases 3–7)**: All depend on Foundational (Phase 2) completion. Independent of each other — can proceed in any order or in parallel once Phase 2 is done, though P1→P5 is the recommended sequence since it matches spec.md's priority ordering.
- **Polish (Phase 8)**: T029/T031/T032 can start once their specific dependencies land; T030 and T033 depend on every user story phase being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories. Reachable via the existing (pre-US2) mobile tab strip, so independently testable even before US2 ships.
- **US2 (P2)**: No dependency on US1's internals — `SectionSwitcher` renders whatever `TabPanel` content already exists, mobile-aware or not.
- **US3 (P3)**: No dependency on US1/US2.
- **US4 (P4)**: No dependency on US1–US3.
- **US5 (P5)**: No dependency on US1–US4.

### Parallel Opportunities

- T001, T002 (Setup) — different files, can run in parallel.
- T003, T004 (Foundational) — different files, can run in parallel.
- Within US1: T005, T006, T010 are parallel (different files); T009 is parallel with T008 once T006/T007 land (different tab file).
- Within US2: T013, T015, T018, T019 are parallel (different files).
- Within US3: T020 is a prerequisite parallel start; T021/T022 can then proceed in parallel (different canvas files).
- US4's T025/T026 and US5's T027/T028 are each parallel pairs.
- Once Phase 2 is done, entire user story phases (3 through 7) can be staffed in parallel if desired — none shares a file with another story's tasks.

---

## Parallel Example: User Story 1

```bash
# After Foundational (T003, T004) completes, launch together:
Task: "Create channel list-item derivation helper in frontend/src/lib/mobileChannelList.ts"
Task: "Create MobileChannelList in frontend/src/components/mobile/MobileChannelList.tsx"
Task: "Create MobileFixtureList in frontend/src/components/mobile/MobileFixtureList.tsx"

# Then, once the corresponding List/Sheet pair exists:
Task: "Wire AudioOutputsTab to the output-variant mobile list/sheet"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (US1) — on-site audio/lighting edits work from a phone.
3. **STOP and VALIDATE**: run the US1 independent test manually.
4. This alone solves the problem statement from the original request (on-site rigging changes) even though navigation is still the old tab strip.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → validate → this is the MVP.
3. US2 → validate → the app is now fully navigable on mobile.
4. US3 → validate → diagrams are safely viewable on site.
5. US4 → validate → equipment/rental lookups work on mobile.
6. US5 → validate → vocabulary management works on mobile.
7. Phase 8 → typecheck/lint/test gate, viewer-role audit, and the full quickstart walkthrough.

### Parallel Team Strategy

Once Phase 2 is done, up to five people could take one user-story phase each (US1–US5) with no file conflicts between them; Phase 8's T030/T033 should wait until all five are merged.

---

## Notes

- [P] tasks touch different files with no unmet dependency.
- [Story] labels map every implementation task back to spec.md's prioritized user stories for traceability.
- No backend task exists in this list — every mutation used above already exists in `frontend/src/api/*.ts`, confirmed in `research.md` R3/R4.
- Desktop code paths are never edited in place — every task above is an additive `useIsMobile()` branch, per FR-016/SC-004.
