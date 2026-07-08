# Quickstart: Configurable Reference Data

## Run

```bash
# Backend (from backend/)
go run ./cmd            # applies migrations 013–018 on startup, :7331

# Frontend (from frontend/)
npm run dev             # :5173
```

## Verify: upgrade invisibility (US1)

1. Start against a database that already has events with patch rows and
   fixtures (a copy of your dev DB — never the original).
2. Open every planning tab: Audio Inputs, Audio Outputs, Lighting.
   Each dropdown (signal type, preamp connector, cable types, output type,
   mic stand, power connector, truss type) offers the same choices as before.
3. Existing rows show their stored values; edit an unrelated field on a row
   and save — accepted, value unchanged.

## Verify: settings page (US2)

1. Open **Settings** in the nav.
2. Under *Signal cable types* add value `dmx5`, label `DMX 5-pin`.
3. Open an event → Audio Inputs: `DMX 5-pin` appears in the cable dropdown;
   select it on a channel and save.
4. Back in Settings, rename the label to `DMX 5-pin (110 Ω)`; the input row
   now shows the new label.
5. Try to delete it → refused with an in-use message.
6. Point the channel back at XLR, delete `dmx5` again → gone from dropdown.
7. Try adding `xlr` to signal cable types → duplicate rejected.

## Verify: fixture modes (US3)

1. Inventory → Rental catalog → pick a lighting fixture model → add modes
   `Basic` (16 ch) and `Extended` (39 ch).
2. Event → Lighting: patch that fixture, pick `Extended` from the mode
   dropdown → channel count fills with 39.
3. Auto-assign DMX → next fixture starts 39 channels later.
4. Switch the fixture to `Basic` → count becomes 16.
5. In the catalog, change `Extended` to 40 channels → the patched fixture
   still shows its copied values (copy-on-pick).
6. A fixture model without modes: mode text + channel count remain manually
   editable exactly as before.

## Verify: import isolation

1. Note Settings values and a model's modes.
2. Re-import the price list from the Inventory page.
3. Vocabularies and fixture modes are unchanged.

## Tests & gates

```bash
cd backend  && go vet ./... && go test ./... && golangci-lint run
cd frontend && npm run lint && npm run typecheck && npm run test && npm run build
```

Key backend tests: migration rebuild preserves rows (pre-insert with all
legacy values incl. empty mic_stand, migrate, compare), vocabulary CRUD +
duplicate 409 + in-use 409 per usage-map column, unseeded legacy value still
readable/writable, fixture-mode CRUD + cascade on item delete + re-import
leaves modes intact, GET /reference-data shape (all eight keys).
