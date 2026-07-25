# Quickstart: Generic Inventory Formats, Manual Entry & PDF Rental Order

**Feature**: `022-generic-inventory-formats` | **Branch**: `022-generic-inventory-formats`

## Run it

```bash
# backend (port 7331)
cd backend && go run ./cmd/main.go &

# frontend (port 5173, proxies /api to 7331)
cd frontend && npm run dev
```

## Gates

```bash
cd backend  && go vet ./... && go test ./...
cd frontend && npm run typecheck && npm run lint && npm test
```

`npm run typecheck` is `tsc -b`. **Do not** substitute `tsc --noEmit` — the root
`tsconfig.json` is references-only, so `--noEmit` checks nothing and passes unconditionally
(constitution v0.4.0, Development Workflow).

## Production build

```bash
make build   # vite build -> backend/cmd/dist -> single Go binary
```

## Database safety

Never run against `backend/patchplanner.db`. Point the server at a throwaway copy:

```bash
cp backend/patchplanner.db /tmp/pp-slice22.db
cd backend && PATCHPLANNER_DB=/tmp/pp-slice22.db go run ./cmd/main.go
```

Migrations `040` and `041` are additive `ALTER TABLE ... ADD COLUMN` statements with
deterministic backfills, but verify them against a copy first regardless.

## Add the PDF dependency

```bash
cd backend && go get github.com/go-pdf/fpdf@v0.9.0
```

`go.mod`/`go.sum` will grow by six modules; only `fpdf` is actually linked (the rest back
optional barcode/template subpackages this feature never imports — verify with
`go list -deps ./... | grep -c barcode`, which should print `0`).

---

## Manual verification

A fresh account, or a throwaway DB copy, is the cleanest starting point.

### 1. Template round trip (US1)

1. Inventories → create an inventory → **Download template**.
2. Open it. Confirm the `Inventory` sheet has a frozen bold header row and that the `Type`
   column offers a drop-list of `audio / lighting / rigging / video / misc`.
3. Confirm the `Example` sheet has sample rows and instructions.
4. Fill in ~6 rows on the `Inventory` sheet across audio, lighting and rigging. Save.
5. **Import generic list (.xlsx)** → categories and items appear with the right types.
6. Open an event bound to this inventory and confirm the items appear in the relevant
   planning dropdowns (a lighting item in the fixture picker, an audio mic in the mic picker).

### 2. Import validation (US1, SC-003)

1. Clear the `Category` cell of one data row; set another row's `Type` to `lights`. Re-import.
2. Both problems are reported together, each naming its sheet row number.
3. The catalog is **unchanged** — no partial import.
4. Reorder the columns and add a junk column of your own; re-import → still works.
5. Rename the sheet from `Inventory` to `Blad1`; re-import → still works (first-sheet fallback).

### 3. Manual entry (US2)

1. Add a category by hand, then two items in it.
2. Edit one item's price; confirm it persists.
3. Delete an unused item → succeeds.
4. Reference an item from an event's patch, then try to delete it → refused, with the
   reference count.
5. Try to delete a category that still has items → refused.
6. Sign in as a different user and confirm the inventory (and these controls) are not reachable.

### 4. Manual items survive imports (US2, FR-017 — the key regression)

1. In the inventory you imported in step 1, add an item by hand.
2. Re-import the same generic file.
3. The hand-entered item is **still present, not discontinued**, with its price and quantity
   intact, and still selectable in planning dropdowns.
4. Add a hand-entered item whose name matches a row in the file, then re-import: two separate
   items exist, and the hand-entered one's values were not overwritten.

### 5. Export gating (US3, FR-022)

1. On an event bound to the generic inventory: the Rental Order tab offers **Export .xlsx**
   and **Export PDF**, and **no** Export LL.xlsx.
2. Request `/api/v1/events/{id}/rental-export` directly → 400 with the explanatory message.
3. Switch to an event bound to an LL-imported inventory → all three buttons appear.

### 6. PDF (US3)

1. Download the PDF. Check: event header (name, date, venue, generation date, inventory name);
   one section per category with a subtotal; audio/lighting split per line; grand total ex VAT.
2. Over-book an item (plan more than the available stock) → its line is marked `*` and the
   footnote explains it with the available count.
3. Include an item with `å ä ö` in its name → renders correctly.
4. Build an order of 100+ lines → paginates, column headers repeat, page numbers read
   "Page N of M", nothing is truncated.
5. Export an event with nothing planned → a valid PDF with zero lines, not an error.
6. Export an event with no date and no venue → header omits them cleanly.

### 7. LL regression (SC-005 — must not break)

1. On an LL inventory, export LL.xlsx. Confirm quantities land in `Antal Ljud` / `Antal Ljus`,
   stale values are cleared, and unplaced lines are reported as before.
2. Re-import that exported file → the catalog is unchanged and plan references still resolve
   (`TestImportRoundTripPreservesReferences` covers this in CI).
3. Duplicate an LL inventory → the copy still offers the LL export; duplicate a generic one →
   the copy does not.

### 8. Mobile

Inventory browsing stays read-only on mobile (no add/edit/delete controls); the rental order
stays read-only for every role, with export buttons available. Desktop layouts are pixel-
unchanged apart from the new controls.
