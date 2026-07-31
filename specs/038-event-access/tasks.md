# Tasks: who can see this event

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [mockup.html](./mockup.html) rev 4

Grouped by the plan's phases rather than by user story, because the three stories
share one component: US1 (the phone can manage), US2 (one door, viewers included)
and US3 (removal is confirmed) all land in the same rewrite, and splitting them
would mean writing the drawer three times. The story each task serves is tagged so
the mapping stays visible.

`[P]` = no dependency on the task above it.

## Phase 0 — the rule

- [ ] **T001** `design/components.md` §`ui/Dialog`: replace the *overlay with fields
      / sentence and two buttons* test with the approved *interrupts / accompanies*
      wording. State that a companion need not be editable. (FR-003)
- [ ] **T002** `design/components.md` §`ui/Drawer`: delete D4's standalone read-only
      paragraph; it is now a sub-case of T001. The section loses a paragraph. (FR-003)
- [ ] **T003** In §`ui/Dialog`, record what the test sorts: `ConfirmDialog` is the
      purest `Dialog`; the cable pickers stay `Dialog`s despite their field; this
      slice's access surface is a `Drawer`. **Name this slice as the demonstration
      of both halves at once** — the access list accompanies and its own removal
      confirm interrupts, on one surface — which is what FR-004 asks for and what a
      three-bullet list of verdicts would not say. Note that Slice 39 applies this
      rule rather than restating it. (FR-004)

**Checkpoint**: `design/` states the rule the rest of the slice is built from.

## Phase 1 — the sentence *(no UI change)*

- [ ] **T004** [P] Create `frontend/src/lib/eventAccess.ts` with `accessCountLine`
      and `accessRoleLine` as signed in plan.md Phase 1. (FR-005)
- [ ] **T005** [P] Create `frontend/src/lib/eventAccess.test.ts`: alone as owner;
      owner + one contributor; the 1↔2 plural boundary per role; a viewer reading it;
      an empty list. (FR-005)

**Checkpoint**: the row's text is correct and tested before anything renders it.

## Phase 2 — the drawer (US1, US3)

- [ ] **T006** `git mv frontend/src/components/event/EventMembersDialog.tsx
      frontend/src/components/event/EventMembersDrawer.tsx` as its own step, so the
      rewrite that follows stays a readable diff.
- [ ] **T007** Swap `ui/Dialog` for `ui/Drawer` at `width="narrow"`, with
      `info` + `noteId="event-access"` carrying the two durable rules (what
      contributor and viewer mean; an invitation goes to an account, not an email
      address). No `footer`. (FR-001, FR-018, FR-019)
- [ ] **T007a** Retitle the surface **Who has access**, subtitle *Everyone here can
      open this event*, at both widths. *Manage access* named the half of the
      surface a viewer does not have, and the door is now open to every role.
      (FR-001a)
- [ ] **T008** Restructure the body as two `DrawerSection`s — **People** with a
      `count`, and **Invite**. No `flush`. The labels are the mockup's own: a
      `DrawerSection` label renders as a `MicroLabel`, which is styled for a word
      and not for a phrase. (FR-002)
- [ ] **T009** Rebuild a member row as `GearCard` → `GearTop` (name, role chip as
      `badge`, controls as `actions`) + `GearSpecs` for the email. (FR-009)
- [ ] **T010** Delete `ROLE_BADGE`'s amber `viewer: 'warning'`; every role chip is
      neutral. (FR-010)
- [ ] **T011** Give the owner's row and the reader's own row a chip and no `actions`
      at all — absent, not disabled. Mark the reader's own row **You**. (FR-011,
      spec Assumptions)
- [ ] **T012** Phone geometry behind `useIsMobile()`: card stacks to two lines, role
      `Select` `h-10`, remove a 44 × 44 target around an `h-4` icon; desktop keeps
      `h-8`/`h-7`. Verify the two heights compute to 114 px and 68 px before
      building to them. (FR-012, SC-002)
- [ ] **T013** Rebuild the invite form as `GearForm` → `FieldStack` (person) →
      `FieldStack` (role) → `FormActions`, full-width primary on the phone. Absent
      entirely when read-only. Keep the already-a-member filter. (FR-013, FR-014,
      FR-015)
- [ ] **T014** Leave the exhausted-picker sentence where the picker was — it is a
      state, not a durable rule, so it does not join the `info` note. (spec Edge
      Cases)
- [ ] **T015** Route removal through `ui/ConfirmDialog`: title *Remove access*;
      sentence naming the member, stating access ends immediately, nothing already
      changed is undone, and they can be invited again; confirming word *Remove*.
      Role changes stay unconfirmed. (FR-016, FR-017, US3)
- [ ] **T016** Keep `readOnly` and its defense-in-depth comment intact through the
      move, updated to say that the trigger is no longer what hides this surface.
      (FR-021)

**Checkpoint**: the surface is correct at both widths, but still has no door on a
phone — US1 is not yet demonstrable.

## Phase 3 — the door (US1, US2)

- [ ] **T017** `OverviewTab.tsx`: build the access drawer once alongside `catalog`
      and render it in both branches. (FR-001)
- [ ] **T018** Desktop: add the access row to the event card — `MicroLabel`
      **Access**, the two lines from T004, an `outline` button reading *Manage* for
      a manager and *View* for a viewer. The catalog row's arrangement, one row
      later. (FR-005, FR-006)
- [ ] **T019** Phone: pass a `CondensedListRow` to `MobileOverviewPanel` beneath the
      catalog row — trailing chevron, no `accentColor`, tappable at every role.
      (FR-005, FR-006, US2)
- [ ] **T020** Remove both access phrases from `OverviewTab`'s `meta`
      (lines 121-124), at both widths. (FR-008, SC-006)
- [ ] **T021** Pass `readOnly` explicitly at the mount; `canManageMembers` now gates
      the controls rather than the door. (FR-020)
- [ ] **T022** `EventDetail.tsx`: delete `membersOpen`, the `UserPlus` import, the
      *Invite* button (130-135), the drawer mount (140) **and the now-dead
      `canManageMembers` const (line 63)** — the button was its only use site, and
      `noUnusedLocals` is on in `tsconfig.app.json`, so leaving it fails `tsc -b`.
      (FR-007, SC-004)
- [ ] **T023** Grep for any remaining importer of `EventMembersDialog`; there should
      be none.

**Checkpoint**: US1 and US2 are both demonstrable end to end at 375 px and on a desk.

## Phase 4 — tests and gates

- [ ] **T024** [P] `EventMembersDrawer.test.tsx` under `renderToStaticMarkup`: a
      viewer's render contains no `<select>`, no remove control, no invite form.
      (FR-014, FR-021, SC-003)
- [ ] **T025** [P] Same file: an owner's render has a role control for a contributor
      and none on the owner's own row or the reader's own row. (FR-011)
- [ ] **T026** [P] Same file: the exhausted-picker state renders the sentence and no
      picker; no role chip carries an amber class. (FR-010)
- [ ] **T027** Run the Gates via the `validator` agent: `gofmt`, `go vet`, `go test`;
      `tsc -b`, `eslint`, `vitest run`, `vite build`.
- [ ] **T028** Review against spec and acceptance criteria via the `reviewer` agent;
      fix what it finds.
- [ ] **T029** Update `ROADMAP.md`: mark Slice 38 ✅ with the date, write the outcome
      into its section, and drop its row from the **What remains** index.

## Dependencies

- T001–T003 before Phase 2 — the code applies a rule that must already be written.
- T004 before T018 and T019 — both rows render its output.
- T006 before T007–T016 — move the file, then rewrite it.
- T017 before T018, T019, T021.
- T022 after T017 — do not remove the old door before the new one exists.
- T024–T026 after T016; T027 after everything.

## Parallel opportunities

T004 and T005 together. T024–T026 together, being one new file's three cases.
Everything else is sequential — it is one component and one call site.
