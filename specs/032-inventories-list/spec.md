# Feature Specification: The inventory list, and the catalogs nobody could see

**Feature Branch**: `032-inventories-list`

**Created**: 2026-07-28

**Status**: Draft

**Input**: The four calls in [mockup.html](mockup.html) answered across four
revisions — two settled as drawn, two overruled:

> "I want search for the inventories list in preparation for when the inventory
> list grows."
> "The mockup is not using the correct drawer styling. See the rig and buses
> drawer in the Audio Inputs tab for reference."
> "In the new drawer design you have 'used on' where it lists the events. I like
> that. But you also have '+6 more' below the three in the list. I want all
> events to show in the list. Make it scrollable if/when necessary. And clicking
> an event should take you to that event."
> "For the two decisions: I approve your recommendation." — the tabs become
> **Rental catalogs** and **Owned gear**, and a row click opens the catalog.

## Context

`/inventories` has two tabs. The catalog behind one of them converged in Wave 5
— a panel, a category rail, a 308-row sheet — and **the list you reach it from
did not**. [design/audit.md](../../design/audit.md) A6 says so in as many words:
*"the inventory list is the only card list left."*

P1 exempts it, and the exemption is correctly invoked: these are genuinely
independent objects. Slice 30 recorded what that is worth — **a rule that
correctly permits something is not a reason to keep it** — so the question this
slice asks is the one that rebuilt Events. Not *is this in violation*, but *what
is this page for*.

### The column that was never shown

It is for picking which catalog to open, and for knowing which one your shows
are actually running on. The second question the page cannot answer at all.

`DeleteInventory` has counted the events pointing at a catalog since Slice 16 and
refuses while any do. The number exists, it is authoritative, and today it is
spent entirely on producing a **409 after** the user has already confirmed a
native browser dialog. Owned gear settled this argument one wave ago: its
*Planned on* column is, in Slice 29's own words, *"the only reason to open this
page rather than the event you are working on"*. Same number, same reason, other
catalog.

So this slice is not mainly a restyle. It is **one column that has never been
shown**, plus the frame the rest of the application already uses.

### What the page does today

| | Today |
|---|---|
| Frame | Three or more `rounded-xl bg-zinc-850` cards with gaps, under a 60-character paragraph explaining what an inventory is |
| Per-row controls | Three ghost buttons — rename, duplicate, delete — on every row, permanently |
| Rename | `window.prompt` |
| Delete | `window.confirm`, followed by a server refusal the user could not have predicted |
| Item count | One full `GET /inventories/{id}/items` per row, used for `.length` |
| Events using a catalog | Not shown anywhere |
| Search | None |

The two `window.*` calls are the only ones in the application.

### A drawer's frame is navigation tier; its contents are not

The mockup got this wrong twice before it got it right, and the rule is worth
stating because nothing in `design/` says it outright: `ui/Drawer` is a
navigation-tier frame — `text-lg` title, `px-5 py-4` — and its **interior is the
work surface's**, because what is declared in a drawer is referenced from a
sheet. Rig, Buses and Universes are all `ui/GearList`: `DrawerSection` with a
`MicroLabel` heading, `GearCard` at `px-2.5 py-2`, `GearSpecs` at 10 px mono,
`Button size="xs"`, `Input size="sm"`. This drawer is the same.

### Scrolling belongs to the body

*Used on* lists every event, and takes **no height of its own**. The drawer body
is already `flex-1 overflow-y-auto`; a capped section inside a scrolling body is
the exact failure [design/patterns.md](../../design/patterns.md) §4 records
against the category rail — twenty-seven categories cut off at the fold in a
private scrollbar, on a surface with room to spare.

## User Scenarios

### US1 — The list is one panel you can read (Priority: P1)

A technician opens *Inventories* and sees every catalog they own as rows of one
panel: name, size, how many shows run on it, and where it came from. No card
stack, no paragraph of explanation, no row of icon buttons.

**Independent Test**: Load `/inventories` with five catalogs and confirm one
bordered frame, five rows, and a strip; confirm a row click opens that catalog.

**Acceptance Scenarios**:

1. **Given** five catalogs, **When** the page loads, **Then** exactly one
   bordered frame renders, containing a bar, five rows and a strip.
2. **Given** the list, **When** a row is clicked anywhere in its width,
   **Then** that catalog opens at `/inventories/{id}`.
3. **Given** the list, **When** it renders, **Then** no row carries a rename,
   duplicate or delete control.

### US2 — Which shows run on this catalog (Priority: P1)

The same technician can see, without opening anything, that two of their five
catalogs are used by no event at all — and, on opening one, exactly which shows
hold the others.

**Independent Test**: Bind nine events to one catalog and none to another;
confirm the column reads `9 events` and `—`, and that the drawer lists all nine
by name, each linking to its event.

**Acceptance Scenarios**:

1. **Given** a catalog bound to nine events, **When** the list renders,
   **Then** its *Used on* cell reads `9 events`.
2. **Given** a catalog bound to no event, **When** the list renders, **Then**
   its *Used on* cell reads `—`, not `0`.
3. **Given** the manage drawer for a catalog bound to nine events, **When** it
   opens, **Then** all nine are listed, oldest first, each navigating to that
   event.

### US3 — Managing a catalog is a drawer, not a browser dialog (Priority: P1)

Renaming, duplicating, deleting and creating a catalog all happen in one drawer,
opened from the row or from the catalog's own bar. A catalog that events depend
on offers no delete control at all, and says which events hold it.

**Independent Test**: Rename a catalog from the drawer, duplicate it, then try
to delete one that is in use and one that is not.

**Acceptance Scenarios**:

1. **Given** the manage drawer, **When** a new name is confirmed, **Then** the
   catalog is renamed and the list reflects it, with no browser dialog shown.
2. **Given** a catalog bound to at least one event, **When** its drawer opens,
   **Then** no delete control exists and the *Used on* section states why.
3. **Given** a catalog bound to no event, **When** delete is pressed, **Then**
   the drawer asks in place, naming the catalog and its item count, and only a
   second confirmation deletes it.
4. **Given** a deletion completes, **When** the drawer closes, **Then** the list
   no longer contains that catalog.

### US4 — Finding one catalog among many (Priority: P2)

A technician with a dozen catalogs types part of a name — or part of the
spreadsheet it came from — and the list narrows to it.

**Independent Test**: With five catalogs, type `2025` and confirm only the
matching rows remain and the strip counts them.

**Acceptance Scenarios**:

1. **Given** five catalogs, **When** `2025` is typed, **Then** only catalogs
   whose name or source filename contains it remain.
2. **Given** a search matching nothing, **When** it is typed, **Then** a
   sentence says so, the field keeps what was typed, and the strip reads
   `0 of 5 catalogs`.
3. **Given** an account with no catalogs, **When** the page loads, **Then** no
   search field renders.

### US5 — The phone (Priority: P3)

The same facts, stacked: name, counts and source on one row, *used on* as a chip
at its end, and the catalog opening on tap.

**Independent Test**: Load the page below the mobile breakpoint and confirm rows
are touch-height and carry the same four facts.

**Acceptance Scenarios**:

1. **Given** a phone viewport, **When** the list renders, **Then** each row
   shows name, item and category counts, source, and a chip carrying the event
   count or `unused`.
2. **Given** a phone viewport, **When** a catalog is open, **Then** its screen
   offers the same manage drawer.

### Edge Cases

- **A catalog with no items and no categories** — counts render `0`, not `—`:
  zero items is a measured fact, where no bound event is an absence.
- **A catalog whose source file was imported and later replaced** — the source
  column shows the current `sourceFilename` and format, nothing historical.
- **An event bound to a catalog and then deleted** — the count falls on the next
  list load; nothing is cached across the mutation.
- **Deleting the last catalog** — the empty state returns, including its
  template download.
- **A rename to a name another catalog already has** — permitted. Names are not
  unique today and this slice does not make them so.
- **A catalog bound to forty events** — every one is listed; the drawer body
  scrolls, and no section inside it does.
- **Two tabs open, one deletes a catalog the other has open in a drawer** — the
  delete returns 404 and the inline error says so; the list refreshes on the
  next load.

## Requirements

### The panel (US1)

- **FR-001**: The catalog list MUST render as exactly one bordered frame —
  `PatchPanel`: a bar, the rows, and a closing strip. No `Card`, no stacked
  boxes with gaps, and no explanatory paragraph above it.
- **FR-002**: The list MUST use navigation-tier values throughout —
  `text-sm` rows, a `text-xs` sans column header, `Button size="sm"` for the
  primary action, `Badge` rather than `Pill` — per
  [design/tokens.md](../../design/tokens.md) §3. It MUST NOT use micro-labels,
  row striping, or work-surface paddings.
- **FR-003**: Each row MUST show, in this order: catalog name, item count,
  category count, events using it, and source (format then filename). Counts MUST
  be right-aligned, mono and `tabular-nums`.
- **FR-004**: Clicking anywhere in a row MUST open that catalog at
  `/inventories/{id}`. The row MUST NOT expand, and the manage control MUST NOT
  be nested inside the row's own clickable element.
- **FR-005**: Rows MUST be ordered alphabetically by name, as the server already
  returns them.
- **FR-006**: The strip MUST state catalog count, total items, total events
  running on them, and how many catalogs are unused — as whole phrases in
  `font-mono tabular-nums`, as `Events`' strip does. It MUST redraw against the
  active search.
- **FR-007**: Each row MUST carry exactly one control other than the row itself:
  a quiet icon button opening the manage drawer, with an accessible name naming
  the catalog.
- **FR-008**: The page MUST NOT render any `window.prompt`, `window.confirm` or
  `window.alert`.
- **FR-009**: The two tabs MUST be labelled **Rental catalogs** and **Owned
  gear**, and the panel title MUST repeat the tab name. The sidebar item, the
  page header and the `/inventories` route are unchanged.

### The counts (US2)

- **FR-010**: `GET /inventories` MUST return, per catalog, the number of items,
  the number of categories, and the number of events bound to it.
- **FR-011**: The event count MUST be computed by the same query that guards
  deletion, so the number shown and the refusal that follows cannot disagree.
- **FR-012**: Rendering the list MUST NOT issue a request per row. The per-row
  `listItems` call MUST be gone.
- **FR-013**: A catalog bound to no event MUST render `—` in the muted ink, not
  `0` — *empty and expected*, per patterns §5. Item and category counts of zero
  render `0`.
- **FR-014**: `GET /inventories/{inventoryID}/events` MUST return every event
  bound to that catalog — id, name, venue and start date — ordered by start date
  ascending, behind the existing owner-only guard.

### The manage drawer (US3)

- **FR-020**: One `ui/Drawer` at `width="narrow"` MUST serve creating a catalog
  and managing one, opened from the row's control and from a **Manage** control
  in the catalog panel's own bar.
- **FR-021**: The drawer's contents MUST be built from `ui/GearList` —
  `DrawerSection`, `GearCard`, `GearSpecs`/`Spec`, `GearForm`, `FieldStack`,
  `FormActions` — with `Button size="xs"` and `Input size="sm"`. No
  navigation-tier field or button may appear inside it.
- **FR-022**: The catalog's card MUST state its name, source file, item count,
  category count, format and creation date. No form control may appear in the
  card itself.
- **FR-023**: Renaming MUST happen in the drawer's form and MUST persist on
  confirm. Creating MUST use the same form construction with an empty name.
- **FR-024**: Duplicating MUST be the *Catalog* section's action control, and
  the drawer's footer MUST state that the copy carries every category and item
  and no event bindings.
- **FR-025**: A delete control MUST NOT render for a catalog bound to one or
  more events. It MUST NOT render disabled.
- **FR-026**: For a catalog bound to no event, the delete control MUST sit apart
  from the confirm control, and pressing it MUST ask in place — inside the form,
  full width, naming the catalog and its item count — never in a dialog.
- **FR-027**: A *Used on* section MUST list **every** bound event, oldest first,
  each showing name, venue and start date. It MUST NOT carry a maximum height;
  the drawer body scrolls.
- **FR-028**: Each listed event MUST be a real link to `/events/{id}` that
  closes the drawer, so it can be opened in a new tab.
- **FR-029**: The section MUST state, in one sentence, that a catalog cannot be
  deleted while an event uses it.
- **FR-030**: Renaming, duplicating or deleting MUST refresh the list; deleting
  MUST return the user to the list.
- **FR-031**: A failed mutation MUST surface inline, above the content it
  concerns, in the reserved error block — never a toast and never a browser
  dialog.

### Search (US4)

- **FR-040**: The bar MUST carry a search field in patterns §1's order — title,
  search, `flex-1`, the one primary action — at `Input size="sm"` with the
  leading icon.
- **FR-041**: Search MUST match catalog name and source filename, through the
  shared `matchesSearch` helper.
- **FR-042**: The field MUST NOT render when the account has no catalogs.
- **FR-043**: A search matching nothing MUST replace the rows with one sentence
  naming what was searched for, keep the field's contents, and leave the strip
  counting `0 of N`.
- **FR-044**: Search MUST be client-side over the already-loaded list. No
  request, no query parameter.

### The phone (US5)

- **FR-050**: Below the mobile breakpoint the list MUST render as touch-height
  rows carrying name, item and category counts, source, and a `Badge` showing
  the event count or `unused`.
- **FR-051**: The mobile catalog screen MUST offer the same manage drawer; the
  phone list itself carries no per-row control.

### Boundaries

- **FR-060**: Nothing in `components/ui/` may change. Every primitive this
  slice needs already exists.
- **FR-061**: The catalog sheet, its category rail, and the Categories and
  Import drawers are unchanged except for the added **Manage** control in the
  bar.
- **FR-062**: Owned gear is unchanged apart from its tab label.
- **FR-063**: No migration. The three counts are computed, never stored.

### Key Entities

- **Inventory**: an owned catalog of equipment and prices. Gains three derived
  counts on the list payload — items, categories, and bound events — none of
  them stored.
- **Event binding**: an event's `inventory_id`. Already the delete guard; now
  also a column, a section, and a set of links.

## Assumptions

- A user has single-digit catalogs today; the search field is added for growth
  rather than for the current count, at the user's explicit instruction.
- Every event bound to a catalog belongs to that catalog's owner, since the
  create form only offers catalogs the user owns. The drawer therefore lists
  events the owner can already see.
- Catalog names are not unique and this slice does not make them so.
- `matchesSearch` (`lib/patchSearch`) is the shared helper the other five search
  fields use, and needs no change.
- The `Manage` control in the catalog panel's bar is owner-only, which the route
  already guarantees — the whole `/inventories/{id}` management surface is
  behind `RequireInventoryOwner`.

## Out of Scope

- **Sorting, or clickable column headers.** Five rows in name order do not need
  it; the day they do is the day search earns its place twice over.
- **An archive state.** A catalog is used or it is not, and *Used on* says
  which. A third status would be a flag to keep in sync with a fact.
- **A default catalog for new events.** The create form already picks the only
  one when there is only one; choosing among several is a decision per show.
- **Rebinding an event to another catalog.** That happens on the event and is
  unchanged here — the drawer's links are how you get there.
- **Bulk delete of unused catalogs.** The strip names the number; deleting them
  is one drawer each.
- **Renaming the `/inventories` route or sidebar item.**

## Success Criteria

- **SC-001**: The catalog list renders as **one** bordered frame, down from one
  per catalog.
- **SC-002**: Rendering the list issues **one** request, down from one plus one
  per catalog — 309 rows of JSON per imported catalog no longer cross the wire
  to produce a three-character count.
- **SC-003**: The application contains **zero** `window.prompt`/`window.confirm`
  calls, down from two.
- **SC-004**: Each row carries **one** control besides itself, down from three.
- **SC-005**: A user can tell which catalogs no event uses without opening
  anything.
- **SC-006**: Attempting to delete a catalog that events depend on is
  impossible from the interface, and the reason is on screen with a link to each
  event that holds it.
- **SC-007**: With forty events bound to one catalog, every one is reachable in
  the drawer without a nested scrollbar.
- **SC-008**: All gates pass: `go vet`, `go test ./...`, `tsc -b`, `eslint`,
  `vitest`.
