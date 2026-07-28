# Quickstart

## Run it

```bash
# backend — applies migrations 045 and 046 on startup
cd backend && go run ./cmd

# frontend — proxies /api and /health to the backend
cd frontend && npm run dev
```

Then open `/events`.

## Gates

Everything below must pass before a commit in this slice is considered done.

```bash
cd backend  && go vet ./... && go test ./... && golangci-lint run
cd frontend && npx tsc -b && npm run lint && npm run test
```

**`tsc -b`, not `tsc --noEmit`.** The root `tsconfig.json` is references-only, so
`--noEmit` type-checks nothing and passes on a broken tree. This has bitten the project
before.

## Database safety

**Never point a dev server at `backend/patchplanner.db`.** Copy it and set the path:

```bash
cp backend/patchplanner.db /tmp/pp-030.db
PATCHPLANNER_DB=/tmp/pp-030.db go run ./cmd
```

Migrations 045 and 046 are both reversible, but 046's down migration drops columns and
therefore drops their values. Rehearse on the copy.

## The fixture

Every state this slice introduces, on one screen. Dates assume today is **2026-07-28**
(a Tuesday); shift them by the same offset to use another day.

| Event | Load-in | First | Last | Load-out | Demonstrates |
|---|---|---|---|---|---|
| Sommarfest Gävle 2025 | | 2025-08-16 | | | past, a year up — the *find last year's file* case |
| Dalakören 40 år | | 2026-06-06 | | | past, one day |
| Rock i Parken | | 2026-07-11 | | | past, recent |
| Sommarscen Borlänge | 2026-07-26 | 2026-07-27 | 2026-07-29 | | **running**, `day 2 of 3`, distinct on-site |
| Sommarfest Gävle | | 2026-08-14 | | | **the next show** — filled ringed dot |
| Karin & Erik — vigsel | | 2026-08-22 | | | the ordinary case: one date, three placeholders |
| Kulturnatt Falun | 2026-09-03 | 2026-09-04 | 2026-09-06 | | multi-day + **overlap** |
| Höstsalongen | | 2026-09-05 | | | the other half of the overlap; set your role to `viewer` |
| Företagsfest Ludvika | | 2026-09-17 | | | one evening — the other half of the on-site clash |
| Bruksrock | 2026-09-17 | 2026-09-18 | 2026-09-20 | 2026-09-21 | **on-site clash** — show days do not touch |
| Nyårsfirande | | 2026-12-31 | 2027-01-01 | | a span crossing a **year** boundary |
| Turné 2027 — skiss | | | | | **undated** — last, under its own heading |

### What to check, and where it is easy to get wrong

1. **Bruksrock and Företagsfest are braced and say `on-site clash`, not `overlap`.** Their
   show spans (18–20 and 17) do not intersect; their on-site spans (17–21 and 17) do. If
   this reads `overlap`, the discriminant is testing the wrong pair of intervals.
2. **Kulturnatt and Höstsalongen say `overlap`.** Both are shows, on the 5th.
3. **Sommarscen is current, not past**, on the 28th — and stays current on the 29th. This is
   the defect fix. Move the clock to the 30th and it becomes past.
4. **Sommarscen says `load-in today` on the 26th**, not `day 0 of 3`.
5. **Bruksrock is still current on 2026-09-21**, its load-out day, with no show that day.
   Getting this wrong means the past test is using `endDate` rather than `loadOutDate`
   (research.md R2).
6. **Karin & Erik has no on-site chip.** Load-in equals the first day, so there is nothing
   to say.
7. **Nyårsfirande files under December 2026** — its first show day — and appears once, not
   in both years.
8. **Turné 2027 is last**, under `No date`, with `—` in the gutter, and is not marked as
   colliding with anything.
9. **The year track draws twelve marks for 2026**, none capped, with Kulturnatt/Höstsalongen
   and Företagsfest/Bruksrock each on two lanes.
10. **Search for `gävle`** and the track redraws to two marks — one in 2026, and none until
    you step to 2025.

### Backwards compatibility

Take a copy of a real database from before this slice, run the migrations, and open every
event. Nothing may show `—` where a date used to be, no event may have moved in the list,
and the dashboard must name the same next show it named before (unless one is now running,
which is the point).
