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

- [x] T001 Run every gate on a clean tree and record the result: `cd frontend && npx tsc -b && npx eslint src --max-warnings 0 && npx vitest run`, then `cd backend && go vet ./... && go test ./...`. A pre-existing failure must be known now, not discovered at the end
- [x] T002 Record `git rev-parse HEAD` and the output of `git diff --stat` for `frontend/src/components/ui`, `frontend/src/components/event/graph`, `frontend/src/components/mobile` and `frontend/src/components/print`, so the end-of-slice assertion is "unchanged **by this slice**"
- [x] T003 Copy the working database for manual passes: `cp backend/patchplanner.db /tmp/pp-027.db`. **Never run against `backend/patchplanner.db`**

---

## Phase 2: The map (Foundational — blocks every story)

**Purpose**: `lib/dmxMap.ts`, its types and its tests. No caller, no import from
any component. Complete when `npx vitest run src/lib/dmxMap.test.ts` is green.

- [x] T004 Create `frontend/src/lib/dmxMap.ts` with the types in [data-model.md](./data-model.md) §2: `Span`, `AddressGroup`, `DmxProblem`, `UniverseMap`, `DmxMap`
- [x] T005 Implement `fixtureSpan(fixture)` with the three normalisations from [contracts/dmx-map.md](./contracts/dmx-map.md) §1 — universe `< 1` → 1, count `< 1` → 1, no start address → no span. `end` is **not** clamped to 512
- [x] T006 Implement grouping: partition a universe's addressed fixtures by `(start, count)` into `AddressGroup`s, members in rig order, ascending by start. This is the step that makes sharing structural rather than a special case
- [x] T007 Implement `clashes(groups)` — pairwise over **groups**, `a.start <= b.end && b.start <= a.end`, one report per pair (FR-025)
- [x] T008 Implement out-of-bounds detection: `group.end > 512`, reported distinctly from a clash (FR-022)
- [x] T009 Implement occupancy as a `Set` of channel numbers unioned over each group's span **clipped to 1–512**, never a sum (contracts §3, research R10)
- [x] T010 Implement `runs`, `largestRun` (ties to the lower start) and `firstRunFitting(n)` by walking 1→512 once
- [x] T011 Assemble `dmxMap(fixtures)`: universes ascending and only those in use, `unaddressed`, flattened `problems`, `sharedGroupCount`, and `duplicateNumbers` passed through from the unchanged `lib/lightingRig.ts`
- [x] T012 [P] Write `frontend/src/lib/dmxMap.test.ts` cases 1–7 and 18 from contracts §8: the four-condition universe, twenty on one address, same-start-different-count, shared-and-clashing, 505–520, 512×1, gaps of four, and the degenerate `count: 0` / `universe: 0`
- [x] T013 Run `npx vitest run src/lib/dmxMap.test.ts` and `npx tsc -b`. **Commit: "feat: the DMX map, as pure functions"**

---

## Phase 3: The packing (Foundational — blocks US3, US4, US5)

**Purpose**: `lib/dmxPlan.ts`. One packer, three callers, still no component
imports it.

- [x] T014 Create `frontend/src/lib/dmxPlan.ts` with `AddressChange` and `Plan` from data-model §3
- [x] T015 Implement `packGroups(groups, cursorStart = 1)` — walk in the order given, place at the cursor, advance by `count`. A placement ending past 512 aborts **the whole universe** (contracts §4)
- [x] T016 Implement per-universe isolation: pack each universe's groups separately, always emit the fixture's own normalised universe in every `AddressChange`, and collect universes that could not fit into `skippedUniverses` without emitting any of their changes (FR-035, FR-036)
- [x] T017 Implement `planAutoAssign(fixtures)` — groups ordered by rig position of the first member; unaddressed fixtures included as groups of one and given addresses (FR-038)
- [x] T018 Implement `planOptimise(fixtures)` — addressed fixtures only, ordered by current start then rig position; unaddressed left alone; `changes` omits fixtures that do not move so a tidy rig plans to nothing (FR-039, FR-042)
- [x] T019 Implement `planMakeRoom(fixtures, insert)` with the ripple of contracts §6: exclude the edited fixture, cursor from `start + count`, **stop at the first group that already clears the cursor**, and return no changes at all if any moved group would end past 512 (FR-046, FR-048, FR-052)
- [x] T020 [P] Write `frontend/src/lib/dmxPlan.test.ts` cases 8–17 from contracts §8, and assert in every one of them that **no fixture changed universe** and that **groups that shared still share and groups that did not still do not** — the rule the spec calls out as satisfiable in one direction only
- [x] T021 Run `npx vitest run src/lib/dmxPlan.test.ts` and `npx tsc -b`. **Commit: "feat: one packer, three callers"**

---

## Phase 4: The backend

**Purpose**: The migration, the column's removal, and the swap of one endpoint
for another. Ends green with no frontend change beyond the type and the API
client.

- [x] T022 Create `backend/migrations/044_drop_dmx_chain.up.sql` — `ALTER TABLE lighting_fixtures DROP COLUMN dmx_chain_parent_id;`, with the comment naming migration 033 as the precedent for dropping a `REFERENCES` column from this table
- [x] T023 Create `backend/migrations/044_drop_dmx_chain.down.sql` — `ADD COLUMN … INTEGER REFERENCES lighting_fixtures(id)`, restoring the schema and not the data, because there never was any (research R11)
- [x] T024 Remove `DMXChainParentID` from `domain.LightingFixture` in `backend/internal/domain/lighting.go`
- [x] T025 Remove the column from both `SELECT`s, the `INSERT`, the `UPDATE` and `scanLightingFixture` in `backend/internal/db/lighting.go`; drop the `UPDATE … SET dmx_chain_parent_id = NULL` from `DeleteLightingFixture` and leave the `power_chain_parent_id` statement beside it
- [x] T026 Delete `AutoAssignDMX` from `backend/internal/db/lighting.go`, and the `auto-assign-dmx` route and handler from `backend/internal/api/lighting.go`. **`ErrUniverseFull` stays**, contrary to the task as written: the bulk-add guard still raises it, and deleting it would have meant inventing a second name for the same 409**

- [x] T027 Add `UpdateFixtureAddresses(db, rigID, changes)` to `backend/internal/db/lighting.go`: one transaction, one `UPDATE` per change, all or nothing
- [x] T028 Add the `PATCH …/fixtures/addresses` route and handler in `backend/internal/api/lighting.go` with the validation in data-model §4 — membership via the existing `requireRigForEvent`, `dmx_universe >= 1`, `1 <= dmx_start_address <= 512`, at most 500 changes — returning the rig's full fixture list
- [x] T029 Widen `domain.BulkFixtureRequest`: `InventoryItemID` to `*int64`, plus `NameStem`, `ShareAddress` and `DMXStartAddress`. Update `validInventoryItemRef`'s call site to pass the pointer through
- [x] T030 Teach `BulkCreateLightingFixtures` the three new fields: name the fixtures `"<stem> N"` from 1, honour an explicit start address, and place every fixture on that one address when `ShareAddress` — checking one fixture's width against 512 rather than the batch's
- [x] T031 Rewrite the auto-assign cases in `backend/internal/db/lighting_test.go` and `backend/internal/api/lighting_test.go` as address-endpoint cases: a good batch applies, an out-of-range address is rejected whole, and a fixture from another rig 404s. Remove the `child.DMXChainParentID` assignment
- [x] T032 [P] Add Go tests for the widened bulk request: a batch with no catalog model, a named batch, and a shared-address batch consuming one fixture's width
- [x] T033 Remove `dmx_chain_parent_id` from `frontend/src/types/index.ts`, widen `BulkFixtureRequest` there, drop `autoAssignDMX` from `frontend/src/api/lighting.ts` and add `updateFixtureAddresses`
- [x] T034 Remove the DMX chain `<TableCell>` from the current `LightingTab.tsx` and the now-dead `autoAssignDMX` mutation, so the tree compiles between phases without the tab being rewritten yet
- [x] T035 Run `go vet ./... && go test ./...` and `npx tsc -b`. Verify `grep -rn "dmx_chain_parent_id\|DMXChainParentID" --include='*.go' --include='*.ts' --include='*.tsx' backend/internal frontend/src` is empty (SC-015). **Commit: "feat: the backend keeps the guarantee, not the algorithm"**

---

## Phase 5: The surface (US1 — P1)

**Purpose**: The panel, the sheet and the row editor. Delivers the whole redesign
on its own; everything after this adds capability to a surface that already works.

- [x] T036 Widen `frontend/src/components/event/RowEditor.tsx` per [contracts/lighting-panel.md](./contracts/lighting-panel.md) §8: `onDelete` optional, `onEditInFlow`/`editInFlowLabel` renamed to `handoff?: { label, text, onSelect }`, and a full-width `notice?: ReactNode` slot inside the amber body
- [x] T037 Update the two audio call sites (`InputSheet.tsx`, `OutputSheet.tsx`) to the `handoff` prop, passing `text: 'Edit in Flow'` so they render byte-identically
- [x] T038 Create `frontend/src/components/event/LightingSheet.tsx`: `SheetTable` with the nine columns of contracts §2, ordered by `position_index`, no control in a closed row
- [x] T039 Implement the address cell's five states from contracts §3 — plain, shared badge, clash, out of bounds, unaddressed — reading them from the map, with a `title` on each that names the reason
- [x] T040 Implement the fixture, truss and power cells: name plus mono model, truss with offset, `grid schuko` or `chain ← 101` naming the parent fixture rather than a row id (FR-007)
- [x] T041 Wire `useRowEditor` and build the row editor's eleven fields per contracts §4, moving `FixtureModeCell`'s copy-on-pick behaviour into it (FR-016)
- [x] T042 Add the truss hand-off — read-only value plus `Hang in plot →` through `RowEditor`'s `handoff` (FR-017) — and delete-with-confirm in the editor (FR-018)
- [x] T043 Rewrite `frontend/src/components/event/LightingTab.tsx` as the panel shell: `PatchPanel`, the bar of contracts §1, search state, the mobile branch and the print sheet untouched, and every control absent for a read-only role (FR-079)
- [x] T044 Wire search over console ID, name, model, mode, truss and note using the existing `matchesSearch` (FR-078), and the empty states of the spec's Edge Cases
- [x] T045 Run `npx tsc -b && npx eslint src --max-warnings 0 && npx vitest run`, then quickstart Pass 1. **Commit: "feat: the Lighting rig becomes a sheet (US1)"**

---

## Phase 6: The strip (US2 — P2)

- [x] T046 Create `frontend/src/components/event/LightingStatusRail.tsx` per contracts §7: three states, ground and rule both tinted, and the shared-group count present in **all three** (research R9)
- [x] T047 Implement the strip's constant content — fixture count, per-universe occupancy `U1 078/512`, shared groups, unaddressed, duplicate console IDs — and, in the problem states, the first problem in full plus `+N more`
- [x] T048 Add the filter control and the `gapsOnly`-equivalent state in `LightingSheet`, filtering to the rows the strip is reporting and offering the way back (FR-058)
- [x] T049 Run the gates and quickstart Pass 2, including the check that universe 3 reads `007/512` and not `021/512`. **Commit: "feat: the strip knows what the DMX map looks like (US2)"**

---

## Phase 7: Adding (US3 — P2)

- [x] T050 Add the add editor to `LightingSheet` — the same `RowEditor` construction at the foot of the sheet, no delete, quantity defaulting to 1 (FR-061, FR-062)
- [x] T051 Build its fields per contracts §5, including the `Addresses` select (`consecutive` / `all share one`) and the model picker over the event's lighting inventory with a custom-fixture option (FR-065, FR-067)
- [x] T052 Implement the fit line: the batch's channel demand against the universe's **largest free run**, one fixture's width when sharing (FR-066)
- [x] T053 Wire the confirm to `bulkAddFixtures` with the widened request, choosing the start address from `firstRunFitting`, and delete both `Dialog`s and their draft state from the tab (SC-012)
- [x] T054 Run the gates and quickstart Pass 4. **Commit: "feat: one editor replaces two dialogs (US3)"**

---

## Phase 8: Inserting (US5 — P2)

- [x] T055 Create `frontend/src/components/event/AddressPrompt.tsx` per contracts §6: the amber block, what is in the way by name and span, and the four answers with their conditions
- [x] T056 Hold the save in both editors when the confirmed address collides, and render the prompt in `RowEditor`'s `notice` slot (FR-043, FR-052)
- [x] T057 Wire `Make room`: call `planMakeRoom`, show the moved count on the button, apply through `updateFixtureAddresses` **and then** save the draft — shift first, save second (data-model §6)
- [x] T058 Wire `Share address` — offered only on an exact match of start and count — and `Place anyway`, which saves the collision for the strip to report (FR-049, FR-050)
- [x] T059 Suppress make room with its reason in the sentence when the ripple would exceed 512 (FR-048), and stop `⌘↵` from saving while the prompt shows (FR-053)
- [x] T060 Run the gates and quickstart Pass 3. **Commit: "feat: an occupied address asks rather than refuses (US5)"**

---

## Phase 9: The drawer and the operations (US4, US6 — P2/P3)

- [x] T061 Create `frontend/src/components/event/UniversesDrawer.tsx` per contracts §9: `Drawer` `narrow`, a `GearCard` per universe with occupancy, `Meter`, fixture count, free, largest run and shared groups
- [x] T062 Ensure the `Meter` draws nothing at zero occupancy (FR-070), and add the models section — each catalog model once, with quantity, per-fixture channels and total demand (FR-071)
- [x] T063 Add both operations to the section header and the footer stating what each does and how they differ (FR-072)
- [x] T064 Wire `Auto-assign DMX` and `Optimise channels` to `planAutoAssign`/`planOptimise` and `updateFixtureAddresses`, each confirming first with what it will change (FR-041)
- [x] T065 Report the outcome: which universes changed, which were skipped and why, and optimise's honest "nothing to close" (FR-037, FR-042)
- [x] T066 Add the `Universes` button to the bar and confirm the bar is exactly the canonical order with no extra buttons (FR-073)
- [x] T067 Run every gate plus `npm run build`, then quickstart Passes 5 and 6. **Commit: "feat: the Universes drawer, and two group-aware operations (US4, US6)"**

---

## Phase 10: Documentation and closing the wave

- [x] T068 Update `design/audit.md`: move A6, A7 and A8 to Part 1b with Wave 3, narrow A4's remaining list to the surfaces waves 4 and 5 own, and mark Wave 3 **done** with the delta table the earlier waves set the pattern for
- [x] T069 Update `ROADMAP.md` with the Slice 27 record and `PROJECT.md` where it describes the Lighting tab
- [x] T070 Verify the boundary gates of quickstart: `git diff --stat main` shows nothing under `components/ui` or `components/event/graph`, and nothing under `mobile/` or `print/` beyond the type removal
- [x] T071 Mark every task above complete with its outcome, and record anything that turned out differently from the plan — a plan that was wrong and a record that says so is worth more than one quietly corrected
- [x] T072 **Commit: "docs: ROADMAP, PROJECT and the Wave 3 record"**

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


---

## What actually happened

Every task above is done. Six things went differently from the plan, and the plan
was wrong about two of them.

### The plan was wrong

1. **T034's premise held, but the phase order had a hole the plan did not see.**
   Phase 4 deletes the auto-assign endpoint, and Phase 9 gives auto-assign its
   drawer — which would have left the rig with **no auto-assign at all** across
   four commits. It was caught while writing Phase 5 and fixed there: the tab
   wires the new planner to a bar button, and Phase 9 moves it into the drawer.
   No commit in the slice ships a capability regression. The dependency graph
   should have shown this; it showed only compile-order dependencies.

2. **`Meter` cannot express FR-070, and should not be made to.** The task list
   said "ensure the `Meter` draws nothing at zero occupancy", as though that were
   a property of `Meter`. It withholds itself for an undeclared **capacity**,
   which is a different condition — a universe's capacity is always 512. The
   caller withholds it instead. Changing a component four tabs share, to express a
   condition only one has, would have been the abstraction rather than the fix.

### The contract was wrong once

3. **`planMakeRoom`'s filter.** Contracts §6 said "the groups at or after
   `start`". A group that begins *below* the insertion point and runs into it is
   in the way just as much as one that begins on it, so the filter is "not
   entirely below". Found while writing T019's tests; the contract and the code
   now agree, and there is a test named for it.

4. **A read-only role does get the Universes drawer.** The panel contract said it
   got neither `Universes` nor `+ Fixtures`. P7 is about controls a role cannot
   *use*, not about hiding information — a viewer can read occupancy. The drawer
   opens; the two operations inside it are absent. Contract corrected.

### Two things the implementation simplified

5. **One `AddressChange`, not two.** `dmxPlan` began with a camel-cased twin of
   the wire's shape, which the API client immediately rejected. A plan exists to
   be sent, so it emits `types/AddressChange` and the twin is gone.

6. **The add editor owns its draft.** The first attempt initialised it during
   render from an `adding` prop — a side effect in a render, setting a parent's
   state from a child's. Extracting `AddFixtureEditor` into its own component,
   mounted only while adding, removed the problem instead of guarding it.

### Gates

| Gate | Result |
|---|---|
| `tsc -b` | clean |
| `eslint src --max-warnings 0` | clean |
| `vitest run` | 228 pass (179 before this slice; 49 added) |
| `go vet ./...` | clean |
| `go test ./...` | pass |
| `npm run build` | succeeds |
| `dmx_chain_parent_id` outside migrations | no matches (SC-015) |
| `git diff --stat -- components/ui components/event/graph` | **empty** |
| `git diff --stat -- components/mobile components/print` | **empty** |
| Migration 044 against a copy of the working DB | column dropped, all fixtures intact |

The manual passes in [quickstart.md](./quickstart.md) have **not** been run — there
is no browser in this toolchain. Passes 1 (the two density claims), 3 (the ripple's
visible effect) and 5 (the operations end to end) are the ones worth a human at a
keyboard before this is called finished.
