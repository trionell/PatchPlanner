## Purpose

Governs how an Audio Inputs source of kind "mic" is linked to an inventory
item: which inventory categories can supply mic options, whether a mic source
may exist before an item is chosen, and what kind a newly created source
defaults to.

## ADDED Requirements

### Requirement: Mic options are sourced from picker-role categories
The set of inventory items offered as "Mic" choices for a source SHALL be
every non-discontinued item whose category has `picker_role = 'mic'` in the
source's event inventory. The system SHALL NOT determine mic eligibility by
matching a category's name against a fixed string.

#### Scenario: Category assigned the mic role supplies mic options
- **WHEN** an inventory category has `picker_role` set to `'mic'` and contains
  items
- **THEN** those items appear as selectable options in a source's "Mic" field

#### Scenario: No category holds the mic role
- **WHEN** no inventory category in the event's bound inventory has
  `picker_role = 'mic'`
- **THEN** the source's "Mic" field offers no items (only the unassigned
  placeholder), regardless of any category's name

#### Scenario: A differently-named category can supply mics
- **WHEN** an inventory category named anything other than "Mikrofon..." (for
  example "Vocal Mics") has `picker_role` set to `'mic'`
- **THEN** its items appear as selectable mic options

### Requirement: Inventory categories can be assigned the mic picker role
`'mic'` SHALL be a valid value for `inventory_categories.picker_role`,
assignable and clearable through the same category role control used for the
existing `'cable'`, `'stand'`, and `'truss'` roles.

#### Scenario: Assigning the mic role
- **WHEN** a user sets an inventory category's role to "Mic" in the category
  editor
- **THEN** the category is saved with `picker_role = 'mic'` and its items
  become eligible mic options

#### Scenario: Rejecting an unknown role
- **WHEN** a category role is set to any value other than empty, `cable`,
  `stand`, `truss`, or `mic`
- **THEN** the request is rejected as invalid

### Requirement: A mic source may exist without an assigned item
A source of kind `"mic"` SHALL be a valid, saveable state whether or not
`mic_item_id` is set. The system SHALL NOT require `mic_item_id` to be
non-null as a condition of a source's kind being `"mic"`.

#### Scenario: Creating a mic source with no item yet
- **WHEN** a source is created or saved with `kind: "mic"` and no
  `mic_item_id`
- **THEN** the save succeeds and the source is stored as an unassigned mic
  source

#### Scenario: Attaching an item afterward
- **WHEN** an existing unassigned mic source is updated with a valid
  `mic_item_id` from a `'mic'`-role category
- **THEN** the save succeeds and the source is now associated with that item

#### Scenario: An unassigned mic source is excluded from rental counts
- **WHEN** rental quantities are computed for an event containing an
  unassigned mic source
- **THEN** that source contributes no quantity for any inventory item

#### Scenario: Line sources still forbid mic-only fields
- **WHEN** a source of kind `"line"` is saved with `mic_item_id`,
  `stand_item_id`, or `phantom_power` set
- **THEN** the save is rejected, unchanged from existing behavior

### Requirement: A newly created source defaults to kind "mic"
When a source is created from the Audio Inputs flow graph without the user
having chosen a kind, its kind SHALL default to `"mic"` with no
`mic_item_id` attached.

#### Scenario: Adding a source from the graph
- **WHEN** a user adds a new source on the Audio Inputs flow graph
- **THEN** the created source has `kind: "mic"` and no mic item attached,
  ready for the user to attach one or switch it to "Line"
