# Quickstart: Equipment Lists — Owned Gear & Event Extras

## Run

```bash
cd backend && go run ./cmd/main.go     # applies migrations 011–012
cd frontend && npm run dev
```

## Verify: owned catalog (US1)

1. Inventory page → **Owned gear** tab → add "Shure SM7B", audio, 1 owned.
2. Edit its quantity; delete another test item. Reload — state persists.
3. Rental catalog tab and planning dropdowns never show owned items.

```bash
curl -s -X POST localhost:7331/api/v1/owned-items -d '{"name":"Shure SM7B","category_type":"audio","quantity_owned":1}' | jq
curl -s localhost:7331/api/v1/owned-items | jq
```

## Verify: plan owned gear (US2)

1. Event → **Equipment** tab → add SM7B ×1 note "podcast mic".
2. Rental Order tab totals and `GET /events/{id}/rental-export/report`
   are unchanged; the exported file contains no owned line.
3. Set quantity 3 (> owned 1) → line flagged "exceeds owned (1)".
4. Re-import LL.xlsx → owned catalog and event lines untouched.
5. Delete the owned item from the catalog → confirm dialog mentions the
   affected event; the event's line disappears.

## Verify: unified extras (US3)

1. Add a manual rental line on the Rental Order tab (e.g. XLR cables ×12).
2. Equipment tab shows it under **Rented extras**; edit the quantity there;
   the Rental Order tab reflects it.

## Tests

```bash
cd backend && go vet ./... && go test ./...
cd frontend && npm run lint && npm run typecheck && npm test
```
