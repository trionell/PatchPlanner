---
description: "Task list for Wave 6c — the nine surfaces"
---

# Tasks: The nine surfaces

**Input**: Design documents from `/specs/035-phone-surfaces/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/phone-surfaces.md](contracts/phone-surfaces.md),
[quickstart.md](quickstart.md), and the approved [mockup.html](mockup.html) revision 2

**Tests**: Included where the plan names them. This project's method is Vitest with
`renderToStaticMarkup` — no DOM, no React Testing Library (constitution). That decides what
is testable: structure, class strings and conditional rendering, never pixels.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: which user story the task belongs to

## Path conventions

Web app: `frontend/src/`, `backend/` — **frontend only** this slice.

---

## Phase 1: Setup

**Purpose**: capture what must not change, before anything changes it.

- [x] T001 Confirm the working tree is clean and the branch is `035-phone-surfaces`; run the full gate suite from [quickstart.md](quickstart.md) once to record a green baseline
- [x] T002 Capture the **before** markup of `SignalFlowStatusRail`'s desktop return for all six states (`gaps = 0 | 1 | >1` × with/without `firstGap`, × with/without a filter handler) into a scratch file, per research R9 — this is the only chance to take it
- [x] T003 [P] Capture the **before** markup of `StagePlotInspector` for all four `element.kind` values × locked/unlocked × read-only/not, per research R7 and the contract §8

**Checkpoint**: two baselines exist. Every later change to those two files is diffable.

---

## Phase 2: Foundational — the bar's overflow (F2)

**Purpose**: `MobilePanel.overflow` blocks US2, US6 and US8. It is not a user story of its
own because it delivers no value alone.

**⚠️ BLOCKING**: US2, US6 and US8 cannot start until this phase is done.

- [x] T004 Add `PanelAction` (`label`, `icon?`, `hint?`, `onClick`) and `overflow?: PanelAction[]` to `frontend/src/components/ui/MobilePanel.tsx`, per [contracts](contracts/phone-surfaces.md) §1. Leave `actions` exactly as it is — same name, same node type, same meaning
- [x] T005 Implement the three render cases in `frontend/src/components/ui/MobilePanel.tsx`: **0** → nothing; **1** → that action's own `h-11 w-11` target with its `label` as `aria-label`; **2+** → a `⋯` target with `aria-label="More actions"` opening a `ui/Sheet`
- [x] T006 Build the overflow sheet inside `MobilePanel` (never at a call site): `ui/Sheet` with `flush`, `title` = the panel's `title`, and rows at `flex min-h-[52px] w-full items-center gap-3 border-b border-zinc-800/60 px-3 text-left` — `SectionSwitcher`'s shape, per contracts §1
- [x] T007 Document the visible/overflow rule in `MobilePanel`'s doc comment, in one sentence with the reason: *a control that changes what you are looking at stays in the bar; a control that does a thing and is finished goes in the overflow*
- [x] T008 Add overflow tests to `frontend/src/components/ui/MobilePanel.test.tsx`: zero renders no control; one renders a direct target and **no** sheet; two render `⋯`; the sheet's rows carry the labels, hints and 52 px minimum

**Checkpoint**: nine surfaces can now put a control somewhere without a bar that wraps.

---

## Phase 3: US1 — A viewport is not a permission (P1) 🎯 MVP

**Goal**: `!isMobile` leaves every permission expression. Equipment lines and rental
quantities become editable from a phone; a plot element's properties become editable; every
row responds to a tap for every role.

**Independent test**: as a contributor at 375 px, edit an equipment line, a rental line and
a plot element's name, and see each on the desktop. As a viewer, open every row and read it.

- [x] T009 [P] [US1] Add `spatial?: boolean` (default `true`) to `frontend/src/components/event/StagePlotInspector.tsx`; when `false`, suppress the Position, Size, Rotation and Tilt rows and render the note *"Position and size are set on a computer."* in their place. Change nothing else
- [x] T010 [US1] Diff `StagePlotInspector`'s desktop markup against T003's baseline — must be byte-identical
- [x] T011 [P] [US1] Create `frontend/src/components/mobile/MobileEquipmentEditSheet.tsx`: `ui/Sheet` over an owned line's quantity and note, with the over-owned warning inline; a **rented** line renders read-only and offers to open the rental order, which is the desktop row's behaviour. Delete kept apart from confirm (`patterns.md` §2). A failed save keeps the sheet open with every value intact
- [x] T012 [P] [US1] Create `frontend/src/components/mobile/MobileRentalEditSheet.tsx`: manual audio and manual light side by side (they are one idea), then the note. No delete — a plan-derived line is not deletable on the desk either. Same failed-save behaviour
- [x] T013 [US1] Export both sheets from `frontend/src/components/mobile/index.ts`
- [x] T014 [US1] In `frontend/src/components/event/EquipmentTab.tsx`: `editable = !readOnly`; delete the comment quoting Slice 21 FR-012; give the phone panel a `primaryAction` for add and wire rows to `MobileEquipmentEditSheet`
- [x] T015 [US1] In `frontend/src/components/event/RentalTab.tsx`: `editable = !readOnly`; delete the FR-012 comment; add the manual-line `primaryAction` and wire rows to `MobileRentalEditSheet`
- [x] T016 [US1] In `frontend/src/components/event/StagePlotTab.tsx`: `editingAllowed = !readOnly`. Placement, drag and the palette stay withheld **by gesture** on a phone, not by role — the canvas keeps receiving no mutation handlers there
- [x] T017 [US1] In `frontend/src/components/event/StagePlotTab.tsx`: delete the `Viewer only` label and render the withheld-gesture sentence at the contract's §6 values, inside the panel, below the bar, above the canvas — *"Placing elements is a desk job — open this plot on a computer. Tap anything on it to read or edit what it is."* It does not vary with role
- [x] T018 [US1] In `frontend/src/components/event/StagePlotTab.tsx`: tapping an element opens `StagePlotInspector` in a `ui/Sheet` with `spatial={false}`, committing per field — so no footer and no Save (`patterns.md` §7d)
- [x] T019 [US1] In `frontend/src/components/mobile/MobileEntityList.tsx`: the row is tappable for **every** role. A role that may not edit gets the same sheet with no confirm and no destructive control, and no request is ever attempted
- [x] T020 [US1] Make the same read-only-but-tappable change in the three edit sheets that already exist — `MobileChannelEditSheet`, `MobileOutputEditSheet`, `MobileFixtureEditSheet` — so a viewer reads the fields rather than meeting a dead row
- [x] T021 [US1] Assert the finding as a test in `frontend/src/components/mobile/CondensedListRow.test.tsx` or a new `permissions.test.tsx`: a read-only list row still renders a tappable element
- [x] T022 [US1] Run `grep -rn "!isMobile" --include='*.tsx' frontend/src` — must return nothing (FR-001)

**Checkpoint**: US1 is independently shippable. The app no longer tells anyone they may not
do something when the truth is that nobody built it.

---

## Phase 4: US2 — A stagebox that arrives on site is declared on site (P1)

**Goal**: the Rig, Buses and Universes drawers are reachable from their tabs' phone
branches.

**Independent test**: add a stagebox from Audio Inputs at 375 px, then select it while
editing a channel, then see it on the desktop.

**Depends on**: Phase 2 (the overflow).

- [x] T023 [US2] In `frontend/src/components/event/AudioInputsTab.tsx`, move `RigDrawer` and `BusesDrawer` above the phone return and render them in it. **No drawer file is edited** — `ui/Drawer` has had a phone form since 6a (research R2 of Slice 33)
- [x] T024 [US2] Give that tab's `MobilePanel` an `overflow` of **Open Rig**, **Groups & DCAs** and **Print patch sheet**, with the desktop's own counts as hints. A role that may not open a drawer gets the entry omitted, not disabled
- [x] T025 [P] [US2] Same in `frontend/src/components/event/AudioOutputsTab.tsx` — `RigDrawer` only; overflow is **Open Rig** and **Print**
- [x] T026 [P] [US2] Same in `frontend/src/components/event/LightingTab.tsx` — `UniversesDrawer`; overflow is **Universes** and **Print**
- [x] T027 [US2] Update `StatusStrip.desktopExtras`' doc comment in `frontend/src/components/event/StatusStrip.tsx`: the drawer **is** mounted now, and Open Rig lives in the overflow because on a phone the strip is already the filter control. State the reason rather than deferring to a finding

**Checkpoint**: US2 is independently shippable. `M5` closes.

---

## Phase 5: US3 — Which event am I holding? (P1)

**Goal**: the event's name is in the shell's header, on every section, at every scroll
position.

**Independent test**: open an event at 375 px, scroll any section to the bottom, read the
name from the header.

- [x] T028 [US3] In `frontend/src/components/Layout.tsx`, match `/events/:id` with `useMatch` and read `['event', id]` with the same fetcher `EventDetail` uses, `enabled` only on that route. Title is `data?.name ?? getPageTitle(pathname)` — the fallback covers pending and error, so there is no flash of *Event Detail* followed by a name (research R12)
- [x] T029 [US3] Give the phone header's title slot `truncate min-w-0` so a long name loses its tail without moving the brand mark or the avatar. The desktop header is untouched
- [x] T030 [US3] In `frontend/src/pages/EventDetail.tsx`, delete the phone header block and make `← Events` a 44 px target beside the section switcher, in one row
- [x] T031 [US3] Add a `Layout` test asserting the title falls back to the page title when the event query has no data, and truncates when it does

**Checkpoint**: US3 is independently shippable, and it has handed ~48 px back to all nine
sections before Phase 6 spends them.

---

## Phase 6: US4 — How is this show doing, in one hand (P2)

**Goal**: Overview has a phone composition. Figures stay figures, ribbons stay drawings,
verdicts become rows that state and route.

**Independent test**: open Overview at 375 px on an event with a patch gap and an over-stock
rental line; every figure and verdict matches the desktop's.

- [x] T032 [US4] Add `readinessLines(summary): ReadinessLine[]` to `frontend/src/lib/eventSummary.ts` per [data-model](data-model.md) §2. It re-uses `ReadinessVerdict` verbatim and formats `figure` from the same `EventSummary` fields `NumbersBand` reads. `summary.readiness` is unchanged, so `ReadinessRow` is untouched
- [x] T033 [US4] Preserve *undeclared is not zero*: an area with no plan keeps its neutral verdict and gets **no** `figure` — a dash, never a `0`
- [x] T034 [P] [US4] Add `eventSummary` tests for `readinessLines`: the five areas, each tone, and the undeclared case
- [x] T035 [US4] Create `frontend/src/components/mobile/MobileOverviewPanel.tsx` as a `MobilePanel` with `title="Overview"`, no search, and the **Edit details** pencil as `primaryAction` (absent for a viewer)
- [x] T036 [US4] In that component: the venue and dates as one quiet line opening the rows region — **not** the event's name, which is in the header after US3 (FR-013)
- [x] T037 [US4] The figures as a two-column grid at the desktop's own type size, the load-in countdown spanning both columns. **No tile draws a border, a radius or a ground of its own** — hairlines only, which is `M1`'s lesson applied to something that is not a row (FR-012)
- [x] T038 [US4] Both rig ribbons as rows whose node track is `overflow-x-auto` at the desktop's node geometry; the DMX meter moves out of the trailing slot to a line beneath its ribbon. The page must not scroll sideways (research R4)
- [x] T039 [US4] The five readiness rows: at least 44 px, four aligned columns (area, figure, pill, chevron), the verdict's tone as the leading edge, and the tap opening that section. Its own markup, **not** `CondensedListRow` (research R3)
- [x] T040 [US4] The inventory row and the meta footer after the readiness run, in the desktop card's order
- [x] T041 [US4] Overview's strip states how many areas need attention and names them, and offers **no** filter — the first sentence-strip in the application, which `patterns.md` §7b already allows and nothing has demonstrated
- [x] T042 [US4] Add the phone branch to `frontend/src/components/event/OverviewTab.tsx`, below the queries and the `eventSummary` memo. The desktop return is untouched
- [x] T043 [P] [US4] Add `MobileOverviewPanel` tests: the countdown spans, no tile carries a border or radius class, five readiness rows render with the right tones, and the strip has no chevron

**Checkpoint**: US4 is independently shippable. Half of `M9` closes, and one of the shell's
three blockers is gone.

---

## Phase 7: US5 — The planning vocabulary, on the device it is corrected on (P2)

**Goal**: event Settings and `/my-defaults` have a phone form. One branch, two surfaces.

**Independent test**: at 375 px, switch vocabularies, add a value, rename one, try to delete
one that is in use.

- [x] T044 [US5] Add the phone branch **inside** `frontend/src/components/VocabularyPanel.tsx` — `ui/Drawer`'s precedent. Neither `SettingsTab.tsx` nor `pages/MyDefaults.tsx` is edited (research R5)
- [x] T045 [US5] The rail becomes a bar control in `actions` naming the current vocabulary, capped at 112 px and truncating, opening a `ui/Sheet` listing all vocabularies with their value counts at `SectionSwitcher`'s 52 px rows and 2 px amber left edge
- [x] T046 [US5] Rows carry the label, the stored value in mono and the usage count; a vocabulary no column reads says `not stored` rather than showing a blank (FR-015)
- [x] T047 [US5] A row opens a sheet to rename, with delete kept apart from confirm; the server's refusal to delete a referenced value surfaces as the inline error it already is
- [x] T048 [US5] The strip states the vocabulary count and the panel's `note`, with no filter — the second sentence-strip
- [x] T049 [P] [US5] Add `VocabularyPanel` tests for the phone branch: the picker truncates, the sheet lists every vocabulary with a count, usage counts are absent when `showUsage` is false, and the desktop return is unchanged

**Checkpoint**: US5 is independently shippable. `M9` closes fully, and the shell is
unblocked.

---

## Phase 8: US6 — The signal chain, in the frame, with a verdict (P2)

**Goal**: Signal Flow is a panel with two runs and a strip; the fifth status rail joins the
shared shell.

**Independent test**: at 375 px on an event with one unsourced channel — the panel, the two
runs, the strip's sentence, and tapping it filters to the gap.

**Depends on**: Phase 2 (the overflow).

- [x] T050 [US6] Rewrite `frontend/src/components/event/SignalFlowStatusRail.tsx` in terms of `event/StatusStrip`, passing the two tints it already hand-writes and a `filter` of `{ label: 'Show N', onClick }` when there is something to filter to. Delete its own tint expression and its `size="xs"` button rather than re-implementing them (F1, research R9)
- [x] T051 [US6] Diff the rail's **desktop** markup for all six states against T002's baseline — must be byte-identical
- [x] T052 [US6] Replace `SignalFlowTab`'s phone branch in `frontend/src/components/event/SignalFlowTab.tsx`: a `MobilePanel` with two runs under micro-label headings carrying their counts, and the rail as `strip`
- [x] T053 [US6] The flow row: `min-h-[44px]`, first line truncating with the number in mono amber, second line the existing `ChainLine` at `font-mono text-[11px]` which **wraps**. Retire `InputFlowCard` and `OutputFlowCard`
- [x] T054 [US6] Give the tab a `gaps` filter on the phone that shares the desktop's existing state, and pass `filtered` so an emptied filter reads as *nothing left to fix* rather than as an empty surface
- [x] T055 [US6] Overflow: **Print**. One action, so the panel renders it as its own target — no menu (contract §1)
- [x] T056 [P] [US6] Add `SignalFlowTab` phone tests: one panel, two runs with counts, a chain that wraps, and a strip that reports the first gap in words

**Checkpoint**: US6 is independently shippable. `F1` closes and `M1`'s last instance goes.

---

## Phase 9: US7 — The verdict does not scroll away (P3)

**Goal**: the shell becomes a fixed-height column; the panel fills the body and only the
rows scroll.

**Independent test**: at 375 × 667 on a 40-row list, scroll to the middle — bar, strip and
nav all still visible.

**⚠️ Depends on**: Phases 6 and 7. The column's failure mode is caused by surfaces that are
not panels, and Overview and Settings were the last two.

- [x] T057 [US7] In `frontend/src/components/Layout.tsx`, make the phone shell `h-[100svh] flex flex-col overflow-hidden`; header `h-14 flex-none`; `main` `flex-1 min-h-0 overflow-hidden px-4 py-4`. `svh` and not `dvh`, for the reason `tokens.md` §7 already gives about the sheet
- [x] T058 [US7] Delete the body's `pb-[calc(3.5rem+env(safe-area-inset-bottom))]` — the nav is a sibling in the column now, so there is nothing to reserve for
- [x] T059 [US7] In `frontend/src/components/mobile/MobileNav.tsx`, stop being `fixed`; become a static `flex-none` sibling. **The safe-area inset stays**, still added to its own padding rather than absorbed (`M10`)
- [x] T060 [US7] In `frontend/src/pages/EventDetail.tsx`, make the phone return `flex h-full flex-col gap-3` with the switcher row `flex-none` and the section `flex-1 min-h-0`
- [x] T061 [US7] In `frontend/src/components/ui/MobilePanel.tsx`, give the root `h-full min-h-0` and the rows region `flex-1 min-h-0 overflow-y-auto`. Both halves matter: `min-h-0` so it may shrink, `overflow-y-auto` and not `hidden` so what does not fit is reachable — 6b had the first without the second (research R11)
- [x] T062 [US7] Update `patterns.md` §7b and §7a and `components.md` §5: the page no longer scrolls, the panel does. This is a value change, so it lands in the same commit as the code (`CLAUDE.md`)
- [x] T063 [US7] Add a shell test that mounts the column around a long list and asserts **both** invariants: the rows region is the only element carrying a scrolling overflow, and no element in the column both may grow and carries `overflow-hidden`
- [x] T064 [US7] Confirm no phone surface is left that is neither a panel nor a canvas — Dashboard, Events, the two Inventories surfaces, `/my-defaults` and all nine sections

**Checkpoint**: US7 is shippable. 6b's deferral closes.

---

## Phase 10: US8 — A print from a phone is a page (P3)

**Goal**: printing from a phone produces the same page as printing from a desk.

**Independent test**: print each of the three tabs at 375 px and compare with the desktop.

**⚠️ Depends on**: Phase 2 (the overflow) and Phase 4 — it edits the same three files.

- [x] T065 [US8] In `frontend/src/components/event/AudioInputsTab.tsx`, return a fragment from the phone branch: the existing `print:hidden` wrapper holding the panel, and `InputPatchSheet` as its **sibling** — the desktop return's own shape (research R13)
- [x] T066 [P] [US8] Same in `frontend/src/components/event/AudioOutputsTab.tsx`
- [x] T067 [P] [US8] Same in `frontend/src/components/event/LightingTab.tsx`
- [x] T068 [US8] Wire each tab's **Print** overflow entry to the handler `PrintButton` already uses
- [x] T069 [US8] In `frontend/src/components/event/RentalTab.tsx`, move the three exports into the overflow: **Export .xlsx**, **Export PDF**, and **Export price list** only for a catalog imported from one
- [x] T070 [P] [US8] Add tests asserting each phone branch renders its print sheet element, and that no panel chrome appears inside it

**Checkpoint**: `M11` closes. Every phone surface reaches the export it has.

---

## Phase 11: Polish & documentation

**Purpose**: the design language cannot lag the code, because it is quoted.

- [x] T071 [P] Rename `MOBILE_SECTION_CAPABILITIES` → `MOBILE_SECTIONS` and `MobileSectionCapability` → `MobileSection` in `frontend/src/types/mobile.ts` and its three call sites; delete the comment explaining why the old name was kept, since that reason has expired (F3)
- [x] T072 Strike `M4`, `M5`, `M9` and `M11` from `design/audit.md` Part 1, move them to Part 1b with the wave named, and correct **"four status rails"** to five in both `audit.md` and `components.md` §5
- [x] T073 [P] In `design/patterns.md`: write §7b's overflow rule with its visible/overflow split; remove *"the page scrolls, not the panel"*; add §7c's **stated exception** for the signal chain, worded as a constraint — *the chain wraps because it is the content; a subtitle summarising a row still truncates*
- [x] T074 [P] In `design/tokens.md` §7: name the wrap exception, and remove the row's mention of the page scrolling
- [x] T075 [P] In `design/components.md` §5: `MobilePanel`'s `overflow`, the three new phone components, `StagePlotInspector`'s `spatial`, and five rails
- [x] T076 In `design/design-language.html` §8: draw the overflow sheet and the readiness row, so the drawn specimens and the prose do not disagree — which is `F1` of Slice 34 repeating if it is skipped
- [x] T077 Update `ROADMAP.md`: the Slice 35 entry, and the dependency graph's `6c → 6d`
- [x] T078 Run every gate and scope assertion in [quickstart.md](quickstart.md), including the three greps and the two byte-identical diffs
- [ ] T079 **Not done — needs a browser.** The handset pass in [quickstart.md](quickstart.md) is a human's: rows 1–18 at 375 px and rows 19–23 on a device. Everything the test method *can* reach is asserted (structure, class strings, conditional rendering); nothing here measured a pixel, by design
- [x] T080 Independent review of the diff against the spec's acceptance scenarios and the mockup, then fix what it finds

---

## Dependencies

```
Phase 1  Setup ─────────────────────────────────────────────┐
                                                            │
Phase 2  the overflow (F2) ──┬──→ Phase 4  US2  M5  ────────┤
                             ├──→ Phase 8  US6  F1          │
                             └──→ Phase 10 US8  M11 ◄── also needs Phase 4 (same files)
                                                            │
Phase 3  US1  M4   ── independent ──────────────────────────┤
Phase 5  US3  name ── independent ──────────────────────────┤
                                                            │
Phase 6  US4  Overview M9 ──┬──→ Phase 9  US7  the shell ───┤
Phase 7  US5  Settings M9 ──┘                               │
                                                            │
                                            Phase 11 Polish ┘
```

**Story independence**: US1, US2, US3, US4, US5, US6 and US8 are each independently
shippable once their prerequisites land. **US7 is the one exception** and it is a real
constraint, not a preference — the shell's failure mode is caused by surfaces that are not
panels.

**File conflicts to respect**:

- Phases 4 and 10 both edit the three audio/lighting tabs → sequential
- Phases 2, 9 both edit `MobilePanel.tsx` → sequential
- Phases 5 and 9 both edit `Layout.tsx` and `EventDetail.tsx` → sequential

---

## Parallel opportunities

| Together | Tasks |
|---|---|
| Baselines | T002, T003 |
| US1's new components | T009, T011, T012 |
| The three audio/lighting tabs, once the first is a pattern | T025, T026 |
| US4's tests beside its build | T034, T043 |
| The design documents | T073, T074, T075 |

**Two agents, no conflicts**: US1 (Equipment, Rental, Stage Plots) and US2 (Audio Inputs,
Audio Outputs, Lighting) touch disjoint files and can run at the same time once Phase 2 is
done.

---

## Implementation strategy

**MVP is US1.** It closes the finding a user meets most often, on three surfaces, and it
depends on nothing.

**Then the two P1s that stand alone** — US2 (the rig on site, the case the phone exists for)
and US3 (the name, the smallest change in the slice and the one that fires every session).

**Then the two M9 halves** — US4 and US5 — which are the design work and which unblock the
shell.

**Then US6, US7, US8**, and the documents last, in the same commit as the code they
describe.

---

## Total

**80 tasks** — 8 foundational, 60 across eight user stories, 10 polish and documentation,
2 review and verification.

| Story | Tasks | Closes |
|---|---|---|
| US1 · a viewport is not a permission | 14 | `M4` |
| US2 · the drawers | 5 | `M5` |
| US3 · the event's name | 4 | *(review)* |
| US4 · Overview | 12 | `M9` (half) |
| US5 · Settings and My Defaults | 6 | `M9` (half) |
| US6 · Signal Flow | 7 | `F1`, `M1`'s last instance |
| US7 · the shell | 8 | 6b's deferral |
| US8 · print | 6 | `M11` |
