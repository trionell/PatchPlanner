# Tasks: who can see this event

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [mockup.html](./mockup.html) rev 4

Grouped by the plan's phases rather than by user story, because the three stories
share one component: US1 (the phone can manage), US2 (one door, viewers included)
and US3 (removal is confirmed) all land in the same rewrite, and splitting them
would mean writing the drawer three times. The story each task serves is tagged so
the mapping stays visible.

`[P]` = no dependency on the task above it.

## Phase 0 — the rule

- [x] **T001** `design/components.md` §`ui/Dialog`: replace the *overlay with fields
      / sentence and two buttons* test with the approved *interrupts / accompanies*
      wording. State that a companion need not be editable. (FR-003)
- [x] **T002** `design/components.md` §`ui/Drawer`: delete D4's standalone read-only
      paragraph; it is now a sub-case of T001. The section loses a paragraph. (FR-003)
- [x] **T003** In §`ui/Dialog`, record what the test sorts: `ConfirmDialog` is the
      purest `Dialog`; the cable pickers stay `Dialog`s despite their field; this
      slice's access surface is a `Drawer`. **Name this slice as the demonstration
      of both halves at once** — the access list accompanies and its own removal
      confirm interrupts, on one surface — which is what FR-004 asks for and what a
      three-bullet list of verdicts would not say. Note that Slice 39 applies this
      rule rather than restating it. (FR-004)

**Checkpoint**: `design/` states the rule the rest of the slice is built from.

## Phase 1 — the sentence *(no UI change)*

- [x] **T004** [P] Create `frontend/src/lib/eventAccess.ts` with `accessCountLine`
      and `accessRoleLine` as signed in plan.md Phase 1. (FR-005)
- [x] **T005** [P] Create `frontend/src/lib/eventAccess.test.ts`: alone as owner;
      owner + one contributor; the 1↔2 plural boundary per role; a viewer reading it;
      an empty list. (FR-005)

**Checkpoint**: the row's text is correct and tested before anything renders it.

## Phase 2 — the drawer (US1, US3)

- [x] **T006** `git mv frontend/src/components/event/EventMembersDialog.tsx
      frontend/src/components/event/EventMembersDrawer.tsx` as its own step, so the
      rewrite that follows stays a readable diff.
- [x] **T007** Swap `ui/Dialog` for `ui/Drawer` at `width="narrow"`, with
      `info` + `noteId="event-access"` carrying the two durable rules (what
      contributor and viewer mean; an invitation goes to an account, not an email
      address). No `footer`. (FR-001, FR-018, FR-019)
- [x] **T007a** Retitle the surface **Who has access**, subtitle *Everyone here can
      open this event*, at both widths. *Manage access* named the half of the
      surface a viewer does not have, and the door is now open to every role.
      (FR-001a)
- [x] **T008** Restructure the body as two `DrawerSection`s — **People** with a
      `count`, and **Invite**. No `flush`. The labels are the mockup's own: a
      `DrawerSection` label renders as a `MicroLabel`, which is styled for a word
      and not for a phrase. (FR-002)
- [x] **T009** Rebuild a member row as `GearCard` → `GearTop` (name, role chip as
      `badge`, controls as `actions`) + `GearSpecs` for the email. (FR-009)
      → **Substituted, deliberately.** `GearCard` is used; the row inside it is
      hand-built rather than `GearTop`/`GearSpecs`. `GearTop` puts the badge before
      the name and the actions after a spacer, and this card needs an avatar first,
      a **You** chip immediately after the name, and — on a phone — the controls on
      a row of their own beneath the email, which is not a shape `GearTop` has. The
      email keeps `GearSpecs`' own values (10 px mono, `text-zinc-500`) so the tier
      is unchanged. This is what the mockup draws.
- [x] **T010** Delete `ROLE_BADGE`'s amber `viewer: 'warning'`; every role chip is
      neutral. (FR-010)
- [x] **T011** Give the owner's row and the reader's own row a chip and no `actions`
      at all — absent, not disabled. Mark the reader's own row **You**. (FR-011,
      spec Assumptions)
- [x] **T012** Phone geometry behind `useIsMobile()`: card stacks to two lines, role
      `Select` `h-10`, remove a 44 × 44 target around an `h-4` icon, card padding
      `px-3 py-2.5`; desktop keeps `h-8`/`h-7` and the default padding. Multiply the
      heights out **before** building to them. (FR-012, FR-012a, SC-002)
      → **117 px and 71 px, border-box.** The mockup's 114/68 are each 3 px light:
      a 14 px email line where the framework gives 15, and no allowance for the two
      1 px borders. Corrected in FR-012a rather than chased in CSS.
      → `GearCard` gained a `className` to make this expressible at all; it had a
      fixed `px-2.5 py-2` and no override, so the first cut of this task silently
      shipped the desk's padding on the phone and the review caught it.
- [x] **T013** Rebuild the invite form as `GearForm` → `FieldStack` (person) →
      `FieldStack` (role) → `FormActions`, full-width primary on the phone. Absent
      entirely when read-only. Keep the already-a-member filter. (FR-013, FR-014,
      FR-015)
      → **Substituted, deliberately.** The two `FieldStack`s are used at `full`.
      `GearForm` and `FormActions` are not: `GearForm` is the row-editor's grid and
      `FormActions` is `ml-auto` — a *right-aligned* end to a form, which is the
      opposite of the full-width primary the mockup draws under a stack of fields
      at 448 px. A plain `flex-col gap-2` is what the drawn form is.
- [x] **T014** Leave the exhausted-picker sentence where the picker was — it is a
      state, not a durable rule, so it does not join the `info` note. (spec Edge
      Cases)
- [x] **T015** Route removal through `ui/ConfirmDialog`: title *Remove access*;
      sentence naming the member, stating access ends immediately, nothing already
      changed is undone, and they can be invited again; confirming word *Remove*.
      Role changes stay unconfirmed. (FR-016, FR-017, US3)
- [x] **T016** Keep `readOnly` and its defense-in-depth comment intact through the
      move, updated to say that the trigger is no longer what hides this surface.
      (FR-021)

**Checkpoint**: the surface is correct at both widths, but still has no door on a
phone — US1 is not yet demonstrable.

## Phase 3 — the door (US1, US2)

- [x] **T017** `OverviewTab.tsx`: build the access drawer once alongside `catalog`
      and render it in both branches. (FR-001)
- [x] **T018** Desktop: add the access row to the event card — `MicroLabel`
      **Access**, the two lines from T004, an `outline` button reading *Manage* for
      a manager and *View* for a viewer. The catalog row's arrangement, one row
      later. (FR-005, FR-006)
- [x] **T019** Phone: pass a `CondensedListRow` to `MobileOverviewPanel` beneath the
      catalog row — trailing chevron, no `accentColor`, tappable at every role.
      (FR-005, FR-006, US2)
- [x] **T020** Remove both access phrases from `OverviewTab`'s `meta`
      (lines 121-124), at both widths. (FR-008, SC-006)
- [x] **T021** Pass `readOnly` explicitly at the mount; `canManageMembers` now gates
      the controls rather than the door. (FR-020)
- [x] **T022** `EventDetail.tsx`: delete `membersOpen`, the `UserPlus` import, the
      *Invite* button (130-135), the drawer mount (140) **and the now-dead
      `canManageMembers` const (line 63)** — the button was its only use site, and
      `noUnusedLocals` is on in `tsconfig.app.json`, so leaving it fails `tsc -b`.
      (FR-007, SC-004)
- [x] **T023** Grep for any remaining importer of `EventMembersDialog`; there should
      be none.

**Checkpoint**: US1 and US2 are both demonstrable end to end at 375 px and on a desk.

## Phase 4 — tests and gates

- [x] **T024** [P] `EventMembersDrawer.test.tsx` under `renderToStaticMarkup`: a
      viewer's render contains no `<select>`, no remove control, no invite form.
      (FR-014, FR-021, SC-003)
- [x] **T025** [P] Same file: an owner's render has a role control for a contributor
      and none on the owner's own row or the reader's own row. (FR-011)
- [x] **T026** [P] Same file: the exhausted-picker state renders the sentence and no
      picker; no role chip carries an amber class. (FR-010)
- [x] **T027** Run the Gates via the `validator` agent: `gofmt`, `go vet`, `go test`;
      `tsc -b`, `eslint`, `vitest run`, `vite build`.
- [x] **T028** Review against spec and acceptance criteria via the `reviewer` agent;
      fix what it finds.
- [x] **T029** Update `ROADMAP.md`: mark Slice 38 ✅ with the date, write the outcome
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

## What the review changed

`reviewer` ran after T027 and found four things worth fixing. All are done.

- **The phone card was never at the phone's padding** (T012, above). The stated
  114 px had been asserted in three durable places before the code produced it.
- **A failed invite did not refresh the list.** `inviteM` had only `onSuccess`, so
  the stale picker that caused the failure stayed stale — and the spec's Edge Cases
  require the refresh by name. Now `onSettled`.
- **FR-008 orphaned two fields.** With the meta line's access phrases gone, nothing
  read `EventSummary.members` or `EventSummary.yourRole`; both were still computed
  and passed in. Deleted, along with `eventSummary()`'s `members` input.
  `membersQuery` stays — the access row needs it.
- **A viewer fetched every account in the system** for a form they never see.
  `usersQuery` is now `enabled: open && !readOnly`. Not a new exposure — `GET
  /users` is open to any signed-in caller by design — but before this slice a viewer
  could not open this surface at all.

Two smaller ones: the desk invite button stays at `sm` rather than the ledger's
`xs`, because `sm` is what every other confirm in a drawer is and the ledger's
value would make this one button 4 px shorter than its neighbours; and a comment
that the alphabetised prop insertion had pushed onto the wrong prop moved back.

## Deliberately not done

Inviting by email address; transferring ownership; leaving an event under your own
power; showing who invited whom; searching the person picker. The other
`window.confirm` deletes are ROADMAP D6 and are untouched — this slice added a
confirm where there had been none at all, which is a different thing.

**One thing found and left alone:** `pages/Dashboard.tsx`, `pages/Events.tsx` and
`components/events/TimelineRow.tsx` still draw a viewer's role with `Badge
variant="warning"` — the amber this slice removed from the member list. FR-010 is
scoped to the drawer, nothing in `design/` now contradicts those three, and
widening the change would be editing three shipped surfaces this slice did not come
for. It is a real inconsistency and it is reported rather than fixed.
