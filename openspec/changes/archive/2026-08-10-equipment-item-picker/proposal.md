## Why

Adding an equipment line means choosing from a native `<select>` whose options read
`category — name` and nothing else. The catalog bound to a live event holds **338 items in 27
categories**, and **fifteen of them are named `Mikrofonkabel`** — they differ only by
`description` (`0,5m`, `7,5m`, `Tele-XLR hane`), which the option label throws away. 62 such
collisions exist across the four catalogs in the database. The planner is asked to tell fifteen
identical options apart, then scroll 338 rows to find them, with no search and no category
filter.

The same blindness runs the other way. The Equipment sheet's own rows show the name alone, so
two lines from two different cables read as two identical rows — `RentalSheet` has carried a
Description column for the same rented line since Slice 28.

And `owned_items` is empty in every catalog, so today's default source of `owned` opens the
picker onto no options at all.

## What Changes

- The Item field stops being a `<select>` and becomes **`ui/RecordField`**, a control that names
  what it holds — one record as `name · description`, or `N items` — and opens an overlay.
- That overlay is the existing read-only catalog browse with its rows switched on: a category
  rail, a sticky search matching **name and description**, and columns Item · Description · Stock.
- **Several items can be chosen in one visit.** Clicking a row's *name* chooses it and closes;
  clicking its *tick* batches it and keeps the overlay open. The add row then becomes N rows,
  each with its own quantity, under one confirm.
- An item **already on the sheet** is stated as such and cannot be re-chosen — both endpoints are
  PUTs keyed on item id, so re-picking one would silently overwrite its quantity.
- The default source becomes **`rented`**, the catalog that has anything in it.
- The Equipment sheet gains a **Description column**, its search gains `description`, and the
  phone subtitle is re-ranked so the description takes the slot `type` was standing in for.

No behaviour is removed. Editing an existing line is untouched; a line's source still cannot be
changed, because that is a move and not an edit.

## Capabilities

### New Capabilities

- `equipment-line-composition`: how an equipment line is chosen from a catalog — single and in
  batch, at both reaches — and how the resulting line is read back on the sheet.

### Modified Capabilities

None. No existing capability in `openspec/specs/` describes this surface.

## Impact

**Frontend.** `components/event/EquipmentSheet.tsx` (the `AddEquipmentLine` editor, the sheet's
columns, its filter), `components/mobile/MobileEquipmentEditSheet.tsx`, `components/event/EquipmentTab.tsx`
(the phone subtitle), `lib/equipmentRows.ts` (`EquipmentRow` gains `description`), plus two new
components — `ui/RecordField` and the catalog picker.

**Backend — one field, no migration.** `EventOwnedEquipment` carries no description while
`EventRental` already does. `owned_items.description` has existed since migration `011`, so this
is a select-list and scan change, not a schema change: `internal/domain/owned.go` gains the
field, and `internal/db/owned.go` adds the column to **both** select lists (lines 72 and 99) and
an argument to `scanEventOwnedEquipment` (line 133).

**`design/` — five edits, in the same commit as the code.** `components.md` §4 gains
`ui/RecordField`; `components.md` §`ui/Dialog` gains the clause distinguishing a Drawer picker
from a Dialog picker; `patterns.md` §4's filter rail becomes the fifth instance; `patterns.md` §2
gains the overlay-beside-the-editor rule and the N-lines-under-one-confirm rule; `patterns.md`
§7b gains the open-search-field exception.

**No API contract changes.** The batch save is N calls against the existing
`putEventOwnedEquipment` / `putManualRental` PUTs. No new endpoint.

## Constitution Check — Principles I–V

**I. Domain-First Data Model.** Reinforced. The change exists because a `Mikrofonkabel` of 0,5 m
and one of 20 m are different real-world objects that the interface was rendering as one. Adding
`description` to the owned line makes the sheet name the object rather than its class. No new
entity, no free-text field replacing a relationship.

**II. Extensibility by Design.** No new hard-coded type. The category rail derives
`{label, qualifier, count}` from either catalog without branching on which — five fixed
`category_type` values or 27 free-form category names are the same shape to it. One departure is
declared below.

**III. Full-Stack Monorepo Architecture.** Unchanged. Backend edits stay in `domain/` and `db/`;
`domain/` keeps its plain structs with no DB tags.

**IV. Inventory-Driven Rental Workflow.** Reinforced. Every chosen line still references a
catalog item; stock is now *shown at the point of choosing* rather than only reported after the
fact, so a quantity is checked against available stock earlier than before. Nothing is dropped
or hidden — a stock of `0` is stated, never greyed or withheld.

**V. Pragmatic Simplicity.** `ui/RecordField` is extracted at its **first** caller rather than
its second, which is the project's own stated rule for `ui/PanelRail` and `MobilePicker`. It is
justified as a design-language addition the user has approved, not as speculative
infrastructure: the picker needs a control that names a record, and `ui/Select` cannot be one.
The picker itself reuses `PanelCols` / `PanelRail` / `SheetTable` / `ui/Drawer` and introduces no
new pattern — it is the fifth instance of an existing one. No new dependency, no new endpoint,
no new state library; the batch draft is `useState`, the catalog is React Query.

### Declared deviation

Decision 29 maps `category_type === 'lighting'` to the Light quantity and **everything else to
Audio**. That is a hard-coded two-department assumption, which Principle II would otherwise
resist. It is confirmed by the user as correct for this tool — the rental order has exactly two
departments and audio is the general one — and it sets a *default* that is overridable on every
line before saving, never a constraint. Recorded here rather than left implicit.
