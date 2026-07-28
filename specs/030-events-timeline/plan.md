# Implementation Plan: The Events timeline, and events that have length

**Branch**: `030-events-timeline` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/030-events-timeline/spec.md`

## Summary

Two things, delivered in one slice because the second was found inside the first and the
first cannot be drawn honestly without it.

**Events gain length.** Three nullable date columns (`load_in_date`, `end_date`,
`load_out_date`) join the existing one, which is renamed `start_date` in its own commit.
Every absent value derives from its neighbour, so every existing row means what it always
meant. The server enforces one ordering rule. This repairs a live defect on the way past:
`partitionEvents` calls an event past when its single date is behind today, so a multi-day
show vanishes from the dashboard on its second morning.

**The Events page becomes a timeline.** One panel with a bar, a year track, a chronological
spine grouped year → month with today cutting across it, and a closing strip. A row opens in
place into `RigRibbon` plus the numbers band plus the readiness verdicts — the sheet-and-editor
pattern with a summary where the editor goes. Collisions between events are derived from the
on-site spans and marked in the gutter.

The whole page's structure is one pure function, `lib/eventTimeline.ts`, so it is tested
without rendering anything — the same shape `lib/dashboard.ts` and `lib/eventSummary.ts`
already take. No new endpoint, no summary API, no new `components/ui/` file.

## Technical Context

**Language/Version**: Go 1.25 (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi router, `modernc.org/sqlite`, `golang-migrate/migrate`;
TanStack React Query, react-router-dom, react-hook-form + zod, Tailwind

**Storage**: SQLite. Three nullable `TEXT` columns added to `events`, one column renamed.
`ALTER TABLE … RENAME COLUMN` is available (SQLite ≥ 3.25; `modernc.org/sqlite` is well
past it) and is used rather than a table rebuild.

**Testing**: Go `httptest` for handlers, `go test` for `internal/db`; Vitest for
non-trivial frontend logic. Per the constitution's pragmatic-testing rule, the tests here
land on the four pure modules and the two handlers — not on the rendering.

**Target Platform**: Single Go binary serving an embedded SPA; desktop browsers plus a
mobile branch driven by `useIsMobile`.

**Project Type**: Web application — `backend/` (Go) + `frontend/` (React/TS + Vite).

**Performance Goals**: The Events page must issue exactly the one `GET /events` it issues
today, however many events exist. Per-event detail is fetched only for an opened row, under
the cache keys Overview and the dashboard already use, so opening a row a second time is
free.

**Constraints**: Two hundred events on one page must render without virtualisation — the
row is a flex row, not a table, and the whole list is one `map`. The year track is O(n) per
year with a single greedy sweep shared with collision detection.

**Scale/Scope**: One page rewritten, one new lib module, four existing modules extended,
two forms extended, four date call sites unified, one migration pair, one domain rename.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see below.*

| Principle | Assessment |
|---|---|
| **I · Domain-First Data Model** | **Pass, and strengthened.** Load-in, show days and load-out are how the trade already talks about a job; the tool has been carrying them in a free-text notes field. The on-site span becomes a first-class derived concept rather than prose. No free-text field is asked to hold a relationship. |
| **II · Extensibility by Design** | **Pass.** Nothing here is an enum or a hardcoded vocabulary. A collision kind (`overlap` / `on-site clash`) is a derived discriminant over two intervals, not a stored record, so it needs no vocabulary table — Principle II governs *data the user configures*, and the user configures dates, not collision kinds. |
| **III · Full-Stack Monorepo Architecture** | **Pass.** Migrations `045` and `046`, versioned and applied on startup; handler changes stay in `internal/api`, data access in `internal/db`, the struct in `internal/domain`. No new package. |
| **IV · Inventory-Driven Rental Workflow** | **Not engaged, deliberately.** Duration does not reach the rental order in this slice. Recorded in the spec's Assumptions and in the roadmap as the next slice. **This is the one place the slice knowingly leaves a gap**, and it is a gap that already exists — the order quotes a five-day hire as a one-day hire today too. What changes is that the tool now *knows* the duration, which is why the next slice is specified immediately after. |
| **V · Pragmatic Simplicity** | **Pass.** No new dependency, no new endpoint, no new `components/ui/` component, no state library. Server state stays in React Query; the open row and the selected year are `useState`. The year track is hand-drawn divs, not a charting library. |

**Gate result: pass.** No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/030-events-timeline/
├── mockup.html          # approved, revision 3 — the visual source of truth
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── events-api.md    # Phase 1
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   ├── 045_event_start_date_rename.up.sql     # new — the rename, its own commit
│   ├── 045_event_start_date_rename.down.sql
│   ├── 046_event_spans.up.sql                 # new — the three dates
│   └── 046_event_spans.down.sql
└── internal/
    ├── domain/event.go                        # Date → StartDate; + 3 fields
    ├── db/events.go                           # select/insert/update carry 4 dates
    ├── db/events_test.go                      # round-trip, null handling
    └── api/
        ├── events.go                          # ordering validation on create + patch
        └── events_dates_test.go               # new — the boundary table

frontend/src/
├── types/index.ts                             # Event: startDate + 3 optional dates
├── lib/
│   ├── eventTimeline.ts                       # new — the page's whole structure
│   ├── eventTimeline.test.ts                  # new
│   ├── dashboard.ts                           # running bucket, formatEventDates
│   ├── dashboard.test.ts                      # extended
│   ├── eventSummary.ts                        # dayLabel gains load-in / running
│   └── eventSummary.test.ts                   # extended
├── pages/
│   ├── Events.tsx                             # rewritten
│   ├── Dashboard.tsx                          # running[0] ?? next; date formatting
│   └── EventDetail.tsx                        # heading date formatting
└── components/
    ├── EventFormDialog.tsx                    # the four-date band
    ├── event/
    │   ├── EventDetailsDrawer.tsx             # the four-date band
    │   ├── EventDates.tsx                     # new — the band, shared by both
    │   └── OverviewTab.tsx                    # drops its private formatEventDate
    ├── events/                                # new — page-local, not ui/
    │   ├── YearTrack.tsx
    │   ├── TimelineRow.tsx
    │   └── EventUnfold.tsx
    └── print/PrintSheet.tsx                   # date formatting

design/                                        # patterns.md §4c, tokens.md §5–6, audit.md
ROADMAP.md                                     # Slice 30
```

**Structure Decision**: The existing web-application layout, unchanged. Three new
presentational components live under `components/events/` rather than `components/ui/`,
because none of them has a second caller — `components.md` §5 is explicit that a component
earns `ui/` by being shared, and a speculative promotion is how a layering inversion starts.
`EventDates.tsx` goes under `components/event/` because it genuinely has two callers on day
one (the create dialog and the details drawer), which is the same test applied honestly in
the other direction.

## Delivery order

Seven commits, in this order, each one leaving the tree green:

| # | Commit | Why here |
|---|---|---|
| 1 | **The rename.** `date` → `start_date` / `startDate`, migration 045, every call site. | Mechanical, wide, and boring. Landing it alone means the interesting commits have small diffs, and a reviewer can read this one by pattern-matching. FR-005 requires it. |
| 2 | **The three dates.** Migration 046, domain, dbstore, handler validation, tests. | The data has to exist before anything derives from it. |
| 3 | **The derivations.** `formatEventDates`, `partitionEvents`'s running bucket and corrected past test, `eventSummary`'s new day labels, `lib/eventTimeline.ts` and its tests. | All pure, all tested, no UI. **The dashboard defect is fixed by this commit**, and can be demonstrated before the page is touched. |
| 4 | **The forms.** `EventDates.tsx`, wired into the dialog and the drawer. | The first commit where a user can enter the new data. |
| 5 | **The page.** `Events.tsx` rewritten, plus `YearTrack`, `TimelineRow`, `EventUnfold`. | The bulk. Depends on 3 for every value it draws. |
| 6 | **The consumers.** Dashboard hero precedence, EventDetail heading, OverviewTab, PrintSheet, the mobile branch. | Everything that reads a date, moved onto the shared formatter. |
| 7 | **The record.** `design/` and `ROADMAP.md`. | FR-044. Last so it describes what actually shipped, not what was intended. |

Commits 1 and 2 are backend-only; 3–6 are frontend-only. Nothing in this slice requires the
two to land together.

## Phase 0 — Research

Seven questions were open. All are resolved in [research.md](research.md); the three that
changed the design:

- **R2** — the past test must use load-out, not the last show day, or an event whose
  load-out is tomorrow drops off the dashboard tonight.
- **R4** — collisions and year-track lanes are one sweep, not two, because two sweeps is
  two chances to disagree about what collides.
- **R6** — the unfold animates with `grid-template-rows: 0fr → 1fr`, which is the only way
  to transition to a content-determined height without measuring it in JavaScript.

**Output**: [research.md](research.md), no `NEEDS CLARIFICATION` remaining.

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — the four dates, the two derived spans, the derivation
  rules, and the state machine an event moves through (upcoming → load-in → running → past).
- [contracts/events-api.md](contracts/events-api.md) — the `Event` payload before and after,
  the validation rule and its error shape, and the explicit statement that **no endpoint is
  added**.
- [quickstart.md](quickstart.md) — how to run it, and the fixture that puts every state on
  one screen.

### Constitution re-check, post-design

Re-read after Phase 1. **Still passing**, with one note worth recording rather than
excusing: the design adds a fourth pure "structure" module (`eventTimeline`) beside
`dashboard`, `eventSummary` and `patchSheet`. That is not four abstractions where one would
do — each is the structure of a different surface, none imports another's internals, and
`eventTimeline` consumes `dashboard`'s `partitionEvents` rather than reimplementing it.
Principle V is about speculative layers; this is one function per screen.

## Complexity Tracking

No constitution violations. Table omitted.
