---
description: "Task list for Slice 33 — the sheet, and the edge the thumb is on"
---

# Tasks: The sheet, and the edge the thumb is on

**Input**: Design documents from `/specs/033-phone-sheet/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md),
[contracts/overlay-components.md](contracts/overlay-components.md),
[quickstart.md](quickstart.md), [mockup.html](mockup.html)

**Tests**: Included, and on one thing only — `ui/Sheet`'s **structure**, via
`renderToStaticMarkup`, the no-DOM idiom `OverviewBands.test.tsx` established.
The spec first claimed a shell has nothing to test; [research.md](research.md)
R8 corrects that. What matters here is what is a sibling of what, and that is
visible in the element order and in nothing else.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: which user story the task serves (US1–US5)

## Path conventions

Web application, but **only `frontend/` is touched** — see
[plan.md](plan.md) § Project Structure for the closed file list. A diff naming a
path outside it fails review.

## Commits

[plan.md](plan.md) lists six steps and this breakdown keeps all six:

| # | What | Stories |
|---|---|---|
| 1 | the primitives — `Sheet`, the hook, `FieldStack`'s width | US1, US2, US5 |
| 2 | the siblings — `Dialog` hardened, `Drawer` anchored | US2 |
| 3 | the three edit sheets | US1 |
| 4 | the three list sheets | US3 |
| 5 | the bottom edge | US4 |
| 6 | the documents | — |

**Nothing renders differently until commit 3.** Commits 1 and 2 are additive:
commit 1 is imported by nothing, and commit 2's only visible effect is that six
drawers acquire a phone form they did not have. That ordering is what makes a
regression after commit 3 attributable to one file.

**Commit 5 is last on purpose.** It is the only step whose effect cannot be seen
in this toolchain, so it must not be able to mask a regression from 3 or 4.

**The gates, run before every commit:**

```bash
cd backend  && go vet ./... && go test ./...
cd frontend && npm run lint && npm run typecheck && npm test
```

`tsc -b`, never `tsc --noEmit` — the root tsconfig is references-only and
`--noEmit` checks nothing. The backend gates are run because CI runs them, not
because this slice can affect them.

---

## Phase 1: Foundational — the primitives

**Purpose**: the shell, its key handler and the field wrapper the phone's forms
need. Blocks US1, US2 and US5. **Nothing imports any of it yet**, so the
interface is byte-identical after this phase.

- [X] T001 Create `frontend/src/hooks/useEscapeToClose.ts` exporting `useEscapeToClose(active: boolean, onClose: () => void): void` — a `useEffect` that returns early when `active` is false, registers `keydown` on `window`, calls `onClose` on `Escape`, and cleans up. Header comment records that it owns the key and nothing else: not focus, not scroll locking, not the backdrop, because only one of its three callers wants each of those the same way ([research.md](research.md) R5)
- [X] T002 Create `frontend/src/components/ui/Sheet.tsx` with exactly the props in [contracts/overlay-components.md](contracts/overlay-components.md) §1 — `open`, `onClose`, `title: ReactNode`, `subtitle?`, `children`, `footer?`, `scrim = true`, `flush = false`. No other prop. Header comment states the claim the component exists for: it does three jobs and decides nothing about any of them ([patterns.md](../../design/patterns.md) §7d)
- [X] T003 Build `Sheet`'s outer layer: `fixed inset-0 z-50 flex items-end`, plus `bg-zinc-950/80 touch-none` and a backdrop click handler **only when `scrim`**. When `scrim` is false emit **no backdrop styling and no click handler**, and set the wrapper `pointer-events-none` with the panel `pointer-events-auto`, so the canvas behind stays live ([research.md](research.md) R2, invariant S3)
- [X] T004 Build `Sheet`'s panel: `flex w-full max-h-[85svh] flex-col rounded-t-xl border-t border-zinc-700 bg-zinc-900 shadow-2xl`, stopping click propagation. `svh` is deliberate and `dvh` is wrong — record [research.md](research.md) R3 in a comment, because this is the value a later reader will want to "fix"
- [X] T005 Build the header: `flex flex-none items-center gap-2 border-b border-zinc-800 px-4 py-3.5`; the title node in a `text-lg font-semibold text-zinc-100` element carrying a `useId()` id; `subtitle` beneath at `text-xs text-zinc-500`; a close `button` at `ml-auto -mr-2 flex h-11 w-11 items-center justify-center` with `X` at `h-5 w-5` and `aria-label="Close"`. The 44 px target is the point — a bare `×` glyph is a 14 px one
- [X] T006 Build the body and footer as **siblings**: body `flex-1 overflow-y-auto overscroll-contain` with `px-4 py-4 flex flex-col gap-3.5` unless `flush`; footer, when given, `flex-none border-t border-zinc-800 px-4 py-3` with `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]` — the inset **added to** the padding, never absorbed (invariants S1, S6, S7)
- [X] T007 Add the accessibility layer: `role="dialog"`, `aria-labelledby` pointing at T005's id, and `aria-modal={scrim}` — which is a fact, not a formality, since a sheet with no backdrop genuinely is not modal (invariant S4)
- [X] T008 Add focus handling: capture `document.activeElement` in a ref on open, move focus to the panel, and restore on close where the element is still connected. Do **not** trap focus when `scrim` is false
- [X] T009 Call `useEscapeToClose(open, onClose)` **before** the `if (!open) return null` — hooks may not sit behind an early return
- [X] T010 [P] Add `full: 'w-full'` to `FieldStack`'s width map in `frontend/src/components/ui/GearList.tsx` and to its `width` union. Leave the four existing widths untouched. Comment records why `grow` could not be reused: its `flex-1` grows the *height* inside the `flex-col` a phone sheet stacks fields in ([research.md](research.md) R4)
- [X] T011 Create `frontend/src/components/ui/Sheet.test.tsx` using `renderToStaticMarkup`, pinning the structural invariants of [contracts/overlay-components.md](contracts/overlay-components.md) §1: the footer is a **sibling** of the scrolling body and not inside it (S1); exactly one element carries `overflow-y-auto` (S2); `scrim={false}` emits no `bg-zinc-950/80` and no `touch-none` (S3); `aria-modal` follows `scrim` (S4); the panel is `rounded-t-xl` and never `rounded-xl` (S5); `flush` removes `px-4 py-4` from the body and changes neither header nor footer (S6); the footer's padding contains `env(safe-area-inset-bottom)` inside a `calc` (S7); `open={false}` renders nothing (S8)
- [X] T012 Run the gates, confirm `grep -rn "from '.*ui/Sheet'" frontend/src` returns only the test, then **commit 1**

---

## Phase 2: Foundational — the siblings

**Goal (US2)**: `ui/Drawer` acquires a phone form for all six of its call sites,
and `ui/Dialog` becomes survivable at any height.

**Independent test**: open the Rig drawer below 768 px — it rises from the
bottom edge with the same sections, headings and spec lines as the desk. Open it
above 768 px — right-anchored, unchanged. No drawer call site appears in the
diff.

- [ ] T013 [US2] Replace `Drawer`'s inline `Escape` effect in `frontend/src/components/ui/Drawer.tsx` with `useEscapeToClose(open, onClose)`, called in the same position — before the `if (!open) return null`
- [ ] T014 [US2] Add the phone branch to `Drawer`: `const isMobile = useIsMobile()`, then after the closed-guard, `if (isMobile) return <Sheet open onClose={onClose} title={title} subtitle={subtitle} footer={footer}>{children}</Sheet>`. **`width` is not forwarded** — a phone has one width, and forwarding it would be an API that must never be used (invariant D2)
- [ ] T015 [US2] Move `Drawer`'s existing desktop return below the new branch **verbatim** — not one line inside it changes. Add a comment above it naming what the branch above is and pointing at [patterns.md](../../design/patterns.md) §7d. Then read the diff and confirm the desktop block shows as moved, not modified (invariant D1)
- [ ] T016 [US2] Add `useEscapeToClose(open, onClose)` to `frontend/src/components/ui/Dialog.tsx`, before its `if (!open) return null` (contract G1)
- [ ] T017 [US2] Give `Dialog` internal scroll: the panel gains `flex max-h-[85svh] flex-col`, its header `flex-none`, its body `flex-1 overflow-y-auto` — **the sheet's own numbers**, so a tall overlay behaves the same at either anchor. Comment records this as the phase's one stated desktop delta: a dialog taller than the viewport now scrolls instead of overflowing off both ends (contract G2)
- [ ] T018 [US2] Confirm no `Drawer` or `Dialog` call site changed: `git diff --name-only` names exactly `Drawer.tsx` and `Dialog.tsx` for this phase (invariant D4)
- [ ] T019 [US2] Compare the desktop's rendered class strings before and after through `twMerge` for `Drawer`'s panel, header, body and footer, and for `Dialog`'s panel and header — computed, not eyeballed, which is what caught Wave 0's four deltas ([research.md](research.md) R8.3)
- [ ] T020 Run the gates, then **commit 2**

---

## Phase 3: US1 — the three edit sheets

**Goal**: the phone's edit form rises from the thumb's edge, speaks the
application's one label voice, and can be saved with the keyboard up.

**Independent test**: [quickstart.md](quickstart.md) rows 1–3 — the form is
bottom-anchored, its labels are mono uppercase, its controls are `h-10`, its
confirm is full width and alone, and its delete is at the foot of the scrolling
body.

Three files, deliberately one task group each: they are three surfaces, and a
regression in one must not be hidden by the other two.

### The channel sheet

- [ ] T021 [US1] Replace `Dialog` with `Sheet` in `frontend/src/components/mobile/MobileChannelEditSheet.tsx`, keeping the same `title` expression and passing the confirm as `footer`
- [ ] T022 [US1] Convert all six fields from `FieldLabel` + control to `FieldStack width="full"` (or `width="grow"` inside the one two-up row), with `Input`/`Select` at `size="md"`. Stagebox and input number stay side by side — they are one idea; everything else stacks (FR-042)
- [ ] T023 [US1] Move the actions: the footer holds one `Button size="md"` spanning full width, labelled **Save channel** and rendering `Saving…` in place. **Delete the Cancel button** — the close control, the scrim and the back gesture are three ways out already (FR-020–FR-022)
- [ ] T024 [US1] Keep the inline error block above the fields, and confirm a failed save still leaves every value intact — already true, and the one behaviour the conversion must not lose (FR-006's scenario)

### The output sheet

- [ ] T025 [P] [US1] Apply T021–T024 to `frontend/src/components/mobile/MobileOutputEditSheet.tsx`, with the confirm labelled **Save output**

### The fixture sheet

- [ ] T026 [P] [US1] Apply T021–T024 to `frontend/src/components/mobile/MobileFixtureEditSheet.tsx`, with the confirm labelled **Save fixture**. Universe and address are the one two-up pair here
- [ ] T027 [US1] Where any of the three can delete its row, place the delete at the **foot of the body**: `Button variant="ghost" size="md"` tinted `text-red-400`, `self-start`, never in the footer (FR-023). Where a sheet has no delete today, none is added
- [ ] T028 [US1] Confirm `grep -rho "FieldLabel" frontend/src/components/mobile/` returns nothing, run the gates, then **commit 3**

---

## Phase 4: US3 — the three list sheets

**Goal**: the section list stops inventing a vocabulary, and the last two
overlays become the component.

**Independent test**: [quickstart.md](quickstart.md) rows 4, 7 and 8 — nine
destinations with no badges, a full-bleed category filter, and a **More** menu
that is a `Sheet` rather than a lookalike.

- [ ] T029 [US3] Convert `frontend/src/components/mobile/SectionSwitcher.tsx` to `<Sheet flush title="Sections">`. Retitle from *Jump to section*: the sheet lists what you can go to, and naming the verb in a heading is the label doing the control's job
- [ ] T030 [US3] Rebuild the list rows: `min-h-[52px]`, a mono `tabular-nums` two-digit ordinal at `text-[10px] tracking-[0.14em] text-zinc-600`, the label at `text-sm`, and the current section marked by `border-l-2 border-amber-500` with `bg-amber-500/[0.06]` and an amber label — **the sidebar's own marker**, which is the one thing the desktop and the phone can share here
- [ ] T031 [US3] Delete `CapabilityBadge`, `CAPABILITY_LABEL` and `CAPABILITY_CLASS` from the same file, and remove `border-amber-500/60` from the closed trigger, leaving `border-zinc-700`. A control that is amber whether or not anything is selected has spent the accent on furniture (FR-062)
- [ ] T032 [US3] Delete `MobileCapability` and the `capability` field from `frontend/src/types/mobile.ts`, and the nine values that populate it. Keep the constant's name — a rename in the same commit as a deletion makes the deletion harder to read ([data-model.md](data-model.md))
- [ ] T033 [US3] Confirm `grep -rn "sky-" frontend/src/components/` shows `sky` only as the legend's sample stroke in `graph/InspectorRail.tsx` and in vocabulary tints, never as a state (FR-062, SC-007)
- [ ] T034 [P] [US3] Convert the phone category filter in `frontend/src/pages/Inventories.tsx` to `<Sheet flush title="Filter by category">`, and strip each row's `border border-zinc-800 bg-zinc-900` — the Control role, on a list of destinations. Rows become `min-h-[52px]` with a bottom rule and the count on the right (FR-063)
- [ ] T035 [P] [US3] Replace `MobileNav`'s inline overlay in `frontend/src/components/mobile/MobileNav.tsx` with `<Sheet flush title="More">`, keeping the two items and their icons. The inline `border-zinc-800` becomes the Frame role's `border-zinc-700`, which the component already supplies (FR-064)
- [ ] T036 [US3] Confirm `grep -rn "<Dialog" frontend/src/components/mobile/ frontend/src/pages/Inventories.tsx` returns nothing, run the gates, then **commit 4**

---

## Phase 5: US4 — the bottom edge

**Goal**: the safe-area inset exists for the first time since Slice 21, and no
bottom-anchored clearance is a literal.

**Independent test**: this one has no gate. [quickstart.md](quickstart.md) §
*What a gate cannot see* — a handset, one pass, four things.

- [ ] T037 [US4] Add `viewport-fit=cover` and `interactive-widget=resizes-content` to the viewport meta in `frontend/index.html`. Comment the file: without the first, every `env(safe-area-inset-*)` in the tree evaluates to `0` on iOS; the second is honoured by Chromium and ignored by WebKit, so nothing may depend on it ([research.md](research.md) R6)
- [ ] T038 [US4] State the bottom nav's height in `frontend/src/components/mobile/MobileNav.tsx`: `h-14` on the `nav`, replacing the emergent sum of `py-2.5` + icon + label, with `pb-[env(safe-area-inset-bottom)]` kept **added** to it. Items become `flex-1 flex-col items-center justify-center gap-0.5` inside the stated height (FR-072)
- [ ] T039 [US4] Derive the phone body's bottom padding in `frontend/src/components/Layout.tsx`: `pb-20` becomes `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`, with a comment naming this as A5 on the other edge of the screen — a height a sibling positions against has to be a value someone chose (FR-073)
- [ ] T040 [US4] State the phone header's height in the same file: `px-4 py-3` becomes `h-14 px-4`, the desktop header's own number ([patterns.md](../../design/patterns.md) §7a). Nothing positions against it yet, which is exactly why it is cheap now and was expensive on the other edge (FR-074)
- [ ] T041 [US4] Record the stated visual deltas of this phase in the commit message: the phone's nav goes ~66 px → 56 px and its header ~53 px → 56 px. Both are the numbers `tokens.md` §7 already specified; neither is a new value
- [ ] T042 Run the gates, then **commit 5**

---

## Phase 6: Polish — the documents

**Purpose**: the design language and the roadmap catch up in the same slice,
which is [design/audit.md](../../design/audit.md) Part 3's standing rule.

- [ ] T043 [P] Settle `design/patterns.md` §7d: the footer holds a full-width confirm alone, delete sits at the foot of the scrolling body, and there is no Cancel. State the reason — at 375 px three controls put a destructive one in the corner a thumb rests on, and *full width* is not what a `flex-1` among three buttons produces
- [ ] T044 [P] Redraw `design/design-language.html` §8's sheet specimen to match T043. **The specimen is what was wrong**, not the prose, and leaving the two disagreeing is worse than either — a design document that lags the code is quoted
- [ ] T045 [P] Update `design/tokens.md` §7's fixed-geometry table with the sheet's own settled values — `max-h-[85svh]` with R3's reason in one line, the 44 px close target, and the footer's inset expressed as *added to* the padding
- [ ] T046 [P] Update `design/components.md` §5: `ui/Sheet` stops being marked **gap** and gains its six props and three tenancies; `MobileNav`'s "a real bottom sheet written inline" sentence goes; note that `Drawer` anchors itself and that no drawer call site knows
- [ ] T047 [P] Update `design/audit.md`: move **M7, M8, M10 and M12** to Part 1b naming Wave 6a; correct the Part 2 wave table, which assigned M8 to 6a and left M7, M10 and M12 unassigned; record M10's finding — that `viewport-fit` was absent, so the insets it describes had never evaluated to anything
- [ ] T048 [P] Add Slice 33 to `ROADMAP.md` with its one-line summary and its dependency on Slice 21 (which built `components/mobile/`) and Slice 29 (which finished the language it converges onto)
- [ ] T049 Walk [quickstart.md](quickstart.md) as far as this toolchain allows, and **write down what could not be walked**. There is no browser here: rows 1–9 are a human's, and the handset pass doubly so. What *can* be asserted is the reading-the-diff block — the three greps and the empty backend diff
- [ ] T050 Run the gates one last time, then **commit 6**

---

## Dependencies

```
Phase 1 (primitives) ──→ Phase 2 (siblings) ──→ Phase 3 (edit sheets) ──┐
                     └────────────────────────→ Phase 4 (list sheets) ──┼──→ Phase 6 (docs)
                                                Phase 5 (bottom edge) ──┘
```

- **Phase 1 blocks everything.** Nothing else can import a component that does
  not exist.
- **Phase 2 needs only Phase 1**, and blocks nothing but its own story — the
  edit sheets use `Sheet` directly, not `Drawer`.
- **Phases 3, 4 and 5 are independent of each other** and touch disjoint files.
  They are ordered as they are so that the one with no gate (5) lands last.
- **Phase 6 needs everything**, because it describes it.

## Parallel opportunities

- **T025 and T026** — the output and fixture sheets, two files, after T021–T024
  has settled the shape on the first one.
- **T034 and T035** — the category filter and the nav's More, two files.
- **T043–T048** — six documents, six files, no shared state.
- T010 is independent of T001–T009 and can be done at any point in Phase 1.

## MVP

**Phases 1–3.** That is M8 closed: a component, its two siblings, and the three
forms that most needed it. Phase 4 is M7, Phase 5 is M10 and the viewport, and
Phase 6 is the standing rule. Each is a commit that can land on another day
without leaving the phone in a half-state — except that Phase 5 should not
outrun Phase 3 for the reason under **Commits** above.
