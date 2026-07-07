# Quickstart: Rental Order Correctness

How to run and manually verify this feature end-to-end.

## Run

```bash
# Terminal 1 — backend (applies migrations 008–010 on startup)
cd backend && go run ./cmd/main.go

# Terminal 2 — frontend
cd frontend && npm run dev    # http://localhost:5173

# Import / re-import the catalog
curl -X POST http://localhost:7331/api/v1/inventory/import-xlsx
```

## Verify: complete rental order (US1)

1. Create an event; open **Audio Inputs**.
2. Add a catalog-linked stagebox and stage multi in the manager panel.
3. Add 3 input rows: two with the same mic (e.g. "Shure SM58"), one `di` with
   a line box.
4. On **Audio Outputs**, assign an amplifier and a speaker to a row.
5. On **Lighting Rig**, add one catalog fixture.
6. Open **Rental Order** — expect lines for: mic ×2, line box ×1, stagebox ×1,
   multi ×1, amp ×1, speaker ×1 (audio column) and the fixture ×1 (lighting
   column), each priced, with a grand total.

```bash
curl -s localhost:7331/api/v1/events/1/rentals | jq '.items[] | {inventory_item_name, quantity_audio, quantity_lighting, is_over_stock}'
```

## Verify: import safety (US2)

1. With the plan above in place, re-run the import curl.
2. Reload the event: every patch row, stagebox, multi, and fixture is intact
   and still shows its equipment.
3. Temporarily remove one referenced item's row from a copy of `LL.xlsx`,
   import that copy: the plan row survives and the rental order line shows
   the discontinued flag.

## Verify: manual lines (US3)

1. On **Rental Order**, add a manual line: pick "XLR-kabel" style item, set
   audio quantity 12, note "FOH runs".
2. The line appears, priced, in the total. Add 2 more of an item already
   auto-counted → one merged line, quantity bumped by 2.
3. Edit the quantity, then delete the line — order updates each time.

```bash
curl -s -X PUT localhost:7331/api/v1/events/1/rentals/manual/57 \
  -H 'Content-Type: application/json' \
  -d '{"quantity_audio":12,"quantity_lighting":0,"notes":"FOH runs"}' | jq
curl -s -X DELETE localhost:7331/api/v1/events/1/rentals/manual/57 -i
```

## Verify: stock validation (US4)

1. Plan more units of an item than its `Antal`/stock in the price list
   (e.g. put the same mic on more channels than the renter stocks).
2. **Rental Order** highlights the line in red with "exceeds stock
   (N available)" and shows the page-level warning banner.
3. Remove rows until within stock — warning clears.

## Verify: legacy backfill

1. Start from a pre-feature database that has free-text mic models.
2. Boot the backend once (runs migration 009).
3. Inputs whose text matched a catalog name are linked (dropdown shows the
   item); unmatched ones show the old text with an "unlinked" badge and do not
   appear on the rental order.

## Tests

```bash
cd backend && go vet ./... && go test ./...
cd frontend && npx tsc --noEmit
```
