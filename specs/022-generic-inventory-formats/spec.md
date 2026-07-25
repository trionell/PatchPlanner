# Feature Specification: Generic Inventory Formats, Manual Entry & PDF Rental Order

**Feature Branch**: `022-generic-inventory-formats`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "Right now PatchPlanner is built around an Excel sheet provided by my most common rental provider. I want the tool to also work with a generic format — Excel import of a generic format alongside the LL Excel import. The generic format doesn't have to look anything like LL.xlsx; the important part is that it's easy to create and fill in. If a user can't or doesn't want to use Excel import, we need a way to manually populate the inventory — probably something similar to owned gear but also with a category. To help users using the generic Excel format we should have a downloadable template. If an inventory has been imported from an LL.xlsx file, allow export to that exact file; if not, don't allow export to LL.xlsx format. It would be cool if we can export the rental order as PDF as well, regardless of how the inventory was created."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Populate a catalog from a generic spreadsheet (Priority: P1)

A technician who rents from a supplier other than the built-in one wants to get that
supplier's gear into PatchPlanner. They open their inventory, download a blank template,
fill it in with their supplier's equipment (or paste from a list the supplier sent them),
and upload it. The catalog fills with categories and items, and every planning dropdown in
the app — mic models, amplifiers, speakers, stageboxes, fixtures, cables, stands — is now
populated with their own gear.

**Why this priority**: This is the whole point of the feature. Without it the product only
serves customers of one Swedish rental house. It also unblocks the other two stories: a
non-LL catalog is what makes format-aware export meaningful, and it is the fastest way for
a new user to get a usable catalog.

**Independent Test**: Create a fresh inventory, download the template, add a handful of rows
across audio, lighting and rigging, upload it, and confirm the items appear in the inventory
browser and in an event's planning dropdowns. Delivers a fully usable catalog on its own,
with no other story implemented.

**Acceptance Scenarios**:

1. **Given** an empty inventory, **When** the user downloads the template and uploads it
   filled in with valid rows, **Then** the catalog contains one category per distinct
   Category value and one item per row, each carrying its description, quantity and price.
2. **Given** a filled-in template, **When** a data row has a Name but its Category cell is
   blank, **Then** the upload is rejected, the message names the offending sheet row
   number, and the catalog is left exactly as it was.
3. **Given** a catalog previously imported from a generic file, **When** the user uploads a
   corrected version of that file, **Then** matching items keep their identity and all
   existing plan references, items no longer in the file are marked discontinued rather
   than deleted, and quantities and prices are updated.
4. **Given** a spreadsheet whose columns are in a different order, or which carries extra
   columns of the user's own notes, **When** it is uploaded, **Then** it imports correctly
   because columns are recognised by their heading rather than their position.
5. **Given** the user's own spreadsheet with no sheet named "Inventory", **When** it is
   uploaded, **Then** the first sheet in the workbook is used.

---

### User Story 2 - Build and maintain a catalog by hand (Priority: P2)

A technician who does not want to deal with spreadsheets at all — or who just needs to add
one item a supplier mentioned on the phone — adds categories and items directly in the
inventory screen. They can correct a price, fix a typo in a name, adjust a stock count, and
remove something they added by mistake.

**Why this priority**: Necessary for users who reject the spreadsheet route entirely, and
valuable to every user as the escape hatch for one-off additions and corrections. Ranked
below P1 because a spreadsheet import gets a user productive far faster for a full catalog.

**Independent Test**: On a brand-new inventory with no import ever performed, add two
categories and several items by hand, edit one, delete another, then plan an event using
them. Delivers a complete catalog without any file ever being uploaded.

**Acceptance Scenarios**:

1. **Given** an inventory (imported or not), **When** the user adds a category with a name
   and an equipment type, **Then** it becomes available to assign items to and appears in
   the category list.
2. **Given** a category exists, **When** the user adds an item with a name, description,
   quantity and price, **Then** it appears in the catalog and is selectable in the relevant
   planning dropdowns for its equipment type.
3. **Given** a hand-entered item exists in an inventory, **When** the user later uploads a
   spreadsheet to that same inventory, **Then** the hand-entered item is still present, is
   not marked discontinued, and its plan references still resolve.
4. **Given** an item is referenced by an event's plan, **When** the user tries to delete it,
   **Then** the deletion is refused and the user is told how many references exist.
5. **Given** a category still contains items, **When** the user tries to delete it, **Then**
   the deletion is refused.

---

### User Story 3 - Send the rental order to any supplier (Priority: P2)

Having planned an event, the technician needs to hand the order to a supplier. If the
catalog came from the built-in supplier's price list, they still get that exact file back
with quantities filled in. Whatever the catalog's origin, they can also download a tidy PDF
order — grouped by equipment category, priced, totalled — that they can attach to an email,
and a plain spreadsheet of the same order for a supplier who wants to edit the numbers.

**Why this priority**: Completes the loop for non-LL users, who otherwise can plan an event
but cannot get the order out of the tool. Equal in importance to Story 2; listed after it
because a catalog must exist before an order can be exported from it.

**Independent Test**: Plan an event against a non-LL catalog, download the PDF and the
generic spreadsheet, and confirm both list every planned item with correct quantities and
totals. Verify the LL export is not offered. Delivers a complete, sendable order document.

**Acceptance Scenarios**:

1. **Given** an event bound to an inventory that was imported from the built-in supplier's
   price list, **When** the user opens the rental order, **Then** all three export options
   are offered and the price-list export behaves exactly as it does today.
2. **Given** an event bound to an inventory that was never imported from that price list,
   **When** the user opens the rental order, **Then** the price-list export is not offered,
   and requesting it directly is refused with an explanatory message.
3. **Given** any event with a non-empty rental order, **When** the user downloads the PDF,
   **Then** it shows the event name, date, venue, generation date and inventory name; one
   section per equipment category with a subtotal; per-line quantities split into audio and
   lighting, unit price and line sum; and a grand total excluding VAT.
4. **Given** a rental order containing a line that exceeds available stock, **When** the PDF
   is produced, **Then** that line is visibly marked and the marking is explained in a
   footnote.
5. **Given** a rental order long enough to span multiple pages, **When** the PDF is
   produced, **Then** column headings repeat on every page and every page is numbered.
6. **Given** any event, **When** the user downloads the generic spreadsheet order, **Then**
   it lists category, item, description, audio and lighting quantities, total, unit price
   and subtotal for every line.

---

### Edge Cases

- **Empty rental order.** Exporting a PDF or spreadsheet for an event with nothing planned
  produces a valid document showing zero lines and a zero total, not an error.
- **Event with no date or venue.** The PDF header omits the missing fields cleanly rather
  than printing empty separators.
- **Uploading the wrong file.** A file that is not a spreadsheet, or a spreadsheet with no
  recognisable headings, is rejected with a message that says what was expected. The catalog
  is unchanged.
- **Uploading the built-in supplier's price list to the generic importer** (or vice versa).
  Rejected on missing required headings rather than silently producing a garbage catalog.
- **Blank and partially blank rows.** Rows with no Name are skipped silently — users leave
  spacer rows in spreadsheets. Rows with a Name but no Category are errors.
- **Same category name with two different equipment types** in one file. The first
  occurrence wins and the user is warned.
- **An unrecognised equipment type value**, or a misspelling. Rejected with the row number,
  so the user can fix it rather than discovering later that a fixture never appears in the
  lighting dropdowns.
- **Duplicate item names in one file.** Both rows are imported; matching against the
  existing catalog is positional within the duplicate group, as it already is today.
- **Hand-entered item whose name later appears in an uploaded file.** Both survive as
  separate items; the user can delete whichever they don't want.
- **Special characters** in equipment names (Swedish å/ä/ö, ampersands, quotes) render
  correctly in the PDF and in the exported spreadsheet, and survive a round trip through
  the generic template.
- **Duplicating an inventory.** The copy remembers how the original was created, so the
  copy offers exactly the same export options.
- **Non-owners.** Only an inventory's owner can add, edit or delete its categories and
  items; a collaborator on an event using that inventory can still read it and export
  orders from it.

## Requirements *(mandatory)*

### Functional Requirements

#### Generic spreadsheet import

- **FR-001**: The system MUST accept a supplier-agnostic spreadsheet whose rows each
  describe one catalog item, carrying Category, equipment Type, Name, Description, Quantity
  and Price excluding VAT.
- **FR-002**: The system MUST locate columns by their heading text rather than their
  position, and MUST accept common alternative headings for each column.
- **FR-003**: The system MUST ignore columns it does not recognise, so users can keep their
  own working columns in the file.
- **FR-004**: The system MUST treat Category and Name as required, and Type, Description,
  Quantity and Price as optional, defaulting a missing Type to audio and missing numeric
  values to zero.
- **FR-005**: The system MUST reject the whole upload, changing nothing, when any data row
  has a Name but no Category, or an unrecognised Type value, and MUST report the 1-based
  sheet row number of each offending row.
- **FR-006**: The system MUST silently skip fully blank rows and rows with no Name.
- **FR-007**: The system MUST warn, without failing, when one Category name appears with
  conflicting Type values, and MUST apply the first Type encountered.
- **FR-008**: The system MUST parse quantities and prices tolerantly, accepting thousands
  separators, comma decimal separators and trailing currency text.
- **FR-009**: The system MUST apply the same non-destructive catalog update as the existing
  import: matched items keep their identity and plan references, absent items are marked
  discontinued rather than deleted, and a failed import changes nothing.
- **FR-010**: The system MUST record which format an inventory was populated from.

#### Downloadable template

- **FR-011**: The system MUST offer a downloadable blank template of the generic format.
- **FR-012**: The template MUST carry the correct column headings, a visually fixed heading
  row, and a constrained choice of Type values so the user cannot mistype one.
- **FR-013**: The template MUST include worked example rows and brief filling-in
  instructions, positioned so they can never be imported as real catalog items.
- **FR-014**: A template downloaded from the system, filled in and uploaded back MUST import
  successfully — the template and the importer cannot be allowed to drift apart.

#### Manual inventory management

- **FR-015**: Users MUST be able to create, rename, retype and delete categories in an
  inventory they own, regardless of whether that inventory was ever imported.
- **FR-016**: Users MUST be able to create, edit and delete items in an inventory they own,
  setting category, name, description, available quantity and price excluding VAT.
- **FR-017**: The system MUST distinguish hand-entered items from imported ones, and MUST
  preserve hand-entered items across any subsequent import to the same inventory — they
  MUST NOT be marked discontinued and MUST NOT be overwritten by an imported row.
- **FR-018**: The system MUST refuse to delete an item that is referenced anywhere in any
  event's plan, and MUST tell the user how many references exist.
- **FR-019**: The system MUST refuse to delete a category that still contains items.
- **FR-020**: Only the inventory's owner MUST be able to perform any of FR-015 to FR-019;
  everyone else MUST be unable to see or reach these actions.
- **FR-021**: Duplicating an inventory MUST carry over both the recorded source format and
  the hand-entered/imported distinction of every item.

#### Format-aware export

- **FR-022**: The system MUST offer the existing supplier price-list export only for
  inventories actually populated from that supplier's price list, MUST hide the action
  otherwise, and MUST refuse a direct request for it with an explanatory message.
- **FR-023**: The existing price-list export MUST be unchanged in behaviour and output for
  inventories that qualify, including its handling of unplaceable lines.
- **FR-024**: The system MUST produce a PDF rental order for any event, regardless of how
  its inventory was populated.
- **FR-025**: The PDF MUST show an event header containing event name, date, venue,
  generation date and inventory name, omitting any that are absent.
- **FR-026**: The PDF MUST group lines by equipment category, show a subtotal per category,
  and show a grand total excluding VAT together with category, line and unit counts.
- **FR-027**: Each PDF line MUST show item name, description, audio quantity, lighting
  quantity, total quantity, unit price excluding VAT and line sum.
- **FR-028**: The PDF MUST visibly mark lines that exceed available stock and lines whose
  item is discontinued, and MUST explain each marking in a footnote.
- **FR-029**: The PDF MUST repeat column headings on every page and number every page.
- **FR-030**: The PDF MUST render correctly for equipment names containing Swedish
  characters.
- **FR-031**: The system MUST produce a generic spreadsheet rental order for any event,
  listing category, item, description, audio quantity, lighting quantity, total, unit price
  and subtotal per line, plus a totals row.
- **FR-032**: Exported files MUST be named after the event and its date, and MUST NOT
  collide with one another.
- **FR-033**: Export actions MUST remain available to every role that can currently export,
  including viewers.

### Key Entities

- **Inventory**: An owned catalog of rentable equipment. Gains a record of how it was
  populated — from the built-in supplier's price list, from a generic spreadsheet, or by
  hand — which determines which export formats it offers.
- **Inventory Category**: A named grouping of items within an inventory, carrying an
  equipment type (audio, lighting, rigging, video, misc) that drives which planning
  dropdowns its items appear in. Now user-creatable and editable.
- **Inventory Item**: A single piece of rentable equipment: name, description, available
  quantity, price excluding VAT, and its category. Now user-creatable and editable, and
  additionally records whether it was hand-entered or imported, so imports leave
  hand-entered items alone.
- **Rental Order**: The existing per-event derived summary of everything the plan
  references. Gains awareness of each line's category so it can be presented grouped.
- **Inventory Template**: A blank generic spreadsheet the system generates on demand,
  guaranteed by construction to match what the importer accepts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who rents from a supplier other than the built-in one can go from an
  empty account to a fully planned event with an exportable order, without ever touching the
  built-in supplier's price list.
- **SC-002**: A new user can produce a working catalog of 20 items from the downloaded
  template in under 10 minutes, with no documentation beyond what the template itself
  contains.
- **SC-003**: 100% of import failures tell the user which sheet row is at fault, and leave
  the catalog exactly as it was.
- **SC-004**: Hand-entered items survive an arbitrary number of subsequent imports with zero
  data loss and zero broken plan references.
- **SC-005**: Every existing event bound to a price-list inventory produces a byte-identical
  price-list export to the one it produced before this feature shipped.
- **SC-006**: The price-list export is unreachable — both in the interface and by direct
  request — for every inventory not populated from that price list.
- **SC-007**: The PDF order is legible and complete without further editing: a supplier
  receiving it can identify every item, quantity and price, and reconcile the total.
- **SC-008**: An order of at least 100 lines exports to a correctly paginated PDF with
  repeated headings and no truncated content.

## Assumptions

- The existing per-inventory ownership and per-event role model is reused unchanged; no new
  permission concepts are introduced. Inventory editing stays owner-only, matching how
  inventories already behave.
- The generic format targets a single flat sheet rather than section headers or one sheet
  per type, because it is the easiest shape for a user to create, sort, filter and paste
  into. This was chosen explicitly over the alternatives.
- The PDF is generated by the system as a downloadable file rather than relying on the
  browser's print dialog, because the document is sent to a third party and its layout must
  not vary by browser. This was chosen explicitly over reusing the existing print sheets.
- The PDF is written in English, matching the rest of the interface, while exported
  filenames keep the existing Swedish prefix for consistency with the current price-list
  export.
- Equipment types remain the existing fixed set (audio, lighting, rigging, video, misc)
  because planning dropdowns branch on them; users define categories freely but not types.
- Manual editing of inventories is a desktop activity. Mobile keeps its existing read-only
  inventory browsing, consistent with how the mobile redesign treats other rare setup
  actions.
- Prices are ex-VAT throughout, as they already are; no VAT calculation is introduced.
- The generic import stores no copy of the uploaded file, since there is no supplier
  template to write quantities back into. Only the price-list import needs to retain the
  original file.
- Round-tripping a generic export back into the importer is not a goal; the generic
  spreadsheet export is an order document, not a catalog format.
- Out of scope: video equipment planning, multi-event/tour templates, importing from CSV or
  other file types, and supplier-specific formats beyond the existing built-in one.
