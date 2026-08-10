# equipment-line-composition Specification

## Purpose
Governs how a planner chooses catalog items when adding equipment lines to an event — one at a
time or several in a batch, on a desk or in a hand — and how the resulting lines are read back
on the Equipment sheet so that two items with the same name remain distinguishable.
## Requirements
### Requirement: The item chooser distinguishes items sharing a name

Choosing a catalog item SHALL present each candidate's description alongside its name, so that
two catalog items with the same name and different descriptions are distinguishable without
opening either.

#### Scenario: Two items share a name

- **WHEN** the catalog holds several items named `Mikrofonkabel` differing only by description
- **THEN** each is presented with its own description (`0,5m`, `7,5m`, `Tele-XLR hane`)
- **AND** no two presented candidates are textually identical

#### Scenario: An item has no description

- **WHEN** a candidate item has an empty or absent description
- **THEN** its name is presented alone, with no placeholder standing in for the missing value

### Requirement: The catalog can be searched and filtered while choosing

The item chooser SHALL offer a text search and a category filter over the catalog being chosen
from, and the search SHALL match against both an item's name and its description.

#### Scenario: Searching by a term that appears only in a description

- **WHEN** the planner searches for `7,5`
- **THEN** the item named `Mikrofonkabel` whose description is `7,5m` is among the matches

#### Scenario: Filtering by category

- **WHEN** the planner selects a category
- **THEN** only that category's items are listed, and the count of matches is stated

#### Scenario: A category holding no items

- **WHEN** the catalog contains a category with no items in it
- **THEN** that category is not offered as a filter

#### Scenario: No item matches

- **WHEN** a search within a category yields nothing
- **THEN** the planner is told so, and is offered the same search across the whole catalog

### Requirement: Stock is stated at the point of choosing

Each candidate item SHALL state its available quantity — the rental catalog's available stock
for a rented line, the owned quantity for an owned line — and a quantity of zero SHALL be stated
plainly rather than withheld, greyed, or used to hide the item.

#### Scenario: An item is out of stock

- **WHEN** a candidate item has an available quantity of zero
- **THEN** it is listed with its quantity shown as zero and remains choosable

### Requirement: One item can be chosen in a single gesture

Choosing exactly one item SHALL NOT cost more interaction than the interface it replaces:
selecting a candidate by its name SHALL choose that item and dismiss the chooser.

#### Scenario: Choosing a single item

- **WHEN** no items are currently held in a batch and the planner selects a candidate by name
- **THEN** that item becomes the chosen item and the chooser closes

### Requirement: Several items can be chosen in one visit

The chooser SHALL allow several items to be accumulated without closing, and SHALL confirm the
accumulated selection as a single act distinct from saving it to the plan.

#### Scenario: Accumulating a batch

- **WHEN** the planner marks several candidates in turn
- **THEN** the chooser remains open, the count of marked items is stated, and a confirmation is
  offered

#### Scenario: A batch is under way

- **WHEN** at least one candidate is already marked and the planner selects a candidate by name
- **THEN** that candidate is added to the batch rather than closing the chooser and discarding it

#### Scenario: Nothing is marked

- **WHEN** no candidate is marked
- **THEN** no confirmation is offered, because there is nothing to confirm

#### Scenario: Re-opening the chooser after a batch

- **WHEN** the planner re-opens the chooser while holding several items
- **THEN** every held item is still marked, so the batch can be widened or narrowed

### Requirement: Confirming a selection does not commit it to the plan

Confirming the chooser's selection SHALL only carry the chosen items into the pending line
editor. Nothing SHALL be written to the event until the planner saves the editor.

#### Scenario: Confirming then abandoning

- **WHEN** the planner confirms a selection of five items and then cancels the editor
- **THEN** no equipment line has been created on the event

### Requirement: Each line in a batch carries its own quantity

Where several items are chosen at once, the pending editor SHALL present one line per item, each
with its own quantity, under a single confirmation.

#### Scenario: Five items chosen

- **WHEN** five items are confirmed
- **THEN** the editor presents five lines, each independently editable, saved by one action

#### Scenario: A batch line's default quantity

- **WHEN** a line arrives from a batch of more than one item
- **THEN** it defaults to a quantity of one, in the department its category implies — a category
  typed as lighting defaults to the lighting quantity, every other category to the audio
  quantity — and every value remains editable before saving

#### Scenario: A single item's quantity is unchanged from today

- **WHEN** exactly one item is chosen
- **THEN** the editor is the single-line editor it is today, and a rented line's quantities
  start at zero and MUST be typed before the line can be saved

#### Scenario: Changing the source with a batch held

- **WHEN** the planner changes the line's source while holding a batch
- **THEN** the batch is cleared, because the two sources are different catalogs with different
  quantity shapes

### Requirement: An item already on the sheet cannot be silently overwritten

Because an equipment line is keyed on its item, re-choosing an item the event already has would
replace that line's quantity rather than adding a second line. The chooser SHALL state which
candidates are already on the sheet, and SHALL NOT offer them for selection.

#### Scenario: A candidate is already planned

- **WHEN** the event already has a line for a candidate item
- **THEN** that candidate states that it is on the sheet, together with its planned quantity
- **AND** it offers no means of selection — the affordance is absent, not disabled

### Requirement: Saving a batch reports what landed

Saving several lines SHALL attempt every line, SHALL NOT stop at the first failure, and SHALL
leave the planner able to retry only what failed.

#### Scenario: Every line saves

- **WHEN** all lines save successfully
- **THEN** the editor closes and every line appears on the sheet

#### Scenario: Some lines fail

- **WHEN** three of five lines save and two fail
- **THEN** the three appear on the sheet, the editor stays open holding only the two that failed
  with their quantities intact, the error names what did land, and confirming again retries only
  the remainder

### Requirement: The default source is the catalog that has contents

A new equipment line SHALL default to the rented source.

#### Scenario: Opening a new line

- **WHEN** the planner begins adding an equipment line
- **THEN** the source is `rented`, and the quantity fields presented are the rented ones
- **AND** the order in which the sources are offered is unchanged

### Requirement: A planned line is read back by what it is, not only by its name

The Equipment sheet SHALL show each line's description, so that two lines chosen from
same-named catalog items remain distinguishable after they are planned.

#### Scenario: Two same-named lines on the sheet

- **WHEN** the sheet holds lines for `Mikrofonkabel 0,5m` and `Mikrofonkabel 20m`
- **THEN** the two rows are distinguishable without opening either

#### Scenario: A line has no description

- **WHEN** a planned line's item has no description
- **THEN** the sheet states the absence in the same way it states any other missing column value

#### Scenario: Searching the planned lines

- **WHEN** the planner searches the Equipment sheet for `7,5`
- **THEN** the line whose item description is `7,5m` matches

#### Scenario: A line is read on a phone

- **WHEN** a planned line is shown in the phone's condensed list
- **THEN** its description is stated where its type would otherwise be, the type standing in
  only when there is no description
- **AND** an over-owned warning is never dropped to make room for other detail

### Requirement: Choosing an item never discards the line being composed

The chooser opens from within a line being composed. Dismissing the chooser SHALL dismiss only
the chooser, leaving the pending line and every value typed into it intact.

#### Scenario: Dismissing the chooser

- **WHEN** the planner dismisses the chooser by any means the surface offers — a close control,
  the surrounding backdrop, or the keyboard's cancel key
- **THEN** the chooser closes and the pending line editor remains open, unchanged

#### Scenario: Cancelling twice

- **WHEN** the planner presses the cancel key twice with the chooser open
- **THEN** the first press closes the chooser and the second cancels the line

#### Scenario: Choosing by keyboard alone

- **WHEN** the planner navigates the chooser with the keyboard
- **THEN** the search, each candidate's selection control and each candidate's name are all
  reachable, marking and choosing are separately actuable, and dismissing returns focus to the
  field that opened the chooser

### Requirement: An empty catalog explains itself

The chooser SHALL open regardless of whether the catalog has contents, and SHALL distinguish a
catalog that is empty from one that has not loaded yet.

#### Scenario: The catalog is still loading

- **WHEN** the chooser opens before the catalog has arrived
- **THEN** it states that the catalog is loading, and does not claim the catalog is empty

#### Scenario: The catalog is genuinely empty

- **WHEN** the catalog has loaded and holds nothing
- **THEN** the chooser opens and states that it is empty, rather than refusing to open

