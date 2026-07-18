# Quickstart: Stage Plots (013)

## Run

```bash
# backend (applies migrations 032/033 + the truss-section conversion on startup)
cd backend && go run ./cmd

# frontend
cd frontend && npm run dev
```

**DB safety (standing rule)**: never verify migrations against the live
dev DB — copy it first and point the backend at the copy:

```bash
cp backend/patchplanner.db /tmp/claude-1000/pp-verify.db
PATCHPLANNER_DB=/tmp/claude-1000/pp-verify.db go run ./cmd
```

Record the reference event's rental totals **before** the first run with
the new migrations and diff after (SC-004/SC-008 byte-for-byte check):

```bash
curl -s localhost:8080/api/v1/events/1/rental-summary > /tmp/claude-1000/rental-before.json
# ...start new build against the copy...
curl -s localhost:8080/api/v1/events/1/rental-summary | diff /tmp/claude-1000/rental-before.json -
```

## Manual walkthrough (maps to spec user stories)

1. **US1** — Event → new "Stage Plots" tab → create "Main stage". Draw a
   rectangle, set 600 × 400 cm in the inspector; place a `person`
   resource, name it; verify a 46 cm speaker renders at 46/600 of the
   stage width at any zoom.
2. **US2** — Toggle grid, set 25 cm, drag with snap-to-grid on → position
   lands on exact multiples (check inspector values); drag next to
   another element with snap-to-objects on → guide appears, edges align
   exactly.
3. **US3** — Add "Lighting" layer, mark active, place elements; hide it
   (elements unselectable), lock it (visible, uneditable); deleting the
   last layer must 409.
4. **US4** — On a speaker element, add stack entries and assignments from
   existing planned data; delete the underlying entity in its own tab →
   link disappears, element stays; rental summary unchanged.
5. **US5** — Trusses manager: new truss, add 3 × "Tross F34 2m" pieces
   (length auto-parses to 200 cm) → drawn length exactly 600 cm. Attach
   rig fixtures at offsets; drag the truss → fixtures follow. Rental
   order now lists 3 × the truss item under Antal Ljus; Lighting tab
   shows "Front truss · 100 cm" read-only per attached fixture.
6. **US6** — Switch Top/Front/Side: same model in all three; raise the
   truss in Front view → Side view agrees; icons switch to per-view
   variants.

## Tests & gates

```bash
cd backend && go vet ./... && go test ./... && golangci-lint run
cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run
```

Key suites for this slice:

- `db/stage_plot_truss_migration_test.go` — conversion per legacy shape
  (section with/without fixtures, zero-length, multi-rig), idempotence.
- `db/rental_test.go` — truss arm: counted once with two placements;
  NULL-item legacy pieces contribute nothing.
- `api/stage_plots_test.go` — CRUD, last-layer 409, kind validation,
  link target validation + delete cleanup.
- `lib/stagePlot.test.ts` — projection mapping, snapping exactness
  (SC-003), truss length sum, name→length parse ("2m", "0,5m"),
  fixture label composition.
- `printSheets.test.tsx` — StagePlotSheet renders with scale caption.
