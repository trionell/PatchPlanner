---
description: "Task list for Slice 30 — the Events timeline, and events that have length"
---

# Tasks: The Events timeline, and events that have length

**Input**: Design documents from `/specs/030-events-timeline/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/events-api.md](contracts/events-api.md),
[quickstart.md](quickstart.md), [mockup.html](mockup.html)

**Tests**: Included. The spec and the contract both state test obligations
([contracts/events-api.md](contracts/events-api.md) §4), and the project's constitution asks
for `httptest` coverage on handlers and Vitest on non-trivial frontend logic. Tests land on
the pure modules and the handlers — **not** on the rendering.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task serves (US1–US5)

## Path conventions

Web application: `backend/` (Go) and `frontend/src/` (React/TS), per
[plan.md](plan.md) § Project Structure.

## Commits

[plan.md](plan.md) lists seven. This breakdown refines commit 5 into **four**, one per user
story, because US2, US3, US4 and US5 are independently testable and a single 900-line page
commit is not reviewable. **Ten commits total.** Each is marked at the end of its phase, and
each must leave every gate green.

**The gates, run before every commit:**

```bash
cd backend  && go vet ./... && go test ./... && golangci-lint run
cd frontend && npx tsc -b && npm run lint && npm run test
```

`tsc -b`, never `tsc --noEmit` — the root tsconfig is references-only and `--noEmit` checks
nothing.

---

## Phase 1: Setup — the rename

**Purpose**: `date` → `start_date` / `startDate`, everywhere, alone. Mechanical and wide;
landing it by itself keeps every later diff small enough to read. FR-005 requires it as its
own commit.

- [x] T001 Write `backend/migrations/045_event_start_date_rename.up.sql` and `.down.sql` — one `ALTER TABLE events RENAME COLUMN` each way, with a header comment recording why the rename happened (three siblings arriving in 046 make `date` the one column a reader has to be told about)
- [x] T002 Rename `Date` → `StartDate` with tag `startDate,omitempty` in `backend/internal/domain/event.go`
- [x] T003 Update the three SQL statements and their scans in `backend/internal/db/events.go` — `ListEventsForUser` (select + `ORDER BY e.start_date IS NULL, e.start_date ASC, e.id DESC`), `GetEvent`, `CreateEvent`, `UpdateEvent`
- [x] T004 [P] Rename `date` → `startDate` on the `Event` interface in `frontend/src/types/index.ts`
- [x] T005 Update every frontend reader: `frontend/src/lib/dashboard.ts`, `frontend/src/lib/eventSummary.ts`, `frontend/src/pages/Events.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/EventDetail.tsx`, `frontend/src/components/EventFormDialog.tsx`, `frontend/src/components/event/EventDetailsDrawer.tsx`, `frontend/src/components/event/OverviewTab.tsx`, `frontend/src/components/print/PrintSheet.tsx`
- [x] T006 [P] Update `date` references in existing tests: `backend/internal/db/events_test.go`, `backend/internal/api/*_test.go`, `frontend/src/lib/dashboard.test.ts`, `frontend/src/lib/eventSummary.test.ts`
- [x] T007 Run the gates against a **copy** of the database (`cp backend/patchplanner.db /tmp/pp-030.db && PATCHPLANNER_DB=/tmp/pp-030.db`), confirm migration 045 applies and reverses, then **commit 1**

**Checkpoint**: The application behaves exactly as before. Nothing user-visible changed.

---

## Phase 2: Foundational — the three dates

**Purpose**: The data has to exist and be trustworthy before anything derives from it.
**Blocks every user story.**

- [x] T008 Write `backend/migrations/046_event_spans.up.sql` (three `ADD COLUMN … TEXT`) and `.down.sql` (three `DROP COLUMN`), with a header comment stating that null means "derives from its neighbour" so every pre-existing row is correct the moment the columns exist
- [x] T009 Add `LoadInDate`, `EndDate`, `LoadOutDate` to `backend/internal/domain/event.go`, all `omitempty`, ordered chronologically in the struct so it reads like the event
- [x] T010 Carry the three columns through select, insert and update in `backend/internal/db/events.go`, using the existing `nullString` helper so an empty string stores as `NULL`
- [x] T011 [P] Add to `backend/internal/db/events_test.go`: a four-date round trip, an all-null round trip, and a read of a row written before 046 (all three new columns `NULL`)
- [x] T012 Add a `validateEventDates(domain.Event) error` helper in `backend/internal/api/events.go` implementing the resolution chain from [data-model.md](data-model.md) §2 (note `loadOut` falls back **twice**) and the ordering rule `loadIn ≤ start ≤ end ≤ loadOut`; check format before comparing, and report the chronologically earliest broken pair. Wire it into `create` and `update` before any write
- [x] T013 Write `backend/internal/api/events_dates_test.go` — the twelve-row table in [contracts/events-api.md](contracts/events-api.md) §4, asserting status **and** that each message names the offending pair
- [x] T014 [P] Add `loadInDate`, `endDate`, `loadOutDate` as optional strings to `Event` in `frontend/src/types/index.ts`
- [x] T015 Create `frontend/src/lib/eventTimeline.ts` with the pure core only: `resolveDates(event)` returning `{loadIn, first, last, loadOut}`, `showSpan`, `onSiteSpan`, `showDays`, `onSiteDays`, `hasDistinctOnSite`. String comparison throughout — ISO dates sort lexicographically
- [x] T016 [P] Create `frontend/src/lib/eventTimeline.test.ts` covering resolution: only a start date; end without load-out (**must** fall back to end, not start); load-in only; no dates at all; inclusive day counts where a one-day event is `1`
- [x] T017 Run the gates, rehearse 046 up and down on the database copy, then **commit 2**

**Checkpoint**: The four dates round-trip and are validated. Nothing reads them yet.

---

## Phase 3: User Story 1 — Record what an event actually occupies (P1)

**Goal**: A user can enter four dates or one, and the application understands what an event
occupies. The disappearing-event defect is repaired.

**Independent test**: Create an event with only a first day and confirm it behaves exactly as
before. Create one with all four, reopen it, confirm the values and the two derived spans.
Put the clock inside a multi-day span and confirm the dashboard still shows it.

- [x] T018 [US1] Add `formatEventDates(event)` to `frontend/src/lib/dashboard.ts` returning both a long form (`Fri 18 – Sun 20 September 2026`) and a short form (`18–20 Sep`), collapsing to the single-date form when start and end resolve equal; keep `shortDate`/`longDate` as its internals or delete them once the last caller moves
- [x] T019 [US1] Add the `running` bucket to `partitionEvents` in `frontend/src/lib/dashboard.ts` and change the past test to `(loadOut ?? end ?? start) < today` — **load-out, not end** ([research.md](research.md) R2). `next` remains the soonest event that has not started
- [x] T020 [P] [US1] Extend `frontend/src/lib/dashboard.test.ts`: an event running today is `running` not `past`; still running on its last show day; still running on its load-out day with no show that day; past the day after load-out; a load-in day counts as running; an undated event is never in any of the three
- [x] T021 [US1] In `frontend/src/lib/eventSummary.ts`, count `daysToLoadIn` to `loadInDate ?? startDate` and extend `dayLabel` with `load-in` (today is the load-in day and it precedes the first show) and `running` (`day 2 of 3`)
- [x] T022 [P] [US1] Extend `frontend/src/lib/eventSummary.test.ts` for both new labels and the boundary between them
- [x] T023 [US1] Create `frontend/src/components/event/EventDates.tsx` — four date inputs as one object with each empty field's placeholder naming its default (`same as first day`, `same day`, `same as last day`), the two derived brackets underneath (`5 days on site`, `3 show days`, collapsing to `1 day`), and client-side ordering validation matching the server's. Navigation density tier
- [x] T024 [US1] Replace the single Date field in `frontend/src/components/EventFormDialog.tsx` with `EventDates`, extending the zod schema and `EventFormValues` with the three new fields
- [x] T025 [US1] Replace the single Date field in `frontend/src/components/event/EventDetailsDrawer.tsx` with `EventDates`, extending `EventDraft`
- [x] T026 [US1] In `frontend/src/pages/Dashboard.tsx`, draw `running[0] ?? next` as the hero, and label its big figure `day N of M` when running rather than `days to load-in`
- [x] T027 [US1] Run the gates and walk the [quickstart.md](quickstart.md) fixture checks 3, 4, 5 and 6, then **commits 3 and 4** (derivations, then forms)

**Checkpoint**: US1 is deliverable on its own. The Events page is still the old grid.

---

## Phase 4: User Story 2 — Find any show on a timeline (P2)

**Goal**: Events becomes one panel containing a chronological spine.

**Independent test**: With past, future, running and undated events, confirm ordering,
grouping, the today marker, the toggle and the search without opening anything.

- [x] T028 [US2] Extend `frontend/src/lib/eventTimeline.ts` with `buildTimeline(events, {today, tense, search})` returning an ordered list of rows and headings — year headings, month headings with counts, the today marker at its chronological position, undated rows last under their own heading — plus the strip's counts (total, running, to come, done, undated)
- [x] T029 [P] [US2] Extend `frontend/src/lib/eventTimeline.test.ts`: oldest first by first show day; a span crossing a month files under its first day; a span crossing a year appears once, in its start year; undated last; the today marker lands between the last past and the first upcoming row; tense filtering; counts agree with rows
- [x] T030 [US2] Create `frontend/src/components/events/TimelineRow.tsx` — the 84 px gutter (day number, weekday, or the range with months substituted for weekdays when the span crosses a month), the spine's `border-l`, the mark (7 px dot, or a 7 × 24 px capsule whose inner fill is the show days), name, venue, role `Badge` when not owner, the on-site chip only when `hasDistinctOnSite`, and the countdown. Past, next and running variants. Values from [mockup.html](mockup.html) and `design/`
- [x] T031 [US2] Rewrite `frontend/src/pages/Events.tsx` as one `rounded-xl border` panel: bar (title, `Upcoming|Past|All` segmented control in a trough defaulting to **All**, search, `flex-1`, `＋ New event`), the row list from `buildTimeline`, and the closing strip. Delete the `Card`/`CardContent` imports
- [x] T032 [P] [US2] Implement the two empty states per patterns §5 — an unmatched search that keeps its text and states what search covers, and a no-events-at-all state with no track, toggle or search and the control that makes one
- [x] T033 [US2] Scroll the today marker into view on first render of the All view, without smooth-scrolling (the page must not animate on arrival)
- [x] T034 [US2] Hide the create control entirely for a user who cannot create events — pass no handler rather than disabling (P7)
- [x] T035 [US2] Run the gates, walk [quickstart.md](quickstart.md) checks 7 and 8, then **commit 5**

**Checkpoint**: The page is the timeline. No track, no unfold, no collision marks yet.

---

## Phase 5: User Story 5 — Be told when two shows collide (P2)

**Goal**: Two events sharing on-site days are marked, and the two kinds are named apart.

**Independent test**: Two events with intersecting show days, and two whose show days do not
intersect but whose on-site spans do. Confirm both pairs are marked, marked differently, and
that neither was blocked at save.

- [ ] T036 [US5] Add the single sweep to `frontend/src/lib/eventTimeline.ts` ([research.md](research.md) R4): sort by first on-site day, walk once maintaining open intervals, emit `{groupId, kind, lane}` per event. `kind` is `overlap` when the show spans intersect and `on-site-clash` when only the on-site spans do. **The lane assignment is produced by this same walk** — the year track consumes it in Phase 7
- [ ] T037 [P] [US5] Extend `frontend/src/lib/eventTimeline.test.ts`: intersecting show spans → `overlap`; touching on-site spans only → `on-site-clash`; adjacent-but-not-touching → no collision; three mutually touching events → one group, three lanes; an undated event never collides; role is irrelevant; an event overlapping one neighbour and merely on-site-clashing with another reports `overlaps`
- [ ] T038 [US5] Draw the collision in `frontend/src/components/events/TimelineRow.tsx` and `frontend/src/pages/Events.tsx` — a 2 px amber brace in the gutter spanning the grouped rows, and the word (`overlaps` / `on-site clash`) as a `Pill` on each row. Never red, never blocking
- [ ] T039 [US5] Add the colliding-pair count to the closing strip, in amber, at the end of the line
- [ ] T040 [US5] Run the gates, walk [quickstart.md](quickstart.md) checks 1 and 2 — **check 1 is the one that fails if the discriminant tests the wrong pair of intervals** — then **commit 6**

**Checkpoint**: Collisions visible. Saving is still never blocked by one.

---

## Phase 6: User Story 3 — See whether a show needs work (P3)

**Goal**: A row opens in place into the show's rig, counts and verdicts.

**Independent test**: Open a row, confirm the summary matches the event's own tabs, open
another and confirm the first closes.

- [ ] T041 [US3] Create `frontend/src/components/events/EventUnfold.tsx` — the four existing queries (`audio-patch`, `lighting-rig`, `rental-summary`, `stage-plots`) for one event under their existing cache keys, `enabled` only when open; `eventSummary()` over the results; `RigRibbon` with `pulse` off; the numbers band at 19 px with the span as its first figure; the readiness verdicts; the notes on one line; `Open the show →`. `—` never `0` for an undeclared figure
- [ ] T042 [US3] Wire it into `frontend/src/pages/Events.tsx` — one open row at a time (`useState<number | null>`), the row above taking `bg-amber-500/[0.04]` and losing its bottom border, the block wearing the 2 px amber left edge
- [ ] T043 [US3] Add the open transition: a `display: grid` wrapper animating `grid-template-rows` `0fr → 1fr` over 160 ms, content in an `overflow: hidden` child, the whole rule inside `@media (prefers-reduced-motion: no-preference)` ([research.md](research.md) R6). No fade, no slide, no pulse
- [ ] T044 [US3] Confirm by network inspection that a page of events issues exactly one request until a row is opened, and none when a previously-opened row is reopened (SC-007)
- [ ] T045 [US3] Run the gates, then **commit 7**

**Checkpoint**: The page answers *which of my next four shows needs work*.

---

## Phase 7: User Story 4 — See a whole year at a glance (P3)

**Goal**: One strip above the list places every event of a year on a calendar scale.

**Independent test**: With events of varying lengths across one year, confirm each is drawn
once, in the right place, at the right relative width, with collisions on separate lanes.

- [ ] T046 [US4] Add `yearTrack(events, year)` to `frontend/src/lib/eventTimeline.ts` — `left = dayOfYear(loadIn) / daysInYear`, `width = onSiteDays / daysInYear`, both as percentages, using the **real** `daysInYear` so December does not drift in a leap year; lanes reused from T036's sweep; and the list of years that contain events
- [ ] T047 [P] [US4] Extend `frontend/src/lib/eventTimeline.test.ts`: leap-year positioning; an event spanning a year boundary appears in its start year only; every event drawn exactly once with no cap; lanes match the collision groups
- [ ] T048 [US4] Create `frontend/src/components/events/YearTrack.tsx` — the inset band, the year stepper offering a direction only when that year has events, twelve month letters as the scale with faint month boundaries, the marks with `min-width: 3px` applied in CSS (never by clamping the percentage — [research.md](research.md) R5), a `title` giving dates and name, the amber today vertical, and the current month's letter in amber
- [ ] T049 [US4] Wire it into `frontend/src/pages/Events.tsx` directly under the bar — redrawing against the active search, scrolling the spine to an event when its mark is selected, and absent entirely when there are no events or while loading
- [ ] T050 [US4] Run the gates, walk [quickstart.md](quickstart.md) checks 9 and 10, then **commit 8**

**Checkpoint**: All five user stories delivered.

---

## Phase 8: Polish & cross-cutting

**Purpose**: Everything else that reads a date, and the written record.

- [ ] T051 [P] Move the heading in `frontend/src/pages/EventDetail.tsx` (both branches) onto `formatEventDates`
- [ ] T052 [P] Delete the private `formatEventDate` from `frontend/src/components/event/OverviewTab.tsx` and use the shared one
- [ ] T053 [P] Move `frontend/src/components/print/PrintSheet.tsx` onto `formatEventDates`, long form, with the on-site span alongside where the paperwork needs it
- [ ] T054 Extend the mobile branch of `frontend/src/pages/Events.tsx`: `CondensedListRow` keeps its treatment and gains month headings, the today rule, the date range in its subtitle, the `day N of M` pill and the collision word. No track, no gutter, no unfold (FR-043)
- [ ] T055 [P] Add **§4c · the spine** to `design/patterns.md`, beside §4b's summary surface — the date gutter as structure, the mark shapes, the today rule, and the sheet-and-editor pattern applied over a summary rather than a form
- [ ] T056 [P] Update `design/tokens.md`: §6 records the unfold as the second sanctioned motion with its reduced-motion wrapper and states that the pulse stays off this page; §5 records that a collision is amber-plus-a-word and never red, with the reason (red is reserved for destructive, over capacity, a broken link and 48 V)
- [ ] T057 [P] Update `design/audit.md`: A6's exemption of Events under P1 was invoked correctly and outlived its usefulness — record what changed and why the exemption is now spent
- [ ] T058 [P] Add Slice 30 to `ROADMAP.md` with its outcome, and add the dependency edge from Slice 29; name rental pricing by duration as the next slice
- [ ] T059 Run every gate one final time, walk the whole [quickstart.md](quickstart.md) fixture including the backwards-compatibility check against a copy of a real pre-slice database, then **commits 9 and 10** (consumers, then the record)

---

## Dependencies

```
Phase 1 (rename) ──→ Phase 2 (the three dates) ──→ Phase 3 (US1)
                                   │
                                   ├──→ Phase 4 (US2, the page) ──┬──→ Phase 5 (US5, clashes)
                                   │                              ├──→ Phase 6 (US3, unfold)
                                   │                              └──→ Phase 7 (US4, track)
                                   │
                                   └──────────────────────────────────→ Phase 8 (polish)
```

- **Phase 2 blocks everything.** Nothing can derive from dates that do not exist.
- **Phase 3 (US1) is independent of Phases 4–7** and could ship alone. It contains the defect
  fix, which is the strongest argument for its priority.
- **Phase 4 (US2) blocks 5, 6 and 7** only because they hang controls on the page it builds.
  Their *logic* (T036, T041's queries, T046) is independent and could be written first.
- **Phase 7 (US4) depends on Phase 5's sweep** for its lanes — T046 consumes T036's output
  rather than recomputing it, which is the whole point of R4.
- **Phase 8 is independent of 4–7** apart from T054, and T051–T053 depend only on Phase 3's
  `formatEventDates`.

## Parallel opportunities

Within phases, `[P]` tasks touch different files:

- **Phase 1**: T004 and T006 alongside T002–T003.
- **Phase 2**: T011, T014 and T016 alongside T012–T013.
- **Phase 3**: T020 and T022 alongside T021 and T023.
- **Phase 8**: T051, T052, T053, T055, T056, T057 and T058 are seven independent files.

Across phases, once Phase 2 is done, the pure-logic tasks T036, T046 and the test files can
be written in parallel with Phase 4's components — they share only `eventTimeline.ts`, so
sequence the edits to that one file.

## Implementation strategy

**MVP is Phase 3.** Phases 1–3 deliver the data model, the forms and the defect fix, and
leave the Events page as it is today. That is a shippable increment: the user can record what
an event occupies, and a multi-day show stops vanishing from the dashboard mid-run.

**Then Phase 4**, which is the redesign proper and the reason the slice was requested.

**Phases 5, 6 and 7 are each independently valuable and independently revertible.** If the
unfold proves distracting in field testing, Phase 6 comes out without touching the rest. If
the year track does not earn its 36 px, Phase 7 comes out. This is the ordering the mockup's
three asks were framed around.

**Phase 8 last**, so the written record in `design/` and `ROADMAP.md` describes what shipped
rather than what was intended.

## Task count

| Phase | Tasks | Story |
|---|---|---|
| 1 · Setup — the rename | T001–T007 (7) | — |
| 2 · Foundational — the three dates | T008–T017 (10) | — |
| 3 · Record what an event occupies | T018–T027 (10) | US1 (P1) |
| 4 · Find any show on a timeline | T028–T035 (8) | US2 (P2) |
| 5 · Be told when two shows collide | T036–T040 (5) | US5 (P2) |
| 6 · See whether a show needs work | T041–T045 (5) | US3 (P3) |
| 7 · See a whole year at a glance | T046–T050 (5) | US4 (P3) |
| 8 · Polish & cross-cutting | T051–T059 (9) | — |
| **Total** | **59** | |
