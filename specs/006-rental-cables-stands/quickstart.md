# Quickstart: Cables & Stands from Inventory

## Automated gates (run per checkpoint and at the end)

```sh
cd backend && go vet ./... && go test ./... && golangci-lint run
cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run && npm run build
```

## §1 Cable & stand picking (US1/US2/US3)

1. Open an event → Audio Inputs. On a channel, open the cable picker: options
   read like "Mikrofonkabel — 4m"; every option is visually unique.
2. Pick "Mikrofonkabel — 4m" on two channels, "Mikrofonkabel — 10m" on one,
   a stand ("Mikrofonstativ Med bom") on two channels; leave one channel with
   no cable and no stand.
3. Audio Outputs: pick a speaker cable ("Högtalarkabel Speakon 2x2,5 — …") on
   two outputs.
4. Rental Order tab: the 4 m cable shows quantity 2, the 10 m quantity 1, the
   stand quantity 2, the speaker cable quantity 2 — priced, summed with any
   manual lines, over-stock flagged if planned > stock (try exceeding one).
5. Export: the downloaded LL.xlsx copy has those quantities on the items'
   rows (Antal Ljud); re-import leaves the catalog unchanged.
6. Print the Inputs sheet: Cable/Stand columns show the item names with
   their length/variant text; no length column of its own remains.

## §2 Legacy migration (US4) — use a COPY of a pre-upgrade DB, never the live one

1. Copy a database that has pre-slice-6 events, run the backend against the
   copy (env-var DB path), open an old event.
2. Rows that had XLR + a stocked length (e.g. 10 m) now show
   "Mikrofonkabel — 10m" picked and counted on the rental order.
3. Rows with any other cable type, all output cables, and all stands show
   their old values as read-only text; they are NOT counted; picking a
   catalog item replaces the legacy text permanently.
4. Nothing on any row lost its cable/stand information.

## §3 Roles (Inventory page)

1. Inventory page: Signalkablage / Signalkablage digital / Högtalarkablage
   are marked Cable, Stativ & Lyftutrustning marked Stand (seeded).
2. Clear a role → that category's items leave the pickers; restore it →
   they return. Re-import the price list → roles survive.
