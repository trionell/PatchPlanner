# Contract: Generic Inventory Spreadsheet & PDF Rental Order Layout

**Feature**: `022-generic-inventory-formats` | **Date**: 2026-07-25

This is a **user-facing contract**, not an API one: it defines the file a user fills in and
the document a supplier receives. Both were reviewed and approved before implementation.
(Precedent for a non-API contract in this project: `specs/021-mobile-friendly-redesign/contracts/mobile-ui-contract.md`.)

---

## 1. The generic inventory spreadsheet

### Shape

A single sheet named **`Inventory`**, row 1 = headers, one catalog item per row.

| Category | Type | Name | Description | Quantity | Price (ex VAT) |
|---|---|---|---|---|---|
| Microphones | audio | Shure SM58 | Dynamic vocal mic | 12 | 120 |
| Microphones | audio | Shure Beta 91A | Boundary kick mic | 2 | 250 |
| Mixers | audio | Behringer X32 | 32ch digital | 1 | 1800 |
| Stageboxes | audio | Behringer S32 | 32/16 stagebox | 2 | 600 |
| Moving heads | lighting | Robe Pointe | 20ch / 24ch modes | 8 | 900 |
| Truss | rigging | Prolyte H30V 2m | Triangle truss 2m | 10 | 150 |

Chosen over LL-style section-header rows and over one-sheet-per-type because a flat table is
the easiest thing for a user to sort, filter, and paste into from a supplier's own list.

### Column recognition

Columns are found by **header text**, normalized (whitespace collapsed, lowercased) with the
existing `normalizeHeader` helper — never by position. Any column whose header matches nothing
is ignored, so users may keep their own working columns.

| Column | Required | Accepted headers (normalized) |
|---|---|---|
| Category | **Yes** | `category` |
| Type | No | `type`, `category type` |
| Name | **Yes** | `name`, `item` |
| Description | No | `description`, `comment` |
| Quantity | No | `quantity`, `qty`, `available` |
| Price | No | `price`, `price ex vat`, `price (ex vat)` |

### Values

- **Type** — one of `audio`, `lighting`, `rigging`, `video`, `misc`; case-insensitive; blank
  defaults to `audio`. Anything else is an error naming the row and the accepted values.
  Types are fixed because planning dropdowns key on them; **categories** are free-form.
- **Quantity / Price** — tolerant parsing: thousands separators, comma decimals, and trailing
  currency text all accepted (`550 kr`, `1 750,00`, `1,750.0`). Unparseable → `0`.
- **Category** — free text. Creates the category on first use; matched case-insensitively
  thereafter.

### Sheet resolution

Use the sheet named `Inventory`; if absent, use the **first sheet** in the workbook — users
paste supplier lists into workbooks whose sheet is called `Sheet1` or `Blad1`.

### Row handling

| Row | Behaviour |
|---|---|
| Fully blank | Skipped silently |
| `Name` blank | Skipped silently (spacer rows are normal in hand-made sheets) |
| `Name` set, `Category` blank | **Error**, reported with its 1-based sheet row number |
| `Type` unrecognised | **Error**, reported with its row number |
| Duplicate names | Both imported; matched positionally within the duplicate group, as today |

A file with any error imports **nothing** — the catalog is left exactly as it was. All bad
rows are reported together, so a user fixing a 200-row sheet sees every problem at once.

### Import semantics

Identical to the existing LL import, because it reuses `UpsertInventory`: matched items keep
their identity and every plan reference, missing items are marked *discontinued* rather than
deleted, and the whole thing is one transaction. Hand-entered items are untouched.

Unlike the LL import, the uploaded file is **not** retained — there is no supplier template to
write quantities back into. Only `source_filename` is kept, for display.

### The downloadable template

Generated on demand, never checked in, so it cannot drift from the parser (a test imports a
freshly generated template to enforce this).

**Sheet `Inventory`** — headers only:

- Row 1 bold, frozen, so headers stay visible while scrolling.
- Column widths sized to their content (Description widest).
- A drop-list on the `Type` column (rows 2–1000) constraining entry to the five valid values,
  removing the single most likely user error at the point of entry.

**Sheet `Example`** — the same headers plus the six sample rows above, and a short
instructions block beneath them:

```
How to use this template
------------------------
1. Fill in the "Inventory" sheet, one piece of equipment per row.
2. Category is your own grouping (e.g. Microphones, Moving heads).
   It is created automatically the first time you use it.
3. Type must be one of: audio, lighting, rigging, video, misc.
   It decides which planning dropdowns the item shows up in.
4. Quantity is how many the supplier has. Price is per item, excluding VAT.
5. Category and Name are required. Everything else is optional.
6. Extra columns of your own are ignored - keep whatever notes you like.
7. Upload the file on the inventory page. Re-uploading updates the catalog
   without breaking anything you have already planned.
```

Examples live on a **separate sheet** because the importer prefers `Inventory`; putting them
in the main sheet would import "Shure SM58" into every new user's catalog.

---

## 2. The PDF rental order

A4 portrait, 12mm margins (matching the app's existing `@page { margin: 12mm }` print rule).
English throughout; the filename keeps the Swedish `Hyrorder` prefix for consistency with the
existing export.

```
+--------------------------------------------------------------------+
| RENTAL ORDER                                                       |
| Sommarfesten 2026                                                  |
| 2026-08-14 - Folkets Hus, Gavle          Generated 2026-07-25      |
| Inventory: Lasse Ljud & Ljus AB                                    |
+--------------------------------------------------------------------+

MICROPHONES                                                    audio
  Item                  Description      Aud  Lig  Tot   Unit    Sum
  Shure SM58            Dynamic vocal      8    -    8    120    960
  Shure Beta 52A        Kick drum mic      1    -    1    180    180
                                          ---------------------------
                              Subtotal                 9        1 140

MIXERS                                                         audio
  Behringer X32         32ch digital       1    -    1  1 800  1 800
                              Subtotal                 1        1 800

MOVING HEADS                                                lighting
  Robe Pointe *         20/24ch mode       -    8    8    900  7 200
                              Subtotal                 8        7 200

====================================================================
TOTAL          3 categories - 12 items - 42 units      31 480,00 SEK
                                                          excl. VAT

* exceeds available stock (6 in inventory)
```

### Rules

| Element | Rule |
|---|---|
| Header | Event name; then date and venue, each omitted cleanly if absent; generation date; inventory name |
| Sections | One per category, ordered by category name, with the category's type shown right-aligned |
| Line order within a section | The rental summary's existing `name ASC` order — unchanged |
| Line columns | Item, Description, Audio qty, Lighting qty, Total, Unit price ex VAT, Line sum |
| Zero quantity | Rendered `-` rather than `0`, so the audio/lighting split reads at a glance |
| Subtotal | Per category: total units and summed line values |
| Grand total | Category count, line count, unit count, and the sum ex VAT |
| Over stock | Trailing `*` on the item name, explained in a footnote with the available count |
| Discontinued | Trailing `(discontinued)` on the item name, explained in the same footnote block |
| Pagination | Column headers repeat on every page; footer shows `Page N of M` |
| Empty order | A valid document with zero lines and a zero total — not an error |

### Character-set constraint

The PDF uses **built-in Helvetica with a cp1252 translator**, so no font file is embedded and
the binary stays small. The cost is a hard rule: **every character drawn must exist in
cp1252**. `å ä ö é &` are fine. `▲`, `–` (en dash), `·` (middle dot) and `═` are **not** — they
would render as garbage.

Hence the ASCII-only markers above: `*` for over-stock, `-` as the header separator, `=` for
the total rule. This constraint is verified by a test asserting Swedish characters survive.

---

## 3. The generic spreadsheet rental order

For suppliers who want to edit numbers rather than read a document. Available for **any**
inventory. Sheet `Rental order`, one row per line, grouped by category with a totals row:

| Category | Item | Description | Audio | Lighting | Total | Unit price | Subtotal |
|---|---|---|---|---|---|---|---|
| Microphones | Shure SM58 | Dynamic vocal mic | 8 | | 8 | 120 | 960 |
| Mixers | Behringer X32 | 32ch digital | 1 | | 1 | 1800 | 1800 |
| Moving heads | Robe Pointe | 20/24ch mode | | 8 | 8 | 900 | 7200 |
| **TOTAL** | | | 9 | 8 | 17 | | **9 960** |

This is an *order document*, not a catalog format — it is deliberately not accepted back by
the generic importer (different columns, different meaning).

---

## 4. Export filenames

Named after the event and its date, with unsafe characters replaced — reusing the existing
`exportFilename` logic, generalized to take an extension.

| Export | Filename | Availability |
|---|---|---|
| Supplier price list | `Hyrorder - {event} - {date}.xlsx` | **Only** `source_format = 'll'` |
| Generic spreadsheet | `Hyrorder - {event} - {date} (lista).xlsx` | Any inventory |
| PDF | `Hyrorder - {event} - {date}.pdf` | Any inventory |

The ` (lista)` suffix keeps the two spreadsheets from colliding in a downloads folder when an
LL user exports both. The date segment is omitted when the event has no date.
