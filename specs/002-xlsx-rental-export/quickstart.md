# Quickstart: Excel Rental Order Export

## Run

```bash
cd backend && go run ./cmd/main.go          # terminal 1
cd frontend && npm run dev                  # terminal 2
curl -X POST http://localhost:7331/api/v1/inventory/import-xlsx   # fresh catalog
```

## Verify: submit-ready file (US1)

1. Plan an event (a few mics, a stagebox, an amp/speaker output, a fixture,
   one manual line).
2. Rental Order tab → **Export**. A file named
   `Hyrorder - <event> - <date>.xlsx` downloads.
3. Open it: every planned item's row has its quantity in *Antal Ljud* or
   *Antal Ljus*; prices/names/comments untouched; the sheet's own Summa
   columns compute the totals when opened.
4. Confirm the stale quantities that ship in the repo's `LL.xlsx` (rows 3 and
   338) are cleared in the export.

```bash
curl -s http://localhost:7331/api/v1/events/1/rental-export/report | jq
curl -sO -J http://localhost:7331/api/v1/events/1/rental-export   # saves with server filename
```

## Verify: no silent omissions (US2)

1. Make a copy of `LL.xlsx` with one planned item's row deleted; import that
   copy (the item becomes *discontinued*).
2. Export again: the file downloads, and the report lists the item with its
   quantities and reason `discontinued`; the UI shows the notice.
3. Restore by re-importing the original file.

## Verify: failure handling

```bash
INVENTORY_PATH=/nonexistent.xlsx ./patchplanner   # then hit export
# → 500 with a clear error; no download
```

## Verify: round-trip (SC-001)

Re-import the exported file: catalog unchanged (item ids/prices identical),
and the quantities you planned are readable at the same items.

## Tests

```bash
cd backend && go vet ./... && go test ./...
cd frontend && npm run lint && npm run typecheck && npm test
```
