# Feature Specification: Rental Order Correctness

**Feature Branch**: `001-rental-order-correctness`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Rental order correctness — make the auto-derived rental order actually complete. Today the per-event rental summary only counts amplifiers, speakers, and lighting fixtures; microphones/DI/IEM (stored as free-text mic_model instead of an inventory reference), stageboxes, stage multicores, cables, and mic stands are never counted, so the rental order understates what must be ordered. This feature: (1) replaces the free-text mic model on audio patch inputs with a real inventory item reference, backfilling existing data by name match; (2) extends the rental summary to count every inventory-linked item referenced anywhere in the event plan; (3) adds manual rental line items so a technician can add extra quantities of any catalog item to an event's order; (4) adds stock validation — any rental line whose planned quantity exceeds available stock is flagged so over-bookings are caught before submitting the order to the renter."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete auto-derived rental order (Priority: P1)

A technician plans an event: they build an input patch (assigning microphones, DI boxes, and IEM systems from the catalog to channels), register the stageboxes and stage multicores they will use (linked to catalog models), assign amplifiers and speakers to outputs, and hang lighting fixtures. When they open the Rental Order tab, **every** catalog item they referenced anywhere in the plan appears as an order line with the correct quantity — not just amplifiers, speakers, and fixtures.

**Why this priority**: "The rental order is derived automatically from what you have planned — no manual counting" is the product's core value proposition, and today it is only partially true. An order that silently omits microphones, stageboxes, and multicores is worse than no automation, because the technician trusts it and under-orders.

**Independent Test**: Create an event, add two input rows with the same microphone model and one with a DI box, register one catalog-linked stagebox and one catalog-linked multicore, assign an amplifier and speaker to an output, and add one lighting fixture. The rental order must show six distinct lines with quantities 2 (mic), 1 (DI), 1 (stagebox), 1 (multicore), 1 (amp), 1 (speaker) plus the fixture — each priced, with a correct grand total.

**Acceptance Scenarios**:

1. **Given** an event whose input patch assigns the same microphone model to 8 channels, **When** the technician views the rental order, **Then** that microphone appears as one line with quantity 8 under the audio column.
2. **Given** an event with a stagebox and a stage multicore each linked to a catalog model, **When** the rental order is viewed, **Then** each appears as a line with quantity 1.
3. **Given** an input row whose microphone selection is chosen from the catalog, **When** the catalog item's name or price changes on re-import, **Then** the patch row still points to the same catalog item (selection is a reference, not copied text).
4. **Given** a patch row with no equipment selected (e.g. a line input with no DI), **When** the rental order is viewed, **Then** that row contributes nothing to the order.
5. **Given** a plan that references equipment, **When** any patch row, stagebox, multicore, or fixture is added, changed, or removed, **Then** the rental order reflects the change on next view without any manual action.

---

### User Story 2 - Catalog re-import never destroys planning data (Priority: P2)

A technician receives an updated price list from the renter and re-imports it. All existing event plans — patch rows, fixtures, stagebox/multicore registrations, manual order lines — survive intact, and their references to catalog items still resolve to the same equipment (matched by name) with updated prices and stock counts.

**Why this priority**: Today, re-importing the catalog silently deletes every event's lighting fixtures, audio output rows, and rental lines — catastrophic data loss that directly contradicts the documented behavior ("existing event data is not affected"). This feature makes catalog references first-class, so the import must be made safe before more of the plan depends on those references.

**Independent Test**: Fully plan an event, re-import the price list, and verify the plan is byte-for-byte identical (same rows, same equipment references) with only prices/stock counts updated.

**Acceptance Scenarios**:

1. **Given** an event with outputs, fixtures, and manual rental lines referencing catalog items, **When** the price list is re-imported, **Then** no planning rows are deleted and all references still resolve to the same-named catalog items.
2. **Given** a catalog item that was removed from the new price list but is referenced by a plan, **When** the import completes, **Then** the plan row is preserved and the rental order flags that line as no longer available from the renter.
3. **Given** an import file that cannot be parsed, **When** the import fails, **Then** the existing catalog and all plans remain unchanged.

---

### User Story 3 - Manual rental line items (Priority: P3)

A technician needs equipment that isn't captured by the patch or rig planning — spare cables, a smoke machine, rigging hardware, extra mic stands. On the Rental Order tab they add a line manually: pick any catalog item, set an audio quantity and/or lighting quantity, optionally note why. Manual lines merge into the same order alongside auto-derived lines.

**Why this priority**: Equipment that has no dedicated planning view (consumables, spares, rigging) still has to reach the renter. Manual lines are the escape hatch that makes the order complete end-to-end, and they unblock ordering cables/stands until those get first-class planning support.

**Independent Test**: On an empty event, manually add "XLR-kabel 10m" × 12 (audio) and a smoke machine × 1 (lighting); the order shows both lines with correct subtotals; editing the quantity or deleting the line updates the order.

**Acceptance Scenarios**:

1. **Given** the rental order view, **When** the technician adds a manual line for a catalog item with quantity 12 audio, **Then** the order shows that line with quantity 12, priced, included in the total.
2. **Given** an item that is already auto-counted (e.g. a mic used on 2 channels), **When** a manual line adds 2 more of the same item, **Then** the order shows one merged line with quantity 4.
3. **Given** an existing manual line, **When** the technician edits its quantity or removes it, **Then** the order updates accordingly.

---

### User Story 4 - Stock validation (Priority: P4)

While reviewing the rental order, the technician immediately sees any line where the planned quantity exceeds what the renter has in stock, so over-bookings are caught and resolved before the order is submitted.

**Why this priority**: Valuable guard, but only meaningful once quantities are complete (US1) and manual lines exist (US3). An incomplete order makes stock warnings misleading.

**Independent Test**: Plan 5 units of an item whose catalog stock is 4; the rental order highlights that line with a clear "exceeds available stock (4)" indication and the order shows an overall warning.

**Acceptance Scenarios**:

1. **Given** a rental line whose total quantity exceeds the catalog's available stock, **When** the order is viewed, **Then** the line is visually flagged and shows planned vs. available quantities.
2. **Given** all lines within stock limits, **When** the order is viewed, **Then** no warnings are shown.
3. **Given** an over-booked line, **When** the technician reduces usage in the plan below the stock level, **Then** the warning disappears on next view.

---

### Edge Cases

- A free-text microphone name from before the upgrade that matches no catalog item: the historical text stays visible on the patch row (so no information is lost), but it contributes nothing to the rental order and is visually marked as unlinked.
- The same catalog item referenced from both audio planning and a manual line (or both audio and lighting): one merged order line with per-discipline quantity columns.
- A stagebox/multicore registered by name only, with no catalog link: valid for patching, absent from the rental order.
- A catalog item with zero recorded stock that is nonetheless planned: flagged like any other over-booking.
- Two catalog items sharing the same name in the price list: references resolve by position in the list, not by name alone; re-import matching falls back to list position when names are ambiguous.
- An event with no plan data: the rental order is empty with a zero total, no errors.
- Deleting a stagebox that patch rows point at: existing behavior (reference cleared or deletion blocked) must keep the rental order consistent — no phantom lines.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Microphone/DI/IEM selection on an audio input row MUST be a reference to a catalog item (chosen from the catalog, filtered by signal type as today), not stored free text.
- **FR-002**: On upgrade, existing free-text microphone values MUST be linked automatically to catalog items by exact, case-insensitive name match; unmatched values MUST remain visible on the patch row as historical text and be marked as unlinked.
- **FR-003**: The rental order for an event MUST include one line per referenced catalog item, aggregating: microphone/DI/IEM references from input rows (one unit per row), stagebox catalog links (one unit per stagebox), stage multicore catalog links (one unit per multicore), amplifier and speaker references from output rows (one unit per row), lighting fixture catalog links (one unit per fixture), and manual line quantities.
- **FR-004**: Each order line MUST report quantities split by discipline (audio vs. lighting), a merged total, unit price, and line subtotal; the order MUST report a grand total. Multiple sources referencing the same catalog item MUST merge into a single line.
- **FR-005**: Technicians MUST be able to add, edit, and remove manual rental lines per event: any catalog item, independent audio and lighting quantities, optional note. At most one manual line per catalog item per event; adding the same item again MUST update the existing line.
- **FR-006**: Each order line MUST include the catalog's available stock, and any line whose total quantity exceeds available stock MUST be flagged in both the order data and the rental order view, showing planned vs. available quantities. The order MUST expose an overall "has over-bookings" indication.
- **FR-007**: Re-importing the price list MUST NOT delete or modify any event planning data (patch rows, stageboxes, multicores, fixtures, manual lines). Catalog references MUST survive the re-import by matching the new list's items to the old ones by name (falling back to list position for duplicate names).
- **FR-008**: If a referenced catalog item no longer exists after a re-import, the planning rows MUST be preserved and the corresponding order line MUST be marked as unavailable from the renter.
- **FR-009**: A failed import MUST leave the catalog and all planning data unchanged.
- **FR-010**: The rental order MUST reflect all plan changes (patch, stageboxes, multicores, fixtures, manual lines) without manual recalculation — viewing the order always shows current state.
- **FR-011**: Equipment not linked to the catalog (custom-named stageboxes, custom fixtures, unlinked historical mic text) MUST NOT appear on the rental order.

### Key Entities

- **Catalog item**: A rentable piece of equipment from the renter's price list — name, description, available stock, unit price, position in the price list. The single source of truth for anything that can be ordered.
- **Audio input row**: One mixer channel's patch line. Now carries a *reference* to a catalog item for its microphone/DI/IEM (plus, transitionally, the historical free-text name for unmatched legacy data).
- **Rental order line**: A derived (or partly manual) row of the event's order — catalog item, audio quantity, lighting quantity, total, unit price, subtotal, available stock, over-booked flag, availability flag.
- **Manual rental line**: A technician-entered quantity of a catalog item attached to an event, with audio/lighting split and optional note; merges with derived quantities of the same item.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a fully planned test event touching every planning surface (inputs, outputs, stageboxes, multicores, fixtures, manual lines), 100% of catalog-linked equipment appears on the rental order with correct quantities — zero manual counting required.
- **SC-002**: Re-importing the price list while events already exist results in zero lost or altered planning rows, verified by comparing every plan before and after import.
- **SC-003**: 100% of legacy microphone assignments whose text exactly matches a catalog item name (ignoring case) are automatically linked during upgrade; no legacy text is silently discarded.
- **SC-004**: Every over-booked line (planned > available) is visibly flagged in the rental order view; a technician can identify all over-bookings for an event in under 10 seconds without leaving the page.
- **SC-005**: A technician can add a manual line for any of the ~300 catalog items in under 30 seconds from opening the rental order tab.

## Assumptions

- **Cables and mic stands are out of scope for automatic counting in this slice.** Patch rows record cable type/length and stand type as planning metadata, but mapping those to specific price-list line items (e.g. which "XLR-kabel" length bucket) is ambiguous today. Manual rental lines (US3) are the supported way to order them; automatic cable/stand counting can be a later feature.
- One patch row, stagebox, multicore, or fixture represents exactly one physical unit for ordering purposes (two outputs driven by the same physical amplifier are counted as two — the technician can correct via review; sharing-aware counting is out of scope).
- Exact case-insensitive name matching is sufficient for the one-time legacy mic backfill and for re-import re-linking; the price list's item names are stable between versions from the same renter.
- Single-user, locally hosted tool (per constitution): no concurrent-edit conflicts on the order.
- The existing audio/lighting discipline split is determined by where the reference occurs (audio planning surfaces → audio quantity; lighting fixtures → lighting quantity; manual lines carry their own split).
