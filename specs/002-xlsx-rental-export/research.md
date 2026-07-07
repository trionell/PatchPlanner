# Research: Excel Rental Order Export

Phase 0 output. Decisions were made against the actual `LL.xlsx` (inspected
during Slice 1: header row 2 with columns `Beskrivning | Kommentar | Tot.
Antal | Ex Moms | Ink Moms | Antal Ljud | Antal Ljus | Summa Ljud | Summa
Ljus | Packat`, items at their `xlsx_row` positions, leftover order
quantities present in the file).

## R1. How to locate the quantity columns

**Decision**: Scan the first rows of the sheet for header cells whose
normalized text (whitespace/newlines collapsed, case-insensitive) equals
"Antal Ljud" and "Antal Ljus"; fail the export with a clear error if either
is missing. Never hard-code column letters.

**Rationale**: The real header cells contain embedded newlines ("Tot. \nAntal"
style), so normalization is required anyway; header search keeps the export
working if the renter inserts a column, and satisfies Principle II.

**Alternatives considered**: Fixed columns F/G — breaks silently on the first
layout change, and "silently wrong file" is the worst failure mode this
feature has.

## R2. Placement and drift protection

**Decision**: For each rental line: skip (and report) if the item is
`discontinued` or has no recorded `xlsx_row`; otherwise read column A at
`xlsx_row` and compare the trimmed, case-insensitive name to the catalog
item's name. Match → write `quantity_audio` / `quantity_lighting` (only
values > 0). Mismatch → leave the row untouched, add to the unplaced report
with reason `row_mismatch`.

**Rationale**: `xlsx_row` is refreshed on every import (Slice 1 upsert), but
the file on disk can drift between imports. FR-004 demands a quantity never
lands on the wrong equipment; the name check makes that a guarantee rather
than a hope. Duplicate-named items (seven "Dmx kabel 3-pol" rows) still place
correctly because each catalog item carries its own row.

## R3. Clearing stale quantities

**Decision**: After locating the columns, iterate every row below the header
and clear both quantity cells (set to empty) before writing the event's
values.

**Rationale**: The repository's actual `LL.xlsx` contains leftover quantities
from a previously submitted order (rows 3 and 338) — without clearing, every
export would phantom-order equipment. Clearing also covers "export twice
after plan changes" (no accumulation).

## R4. Endpoint shape: separate report + download

**Decision**: Two GET endpoints:
- `GET /events/{id}/rental-export/report` → JSON: filename + unplaced lines.
- `GET /events/{id}/rental-export` → the `.xlsx` stream with
  `Content-Disposition: attachment`.

The UI calls the report first, renders notices, then triggers the download
via a plain anchor navigation. Both endpoints run the same writer; the report
endpoint just discards the bytes.

**Rationale**: A file response can't carry structured warnings a UI can
render, and headers-as-JSON is fragile. Running the writer twice is
negligible (<10 ms) for a single-user tool and keeps both endpoints trivially
cacheable/testable. A browser download needs a plain URL (no fetch-blob
gymnastics), which the separate file endpoint provides.

**Alternatives considered**: single endpoint returning multipart or
base64-in-JSON (clunky, breaks native download UX); warnings in a custom
response header (size limits, encoding pain).

## R5. Formula (Summa) columns

**Decision**: Do not touch the `Summa Ljud`/`Summa Ljus` cells. Note: their
*cached* values in the file won't reflect the new quantities until the renter
opens the file in Excel/LibreOffice, which recalculates on open.

**Rationale**: Writing computed prices ourselves would desync from the
sheet's own formulas and violate "submit unmodified" in spirit. Recalc-on-open
is standard spreadsheet behavior.

## R6. Filename

**Decision**: `Hyrorder - {event name}[ - {event date}].xlsx`, with
characters outside `[A-Za-z0-9 ._-åäöÅÄÖ]` replaced by `_`, served via
RFC 5987 `filename*` plus an ASCII fallback in `Content-Disposition`.

**Rationale**: Identifies the event (FR-006), survives Windows filename
rules, keeps Swedish characters where the browser supports them.

## R7. Round-trip compatibility with the importer

**Decision**: Add a test that re-imports an exported file and asserts the
catalog is unchanged and the quantities read back equal the plan (SC-001).

**Rationale**: Slice 0/1 already fixed `isCategoryHeader` to ignore the
order-quantity columns, so a file with quantities re-imports cleanly — this
test locks that property in so future importer changes can't break the
export → import loop.

## R8. Source file access

**Decision**: Reuse the importer's `INVENTORY_PATH` resolution (default
`../LL.xlsx`), extracted into a shared helper in the api package. The file is
opened read-only; the modified workbook is written to the HTTP response
stream only (`file.Write(w)`), never back to disk (FR-007).
