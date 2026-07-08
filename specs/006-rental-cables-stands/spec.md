# Feature Specification: Rental Completeness — Cables & Stands from Inventory

**Feature Branch**: `006-rental-cables-stands`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Roadmap slice 6 — Missing cables and stands in rental order and
Excel output. Every item should be included and mapped to the Excel sheet. If I select a 4m XLR
cable, it should be included. If I select a boom stand, it should be included. Stands and
available cables and lengths are in the inventory and the options should come from the
inventory. Today the XLR cable length is just a number and stand types seems to be disconnected
from the inventory."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick input cables from the catalog and see them on the rental order (Priority: P1)

While planning input channels, the planner chooses each channel's cable from the actual rental
catalog — a concrete cable with its length (e.g. "Mikrofonkabel 4m") — instead of typing a
free-form length next to a generic cable type. Every picked cable then shows up on the event's
rental order with the correct quantity and price, and lands in the exported Excel order like any
other rented item.

**Why this priority**: This is the core promise of the tool — "the rental order is derived
automatically from the plan" — and cables are the most numerous line items on a real order.
Today they are silently missing, so every order is wrong until manually patched.

**Independent Test**: Plan an event with several input channels using different catalog cables
(including two channels sharing the same cable), open the Rental Order tab and verify each cable
appears with the summed quantity and correct price, then export and verify the same quantities
in the Excel file.

**Acceptance Scenarios**:

1. **Given** an event with three input channels, **When** the planner picks "Mikrofonkabel 4m"
   on two channels and "Mikrofonkabel 10m" on one, **Then** the rental order shows a line with
   quantity 2 for the 4 m cable and a line with quantity 1 for the 10 m cable, priced from the
   catalog.
2. **Given** cables selected on input channels, **When** the planner exports the rental order to
   Excel, **Then** the cable quantities are written to those items' rows in the sheet.
3. **Given** the cable picker is open, **When** the catalog has several cables sharing a name
   but differing in length/variant, **Then** every option is visually distinguishable (name plus
   its length/variant), so the planner can tell "4m" from "10m" at a glance.
4. **Given** a channel where no cable is needed (e.g. a wireless receiver patched locally),
   **When** the planner leaves the cable unset, **Then** no cable is counted for that channel
   and the row shows no cable on sheets.
5. **Given** more cables of one kind are planned than the catalog has in stock, **When** the
   planner views the rental order, **Then** that line is flagged as over stock (existing stock
   validation applies to cables too).

---

### User Story 2 - Pick mic stands from the catalog and see them on the rental order (Priority: P2)

While planning input channels, the planner chooses the channel's stand from the actual stand
catalog (e.g. "Mikrofonstativ Med bom") instead of a generic stand-type word that is
disconnected from the price list. Picked stands are counted on the rental order and in the
Excel export.

**Why this priority**: Same correctness gap as cables, slightly fewer line items per event.
Kept separate so the cable flow (P1) is independently shippable.

**Independent Test**: Plan channels with different stands from the catalog, verify summed stand
quantities and prices on the Rental Order tab and in the Excel export.

**Acceptance Scenarios**:

1. **Given** four input channels, **When** the planner picks "Mikrofonstativ Med bom" on three
   of them and "Mikrofonstativ till trummor" on one, **Then** the rental order shows those two
   stand lines with quantities 3 and 1.
2. **Given** a channel that needs no stand (e.g. a DI on the floor), **When** the planner leaves
   the stand unset, **Then** no stand is counted for that channel.
3. **Given** stands selected on channels, **When** the planner exports to Excel, **Then** stand
   quantities are written to the correct rows.

---

### User Story 3 - Pick output cables from the catalog and see them on the rental order (Priority: P2)

While planning outputs (speaker runs, monitor sends), the planner chooses each output's cable
from the catalog — speaker cables ("Högtalarkabel Speakon 2x2,5" in a specific length) or signal
cables — and they are counted on the rental order and Excel export the same way.

**Why this priority**: Completes the cable story for the whole patch; independent of inputs and
testable on its own.

**Independent Test**: Plan outputs with catalog speaker cables, verify quantities and prices on
the Rental Order tab and in the export.

**Acceptance Scenarios**:

1. **Given** two outputs using the same catalog speaker cable, **When** the planner views the
   rental order, **Then** that cable appears once with quantity 2.
2. **Given** an output with no cable picked, **When** the rental order is viewed, **Then** no
   cable is counted for that output.

---

### User Story 4 - Existing event plans keep their cable and stand information (Priority: P3)

Events planned before this change already carry a cable type plus a typed length, and a stand
type, on every row. After the upgrade the planner opens an old event and still sees what was
planned: rows whose old values unambiguously correspond to a catalog item now point at that
item (and are therefore counted); rows that cannot be confidently matched keep their old values
visible as read-only legacy text so no information is lost.

**Why this priority**: Data preservation is mandatory, but it delivers no new capability of its
own — it protects the value of the other stories.

**Independent Test**: Take a database with pre-existing planned events, upgrade, open each event
and verify every row still shows its cable/stand information, either as a catalog pick or as
legacy text; verify matched rows are now counted on the rental order.

**Acceptance Scenarios**:

1. **Given** an old row with a cable type and length that match exactly one catalog cable,
   **When** the event is opened after the upgrade, **Then** the row shows that catalog cable and
   the rental order counts it.
2. **Given** an old row whose cable values match no catalog item (or match ambiguously),
   **When** the event is opened, **Then** the row still displays the original type and length as
   read-only legacy text, is not counted on the rental order, and the planner can replace it
   with a catalog pick at any time.
3. **Given** an old row with a stand type, **When** the event is opened, **Then** the stand
   information is likewise either matched to a catalog stand or preserved as legacy text.

---

### Edge Cases

- Catalog cables carry their length/variant in a secondary text ("Mikrofonkabel" + "4m", or
  adapter variants like "Tele-XLR hane"); several items share the same name. Pickers and all
  displays (tables, print sheets, signal flow, rental order) must show enough to distinguish
  them — name alone is not unique.
- A picked cable or stand is later marked discontinued in the catalog: existing rows keep
  showing it and it still counts on the rental order (flagged there as discontinued, as today),
  but it is not offered for new picks.
- A picked item is deleted from the inventory (e.g. removed during a price-list re-import): the
  planning row must not break — it keeps a readable legacy label, mirroring how removed mic
  items are handled today.
- The same physical cable item is also added manually on the Rental Order tab: manual quantities
  and derived quantities combine on one line, as they already do for other items.
- The stand catalog category mixes mic stands with other stands and rigging hardware (speaker
  stands, slings, clamps): the picker may present the whole category; the planner chooses. No
  attempt is made to guess which items are "really" mic stands.
- Legacy adapter-style rows (e.g. old "Y-cable" text) that match nothing stay as legacy text —
  the planner decides whether a catalog Y-cable replaces them.
- An event that was exported before the upgrade: old exported files are unaffected snapshots;
  re-exporting after the upgrade includes the newly counted cables and stands.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Input channel rows MUST let the planner pick the channel's cable from the rental
  catalog's cable items instead of entering a cable type and a free-typed length; the pick MAY
  be left empty ("no cable").
- **FR-002**: Output rows MUST likewise let the planner pick the output's cable from the rental
  catalog's cable items (speaker and signal cables), with an empty option.
- **FR-003**: Input channel rows MUST let the planner pick the channel's stand from the rental
  catalog's stand items instead of a stand-type word, with an empty option ("no stand").
- **FR-004**: Every cable and stand picker option MUST be uniquely identifiable to the planner —
  where multiple catalog items share a name, the distinguishing variant/length text MUST be part
  of the displayed option.
- **FR-005**: The rental order MUST count every picked cable and stand: one unit per planning
  row that picks the item, summed per item across the event, priced from the catalog, and
  combined with quantities from other sources (manual lines) on a single line per item.
- **FR-006**: Stock validation MUST apply to cables and stands: lines where the planned
  quantity exceeds availability are flagged exactly like other over-stock lines.
- **FR-007**: The Excel export MUST include picked cables and stands through the same mechanism
  as all other rental lines (quantities written to the item's row in the sheet), with no change
  to how the sheet is otherwise treated.
- **FR-008**: Existing planned rows MUST be migrated: where the old cable type + length (or
  stand type) unambiguously matches a single catalog item, the row is converted to that pick;
  otherwise the old values are preserved as read-only legacy text on the row. No row may lose
  its cable/stand information.
- **FR-009**: Legacy text (unmatched old values) MUST be visible wherever the row is shown
  (editing tables, print sheets, signal flow) and MUST be replaceable by a catalog pick, at
  which point the legacy text is superseded.
- **FR-010**: Discontinued catalog items MUST NOT be offered for new picks but MUST remain
  displayed and counted where already picked (with the existing discontinued flagging on the
  rental order).
- **FR-011**: Print sheets and the signal-flow view MUST show the picked cable and stand item
  names (including their distinguishing variant/length text) in place of the old type + length
  columns.
- **FR-012**: Owned (non-rental) gear MUST remain excluded: cable and stand picks come from the
  rental catalog and are counted on the rental order only — nothing in this feature routes owned
  items onto a rental order.

### Key Entities

- **Cable pick**: A planning row's reference to one rental-catalog item representing a concrete
  cable (type + length/variant). Lives on input channel rows and output rows; optional.
- **Stand pick**: A planning row's reference to one rental-catalog item representing a stand.
  Lives on input channel rows; optional.
- **Legacy cable/stand label**: Read-only preserved text from before the upgrade (old cable type
  + typed length, or stand-type word) for rows that could not be confidently matched to a
  catalog item. Superseded when the planner makes a real pick.
- **Rental order line** (existing): Gains cables and stands as contributing sources; unchanged
  in shape — per-item quantity, price, stock flagging, manual additions, Excel placement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of cables and stands picked on planning rows appear on the rental order with
  correct summed quantities and catalog prices — zero manual re-entry needed for cables/stands.
- **SC-002**: The exported Excel order and the on-screen rental order agree exactly on every
  cable and stand quantity, and a re-import of the exported file leaves the catalog unchanged
  (existing round-trip guarantee holds).
- **SC-003**: After upgrading a database with existing events, 100% of previously entered
  cable/stand information is still visible on its row (as a catalog pick or as legacy text) —
  zero silent data loss.
- **SC-004**: A planner can select the intended cable (correct type and length) in a single
  picker interaction, with every option visually unique — no two indistinguishable entries.
- **SC-005**: Planning more units of a cable or stand than the catalog stocks flags the line as
  over stock, matching the behavior of all other rental lines.

## Assumptions

- The rental catalog (imported price list) is the single source of truth for which cables and
  stands exist, their lengths/variants, prices, and stock — cable pickers are populated from the
  catalog's cable categories and stand pickers from its stand category, rather than from
  configurable vocabulary lists. The old cable-type and stand vocabulary dropdowns disappear
  from planning rows (reference-data management itself is untouched).
- One cable and at most one stand per input row, one cable per output row — matching today's
  row shape. Multi-cable needs (DI double cabling, stereo pairs, per-hop chain cables) are
  explicitly later slices (9 and 10) that will reuse this picker pattern.
- Quantity per pick is exactly 1; planners needing spares add them as manual rental lines, as
  today.
- Catalog items encode length/variant in their secondary description text (e.g. "4m"); the
  feature displays it but does not parse or interpret it beyond migration matching.
- Migration matching is best-effort and conservative: only exact, unambiguous matches convert
  automatically; everything else becomes legacy text for the planner to resolve. This mirrors
  the established mic-item migration behavior.
- Stands are an input-side concern (mic stands); outputs and lighting do not gain stand picks in
  this slice. Speaker stands can be added as manual rental lines as today.
