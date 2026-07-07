# Feature Specification: Excel Rental Order Export

**Feature Branch**: `002-xlsx-rental-export`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Run specify for Slice 2 — Excel rental order export: write planned quantities back into the LL.xlsx template so the order can be submitted to the renter unmodified." (ROADMAP.md Slice 2, PROJECT.md §3.1 — "the most pressing missing feature".)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download a submit-ready order file (Priority: P1)

A technician finishes planning an event and clicks **Export** on the Rental Order tab. They receive a copy of the renter's own price-list file in which the *Antal Ljud* (audio quantity) and *Antal Ljus* (lighting quantity) columns are filled in at exactly the rows of the items they planned — every other cell (names, comments, stock counts, prices, the sheet's own sum columns, layout, formatting) untouched. They attach the file to an email and send it to the renter without opening it first.

**Why this priority**: This is the entire point of the tool's rental workflow (Constitution IV): the renter accepts orders only in their own file format, and until now the technician had to copy quantities across by hand — the exact error-prone manual counting PatchPlanner exists to eliminate.

**Independent Test**: Plan an event touching several items (mics, a stagebox, speakers, a fixture, a manual line), export, open the file: each planned item's row shows the correct quantity in the correct column, and a diff against the original file shows changes *only* in the two quantity columns.

**Acceptance Scenarios**:

1. **Given** an event whose rental order has 8 lines with audio and lighting quantities, **When** the technician exports, **Then** the downloaded file contains each quantity in the *Antal Ljud* or *Antal Ljus* column on the row of the corresponding item, matching the split shown on the Rental Order tab.
2. **Given** the export file, **When** it is compared to the renter's original price list, **Then** no cell outside the two quantity columns differs — names, comments, stock, prices, and the sheet's computed sum columns are preserved.
3. **Given** the renter's file contains leftover quantities from a previously submitted order, **When** the technician exports, **Then** those stale values are cleared and the file carries only this event's quantities.
4. **Given** an event with an empty rental order, **When** the technician exports, **Then** they receive a valid copy of the price list with both quantity columns empty.
5. **Given** the export completes, **When** the technician looks at the downloaded file's name, **Then** it identifies the event (name and date), so multiple event orders don't overwrite each other.

---

### User Story 2 - No silent omissions (Priority: P2)

A technician exports an order where some lines cannot be placed in the file — an item was discontinued from the renter's latest price list, or the row where an item used to live now holds something else. The export still succeeds for everything placeable, and the technician is told exactly which lines could not be written (item name and quantities) so they can add them to the order by hand or renegotiate.

**Why this priority**: An order file that silently drops lines is worse than no export — the technician trusts it, sends it, and equipment doesn't show up at load-in. Every unplaced line must be surfaced.

**Independent Test**: Plan an event including one item, remove that item's row from a copy of the price list, re-import that copy, export: the export completes, and the response identifies the missing item with its quantities; the file contains everything else.

**Acceptance Scenarios**:

1. **Given** a rental line referencing an item no longer present in the current price list (discontinued), **When** the technician exports, **Then** the file is produced without that line and the technician sees a notice naming the item and its unplaced quantities.
2. **Given** an item whose recorded row in the file now holds a different equipment name (the catalog and file have drifted apart), **When** the technician exports, **Then** nothing is written to that row and the line is reported as unplaced — a quantity must never land on the wrong equipment.
3. **Given** all lines place cleanly, **When** the technician exports, **Then** no warnings are shown.
4. **Given** the price-list file itself is missing or unreadable, **When** the technician exports, **Then** they get a clear error and no file is downloaded.

---

### User Story 3 - Export from the Rental Order tab (Priority: P3)

The Export button on the Rental Order tab (currently a "coming soon" placeholder) triggers the download directly from the browser. If the order has over-stock or discontinued warnings, the existing warning banner is visible right above the button — the technician can still export, but they act with eyes open.

**Why this priority**: The capability (US1/US2) is usable via a direct link even without UI polish; wiring the button and download flow makes it an everyday workflow.

**Independent Test**: On an event with a populated order, click Export: the browser downloads the file; on an event with an over-stock line, the banner is visible while exporting; unplaced-line notices from US2 appear in the UI after export.

**Acceptance Scenarios**:

1. **Given** a populated rental order, **When** the technician clicks Export, **Then** the file downloads with the event-specific filename.
2. **Given** the export reported unplaced lines, **When** the download completes, **Then** the notices are shown on the Rental Order tab.
3. **Given** an export failure (e.g. source file missing), **When** the technician clicks Export, **Then** an error message is shown and nothing downloads.

---

### Edge Cases

- Merged quantities: a line's audio and lighting quantities land in their respective columns on the same row (e.g. DMX cable ordered 2 for audio + 4 for lighting).
- Items sharing the same name in the price list (e.g. seven "Dmx kabel 3-pol" rows of different lengths): each catalog item carries its own row position, so quantities land on the specific variant that was planned.
- The sheet's own *Summa Ljud*/*Summa Ljus* columns compute prices from the quantity columns — they must be left to compute (not overwritten with fixed numbers) so the renter's file behaves as they expect.
- An event exported twice (after plan changes) produces a fresh file both times; export never accumulates.
- The original price-list file on disk is never modified by an export.
- Zero-quantity lines (possible only transiently) are treated as absent — no zero is written.
- Quantities are whole numbers; the order model only produces integers.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST produce, per event, a downloadable copy of the renter's current price-list file with the event's rental order quantities written into the *Antal Ljud* (audio) and *Antal Ljus* (lighting) columns at each referenced item's row.
- **FR-002**: The export MUST NOT alter any content outside those two quantity columns: item names, comments, stock counts, prices, computed sum columns, sheet layout, and formatting are preserved so the file can be submitted unmodified (Constitution IV).
- **FR-003**: Before writing, the export MUST clear any pre-existing values in the two quantity columns throughout the sheet, so the file carries exactly one event's order and nothing stale.
- **FR-004**: Before writing a quantity, the export MUST verify that the equipment name at the target row matches the catalog item being placed; on mismatch the row is left untouched and the line is reported as unplaced. A quantity MUST never be written to a row holding different equipment.
- **FR-005**: Rental lines that cannot be placed (discontinued items, unmatchable rows) MUST be reported to the technician with item name and unplaced quantities; the export MUST still complete for all placeable lines.
- **FR-006**: The downloaded file's name MUST identify the event (name and, when set, date).
- **FR-007**: The export MUST NOT modify the source price-list file on disk.
- **FR-008**: An event with an empty rental order MUST export successfully as a clean copy of the price list with empty quantity columns.
- **FR-009**: If the source price-list file is missing or unreadable, the export MUST fail with a clear error and no download.
- **FR-010**: The Rental Order tab's Export button MUST trigger the download and surface any unplaced-line notices and export errors; the existing over-stock/discontinued warnings remain visible so the technician exports informed (export is not blocked by warnings).

### Key Entities

- **Export document**: A per-event copy of the renter's price-list file with this event's quantities in the two order columns; identified by event name/date in its filename.
- **Placement**: The link between a rental order line and its target row in the file — the item's recorded sheet position, validated by name match at export time.
- **Unplaced line**: A rental order line that could not be written (item discontinued or its target row no longer matches); carries item name and audio/lighting quantities for manual follow-up.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Round-trip fidelity: importing the catalog from an exported file yields exactly the planned quantities on exactly the planned items — 100% of placeable lines, zero misplaced quantities.
- **SC-002**: For an event where all lines are placeable, the exported file requires zero manual edits before submission to the renter.
- **SC-003**: 100% of unplaceable lines are reported to the technician — no rental line is ever silently absent from both the file and the report.
- **SC-004**: Exporting a full catalog (~300 rows) with a 50-line order completes and starts downloading in under 5 seconds.
- **SC-005**: Producing a submit-ready order for a planned event takes one click from the Rental Order tab, down from the current manual copy of every quantity into the spreadsheet.

## Assumptions

- The renter's file format is stable: a single sheet in the known layout, with *Antal Ljud* and *Antal Ljus* as the order-quantity columns (per Constitution IV and the actual file in the repository). If the renter restructures the file, a fresh import establishes the new row positions.
- The export sources the same price-list file the catalog was last imported from; keeping them in sync is the import's job (already non-destructive). Row-level name verification (FR-004) protects against drift between imports.
- The renter's sheet computes its own sums from the quantity columns; the export relies on that behavior rather than writing prices.
- One export file per event; combining multiple events into one order is out of scope.
- Quantities are whole numbers ≥ 1 (the order model produces only integers; zero-quantity manual lines are removed by design in the rental order feature).
