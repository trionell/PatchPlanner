# Feature Specification: Equipment Lists — Owned Gear & Event Extras

**Feature Branch**: `003-equipment-lists`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Equipment lists: per-event rigging/misc equipment planning and an owned (non-rental) gear catalog that never appears on the rental order." (ROADMAP.md Slice 3; PROJECT.md §3.2 + §3.9; Constitution I & IV — owned/generic equipment tracked outside the rental catalog without export constraints.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owned gear catalog (Priority: P1)

A technician owns equipment that isn't in the renter's price list — their own microphones, DI boxes, shackles, slings, gaff tape, a laptop running the show. They maintain a personal catalog of this gear: name, what kind of equipment it is (audio, lighting, rigging, video, misc), how many they own, and free-form notes. The catalog lives next to the rental catalog on the Inventory page.

**Why this priority**: Today there is no way to represent owned gear at all — adding it as free text loses tracking, and adding it via rental items would wrongly put it on the renter's order (PROJECT.md §3.9). The catalog is the foundation the other stories build on.

**Independent Test**: Open the Inventory page, switch to Owned gear, add "Shure SM7B — audio — 1 owned", edit its quantity, delete it. Entries persist across reloads and never appear among rental items.

**Acceptance Scenarios**:

1. **Given** the Inventory page, **When** the technician adds an owned item with name, equipment type, and owned quantity, **Then** it appears in the owned-gear list and persists.
2. **Given** an existing owned item, **When** the technician edits its fields or deletes it, **Then** the change persists; deletion removes it from the catalog.
3. **Given** owned items exist, **When** the technician browses rental catalog views or planning dropdowns fed by the rental catalog, **Then** owned items do not appear there (and vice versa).

---

### User Story 2 - Plan owned gear on an event (Priority: P2)

While planning an event, the technician opens a new **Equipment** tab and adds owned gear to the plan: pick an item from the owned catalog, set the quantity to bring, add a note ("FOH laptop", "spare DI for keys"). The list is the packing reference for gear they bring themselves. Owned gear never appears on the rental order or in the exported order file. If they plan more units than they own, the line is flagged — same idea as the rental stock validation.

**Why this priority**: This closes the §3.9 gap: gear can now be part of the plan without polluting the renter's order, and the plan finally reflects everything coming to the gig.

**Independent Test**: Add two owned items to an event with quantities and notes; verify the Rental Order tab total and the exported file are completely unchanged; set a quantity above the owned count and see the flag.

**Acceptance Scenarios**:

1. **Given** an event and a populated owned catalog, **When** the technician adds an owned item with quantity 2 and a note, **Then** the Equipment tab lists it and it persists.
2. **Given** owned gear planned on an event, **When** the rental order or the export file is viewed, **Then** neither contains any owned line — totals identical to before.
3. **Given** a planned quantity exceeding the owned count, **When** the list is viewed, **Then** the line is visibly flagged with planned vs. owned.
4. **Given** an owned line, **When** the technician updates its quantity/note or removes it, **Then** the list reflects the change.
5. **Given** an owned item is deleted from the catalog, **When** events that planned it are viewed, **Then** the line is gone from their equipment lists (the catalog is the source of truth; the UI confirms before a delete that affects plans).

---

### User Story 3 - One place for all event extras (Priority: P3)

The Equipment tab also shows the event's *rented* extras — the manual rental lines (spare cables, rigging hardware, smoke machine) that already exist on the Rental Order tab — so the technician sees the complete "everything beyond the patch and the rig" list in one place: what they bring (owned) and what gets ordered (rented extras). Rented extras remain editable from here with the same behavior as on the Rental Order tab.

**Why this priority**: Pure workflow convenience layered on existing data; valuable but nothing breaks without it.

**Independent Test**: Add a manual rental line from the Rental Order tab; it appears under "Rented extras" on the Equipment tab; edit its quantity there and see the rental order update.

**Acceptance Scenarios**:

1. **Given** manual rental lines exist, **When** the Equipment tab is opened, **Then** they are listed under a rented-extras section alongside the owned-gear section.
2. **Given** the Equipment tab, **When** a rented extra is added/edited/removed there, **Then** the Rental Order tab reflects it (same underlying lines).

---

### Edge Cases

- Owned items and rental items may share names (a technician owns an SM58 and also rents more): they are distinct entries in distinct catalogs; the event plan can contain both without interference.
- Deleting an owned item that is planned on events removes those plan lines; the UI states how many events are affected before confirming.
- An owned line with quantity 0 is meaningless: setting quantity to 0 removes the line (mirrors manual rental lines).
- The owned catalog is independent of price-list imports: re-importing `LL.xlsx` never touches owned gear.
- Owned quantity is informational (for the over-planned flag); two simultaneous events can both plan the same owned gear — flagging is per event only (no cross-event availability tracking in this slice).
- Equipment types reuse the same classification vocabulary as the rental catalog (audio, lighting, rigging, video, misc) so lists sort familiarly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Technicians MUST be able to create, edit, and delete owned-gear catalog entries with: name (required), equipment type (audio/lighting/rigging/video/misc), owned quantity, and optional description/notes.
- **FR-002**: The owned catalog MUST be visible on the Inventory page alongside (but clearly separated from) the rental catalog, and MUST be completely independent of price-list imports.
- **FR-003**: Owned items MUST NOT appear in rental-catalog listings, rental-order summaries, or the exported order file under any circumstance.
- **FR-004**: Technicians MUST be able to attach owned items to an event with a quantity and an optional note; at most one line per owned item per event (adding again updates the line; quantity 0 removes it).
- **FR-005**: An event's owned-equipment line whose quantity exceeds the item's owned count MUST be visibly flagged with planned vs. owned quantities.
- **FR-006**: Deleting an owned catalog item MUST remove its lines from all event plans; the UI MUST warn (with the number of affected events) before such a delete.
- **FR-007**: The event detail page MUST gain an Equipment tab showing the owned-gear list (editable per FR-004) and the event's rented extras (the existing manual rental lines), the latter editable with identical semantics to the Rental Order tab.
- **FR-008**: Deleting an event MUST remove its owned-equipment lines (consistent with all other per-event planning data).

### Key Entities

- **Owned item**: A piece of equipment the technician owns — name, equipment type, owned quantity, description/notes. Lives in its own catalog, never in the rental catalog.
- **Event owned-equipment line**: A per-event planning row — owned item, quantity to bring, note; flagged when quantity exceeds the owned count.
- **Rented extra** (existing): a manual rental line; surfaced on the Equipment tab but unchanged in behavior and storage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A technician can add a new owned item and attach it to an event in under 60 seconds total.
- **SC-002**: 0 owned-gear lines ever appear in a rental order summary or exported order file, regardless of how many are planned.
- **SC-003**: 100% of over-planned owned lines (quantity > owned) are visibly flagged.
- **SC-004**: Re-importing the price list changes 0 owned-catalog entries and 0 event owned-equipment lines.
- **SC-005**: The complete "extras" picture for an event (owned + rented beyond patch/rig) is readable on one tab without visiting any other page.

## Assumptions

- Owned quantities are informational per event; cross-event double-booking detection of owned gear is out of scope for this slice (noted as future work).
- The equipment-type vocabulary mirrors the rental catalog's category types for familiarity; a misc default suffices for uncategorized gear.
- Owned gear has no pricing (nothing is billed); no price fields.
- Single-user local tool: no sharing/permissions on the owned catalog.
- Rented extras on the Equipment tab reuse the existing manual rental lines — one storage, two views; no new ordering machinery.
