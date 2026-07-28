# Quickstart

## Run it

```bash
# backend — no migration in this slice
cd backend && go run ./cmd

# frontend — proxies /api and /health to the backend
cd frontend && npm run dev
```

Then open `/inventories`.

## Gates

Everything below must pass before a commit in this slice is considered done.

```bash
cd backend  && go vet ./... && go test ./...
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

These are exactly what `.github/workflows/ci.yml` runs, and nothing more —
earlier slices' quickstarts list `golangci-lint run`, which is neither installed
here nor part of CI.

**`tsc -b`, not `tsc --noEmit`.** The root `tsconfig.json` is references-only, so
`--noEmit` type-checks nothing and passes on a broken tree. This has bitten the
project before.

## Database safety

**Never point a dev server at `backend/patchplanner.db`.** Copy it and set the
path:

```bash
cp backend/patchplanner.db /tmp/claude-1000/pp-032.db
PATCHPLANNER_DB=/tmp/claude-1000/pp-032.db go run ./cmd
```

This slice adds no migration, so a copy is only needed for the fixture below —
which binds and deletes events, and must not be rehearsed on real data.

## The fixture

Five catalogs, covering every state the list can be in.

| Catalog | Items | Categories | Events bound | Source | Demonstrates |
|---|---|---|---|---|---|
| LL prislista 2026 | 308 | 12 | 9 | `ll` · LL-2026.xlsx | the working catalog; **no delete control**; nine links |
| Backline & PA | 84 | 6 | 2 | `generic` · backline-2026.xlsx | the second format, and why the export set differs |
| LL prislista 2025 | 291 | 12 | 0 | `ll` · LL-2025.xlsx | last year's file — `—` in *Used on*, delete available |
| Ljus – Gasklockorna | 47 | 4 | 1 | hand-built | no source file; one binding is still a binding |
| Sandbox | 3 | 1 | 0 | hand-built | the delete path, and the smallest possible catalog |

Strip should read: `5 catalogs · 733 items · 12 events run on them · 2 unused`.

## What to check, and where it is easy to get wrong

**One frame.** The page is one bordered box. If you can see a gap between two
bordered things, the card list has survived.

**One request.** Open the network panel and reload. There must be exactly one
`GET /api/v1/inventories` and **no** `GET /api/v1/inventories/{id}/items`. This
is the regression most likely to creep back in, because adding a count to a row
is one `useQuery` away.

**`—` versus `0`.** *LL prislista 2025* shows `—` under *Used on* and `291`
under *Items*. A `0` in the *Used on* column is the bug: no binding is an
absence, not a measurement.

**Search.**

- `2025` matches *LL prislista 2025* by name.
- `backline-2026` matches *Backline & PA* by its **source filename**, which is
  the half people forget to implement.
- `zzz` leaves one sentence and a strip reading `0 of 5 catalogs`, with the
  field still holding `zzz`.
- Delete all five catalogs and reload: **no search field renders at all**.

**The drawer, on a catalog in use.** Open *LL prislista 2026*. There must be:

- a *Catalog* section with a card (name, source file, item count) and a mono
  spec line, and a **Duplicate** control on the heading row;
- an amber-edged form holding the name — and nothing that looks like a field
  inside the card above it;
- a *Used on* section headed `9`, listing **all nine**, oldest first;
- **no delete control anywhere**, and one sentence saying why;
- 10 px mono micro-labels and `h-7` buttons. If you see `h-10` fields or 14 px
  labels, the interior is at the wrong tier — compare it side by side with the
  Rig drawer on Audio Inputs.

**Scrolling.** Bind forty events to one catalog. The drawer body scrolls; the
*Used on* section must not have a scrollbar of its own. Two scrollbars inside
one overlay is the failure the category rail already taught us.

**The links.** Middle-click an event in *Used on* — it must open that event in a
new tab, which means it is a real `<a href>` and not a click handler. Clicking
it normally navigates and closes the drawer.

**The delete path.** Open *Sandbox*. Delete sits apart from Save. Pressing it
asks inside the form, naming the catalog and `3 items`. Cancel leaves
everything; confirming returns you to the list without it.

**No browser dialogs.** Nothing in this page may produce the browser's own grey
dialog:

```bash
grep -rn "window\.\(prompt\|confirm\|alert\)" \
  frontend/src/pages/Inventories.tsx frontend/src/components/inventory/
```

must return nothing but the comment in `InventoryDrawer.tsx` saying what it
replaced. Note the scope: `window.confirm` survives in nineteen other files and
this slice does not touch them.

**The bar of the catalog itself.** Open a catalog and check its bar carries
**Manage**, opening the same drawer over the sheet.

**The phone.** Narrow the window below the breakpoint: rows are touch height,
carry the counts in the subtitle and a chip at the end (`9 events` or `unused`),
and there is no `⋯` control — management is reached from the catalog's own
screen.

## The two numbers that must agree

```bash
# the count the column shows, and the count the refusal uses
sqlite3 /tmp/claude-1000/pp-032.db \
  "SELECT id, name, (SELECT COUNT(*) FROM events WHERE inventory_id = i.id) FROM inventories i;"
```

Then try `DELETE /api/v1/inventories/{id}` on one with a non-zero count with
`curl`: the `409` message must name the same number the column did.
