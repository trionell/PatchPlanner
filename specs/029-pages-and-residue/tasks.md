# Tasks: The pages, and what is left over

Eight phases, one commit each. Gates after every phase:
`npx tsc -b && npx eslint src --max-warnings 0 && npx vitest run`, plus
`go vet ./... && go test ./...` after Phase 1.

---

## Phase 1 · The usage count (US4)

- [x] **T001** `domain.ReferenceValue` gains `UsageCount int` / `usageCount`, with
  a comment saying it is derived per request and never stored (FR-032).
- [x] **T002** `ListReferenceData` populates it by calling the **existing**
  `countReferenceUsage` — called, not copied, so the count and the delete guard
  cannot disagree (FR-033).
- [x] **T003** The reference *template* response leaves it at zero and the
  frontend never renders it: a template is not referenced by any plan, and `0`
  would imply it could be (FR-034).
- [x] **T004** `db/reference_test.go`: the four cases in
  [quickstart.md](./quickstart.md), including SC-007 — a value reporting zero is
  deletable, one reporting more is refused.
- [x] **T005** `types/index.ts`: `ReferenceValue.usageCount?: number`.

**Commit**: `feat: a vocabulary value says what uses it (US4)`

## Phase 2 · The rail (US1, US4)

- [x] **T006** `ui/PanelRail.tsx`: a filter column for a `PatchPanel` —
  `w-56 shrink-0 border-r border-zinc-800`, scrollable, rows at work density, the
  selected row `bg-amber-500/10 text-amber-300` (FR-003).
- [x] **T007** A row takes a label, an optional muted qualifier, a count, and
  `onSelect`. **No other control may go in one** (FR-004) — the comment says why.
- [x] **T008** `PanelCols`, the flex wrapper that puts a rail beside a sheet, so
  neither caller lays it out by hand.

**Commit**: `feat: a filter column for a work panel (US1, US4)`

## Phase 3 · The inventory catalog (US1, US2)

- [x] **T009** `pages/inventory/InventorySheet.tsx`: six columns, `Modes` counting
  a lighting item's modes (FR-005, FR-006).
- [x] **T010** The row editor: category, name, description, qty, price, delete
  (FR-007).
- [x] **T011** DMX modes in the editor's `notice` slot — list, delete, add row —
  and the modes dialog deleted (FR-008, FR-009).
- [x] **T012** The add editor at the foot (FR-010); search (FR-011).
- [x] **T013** [P] `event/InventoryStatusRail.tsx`: items, categories, the filtered
  count, the source file and import date (FR-012).
- [x] **T014** [P] `pages/inventory/CategoriesDrawer.tsx`: name, type, picker role,
  delete, add; the footer explaining what a picker role does (FR-014, FR-015).
- [x] **T015** [P] `pages/inventory/ImportDrawer.tsx`: file picker, template
  download, format note, last result (FR-016, FR-017).
- [x] **T016** `InventoryDetail` rewritten as one `PatchPanel` with the rail
  (FR-001 – FR-004), read-only handling (FR-018).
- [x] **T017** The list view: item counts on each card, `+ New inventory` as the
  page's primary action, the create card deleted (FR-013).
- [x] **T018** Both always-open forms and all three `rounded-lg` gone; the
  `isMobile` branch moved verbatim.

**Commit**: `feat: the inventory catalog is a work surface (US1, US2)`

## Phase 4 · Owned gear (US3)

- [x] **T019** `OwnedGearManager` as one `PatchPanel`: five columns, editor, strip
  (FR-019 – FR-021).
- [x] **T020** The always-open form and its `rounded-lg` deleted (FR-022).

**Commit**: `feat: owned gear is a sheet (US3)`

## Phase 5 · Vocabularies (US4)

- [x] **T021** `components/VocabularyPanel.tsx`: rail of vocabularies, sheet of
  values, editor, strip (FR-023 – FR-029).
- [x] **T022** The `In use` column and the editor's notice, on Settings only
  (FR-025, FR-027).
- [x] **T023** The stored value read-only in the editor, with its reason (FR-026).
- [x] **T024** `SettingsTab` and `MyDefaults` rewritten onto it; read-only handling
  (FR-031).
- [x] **T025** `VocabularyCard.tsx` deleted (FR-030). If Phase 2's rail needed a
  prop to fit this caller, **inline it instead** — research.md R3.

**Commit**: `feat: nine cards become one panel (US4)`

## Phase 6 · The dashboard (US5)

- [x] **T026** `lib/dashboard.ts`: partition events into `{ next, upcoming, past }`
  — the hero is the soonest dated event at or after today; undated events sort last
  under upcoming and are never the hero.
- [x] **T027** [P] `lib/dashboard.test.ts`: the five cases in quickstart.
- [x] **T028** `pages/dashboard/NextShow.tsx`: the amber-bordered hero — name,
  venue, written-out date, countdown, ribbon, five figures, readiness,
  `Open the show →` (FR-038, FR-040), and the empty state (FR-039).
- [x] **T029** The pulse: a travelling dot on each run, staggered, inside
  `@media (prefers-reduced-motion: no-preference)` in `index.css` beside the
  existing one (FR-041).
- [x] **T030** [P] `pages/dashboard/EventRows.tsx`: dated rows under micro-label
  rules, past its own dimmed block (FR-042, FR-043).
- [x] **T031** `Dashboard` rewritten: no `Card`, the primary action in the page's
  own row, the account totals as a closing strip (FR-036, FR-037, FR-044 – FR-046).

**Commit**: `feat: the dashboard is worth landing on (US5)`

## Phase 7 · The small ones (US6)

- [x] **T032** The class map moved to `ui/buttonVariants.ts` and `buttonClasses`
  exported from there — **not** from `Button.tsx`, because a component file that
  also exports a function breaks fast refresh. `Button.tsx` only got smaller
  (FR-049).
- [x] **T033** `Login` uses it, and `border-red-800` (FR-050).
- [x] **T034** `Events`: search beside the primary action, actionable empty state,
  the introductory sentence removed (FR-047, FR-048).
- [x] **T035** `StartPage`: the one `rounded-lg` → `rounded-xl` (FR-051).

**Commit**: `refactor: a retyped button, a search field, and one stray radius (US6)`

## Phase 8 · Gates and documentation

- [x] **T036** Every gate in quickstart, including the four boundary diffs and the
  three counting gates.
- [x] **T037** `design/audit.md`: **A4, A6, A7 struck** and moved to Part 1b; A9
  resolved or restated; Wave 5 marked done with a delta table; the start-page
  exemption recorded (FR-052).
- [x] **T038** `design/principles.md` P2: the start page qualified as exempt rather
  than listed as a navigation surface (FR-052).
- [x] **T039** `design/patterns.md`: the rail, as the third column construction
  after the palette and the inspector.
- [x] **T040** `design/tokens.md` §6: the pulse now appears on two surfaces, named.
- [x] **T041** `design/design-language.html`: all findings struck, all five waves
  done; republish to the same URL.
- [x] **T042** `ROADMAP.md` Slice 29 record and dependency line; `PROJECT.md`.
- [x] **T043** Republish both mockups if the built surfaces diverged from them.

**Commit**: `docs: the convergence is finished`

---

## Notes

- **T002 and T025 are the two places to resist.** Copy the usage count and it
  drifts from the guard; parameterise the rail for a second caller it does not fit
  and the abstraction is worse than two columns.
- **T029 puts a keyframe in `index.css` beside `pp-travel`**, not a second
  mechanism. The start page animates an SVG `offset-path`; a run here is a straight
  div, so this is a horizontal translate — same claim, appropriate means.
- **T037 is the wave's real deliverable.** A4, A6 and A7 have been open since the
  audit was written; this is the commit that closes them.
