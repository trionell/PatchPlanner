# Feature Specification: Lighting Rig Workflow — Fixture IDs, Mode Picking & Bulk-Add

**Feature Branch**: `007-lighting-fixture-workflow`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "Roadmap slice 7 — (5) On lighting rig I want a new attribute for
fixture ID (to be used with GrandMA). (6) When adding a fixture, the modal that appears does not
include the available modes of the selected fixture from the inventory where I have added modes.
Modes are however available in the table once the fixture is added. (7) Add a feature to
bulk-add fixtures. It should auto-set as much as possible. For example fixture ID should
increment from the value that is provided as start. Mode should be same for all etc."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Give every fixture a console fixture ID (Priority: P1)

The lighting planner assigns each rig fixture a numeric fixture ID — the number the fixture is
patched under in the lighting console (GrandMA). The ID is set directly in the rig table, shows
up on the printed lighting rig sheet, and travels with the fixture so the paper patch, the
planning tool, and the console all speak the same numbers at load-in.

**Why this priority**: The fixture ID is the lingua franca between the plan and the console —
without it the printed sheet cannot be used to patch the desk. It is also the foundation the
bulk-add auto-numbering (US3) builds on.

**Independent Test**: Add fixtures, type fixture IDs on their rows, reload the page and verify
the IDs persist, and print the lighting sheet to see a Fixture ID column.

**Acceptance Scenarios**:

1. **Given** a rig with fixtures, **When** the planner enters fixture ID 101 on a row, **Then**
   the value persists and reappears after a reload.
2. **Given** fixtures with IDs, **When** the planner prints the lighting rig sheet, **Then**
   each row shows its fixture ID.
3. **Given** two fixtures accidentally given the same ID, **When** the planner views the rig
   table, **Then** the duplicates are visibly flagged (the console would reject them) — but the
   tool does not block saving, since the planner may be mid-renumbering.
4. **Given** an existing event planned before this change, **When** the planner opens its rig,
   **Then** all fixtures simply have no ID yet and can be numbered at any time.

---

### User Story 2 - Pick a defined DMX mode while adding a fixture (Priority: P2)

When the planner adds a fixture and selects a catalog model that has DMX modes defined on the
Inventory page, the add dialog offers those modes to pick from — exactly like the rig table
already does — instead of a free-text mode name and a manually typed channel count. Picking a
mode fills the name and channel count; free-text entry remains available for models without
defined modes and for custom fixtures.

**Why this priority**: Today's behavior is a defect: the modes the user carefully defined are
ignored at the moment they are most useful, and the fixture must be edited right after being
added. Small fix, immediate irritation removed.

**Independent Test**: Define two modes on a catalog model, open Add Fixture, select that model,
and verify the modes appear and picking one fills name + channel count; select a model without
modes and verify free text still works.

**Acceptance Scenarios**:

1. **Given** a catalog model with modes "Basic (8 ch)" and "Extended (16 ch)", **When** the
   planner selects that model in the Add Fixture dialog, **Then** both modes are offered and
   picking "Extended" sets the mode name to "Extended" and the channel count to 16 before the
   fixture is created.
2. **Given** a catalog model with no defined modes, **When** it is selected in the dialog,
   **Then** the mode name and channel count remain freely editable as today.
3. **Given** a custom fixture (typed name, no catalog model), **When** the dialog is used,
   **Then** free-text mode entry applies.
4. **Given** a picked mode, **When** the planner switches the dialog to a different model,
   **Then** stale mode values do not leak — the mode offer follows the newly selected model.

---

### User Story 3 - Bulk-add a batch of identical fixtures (Priority: P2)

The planner adds many units of the same model in one step: pick the catalog model, how many,
and the shared settings (DMX mode, truss section, universe, power connection), plus a starting
fixture ID. The tool creates the whole batch with everything auto-set: fixture IDs increment
from the start value, positions continue along the truss, and DMX addresses are assigned
sequentially so the batch is patch-ready without touching each row.

**Why this priority**: Rigs routinely contain 8–20 identical wash/beam units; adding them one
by one and hand-numbering every attribute is the single most repetitive task in lighting
planning. Depends on US1 for the ID numbering.

**Independent Test**: Bulk-add 8 units of a model with a mode, starting fixture ID 101, into
one truss section and universe; verify 8 rows exist with IDs 101–108, the same mode, sequential
DMX addresses, and positions appended in order.

**Acceptance Scenarios**:

1. **Given** the bulk-add form with model, quantity 8, mode "Extended (16 ch)", truss "Front",
   universe 2, and start fixture ID 101, **When** the planner confirms, **Then** 8 fixtures are
   created with fixture IDs 101–108, all in "Front" on universe 2 with mode Extended/16, with
   sequential DMX start addresses, appended after existing fixtures in position order.
2. **Given** existing fixtures already occupy DMX addresses on the chosen universe, **When** a
   batch is bulk-added, **Then** the new addresses continue after the occupied range; if the
   batch would exceed the universe's 512 channels, the operation is rejected with a clear
   message and nothing is created (all-or-nothing).
3. **Given** the rig already uses fixture IDs up to 108, **When** the planner opens bulk-add,
   **Then** the suggested start ID is the next free number (109), still editable.
4. **Given** a batch was just created, **When** the planner reviews the rows, **Then** each row
   is individually editable afterwards like any other fixture (no special linkage).
5. **Given** quantity 1, **When** bulk-add is used, **Then** it behaves like a fully pre-filled
   single add.

---

### Edge Cases

- Duplicate fixture IDs: flagged wherever fixtures are listed (rig table), but never blocking —
  renumbering passes through duplicate states. The printed sheet prints whatever is set.
- Fixture ID is optional: rows without an ID print an empty cell and are never flagged.
- Bulk-add with a start ID that collides with existing IDs: the batch is still created as
  requested (the planner chose the start), and the resulting duplicates are flagged like any
  others.
- Bulk-add of a model with no defined modes: mode name/channel count are entered as free text
  once and applied to the whole batch.
- Bulk-add without a truss section (rig-level fixtures) is allowed — positions continue in the
  unassigned group.
- Universe overflow (batch does not fit in the remaining address space): rejected up front,
  nothing partially created; the existing per-universe 512-channel rule applies unchanged.
- A quantity above the sensible maximum (e.g. more than 100) is rejected — protects against
  typos creating hundreds of rows.
- Power in bulk-add uses one shared choice (e.g. grid + connector); daisy-chaining individual
  units to each other remains a per-row edit afterwards, as chaining topology is rig-specific.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every rig fixture MUST carry an optional numeric fixture ID, editable in the rig
  table and persisted with the fixture.
- **FR-002**: The printed lighting rig sheet MUST include a Fixture ID column showing each
  row's ID (empty when unset).
- **FR-003**: Duplicate fixture IDs within one rig MUST be visibly flagged in the rig table
  without blocking any operation.
- **FR-004**: The Add Fixture dialog MUST offer the selected catalog model's defined DMX modes;
  picking one fills the mode name and channel count before creation. Models without modes and
  custom fixtures keep free-text mode entry. Switching models in the dialog MUST refresh the
  offered modes and not carry stale picks over.
- **FR-005**: A bulk-add action MUST create N fixtures of one catalog model in a single
  operation, with shared values applied to every unit: DMX mode (picked or free text), truss
  section (or none), DMX universe, and power connection/connector.
- **FR-006**: Bulk-add MUST auto-number fixture IDs incrementally from a planner-provided
  start value, and MUST suggest the next free ID in the rig as the default start.
- **FR-007**: Bulk-add MUST assign sequential DMX start addresses on the chosen universe,
  continuing after already-occupied addresses, honoring each unit's channel count.
- **FR-008**: Bulk-add MUST be all-or-nothing: if the batch cannot be placed (universe address
  space exceeded, invalid quantity), nothing is created and the reason is shown.
- **FR-009**: Bulk-add MUST append the batch's positions after existing fixtures (within the
  chosen truss section's ordering), and each created fixture MUST be an ordinary, individually
  editable row afterwards.
- **FR-010**: Bulk-add quantity MUST be limited to a sane range (1–100).
- **FR-011**: Existing rigs and fixtures MUST be unaffected by the upgrade: no fixture gains an
  ID automatically, and all current behavior (single add, auto-assign DMX, power chains) keeps
  working unchanged.

### Key Entities

- **Fixture ID**: Optional per-fixture integer — the console (GrandMA) patch number. No
  uniqueness constraint, but duplicates within a rig are surfaced visually.
- **Bulk-add request**: One catalog model + quantity + shared settings (mode, truss section,
  universe, power, start fixture ID) that expands into N ordinary fixtures.
- **Fixture mode** (existing): The catalog-defined DMX personality; now also offered inside
  the Add Fixture dialog, not only in the rig table.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A planner can number an existing 20-fixture rig with console IDs in under two
  minutes, and the printed sheet shows every ID.
- **SC-002**: Adding a fixture of a model with defined modes requires zero post-add edits to
  get the right mode and channel count (today it always requires at least one).
- **SC-003**: Adding 8 identical fixtures fully patched (IDs, mode, truss, universe, addresses)
  takes one form submission instead of 8 separate adds plus per-row edits — under 30 seconds
  end to end.
- **SC-004**: 100% of bulk-added fixtures come out correctly numbered (IDs strictly
  incrementing from the start value) and addressed (no DMX overlaps on the universe), or the
  batch is rejected whole with a reason.
- **SC-005**: Duplicate console IDs in a rig are visible at a glance (flagged rows), catching
  the collision before it reaches the console.

## Assumptions

- Fixture IDs are plain positive integers (GrandMA-style patch numbers); ID uniqueness is the
  planner's responsibility — the tool flags duplicates but does not enforce, since renumbering
  legitimately passes through duplicate states.
- The fixture ID is per rig fixture (per unit), not per model.
- Bulk-add covers catalog models only; custom (non-catalog) fixtures keep the single-add path.
  Bulk power settings cover the shared case (e.g. all on grid with one connector type);
  fixture-to-fixture daisy-chains are wired per row afterwards.
- Bulk-add DMX addressing uses the same per-universe sequential logic as the existing
  auto-assign (append after occupied space, 512-channel cap, rejection on overflow);
  re-running Auto-assign afterwards remains possible and unchanged.
- The lighting print sheet gains one column; no other print changes.
- No import/export impact: fixture IDs are planning data only and do not appear on the rental
  order or in the Excel export.
