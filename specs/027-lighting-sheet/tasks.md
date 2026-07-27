---

description: "Task list for Slice 27 — Lighting becomes a sheet"
---

# Tasks: Lighting becomes a sheet

**Input**: Design documents from `/specs/027-lighting-sheet/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/dmx-map.md](./contracts/dmx-map.md),
[contracts/lighting-panel.md](./contracts/lighting-panel.md)

**Tests**: Vitest for `lib/dmxMap.ts` and `lib/dmxPlan.ts`, which is where the
whole difficulty of this slice lives — eighteen named cases in
[contracts/dmx-map.md](./contracts/dmx-map.md) §8, each mapped to a task below.
Go tests for the new address endpoint. The surface is checked by the six passes in
[quickstart.md](./quickstart.md); this project has no component-test harness, and a
render test asserting Tailwind class strings would restate the contract rather
than verify it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task serves

## A note on phase order

The template puts US1 first. Here **the map and the packing come first with no
caller at all** (Phases 2 and 3), because every user story depends on them and
because putting them under test before anything renders is what makes Phase 5 a
layout exercise rather than a debugging one. US1's own tasks are in Phase 5.

Phase 4 (the backend) is deliberately between them: it is the only phase that can
break another slice's tests, so it lands on its own, green, before any component
is touched.

---

## Phase 1: Setup

**Purpose**: Establish the ground, so nothing later is blamed on this slice.

- [ ] T001 Run every gate on a clean tree and record the result: `cd frontend && npx tsc -b && npx eslint src --max-warnings 0 && npx vitest run`, then `cd backend && go vet ./... && go test ./...`. A pre-existing failure must be known now, not discovered at the end
- [ ] T002 Record `git rev-parse HEAD` and the output of `git diff --stat` for `frontend/src/components/ui`, `frontend/src/components/event/graph`, `frontend/src/components/mobile` and `frontend/src/components/print`, so the end-of-slice assertion is "unchanged **by this slice**"
- [ ] T003 Copy the working database for manual passes: `cp backend/patchplanner.db /tmp/pp-027.db`. **Never run against `backend/patchplanner.db`**

---

## Phase 2: The map (Foundational — blocks every story)

**Purpose**: `lib/dmxMap.ts`, its types and its tests. No caller, no import from
any component. Complete when `npx vitest run src/lib/dmxMap.test.ts` is green.

- [ ] T004 Create `frontend/src/lib/dmxMap.ts` with the types in [data-model.md](./data-model.md) §2: `Span`, `AddressGroup`, `DmxProblem`, `UniverseMap`, `DmxMap`
- [ ] T005 Implement `fixtureSpan(fixture)` with the three normalisations from [contracts/dmx-map.md](./contracts/dmx-map.md) §1 — universe `< 1` → 1, count `< 1` → 1, no start address → no span. `end` is **not** clamped to 512
- [ ] T006 Implement grouping: partition a universe's addressed fixtures by `(start, count)` into `AddressGroup`s, members in rig order, ascending by start. This is the step that makes sharing structural rather than a special case
- [ ] T007 Implement `clashes(groups)` — pairwise over **groups**, `a.start <= b.end && b.start <= a.end`, one report per pair (FR-025)
- [ ] T008 Implement out-of-bounds detection: `group.end > 512`, reported distinctly from a clash (FR-022)
- [ ] T009 Implement occupancy as a `Set` of channel numbers unioned over each group's span **clipped to 1–512**, never a sum (contracts §3, research R10)
- [ ] T010 Implement `runs`, `largestRun` (ties to the lower start) and `firstRunFitting(n)` by walking 1→512 once
- [ ] T011 Assemble `dmxMap(fixtures)`: universes ascending and only those in use, `unaddressed`, flattened `problems`, `sharedGroupCount`, and `duplicateNumbers` passed through from the unchanged `lib/lightingRig.ts`
- [ ] T012 [P] Write `frontend/src/lib/dmxMap.test.ts` cases 1–7 and 18 from contracts §8: the four-condition universe, twenty on one address, same-start-different-count, shared-and-clashing, 505–520, 512×1, gaps of four, and the degenerate `count: 0` / `universe: 0`
- [ ] T013 Run `npx vitest run src/lib/dmxMap.test.ts` and `npx tsc -b`. **Commit: "feat: the DMX map, as pure functions"**

---

## Phase 3: The packing (Foundational — blocks US3, US4, US5)

**Purpose**: `lib/dmxPlan.ts`. One packer, three callers, still no component
imports it.

- [ ] T014 Create `frontend/src/lib/dmxPlan.ts` with `AddressChange` and `Plan` from data-model §3
- [ ] T015 Implement `packGroups(groups, cursorStart = 1)` — walk in the order given, place at the cursor, advance by `count`. A placement ending past 512 aborts **the whole universe** (contracts §4)
- [ ] T016 Implement per-universe isolation: pack each universe's groups separately, always emit the fixture's own normalised universe in every `AddressChange`, and collect universes that could not fit into `skippedUniverses` without emitting any of their changes (FR-035, FR-036)
- [ ] T017 Implement `planAutoAssign(fixtures)` — groups ordered by rig position of the first member; unaddressed fixtures included as groups of one and given addresses (FR-038)
- [ ] T018 Implement `planOptimise(fixtures)` — addressed fixtures only, ordered by current start then rig position; unaddressed left alone; `changes` omits fixtures that do not move so a tidy rig plans to nothing (FR-039, FR-042)
- [ ] T019 Implement `planMakeRoom(fixtures, insert)` with the ripple of contracts §6: exclude the edited fixture, cursor from `start + count`, **stop at the first group that already clears the cursor**, and return no changes at all if any moved group would end past 512 (FR-046, FR-048, FR-052)
- [ ] T020 [P] Write `frontend/src/lib/dmxPlan.test.ts` cases 8–17 from contracts §8, and assert in every one of them that **no fixture changed universe** and that **groups that shared still share and groups that did not still do not** — the rule the spec calls out as satisfiable in one direction only
- [ ] T021 Run `npx vitest run src/lib/dmxPlan.test.ts` and `npx tsc -b`. **Commit: "feat: one packer, three callers"**

---

## Phase 4: The backend

**Purpose**: The migration, the column's removal, and the swap of one endpoint
for another. Ends green with no frontend change beyond the type and the API
client.

- [ ] T022 Create `backend/migrations/044_drop_dmx_chain.up.sql` — `ALTER TABLE lighting_fixtures DROP COLUMN dmx_chain_parent_id;`, with the comment naming migration 033 as the precedent for dropping a `REFERENCES` column from this table
- [ ] T023 Create `backend/migrations/044_drop_dmx_chain.down.sql` — `ADD COLUMN … INTEGER REFERENCES lighting_fixtures(id)`, restoring the schema and not the data, because there never was any (research R11)
- [ ] T024 Remove `DMXChainParentID` from `domain.LightingFixture` in `backend/internal/domain/lighting.go`
- [ ] T025 Remove the column from both `SELECT`s, the `INSERT`, the `UPDATE` and `scanLightingFixture` in `backend/internal/db/lighting.go`; drop the `UPDATE … SET dmx_chain_parent_id = NULL` from `DeleteLightingFixture` and leave the `power_chain_parent_id` statement beside it
- [ ] T026 Delete `AutoAssignDMX` and `ErrUniverseFull` from `backend/internal/db/lighting.go`, and the `auto-assign-dmx` route and handler from `backend/internal/api/lighting.go`
- [ ] T027 Add `UpdateFixtureAddresses(db, rigID, changes)` to `backend/internal/db/lighting.go`: one transaction, one `UPDATE` per change, all or nothing
- [ ] T028 Add the `PATCH …/fixtures/addresses` route and handler in `backend/internal/api/lighting.go` with the validation in data-model §4 — membership via the existing `requireRigForEvent`, `dmx_universe >= 1`, `1 <= dmx_start_address <= 512`, at most 500 changes — returning the rig's full fixture list
- [ ] T029 Widen `domain.BulkFixtureRequest`: `InventoryItemID` to `*int64`, plus `NameStem`, `ShareAddress` and `DMXStartAddress`. Update `validInventoryItemRef`'s call site to pass the pointer through
- [ ] T030 Teach `BulkCreateLightingFixtures` the three new fields: name the fixtures `"<stem> N"` from 1, honour an explicit start address, and place every fixture on that one address when `ShareAddress` — checking one fixture's width against 512 rather than the batch's
- [ ] T031 Rewrite the auto-assign cases in `backend/internal/db/lighting_test.go` and `backend/internal/api/lighting_test.go` as address-endpoint cases: a good batch applies, an out-of-range address is rejected whole, and a fixture from another rig 404s. Remove the `child.DMXChainParentID` assignment
- [ ] T032 [P] Add Go tests for the widened bulk request: a batch with no catalog model, a named batch, and a shared-address batch consuming one fixture's width
- [ ] T033 Remove `dmx_chain_parent_id` from `frontend/src/types/index.ts`, widen `BulkFixtureRequest` there, drop `autoAssignDMX` from `frontend/src/api/lighting.ts` and add `updateFixtureAddresses`
- [ ] T034 Remove the DMX chain `<TableCell>` from the current `LightingTab.tsx` and the now-dead `autoAssignDMX` mutation, so the tree compiles between phases without the tab being rewritten yet
- [ ] T035 Run `go vet ./... && go test ./...` and `npx tsc -b`. Verify `grep -rn "dmx_chain_parent_id\|DMXChainParentID" --include='*.go' --include='*.ts' --include='*.tsx' backend/internal frontend/src` is empty (SC-015). **Commit: "feat: the backend keeps the guarantee, not the algorithm"**

---

## Phase 5: The surface (US1 — P1)

**Purpose**: The panel, the sheet and the row editor. Delivers the whole redesign
on its own; everything after this adds capability to a surface that already works.

- [ ] T036 Widen `frontend/src/components/event/RowEditor.tsx` per [contracts/lighting-panel.md](./contracts/lighting-panel.md) §8: `onDelete` optional, `onEditInFlow`/`editInFlowLabel` renamed to `handoff?: { label, text, onSelect }`, and a full-width `notice?: ReactNode` slot inside the amber body
- [ ] T037 Update the two audio call sites (`InputSheet.tsx`, `OutputSheet.tsx`) to the `handoff` prop, passing `text: 'Edit in Flow'` so they render byte-identically
- [ ] T038 Create `frontend/src/components/event/LightingSheet.tsx`: `SheetTable` with the nine columns of contracts §2, ordered by `position_index`, no control in a closed row
- [ ] T039 Implement the address cell's five states from contracts §3 — plain, shared badge, clash, out of bounds, unaddressed — reading them from the map, with a `title` on each that names the reason
- [ ] T040 Implement the fixture, truss and power cells: name plus mono model, truss with offset, `grid schuko` or `chain ← 101` naming the parent fixture rather than a row id (FR-007)
- [ ] T041 Wire `useRowEditor` and build the row editor's eleven fields per contracts §4, moving `FixtureModeCell`'s copy-on-pick behaviour into it (FR-016)
- [ ] T042 Add the truss hand-off — read-only value plus `Hang in plot →` through `RowEditor`'s `handoff` (FR-017) — and delete-with-confirm in the editor (FR-018)
- [ ] T043 Rewrite `frontend/src/components/event/LightingTab.tsx` as the panel shell: `PatchPanel`, the bar of contracts §1, search state, the mobile branch and the print sheet untouched, and every control absent for a read-only role (FR-079)
- [ ] T044 Wire search over console ID, name, model, mode, truss and note using the existing `matchesSearch` (FR-078), and the empty states of the spec's Edge Cases
- [ ] T045 Run `npx tsc -b && npx eslint src --max-warnings 0 && npx vitest run`, then quickstart Pass 1. **Commit: "feat: the Lighting rig becomes a sheet (US1)"**

---

## Phase 6: The strip (US2 — P2)

- [ ] T046 Create `frontend/src/components/event/LightingStatusRail.tsx` per contracts §7: three states, ground and rule both tinted, and the shared-group count present in **all three** (research R9)
- [ ] T047 Implement the strip's constant content — fixture count, per-universe occupancy `U1 078/512`, shared groups, unaddressed, duplicate console IDs — and, in the problem states, the first problem in full plus `+N more`
- [ ] T048 Add the filter control and the `gapsOnly`-equivalent state in `LightingSheet`, filtering to the rows the strip is reporting and offering the way back (FR-058)
- [ ] T049 Run the gates and quickstart Pass 2, including the check that universe 3 reads `007/512` and not `021/512`. **Commit: "feat: the strip knows what the DMX map looks like (US2)"**

---

## Phase 7: Adding (US3 — P2)

- [ ] T050 Add the add editor to `LightingSheet` — the same `RowEditor` construction at the foot of the sheet, no delete, quantity defaulting to 1 (FR-061, FR-062)
- [ ] T051 Build its fields per contracts §5, including the `Addresses` select (`consecutive` / `all share one`) and the model picker over the event's lighting inventory with a custom-fixture option (FR-065, FR-067)
- [ ] T052 Implement the fit line: the batch's channel demand against the universe's **largest free run**, one fixture's width when sharing (FR-066)
- [ ] T053 Wire the confirm to `bulkAddFixtures` with the widened request, choosing the start address from `firstRunFitting`, and delete both `Dialog`s and their draft state from the tab (SC-012)
- [ ] T054 Run the gates and quickstart Pass 4. **Commit: "feat: one editor replaces two dialogs (US3)"**

---

## Phase 8: Inserting (US5 — P2)

- [ ] T055 Create `frontend/src/components/event/AddressPrompt.tsx` per contracts §6: the amber block, what is in the way by name and span, and the four answers with their conditions
- [ ] T056 Hold the save in both editors when the confirmed address collides, and render the prompt in `RowEditor`'s `notice` slot (FR-043, FR-052)
- [ ] T057 Wire `Make room`: call `planMakeRoom`, show the moved count on the button, apply through `updateFixtureAddresses` **and then** save the draft — shift first, save second (data-model §6)
- [ ] T058 Wire `Share address` — offered only on an exact match of start and count — and `Place anyway`, which saves the collision for the strip to report (FR-049, FR-050)
- [ ] T059 Suppress make room with its reason in the sentence when the ripple would exceed 512 (FR-048), and stop `⌘↵` from saving while the prompt shows (FR-053)
- [ ] T060 Run the gates and quickstart Pass 3. **Commit: "feat: an occupied address asks rather than refuses (US5)"**

---

## Phase 9: The drawer and the operations (US4, US6 — P2/P3)

- [ ] T061 Create `frontend/src/components/event/UniversesDrawer.tsx` per contracts §9: `Drawer` `narrow`, a `GearCard` per universe with occupancy, `Meter`, fixture count, free, largest run and shared groups
- [ ] T062 Ensure the `Meter` draws nothing at zero occupancy (FR-070), and add the models section — each catalog model once, with quantity, per-fixture channels and total demand (FR-071)
- [ ] T063 Add both operations to the section header and the footer stating what each does and how they differ (FR-072)
- [ ] T064 Wire `Auto-assign DMX` and `Optimise channels` to `planAutoAssign`/`planOptimise` and `updateFixtureAddresses`, each confirming first with what it will change (FR-041)
- [ ] T065 Report the outcome: which universes changed, which were skipped and why, and optimise's honest "nothing to close" (FR-037, FR-042)
- [ ] T066 Add the `Universes` button to the bar and confirm the bar is exactly the canonical order with no extra buttons (FR-073)
- [ ] T067 Run every gate plus `npm run build`, then quickstart Passes 5 and 6. **Commit: "feat: the Universes drawer, and two group-aware operations (US4, US6)"**

---

## Phase 10: Documentation and closing the wave

- [ ] T068 Update `design/audit.md`: move A6, A7 and A8 to Part 1b with Wave 3, narrow A4's remaining list to the surfaces waves 4 and 5 own, and mark Wave 3 **done** with the delta table the earlier waves set the pattern for
- [ ] T069 Update `ROADMAP.md` with the Slice 27 record and `PROJECT.md` where it describes the Lighting tab
- [ ] T070 Verify the boundary gates of quickstart: `git diff --stat main` shows nothing under `components/ui` or `components/event/graph`, and nothing under `mobile/` or `print/` beyond the type removal
- [ ] T071 Mark every task above complete with its outcome, and record anything that turned out differently from the plan — a plan that was wrong and a record that says so is worth more than one quietly corrected
- [ ] T072 **Commit: "docs: ROADMAP, PROJECT and the Wave 3 record"**

---

## Dependencies

```
Phase 1 ─→ Phase 2 (map) ─→ Phase 3 (packing) ─┬─→ Phase 7 (adding)
                                                ├─→ Phase 8 (inserting)
                                                └─→ Phase 9 (drawer, operations)
Phase 4 (backend) ─→ Phase 5 (surface) ─→ Phase 6 (strip) ─→ 7 ─→ 8 ─→ 9 ─→ 10
```

Phases 2 and 3 have no dependency on Phase 4 and could be written first, last or
in parallel with it — they import nothing. Phases 5 onwards are strictly ordered,
because each renders inside the one before it.

## Independent test criteria

| Story | Delivered by | Testable alone by |
|---|---|---|
| US1 read the rig | Phase 5 | quickstart Pass 1 — the sheet reads and edits with no strip, no drawer, no prompt |
| US2 the four conditions | Phase 6 | Pass 2, and `dmxMap.test.ts` cases 1–7 |
| US3 adding | Phase 7 | Pass 4 |
| US4 the operations | Phase 9 | `dmxPlan.test.ts` cases 8–13, then Pass 5 |
| US5 inserting | Phase 8 | `dmxPlan.test.ts` cases 14–17, then Pass 3 |
| US6 the drawer | Phase 9 | Pass 5's first four items |
