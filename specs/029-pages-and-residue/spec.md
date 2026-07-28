# Feature Specification: The pages, and what is left over

**Feature Branch**: `wave-4-5-convergence`

**Created**: 2026-07-28

**Status**: Draft

**Input**: The four calls in [mockup.html](mockup.html) §10 answered — two
approved as drawn, one approved with its hedge removed, and one revised:

> "Wave 5 decision 2: Add the in use endpoint. It's worth it."
> "Wave 5 decision 4: Exempt start page"
> "In wave 5, the dashboard page could look a bit more like the rest. Less
> card-y. I would like a more fun and exciting dashboard since that is the
> logged in landing page."

## Context

**Wave 5** closes the convergence recorded in
[design/audit.md](../../design/audit.md): the last of **A6**, the last of **A7**,
and **A4** outright.

The audit calls these surfaces "mostly already right", and for four of the eight
that holds. Three do not, and the third is the one the audit did not predict:

| Surface | What is actually wrong |
|---|---|
| **Inventories** | The catalog detail is **three cards and a 308-row navigation-tier table** — the largest table in the application by row count — with a permanently-open five-field add form, a per-row modes dialog, and category management crammed into the corner of every tile of the filter list. |
| **Owned gear** | The same conversion, a fifth of the size. |
| **Settings · My Defaults** | **Nine `VocabularyCard`s in a two-column grid**, each a list of live inputs with a stored-value `<code>` beside every label and its own add form. Nine always-open forms on one page, five screens of scrolling to reach *Truss types*. |
| **Dashboard** | Five bordered boxes saying twelve, four, two, and here are some links — on the screen a user lands on every working day. |

### The dashboard is a rebuild, not a trim

The mockup proposed removing the three meaningless stat badges and the "Quick
actions" card holding one button and a sentence of marketing copy. The answer
went further: **less card-y, and make it exciting.**

So the page loses cards entirely. The next show is drawn at full size with the
shape of its rig as a one-row flow ribbon, a countdown, five figures and the
readiness verdicts from every tab; everything else falls onto a spine of dates,
upcoming and done; the three counts become the footer strip they always were.

It reuses Wave 4's `lib/eventSummary` and its ribbon, for exactly one event.

### The one animation

`design/tokens.md` §6 permits two things — `transition-colors`, and the
signal-flow pulse, "already wrapped in `prefers-reduced-motion: no-preference`",
with the instruction that any new animation gets the same wrapper. That pulse
exists today only on the **signed-out** start page.

Wave 5 brings it inside, to the signed-in landing page, staggered along the
hero ribbon's runs so the signal walks the rig. It stays off every working
surface, because a tool that animates while a technician is counting channels is
in the way — which is why Wave 4's Overview ribbon has none.

### The start page is exempt

Recorded in writing rather than half-converted. It shares the brand mark, the
amber accent and the type families with the application, and nothing else: its
`rounded-2xl` cards, gradient grounds and 44 px display heading are a different
brief. A landing page's job is to be memorable to someone who has never seen the
product; the application's is to disappear behind the patch.

Its one stray `rounded-lg` — neither the page's own `rounded-2xl` nor the
ladder's `rounded-md` — is corrected, and A4 then closes honestly instead of
staying open against a page nobody intends to convert.

### In use is a count, not a derivation

Wave 4 withdrew its proposed endpoint because Overview's figures were
derivations. This one is the opposite case, and it needs almost nothing:
`countReferenceUsage` **already exists** in `db/reference.go`, where the delete
guard calls it to refuse removing a value a plan references. Today the interface
finds out by trying and reports the refusal as an error the user caused.

Surfacing the same count on the same response is what makes a value safe to
delete look different from one that is load-bearing, *before* the click — and by
calling the same function, the count and the refusal cannot disagree.

## User Scenarios

### US1 — The inventory catalog is a work surface (Priority: P1)

Someone maintaining a 308-item price list scans it, filters it by category, and
edits an item in place.

**Acceptance**:
1. Categories are visible all at once beside the items, not four at a time.
2. Clicking a category filters the items; clicking it again clears the filter.
3. Clicking an item opens an editor beneath it; no closed row holds a control.
4. A lighting item's DMX modes are edited in that editor, not in a dialog.
5. The panel states its item count, category count and where the catalog came from.

### US2 — Category and import management have their own drawers (Priority: P1)

**Acceptance**:
1. Renaming, retyping, deleting a category and assigning its planning picker role
   happen in a drawer, not in the corner of a filter tile.
2. Importing a price list, downloading the blank template, and the result of the
   last import are in one drawer that explains what the formats are.
3. Neither drawer shifts the sheet's layout.

### US3 — Owned gear is a sheet (Priority: P2)

**Acceptance**:
1. One panel, one sheet, one editor, one strip; no always-open form.
2. `Planned on` still states how many events reference each item.

### US4 — Vocabularies are one panel (Priority: P1)

**Acceptance**:
1. Nine cards become a rail of vocabularies and one sheet of values.
2. The stored value is a column, not a caption beside every label.
3. A value states how many plan rows use it, before you try to delete it.
4. My Defaults renders the same panel without the usage column, which does not
   apply to a template.

### US5 — The dashboard is worth landing on (Priority: P1)

**Acceptance**:
1. No `Card` on the page.
2. The next show is drawn at full size with its rig, its countdown, five figures
   and its readiness.
3. Every other event is a dated row; past events are their own block.
4. The signal pulse animates the hero's ribbon, and stops under
   `prefers-reduced-motion: reduce`.
5. Account totals close the page rather than heading it.

### US6 — The small ones (Priority: P3)

**Acceptance**:
1. Events keeps its card grid, gains a search field and an actionable empty state.
2. Login's sign-in control uses the primary button's own classes rather than a
   retyped copy, and its error block uses the token.
3. The start page is unchanged but for one radius, and the exemption is written
   into `design/`.

---

## Requirements

### Inventory catalog (US1)

- **FR-001**: The inventory detail MUST render as one `PatchPanel` replacing three
  `Card`s and the page header above them.
- **FR-002**: The bar MUST read: `← Back`, the inventory name, search,
  `Categories`, `Import`, `flex-1`, `+ Item`.
- **FR-003**: Categories MUST render as a **column of the panel**, `w-56`,
  `border-r border-zinc-800`, scrollable — the mirror of the stage plot's palette
  (`design/patterns.md` §4).
- **FR-004**: The rail MUST show `All items` plus every category with its type and
  item count, and MUST only filter — no other control may appear in a rail row.
- **FR-005**: The sheet MUST have six columns: `Item`, `Description`, `Category`,
  `Qty`, `Price`, `Modes`.
- **FR-006**: `Modes` MUST show the count of DMX modes on a lighting item and `—`
  otherwise, so which items carry modes is visible without opening anything.
- **FR-007**: Clicking a row MUST open a `RowEditor` with `Category`, `Name`,
  `Description`, `Qty`, `Price`, and `Delete`.
- **FR-008**: For an item whose category type is `lighting`, the editor MUST render
  its DMX modes in `RowEditor`'s `notice` slot: each mode with its channel count,
  a delete, and an add row.
- **FR-009**: The modes dialog MUST be deleted.
- **FR-010**: `+ Item` MUST open an add editor at the foot of the sheet.
- **FR-011**: Search MUST filter on item name and description.
- **FR-012**: The strip MUST state item count, category count, the filtered
  category's count, and the source file and import date when there is one.
- **FR-013**: The inventory **list** view MUST keep its card list (P1's exception),
  gain each inventory's item count, and move `Create a new inventory` from a card
  into the page's one primary action.

### The drawers (US2)

- **FR-014**: A `Categories` drawer MUST hold, per category: name, type, planning
  picker role, and delete; plus an add row.
- **FR-015**: Its footer MUST state that a category's picker role is what makes its
  items appear in a patch row's picker.
- **FR-016**: An `Import` drawer MUST hold the file picker, the blank-template
  download, a note naming the detected formats, and the result of the last import.
- **FR-017**: The bare success paragraph and the page-level error paragraph MUST be
  removed from the layout, so nothing shifts when an import finishes.
- **FR-018**: A read-only viewer of an inventory they do not own MUST see neither
  drawer's operations — but MUST still be able to open and read them (P7 is about
  controls a role cannot use, not about hiding information).

### Owned gear (US3)

- **FR-019**: `OwnedGearManager` MUST render as one `PatchPanel` with a sheet:
  `Item`, `Type`, `Owned`, `Planned on`, `Notes`.
- **FR-020**: The editor MUST hold name, description, type, owned quantity and
  notes, with delete.
- **FR-021**: The strip MUST state item count, a per-type breakdown, and how many
  items are planned on at least one event.
- **FR-022**: The always-open add form and its `rounded-lg` MUST be deleted.

### Vocabularies (US4)

- **FR-023**: `SettingsTab` and `MyDefaults` MUST render one `PatchPanel` with a
  vocabulary rail and a value sheet, replacing nine `VocabularyCard`s each.
- **FR-024**: The rail MUST list all nine vocabularies with their value counts.
- **FR-025**: The sheet MUST have columns `Label`, `Stored value`, and — on
  Settings only — `In use`.
- **FR-026**: The editor MUST offer `Label` only; the stored value is immutable and
  MUST render read-only with the reason.
- **FR-027**: On Settings, the editor's `notice` MUST state the usage count and what
  it means: renaming is always safe, deleting is refused while a plan uses it.
- **FR-028**: `+ Value` MUST open an add editor with `Label` and `Stored value`.
- **FR-029**: The strip MUST state vocabulary count, total values, the selected
  vocabulary's count, and — on Settings — that this is the event's own copy.
- **FR-030**: `VocabularyCard` MUST be deleted once nothing imports it.
- **FR-031**: A read-only role MUST get no `+ Value` and no editor.

### The usage count (US4)

- **FR-032**: `domain.ReferenceValue` MUST gain `UsageCount int` with JSON key
  `usageCount`.
- **FR-033**: `ListReferenceData` MUST populate it by calling the **existing**
  `countReferenceUsage`, so the count and the delete guard cannot disagree.
- **FR-034**: The reference *template* response MUST NOT carry a usage count: a
  template is not referenced by any plan, and reporting `0` would imply it could be.
- **FR-035**: A Go test MUST assert that a value the delete guard refuses reports a
  non-zero count, and that one it allows reports zero.

### The dashboard (US5)

- **FR-036**: The Dashboard MUST render no `Card`.
- **FR-037**: The page MUST open with a `Next show` micro-label and the one primary
  action, `+ New event`.
- **FR-038**: The hero MUST be one `rounded-xl` frame bordered
  `border-amber-500/55` — the canvas's own mark for *the box every other box is
  arranged around* — carrying the event name, venue, written-out date, a countdown
  in mono at `text-3xl` in `amber-500`, the audio ribbon, five figures, the
  readiness verdicts, and `Open the show →`.
- **FR-039**: The hero MUST be absent when there is no upcoming event, replaced by
  an actionable empty state.
- **FR-040**: Its figures MUST come from `lib/eventSummary`, fetched for that one
  event, and MUST render `—` while the queries are in flight.
- **FR-041**: The hero's ribbon runs MUST carry the `pp-pulse` travelling dot,
  staggered, inside `@media (prefers-reduced-motion: no-preference)`.
- **FR-042**: Everything else MUST render as dated rows under `Also coming up` and
  `Done` micro-label rules — date in `font-mono tabular-nums`, then name, venue and
  role — with no card frame.
- **FR-043**: Past events MUST be their own block, dimmed.
- **FR-044**: The three stat cards and the `Quick actions` card MUST be deleted, and
  the account totals MUST close the page as a strip: events, upcoming,
  inventories, catalog items, owned items.
- **FR-045**: A `Badge` that repeats the label beside it MUST NOT appear.
- **FR-046**: `Dashboard`'s `rounded-lg` MUST become `rounded-md`.

### The small ones (US6)

- **FR-047**: `Events` MUST keep its card grid, gain a search field beside the
  primary action, and show an actionable empty state.
- **FR-048**: The introductory sentence above the grid MUST be removed.
- **FR-049**: `ui/Button` MUST export the class string its variants produce, so a
  link can be styled as a button without retyping it.
- **FR-050**: `Login` MUST use it, and MUST use `border-red-800` for its error block.
- **FR-051**: `StartPage`'s single `rounded-lg` MUST become `rounded-xl`, matching
  its own neighbours rather than the ladder it is exempt from.
- **FR-052**: `design/audit.md` and `design/principles.md` MUST record the start
  page's exemption in writing.

### Boundaries (US6)

- **FR-053**: `components/ui/` MUST change in exactly one file, `Button.tsx`, and
  only by addition.
- **FR-054**: Every Wave 4 surface, the audio tabs, Stage Plots, Lighting, and
  `components/event/graph/` MUST be untouched.
- **FR-055**: `components/print/` MUST be unchanged.
- **FR-056**: The only backend change MUST be the usage count: one struct field, one
  query loop, and its test. No migration.
- **FR-057**: Every `isMobile` branch MUST render as it does today.

---

## Assumptions

- **`countReferenceUsage` is correct.** It has guarded deletes since Slice 17; this
  wave reads it, it does not re-derive it.
- **A rail is a desktop construction.** On a phone, Inventories keeps the
  full-screen category dialog it has today, and Settings keeps its stacked cards
  until somebody asks otherwise.
- **The dashboard's "next show" is the soonest event with a date at or after
  today.** An event with no date is never the hero.
- **Inventory ownership is unchanged.** Only the owner manages; the wave moves
  where the controls live, not who has them.

## Out of Scope

- Sorting or bulk-editing the inventory sheet. Import already handles bulk, which
  is how 308 items arrive.
- Moving an item between categories other than by editing it.
- Converting the start page.
- A vocabulary rail on the phone.
- Anything about auth, roles or sharing.

## Success Criteria

- **SC-001**: `Card` disappears from `Dashboard`, `Inventories`' detail,
  `OwnedGearManager`, `SettingsTab` and `MyDefaults` — from 5 + 3 + 1 + 9 + 9.
- **SC-002**: Zero permanently-open add forms across the wave, from five.
- **SC-003**: The inventory sheet shows ≥ 28 items on a 900 px viewport, from ~9.
- **SC-004**: All twelve categories are visible at once, from ~4.
- **SC-005**: Dialogs on the inventory page: 1 (the phone's category filter), from 2.
- **SC-006**: `grep -c rounded-lg` over `frontend/src` returns **1** — the one
  inside `PatchPanel.tsx`'s comment — from 12.
- **SC-007**: A vocabulary value's usage count equals what the delete guard sees,
  asserted by a Go test.
- **SC-008**: `git diff --stat -- frontend/src/components/ui` touches one file.
- **SC-009**: `tsc -b`, `eslint`, `vitest`, `go vet`, `go test` all pass.
