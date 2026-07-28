---
description: "Task list for Slice 32 — the inventory list, and the catalogs nobody could see"
---

# Tasks: The inventory list, and the catalogs nobody could see

**Input**: Design documents from `/specs/032-inventories-list/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md),
[contracts/inventories-api.md](contracts/inventories-api.md),
[quickstart.md](quickstart.md), [mockup.html](mockup.html)

**Tests**: Included, on the query, the payload and the pure module — never on the
rendering. That is the constitution's pragmatic-testing rule and the shape every
slice since 027 has taken.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: which user story the task serves (US1–US5)

## Path conventions

Web application: `backend/` (Go) and `frontend/src/` (React/TS), per
[plan.md](plan.md) § Project Structure.

## Commits

[plan.md](plan.md) lists five steps. This breakdown keeps them and splits the
last of them, for **six commits** in total:

| # | What | Stories |
|---|---|---|
| 1 | the counts and the route | — |
| 2 | the pure module | — |
| 3 | the page: panel, columns, drawer | US1, US2, US3 |
| 4 | search | US4 |
| 5 | the phone | US5 |
| 6 | the documents | — |

**Commit 3 carries three stories on purpose.** The panel and the drawer land
together because there is no honest intermediate state: the three per-row ghost
buttons and the create `Dialog` are the operations the drawer replaces, and a
commit that removes them before the drawer exists leaves the page unable to
rename a catalog. Building the drawer first and wiring it into the card list
would mean writing wiring whose only purpose is to be deleted in the next
commit. The tasks below are still split by story, which is what makes the diff
reviewable.

**The gates, run before every commit:**

```bash
cd backend  && go vet ./... && go test ./...
cd frontend && npm run lint && npm run typecheck && npm test
```

`tsc -b`, never `tsc --noEmit` — the root tsconfig is references-only and
`--noEmit` checks nothing.

---

## Phase 1: Foundational — the counts and the route

**Purpose**: everything the page needs from the server, before anything renders
differently. Blocks US1, US2 and US3. Nothing in this phase is visible.

- [X] T001 Add `ItemCount`, `CategoryCount`, `EventCount` (all `int`, all `json:"…,omitempty"`) to `Inventory` in `backend/internal/domain/inventory.go`, with a comment recording that only the list query populates them and that `omitempty` follows `InventoryCategory.ItemCount`
- [X] T002 Extend the listing query in `backend/internal/db/inventories.go` — `ListInventoriesForOwner` gains three correlated sub-selects over `inventory_items`, `inventory_categories` and `events` per [research.md](research.md) R1, scanned into the three new fields. `scanInventory` stays as it is for the single-inventory readers; the list scans its own row
- [X] T003 Add `ListEventsForInventory(database *sql.DB, inventoryID int64) ([]domain.Event, error)` to `backend/internal/db/inventories.go` — every event with `inventory_id = ?`, ordered `COALESCE(start_date, '') ASC, name ASC`, no membership predicate, with a comment saying why (it must return the set `EventCount` counted)
- [X] T004 Add the `listEvents` handler to `backend/internal/api/inventories.go` and register `r.Get("/events", h.listEvents)` in `RegisterOwned`, returning `[]` rather than `null` for an empty result, as `listMine` already does
- [X] T005 [P] Test the counts in `backend/internal/db/inventories_test.go`: a catalog with items, categories and two bound events reports 3 correct numbers; an empty catalog reports zeroes; a second owner's catalog is not listed
- [X] T006 [P] Test `ListEventsForInventory` in `backend/internal/db/inventories_test.go`: ordering by start date, an undated event sorting first, and an unbound catalog returning an empty slice
- [X] T007 Test the payload in `backend/internal/api/inventories_test.go`: `GET /inventories` carries `itemCount`/`categoryCount`/`eventCount`, and a zero count is **absent** from the JSON rather than `0`
- [X] T008 Test the route in `backend/internal/api/inventories_test.go`: `GET /inventories/{id}/events` returns the bound events for the owner and `404` for a non-owner, and **the number it returns equals the `eventCount` the list reported and the count `DELETE` refuses with** — one test asserting all three agree ([data-model.md](data-model.md))
- [X] T009 Run the gates, then **commit 1**

## Phase 2: Foundational — the pure module

**Purpose**: the page's only derived structure, testable without rendering.
Blocks US1's strip and US4 entirely.

- [X] T010 Add `itemCount?`, `categoryCount?`, `eventCount?` to `Inventory` in `frontend/src/types/index.ts`, documented as list-payload-only
- [X] T011 Create `frontend/src/lib/inventoryList.ts` exporting `summariseInventories(inventories, search)` → `{ visible, total, items, events, unused }`, matching name and `sourceFilename` through the existing `matchesSearch`, per [research.md](research.md) R6
- [X] T012 Create `frontend/src/lib/inventoryList.test.ts` — totals over five catalogs; `unused` counts only `eventCount ?? 0 === 0`; an empty search returns everything; a term matching a **source filename** narrows the list; a term matching nothing returns `visible: []` with `total` unchanged, which is what makes the strip say `0 of 5`
- [X] T013 Run the gates, then **commit 2**

## Phase 3: US1 + US2 + US3 — the page

**Goal**: the list becomes one panel with the *Used on* column, and every
operation on a catalog moves into one drawer.

**Independent test**: [quickstart.md](quickstart.md)'s fixture — one frame, one
request, `—` versus `0`, the drawer's two delete paths, and no browser dialog
anywhere.

### The drawer (US3)

- [ ] T014 [US3] Add `listInventoryEvents(inventoryId)` to `frontend/src/api/inventories.ts`, returning `Event[]`
- [ ] T015 [US3] Create `frontend/src/components/inventory/InventoryDrawer.tsx` — one `Drawer width="narrow"` whose mode is implied by whether it was given an inventory. Header title and subtitle per [mockup.html](mockup.html); footer stating what duplication carries
- [ ] T016 [US3] Build the *Catalog* section with `DrawerSection` + `GearCard` + `GearTop` + `GearSpecs`/`Spec` (items, categories, format, created) and **Duplicate** as the section's `action` at `Button size="xs" variant="outline"` — no form control inside the card
- [ ] T017 [US3] Build the name form with `GearForm` + `FieldStack` + `FormActions` at `Input size="sm"`, serving both create (empty name, confirm reads *Create*) and rename (confirm reads *Save*)
- [ ] T018 [US3] Delete: render no control at all when `eventCount > 0`; otherwise place it in `FormActions` apart from the confirm, and on press replace nothing — add a full-width block inside the form naming the catalog and its item count, with a `destructive` confirm and a `ghost` cancel ([spec.md](spec.md) FR-025, FR-026)
- [ ] T019 [US2] Build the *Used on* section: `DrawerSection label="Used on" count={events.length}` over `listInventoryEvents`, **every** event as a `GearCard`, oldest first, each an `<a href="/events/{id}">` that closes the drawer, with venue and start date and a `text-zinc-600` `→`. No `max-h` anywhere in the section ([research.md](research.md) R5)
- [ ] T020 [US2] Add the one-sentence note under the section heading stating that a catalog cannot be deleted while an event uses it, and `—` handling for an undated event's date
- [ ] T021 [US3] Wire the drawer's mutations — create, rename, duplicate, delete — invalidating `['inventories']`, closing on success, and surfacing failures through the caller's inline error block, never a toast

### The list (US1, US2)

- [ ] T022 [US1] Replace `InventoryList` in `frontend/src/pages/Inventories.tsx` with one `PatchPanel`: bar carrying the title and `Button size="sm"` **New catalog**, the rows, and the strip. Delete the explanatory paragraph and the create `Dialog`
- [ ] T023 [US1] [US2] Replace `InventoryRow` with a navigation-tier row — name, items, categories, *used on*, source — at `text-sm` with `px-3 py-2.5`, mono `tabular-nums` right-aligned counts, `—` in `text-zinc-600` for no bound event and `0` for no items, and format-then-filename in the source cell. **Delete the per-row `listItems` query**
- [ ] T024 [US1] Make the row open the catalog on click across its whole width, with the drawer's `⋯` control as a sibling rather than a nested button, labelled *Manage {name}* for assistive technology
- [ ] T025 [US1] Add the column header row at `text-xs text-zinc-400 font-medium` on the inset ground, right-aligned over the three numeric columns
- [ ] T026 [US1] Add the strip from `summariseInventories` — whole phrases in `font-mono tabular-nums`, separators at `text-zinc-700`, as `Events`' strip draws them
- [ ] T027 [US1] Empty account: the actionable empty state inside the panel, with **New catalog** and the blank-template download, and no search field
- [ ] T028 [US1] Rename the two tabs to **Rental catalogs** and **Owned gear**, and set the panel title to match; leave the sidebar item, the header title and the route alone
- [ ] T029 [US3] Add **Manage** to the catalog panel's own bar in `InventoryDetail` (`Button size="xs" variant="outline"`, beside Categories and Import) opening the same drawer
- [ ] T030 Confirm `grep -rn "window.prompt\|window.confirm\|window.alert" frontend/src` returns nothing, run the gates, then **commit 3**

## Phase 4: US4 — search

**Goal**: a technician with a dozen catalogs finds one by name or by the
spreadsheet it came from.

**Independent test**: `2025` narrows by name, `backline-2026` narrows by source
filename, `zzz` leaves a sentence and `0 of 5 catalogs`.

- [ ] T031 [US4] Add the search field to the panel's bar in `frontend/src/pages/Inventories.tsx` — patterns §1 order (title, search, `flex-1`, primary), `Input size="sm"` with the leading `Search` icon at `pl-8`, `min-w-[12rem] max-w-xs flex-1`
- [ ] T032 [US4] Feed it through `summariseInventories`; render the no-match sentence in place of the rows, naming what was searched for, and keep the field's contents
- [ ] T033 [US4] Make the strip read `N of M catalogs` while a search is active, and hide the field entirely when the account has no catalogs
- [ ] T034 Run the gates, then **commit 4**

## Phase 5: US5 — the phone

**Goal**: the same four facts, stacked, at touch height.

**Independent test**: below the breakpoint, rows carry name, counts, source and
a chip; the catalog screen offers the drawer.

- [ ] T035 [US5] Add the mobile branch to the list in `frontend/src/pages/Inventories.tsx` using `CondensedListRow` — title the name, subtitle `N items · N categories · source`, trailing a `Badge` reading `N events` or `unused`
- [ ] T036 [US5] Add **Manage** to `MobileInventoryDetail`'s header so the drawer is reachable on the phone, and leave the phone list itself without a per-row control
- [ ] T037 Run the gates, then **commit 5**

## Phase 6: Polish — the documents

**Purpose**: the design language and the roadmap catch up in the same slice,
which is [design/audit.md](../../design/audit.md) Part 3's standing rule.

- [ ] T038 [P] Update `design/audit.md`: the inventory list was the last card list and is gone, so P1's exception now has **no instances** in the tree — the rule stays and its worked example becomes a closed case. Record it under Wave 5's successor rather than reopening a finding
- [ ] T039 [P] Update `design/patterns.md` §3 with the rule this slice had to state out loud — *a drawer's frame is navigation tier; its contents take the tier of the surface that references them* — and §4's no-height rule gaining the drawer section as its second instance
- [ ] T040 [P] Add Slice 32 to `ROADMAP.md` with its one-line summary and its dependency on Slices 16, 29 and 30
- [ ] T041 Walk [quickstart.md](quickstart.md) against a **copy** of the database (`PATCHPLANNER_DB=/tmp/claude-1000/pp-032.db`), including the forty-event scroll case and the middle-click on an event link
- [ ] T042 Run the gates one last time, then **commit 6**

---

## Dependencies

```
Phase 1 (counts, route) ──┐
                          ├──→ Phase 3 (the page) ──→ Phase 4 (search) ──→ Phase 5 (phone) ──→ Phase 6 (docs)
Phase 2 (pure module) ────┘
```

- **Phases 1 and 2 are independent of each other** and can be done in either
  order, or at once.
- Phase 3 needs both: the columns need the counts, the strip needs the module.
- Phase 4 needs Phase 3's bar and Phase 2's module. Phase 5 needs Phase 3's
  drawer. Neither blocks the other.
- Phase 6 needs everything, because it describes it.

## Parallel opportunities

- **T005–T008** — four tests across two files, no shared state.
- **T038–T040** — three documents, three different files.
- Within Phase 3, T014–T021 (the drawer) and T022–T028 (the list) touch
  different files and meet only at T024 and T029.

## MVP

**Phases 1–3.** That is the whole point of the slice: one frame, the column that
was never shown, and no browser dialogs. Search, the phone and the documents are
each a commit that can land on another day without leaving the page in a
half-state.
