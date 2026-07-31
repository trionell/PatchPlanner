# Implementation Plan — who can see this event

**Branch**: `038-event-access`
**Spec**: [spec.md](./spec.md)
**Design**: [mockup.html](./mockup.html), revision 4, approved 2026-07-31

No `research.md`. There is nothing to resolve: the endpoints are complete and
tested from Slice 15, every value comes from `design/`, and the three questions
the design left open were ruled at approval.

## Technical context

| | |
|---|---|
| Backend | **None.** `GET/POST /events/{id}/members` and `PATCH`/`DELETE .../members/{userID}` are complete, role-gated behind `RequireEventAccess` and covered by `event_members_test.go`. No migration, no handler, no model field. |
| Testing | Vitest with `renderToStaticMarkup`. No DOM — so a rendered assertion can only ask *what is in the markup*, which is exactly the shape of this slice's real risk (a control present for a role that must not have it). The row's summary sentence goes to `lib/` to be testable at all. |
| New dependency | None |
| Scope | ~8 frontend files. One component rewritten and renamed, one new pure module, three call sites, two `design/` sections. |

This slice changes `design/components.md` §`ui/Dialog` and §`ui/Drawer`, so it
updates them in the same commit — Phase 0, before the code that depends on them.

## Constitution check

- **V · Pragmatic simplicity — no component invented.** Every part of this surface
  already exists: `ui/Drawer`, `DrawerSection`, `GearCard`, `GearTop`, `GearSpecs`,
  `ui/ConfirmDialog`, `ui/InfoNote`, `CondensedListRow`. The slice composes them and
  adds no `ui/` file.
- **V · No abstraction ahead of a second caller.** The access drawer is built once in
  `OverviewTab` and rendered in both its branches — the precedent `catalog` set in the
  same file at line 108. Not a new shared component; one element in two returns.
- **Pure logic in `lib/`, tested.** The row's sentence — *"You are the owner · 2
  contributors, 1 viewer"* — is derived, so it is a pure function with its own tests,
  not string-building inside JSX where `renderToStaticMarkup` can only reach it through
  a full render.
- **III · One rule, one place.** The *interrupts / accompanies* wording is written into
  `components.md` once, in Phase 0. Slice 39 applies it. D4's read-only clause is
  absorbed rather than left beside it as a second answer.
- **A reach check is never a permission** (P9 / patterns.md §7g). `useIsMobile()`
  decides geometry only. What a viewer may not do is decided by role at every width,
  and the two must not be spelled with the same branch — see the risk table.

No violations. Complexity Tracking is empty.

## Phases

### Phase 0 — the rule *(no code)*

`design/components.md`:

- §`ui/Dialog` — replace *an overlay with fields is a `Sheet`; an overlay that is a
  sentence and two buttons is a `Dialog`* with the approved wording: a `Dialog`
  **interrupts** (one choice, centred, gone when answered); a `Drawer`
  **accompanies** (a companion workspace you go on working in); **a companion need
  not be editable** — consulting is accompanying.
- §`ui/Drawer` — delete D4's standalone *a read-only work surface opened from another
  surface is a `Drawer`* paragraph. It becomes a sub-case of the clause above; the
  section loses a paragraph rather than gaining one.
- Record what the new test sorts without argument: `ConfirmDialog` is the purest
  `Dialog`; the cable pickers stay `Dialog`s despite holding a field, because they are
  one choice raised mid-patch; this slice's access surface is a `Drawer`.

Why first: Phases 1–2 are the rule applied. Writing them first would be deciding the
language in code and documenting it afterwards, which is the fault D4 was cited for.

### Phase 1 — the sentence *(no UI change)*

`frontend/src/lib/eventAccess.ts`:

```ts
import type { EventMember } from '../types'

/** "4 people have access" — the row's title. */
export function accessCountLine(members: EventMember[]): string

/** "You are the owner · 2 contributors, 1 viewer" — the row's subtitle.
 *  Omits a role with no members; omits the trailing clause when you are alone. */
export function accessRoleLine(members: EventMember[], yourUserId: number): string
```

Tests (`eventAccess.test.ts`): one member (you, the owner); an owner and one
contributor; the plural boundary at 1 vs 2 of each role; a viewer reading it; a
member list that has not loaded yet.

### Phase 2 — the drawer

`EventMembersDialog.tsx` → `EventMembersDrawer.tsx`, same directory. The rename is
the point: the file named the shape, and the shape is what was wrong.

- `ui/Drawer`, `width="narrow"`, `info` + `noteId="event-access"`, **no `footer`**.
- Title **Who has access**, subtitle *Everyone here can open this event*, at both
  widths. The current *Manage access* named what an owner does with the surface,
  which is the half a viewer does not have; the drawer is now open to every role.
- Two `DrawerSection`s: **People** (with a `count`) and **Invite**. No `flush`.
  A `DrawerSection` label renders as a `MicroLabel`, which is a word, not a phrase.
- A member is `GearCard` → `GearTop` (name, role chip as `badge`, controls as
  `actions`) + `GearSpecs` (the email, 10 px mono).
- Role chips neutral at every role — `ROLE_BADGE`'s `viewer: 'warning'` goes. Amber
  is *needs attention* (`tokens.md` §5) and a viewer is not a fault.
- The owner's row and the reader's own row: chip, no controls. `GearTop`'s `actions`
  is simply absent — P7, not a disabled control.
- Phone geometry via `useIsMobile()`: the card stacks, role `Select` `h-10`, remove a
  44 × 44 target around an `h-4` icon. Desktop keeps `h-8` / `h-7`. Target heights
  114 px and 68 px.
- Invite: `GearForm` → two `FieldStack`s (person, role) → `FormActions` with a
  full-width primary on the phone. Absent entirely when read-only.
- The exhausted-picker sentence stays where the picker was — a state, not a rule.
- Remove raises `ui/ConfirmDialog`: *Remove access* / the member's name, access ends
  immediately, nothing already changed is undone, they can be invited again /
  **Remove**. Role change: no confirm.

### Phase 3 — the door

`OverviewTab.tsx` builds the drawer once and renders it in both branches, exactly as
`catalog` already is:

- Desktop: an access row in the event card, the catalog row's arrangement one row
  later — `MicroLabel` **Access**, the two lines, an `outline` button reading
  *Manage* or *View*.
- Phone: a `CondensedListRow` passed to `MobileOverviewPanel`, under the catalog row,
  trailing chevron, no `accentColor`.
- `meta` loses its two access phrases at both widths (`OverviewTab.tsx:121-124`).
- `readOnly` is passed explicitly. `canManageMembers` (`yourRole !== 'viewer'`)
  moves from gating the door to gating the controls, which is what the server has
  always enforced.

`EventDetail.tsx` loses `membersOpen`, the `UserPlus` import, the *Invite* button
(130-135) and the drawer's mount (140). The header keeps only the back link.

### Phase 4 — tests and gates

`EventMembersDrawer.test.tsx`, under `renderToStaticMarkup`:

- a viewer's render contains no `<select>`, no remove control and no invite form;
- an owner's render contains a role control for a contributor and none on the owner's
  own row;
- the reader's own row carries the **You** marker and no controls;
- the exhausted-picker state renders the sentence and no picker;
- no member's role chip carries the amber class.

Then the Gates from `CLAUDE.md`, via the `validator` agent.

## Risks

| Risk | Why it is real here | What contains it |
|---|---|---|
| A viewer reaching a control | The door is now open to every role, where before it was hidden from viewers entirely. The client gate changes meaning in this slice. | `readOnly` passed explicitly at the mount, gating each control; four of Phase 4's five tests are this one risk. The server already refuses regardless. |
| Spelling a permission with `useIsMobile()` | Two branches land in one component in this slice — geometry and role. They read alike and mean nothing alike (§7g). | Role decides presence; the reach check decides only size and stacking. Reviewed as a named item. |
| The count disagreeing with itself | Overview states the number twice today, and this slice adds a third statement before removing two. | Phase 3 removes both meta phrases in the same commit that adds the row. |
| Self-removal locking the reader out | A contributor can remove their own row through the API; doing it from this surface would drop them out of the surface mid-action. | Own row carries no controls (spec Assumptions — the one inferred behaviour). |
| The rename losing history | `EventMembersDialog` → `EventMembersDrawer` is a file move plus a rewrite. | `git mv` first, edits second, so the diff stays reviewable. |

## Complexity Tracking

No violations found.
