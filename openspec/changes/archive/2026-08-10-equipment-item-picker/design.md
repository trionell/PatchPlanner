## Context

See `proposal.md` — Why. The visual design is settled: `mockup.html` in this directory was
approved by the user in a real user turn, and its 55 numbered decisions are the source this
document implements. Grep it; it is 3,339 lines and must never be read whole.

Three constraints shape the approach and none of them are negotiable here:

- The add editor is `RowEditor` inside a `<td colSpan>` at the foot of `EquipmentSheet`. It
  already binds `Escape` to cancel and `⌘/Ctrl+Enter` to save.
- Below 768 px the add form is a `ui/Sheet`, and `ui/Drawer` *is* a bottom `ui/Sheet` at that
  width. A picker overlay opening from the add form is therefore a sheet over a sheet.
- Both write endpoints are PUTs keyed on `(event, item)`. There is no create-vs-update
  distinction to lean on, so re-choosing a planned item overwrites it.

## Goals / Non-Goals

**Goals**

- One catalog picker serving both catalogs and both reaches, built from existing pieces.
- The single-item path costs exactly what it costs today — three interactions.
- The design-language additions are written into `design/` in the same commit as the code.

**Non-Goals**

- No new endpoint, no migration, no change to the API contract.
- No recents, no favourites, no create-an-item-from-inside-the-picker.
- The Rental Order tab's own sheet is untouched; it already shows a description.
- Editing an existing line is untouched, including its source staying fixed.

## Decisions

### The picker is a `ui/Drawer`, not a `ui/Dialog`

`components.md` §`ui/Dialog`'s *interrupts vs accompanies* test, applied literally, does not
separate this picker from the cable pickers that are `Dialog`s — both raise one choice mid-form.
The user ruled Drawer. The distinguishing clause, which this change writes into `design/`, is
that a vocabulary of eight cable types is **answered** while a catalog of 338 across 27
categories is **worked in**: you search it, filter it, and now accumulate from it. The read-only
browse of these exact rows is already a `Drawer` on that same reasoning.

*Alternative considered:* `ui/Dialog`, rejected by the user's ruling and weakened further by
multi-select — an overlay you tick five things in is not an interruption by any reading.

### The overlay renders beside `RowEditor`, never inside it

React events bubble the React tree, not the DOM tree. A drawer rendered inside the editor's
children delivers `Escape` to both handlers — closing the picker *and* discarding the add. Making
them siblings fixes it with no prop, no `stopPropagation`, and no ordering assumption. Escape
twice means picker, then add.

*Alternative considered:* `stopPropagation` in the drawer's key handler. Rejected — it makes
correctness depend on handler order, and it silently breaks the next overlay that nests.

### Two gestures per row, not one gesture plus a confirm

The row's **name** chooses and closes; the row's **tick** accumulates and keeps the drawer open.
Once anything is ticked, the name ticks too, because closing on a name click would throw the
batch away. This is `patterns.md` §4's existing split — the label selects, the dot cables — and
it is what keeps the one-item path at today's three interactions.

*Alternative considered:* one gesture plus a mandatory confirm, which is simpler to explain but
charges every single-item add an extra click to serve the batch case. Explicitly rejected by the
user (ruling E). If the two gestures prove too subtle in use, that fallback is the retreat.

### Quantities live in the editor, never in a picker row

`patterns.md` §2 forbids a permanent `<input>` in a scannable row — the lighting-fixture failure
— and 338 rows is a worse place to repeat it. The tick is a *selection state*, not a value.

Nor are quantities "corrected on the sheet afterwards": that trades five overlay interactions
for five row-editor opens and leaves the plan briefly stating quantities nobody chose.

So the editor grows one line per chosen item under a single confirm. **At N = 1 it is literally
today's editor** — the per-line fields only move into a block once there is more than one line.

### A batch line defaults to 1; a single line does not

Ruling B, and it is a deliberate divergence from the mockup as drawn. A batch of five defaults
each line to `1` in the department its category implies (`category_type === 'lighting'` → Light,
everything else → Audio — a hard-coded two-department assumption, declared in the proposal's
Constitution Check). That is what makes the fast path *tick five, confirm, save*.

A **single** rented add keeps today's `0 / 0` and will not save until a quantity is typed. The
two paths differ on purpose: the mockup would have let the batch's default leak into the single
path, changing existing behaviour nobody asked to change.

### Already-planned items are absent from selection, not disabled

P7's own preferred shape. A planned candidate carries no tick and its name does not choose; it
states `on the sheet · N` — beside the name on a desk where `PanelRailRow` puts a qualifier, in
`CondensedListRow`'s `trailing` slot in a hand. A category whose every item is planned is **not**
an empty state: every row still renders, and the footer simply never appears.

### The batch save is N sequential calls, and does not stop at the first failure

No new endpoint, so no backend change for the batch — just the existing PUTs in a loop, with one
query invalidation at the end rather than N. Sequential rather than parallel: N is small, and a
predictable order makes the partial-failure message truthful about what landed.

On partial failure the editor stays open holding **only what failed**, quantities intact, its
confirm re-reading `Add 1 line` so pressing again retries exactly the remainder. The error names
what *succeeded* first, because that is the fact the user cannot see from behind the editor.

*Alternative considered:* a transactional batch endpoint. Rejected under Principle V — it adds an
endpoint and a migration-shaped problem to solve a failure mode that partial retry already
handles.

### `ui/RecordField` is extracted at its first caller

Against the project's own extract-at-the-second-caller rule, and declared as such in the
proposal's Constitution Check. The justification is that it is an approved *design-language*
addition rather than speculative reuse: the picker needs a control that stands for a chosen
record, and `ui/Select` cannot be one. Its contract is *names what it holds* — empty it invites,
holding one record it reads `name · description`, holding several it reads `N items`.

### The phone picker is a second sheet layer

The add sheet stays mounted, so the draft survives. Replacing its contents in place would need a
back control and a navigation stack inside a component that has six props on purpose. The
construction already ships — D4's browse holds a `MobilePicker` that opens a sheet, and
`useEscapeToClose` already maintains an overlay stack. Two scrims stacking is what makes the
layers read as depth.

### The backend delta is a select list, not a schema change

`owned_items.description` has existed since migration `011`; `EventOwnedEquipment` simply never
selected it, while `EventRental` always did. So: one field on the domain struct, the column added
to **both** select lists in `internal/db/owned.go` (the list query and the single-row query), and
one argument on `scanEventOwnedEquipment`. `COALESCE(o.description, '')` matches how that file
already handles every other nullable column, keeping the domain struct free of `sql.Null*`.

### The phone subtitle is ranked, not appended

It already joins five things onto one line; the description would be a sixth. So `type` loses its
standing slot to the description — the description is the specific fact `type` was standing in
for — and keeps it whenever the description is empty. The over-owned warning is conditional and
never dropped to make room: an alarm outranks detail.

## Risks / Trade-offs

- **The two gestures may not be discoverable.** A user may not find the tick, and will simply
  keep adding items one at a time — which still works and costs nothing extra. → Mitigated by the
  single path remaining fully functional; the retreat is one-gesture-plus-confirm.
- **A batch of N is N round trips.** A batch of twenty is twenty requests. → N is bounded by what
  a person will tick in one visit; sequential keeps the failure story truthful. Revisit only if a
  real batch proves slow.
- **The two quantity paths differ** (batch defaults to 1, single does not). Someone who learns the
  batch behaviour first may be surprised the single add demands a number. → The user's explicit
  ruling; the alternative changed existing behaviour silently.
- **Two stacked sheets on a phone.** Deeper than any current surface. → The stack and its escape
  handling already exist; the add sheet stays mounted so nothing is lost if the layer is
  dismissed.
- **`ui/Drawer` does not store a focus return target** the way `ui/Sheet` does. Returning focus to
  the field on close needs that, so the drawer gains it. → A small, contained addition to a
  component with existing tests.
- **Five `design/` edits** land in this change. → They are enumerated in the proposal and in
  tasks, and each was named in the approved mockup; none is drafted here.

## Migration Plan

None. No schema change, no data backfill, no API version. The change is additive to the sheet's
columns and replaces one form control; an event planned before it reads identically after it,
with a description now shown where the catalog has one.
