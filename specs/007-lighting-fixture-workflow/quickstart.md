# Quickstart: Lighting Rig Workflow

## Automated gates (run per checkpoint and at the end)

```sh
cd backend && go vet ./... && go test ./... && golangci-lint run
cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run && npm run build
```

## §1 Fixture IDs (US1)

1. Open an event → Lighting Rig. Type fixture IDs (e.g. 101, 102) into the
   FID column on existing rows; reload — the values persist.
2. Give two rows the same ID → both FID cells show the amber duplicate flag;
   fix one → flags clear. Rows without an ID are never flagged.
3. Print the lighting sheet: FID is the first column, empty where unset.

## §2 Modes in the Add Fixture dialog (US2)

1. On the Inventory page, ensure a lighting model has two modes defined.
2. Lighting tab → Add fixture → select that model: a mode picker appears;
   choosing "Extended (16 ch)" fills mode = Extended, channels = 16.
3. Switch the dialog to a model without modes: picker disappears, the typed
   mode/channel values reset to defaults, free text works.
4. Add with a picked mode → the created row carries mode + count directly.

## §3 Bulk-add (US3)

1. Click Bulk add: model, quantity 8, mode picked, truss "Front", universe 2,
   power grid/Schuko; start FID pre-filled with the next free number — set 101.
2. Submit → 8 new rows: FIDs 101–108, same mode/truss/universe, DMX addresses
   sequential continuing after anything already on universe 2, positions
   appended; each row individually editable.
3. Try quantity 40 of a 16-channel mode on one universe (640 ch) → rejected
   with the universe-full message, zero rows created.
4. Try quantity 0 and 101 → rejected.
5. Run Auto-assign DMX afterwards → still works and repacks as before.
