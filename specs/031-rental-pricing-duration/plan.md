# Implementation Plan: Rental pricing by duration

**Branch**: `031-rental-pricing-duration` | **Date**: 2026-07-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/031-rental-pricing-duration/spec.md`

## Summary

A day rate becomes a price. Four numbers, three of them read from files the
application already opens and throws away.

**The rate card.** A new `inventory_rent_factors` table holds the supplier's
`days → multiplier` curve. It arrives from `LL.xlsx`'s `Hyresfaktor` sheet, from
a new optional `Pricing` sheet in the generic template, or typed into the
catalog's own Pricing drawer. It is read by **stepping down** to the highest row
at or below the billed days, clamped at both ends.

**The cascade.** Charged-days rule and VAT rate live on the user (as defaults a
catalog adopts at import), on the catalog (the supplier's terms) and on the event
(`NULL` = follow the catalog). Discount lives on the event alone. Nothing an
event stores reaches its catalog.

**The computation, in one place.** `db.GetRentalSummary` fills a new
`RentalPricing` block. Its four callers are the whole set of places an order is
rendered — the JSON, the PDF, the generic spreadsheet, the LL price list — so
**no export can be written that omits the price**. The arithmetic itself is pure
and lives in `domain`.

**The rename.** `RentalSummary.TotalExVAT` → `SubtotalExVAT`, keeping its
meaning. Nine call sites, one of which is the Overview number band that has shown
a day rate labelled *RENTAL, EX VAT* since Wave 4. A field added beside the old
one would have left all nine compiling and eight of them wrong.

**Two drawers and a tab.** *Pricing* on the rental panel's bar and on the
catalog's, both `ui/Drawer` built from `ui/GearList`; `/my-defaults` becomes two
tabs. **No `design/` file is edited** — every construction already exists, and
the ledger is `GearSpecs` rows in a `GearCard`.

## Technical Context

**Language/Version**: Go 1.25 (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: chi, `modernc.org/sqlite`, `golang-migrate`,
`xuri/excelize`, `go-pdf/fpdf`; TanStack React Query, Tailwind. **Nothing added**
— both spreadsheet reads and the PDF block use libraries already in `go.mod`.

**Storage**: SQLite. One migration pair (**050**): one table, eight columns,
every one with a constant default so no data conversion is needed and every
existing row keeps its meaning.

**Testing**: Go `testing` for the pure lookup and the arithmetic (the table-driven
cases in FR-003), `go test` over `internal/db` for the cascade's resolution,
`httptest` for the five new routes and their validation, and a parser test
against the **real `LL.xlsx`** for the 16 rows and the VAT formula. Vitest for
`lib/rentalPricing.ts`. Per the constitution's pragmatic-testing rule, tests land
on the arithmetic, the parsers, the payloads and the pure module — not on
rendering.

**Target Platform**: Single Go binary serving an embedded SPA; desktop plus the
`useIsMobile` branch.

**Project Type**: Web application — `backend/` + `frontend/`.

**Performance Goals**: `GetRentalSummary` gains two queries (the event's catalog
pricing, the rate card) on a call that already runs a thirteen-arm CTE. The
rental tab issues no additional request: the drawer reads the summary it already
has and the event it already has.

**Constraints**:
- The PDF stays cp1252-representable — `x` not `×`, `-` not `−` — per
  `rental_pdf.go`'s own header comment.
- The LL export writes only cells a human types, and never rewrites a formula.
- A malformed rate-card row must never reject a 308-item price list.
- The strip's **tint** stays the stock verdict; pricing speaks in words.

**Scale/Scope**: One table, eight columns, five routes, two drawers, one phone
sheet, one page gains a tab, three exports gain a block, two importers gain a
sheet, one field renamed across nine sites.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see below.*

| Principle | Assessment |
|---|---|
| **I · Domain-First Data Model** | **Pass.** A rent factor is a real thing a rental house publishes, in their own vocabulary (`Hyresfaktor`), and it is modelled as the traversable table it is rather than as a number typed into a note. The `UNIQUE (inventory_id, days)` constraint is the domain statement that the table is one curve. Nothing becomes free text. |
| **II · Extensibility by Design** | **Pass.** The rate card is **data, not code** — a supplier who publishes a 60-day row gets one by adding a row, with no new endpoint, component or enum. `charged_days` is the one closed set, and it is closed because it names two derivations that exist in `Event.Resolve()`, not two labels. |
| **III · Full-Stack Monorepo Architecture** | **Pass.** Resource-oriented routes inside the existing guarded groups; handlers in `api/`, queries in `db/`, pure arithmetic in `domain/`, sheet parsing in `service/`. One versioned migration pair applied on startup. No new package. |
| **IV · Inventory-Driven Rental Workflow** | **Pass, and this is the principle the slice serves.** *"Every event MUST be exportable as a supplier-neutral rental order that stands on its own — identifying the event, every item, its quantities, and **its price**"*. The order has not carried its price; it carries a day rate. The LL export additionally reproduces the supplier's own file more faithfully than before, filling in the two cells that file was built to have filled. And *"lines that cannot be represented faithfully MUST be reported"* is extended to the two cells, via `pricing_placed`. |
| **V · Pragmatic Simplicity** | **Pass.** Two scalars on `users` rather than a settings table; the derived block computed in the one function every renderer already calls rather than in a service each would have to remember; no new `components/ui/` file, because the ledger is composable from `GearCard` and `GearSpecs` — which is the test of whether this is one language or several. |

**Gate result: pass.** No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/031-rental-pricing-duration/
├── mockup.html                  # approved, revision 2 — the visual source of truth
├── spec.md
├── plan.md                      # this file
├── research.md                  # Phase 0
├── data-model.md                # Phase 1
├── quickstart.md                # Phase 1
├── contracts/
│   └── pricing-api.md           # Phase 1
├── checklists/
│   └── requirements.md
└── tasks.md                     # Phase 2
```

### Source Code (repository root)

```text
backend/
├── migrations/050_rental_pricing.{up,down}.sql   # new
└── internal/
    ├── domain/
    │   ├── pricing.go                 # new — RentFactor, InventoryPricing,
    │   │                              #   RentalPricing, PricingDefaults,
    │   │                              #   LookupRentFactor, BilledDays, ComputePricing
    │   ├── pricing_test.go            # new — the six lookup cases, the arithmetic
    │   ├── rental.go                  # TotalExVAT -> SubtotalExVAT; + Pricing
    │   ├── event.go                   # + 4 fields
    │   └── inventory.go               # (unchanged)
    ├── db/
    │   ├── pricing.go                 # new — rate-card CRUD, inventory + event
    │   │                              #   pricing, user defaults, resolution
    │   ├── pricing_test.go            # new — the cascade, the unique constraint
    │   ├── rental.go                  # GetRentalSummary fills Pricing
    │   └── events.go                  # scan the 4 columns; UpdateEventPricing
    ├── api/
    │   ├── pricing.go                 # new — /pricing-defaults, inventory pricing,
    │   │                              #   rate-card rows, event pricing
    │   ├── pricing_test.go            # new — validation, 409, viewer 403
    │   ├── router.go                  # + 1 handler in the auth group
    │   ├── inventories.go             # + RegisterOwned routes
    │   └── events.go                  # + RegisterEvent route
    └── service/
        ├── inventory_pricing_sheet.go # new — one parser, both importers
        ├── inventory_pricing_sheet_test.go
        ├── inventory_import.go        # LL: Hyresfaktor + the VAT formula
        ├── inventory_import_generic.go# generic: the optional Pricing sheet
        ├── inventory_template.go      # + the blank Pricing sheet
        ├── rental_export.go           # + writePricingCells
        ├── rental_pdf.go              # + the ledger block
        └── rental_xlsx.go             # + the ledger rows

frontend/src/
├── types/index.ts                     # RentalPricing, the rename, Event + 4,
│                                      #   InventoryPricing, RentFactor
├── api/
│   ├── rentals.ts                     # + putEventPricing
│   ├── inventories.ts                 # + pricing + rate-card calls
│   └── pricingDefaults.ts             # new
├── lib/
│   ├── rentalPricing.ts               # new — ledger rows, factor-source words,
│   │                                  #   the browser's own step-down lookup
│   └── rentalPricing.test.ts          # new
├── components/
│   ├── event/
│   │   ├── PricingDrawer.tsx          # new
│   │   ├── RentalTab.tsx              # + the bar button, + the overflow entry
│   │   └── RentalStatusRail.tsx       # the derivation
│   ├── inventory/
│   │   └── InventoryDrawers.tsx       # + PricingDrawer (catalog)
│   └── mobile/
│       └── MobilePricingSheet.tsx     # new
└── pages/
    ├── MyDefaults.tsx                 # two tabs
    └── Inventories.tsx                # + the Pricing button in the catalog bar
```

**Structure Decision**: existing directories only. The catalog's Pricing drawer
joins `InventoryDrawers.tsx` beside Categories and Import — it is opened from the
same bar and is the same kind of thing — while the event's is its own file beside
the tab that opens it, matching `EventDetailsDrawer`.

## Delivery order

Each step is a commit, and each leaves the tree green.

1. **The schema and the arithmetic.** Migration 050, `domain/pricing.go` with its
   table-driven tests, `db/pricing.go` and the cascade's resolution. Nothing
   renders differently; nothing calls it yet.
2. **The summary.** `GetRentalSummary` fills `Pricing`; the rename lands with all
   nine call sites, the PDF and the spreadsheet still printing only the subtotal.
   **This is the largest single commit and it is where the exports must not
   break** — every existing rental test is run here.
3. **The routes.** `api/pricing.go`, the five routes, their validation and their
   tests. The interface still cannot reach them.
4. **The parsers.** The `Pricing`/`Hyresfaktor` sheet parser, both importers, the
   VAT formula heuristic, the template's new sheet and the round-trip test.
   Importing the real `LL.xlsx` now produces a priced catalog with nothing typed.
5. **The exports.** The PDF block, the spreadsheet rows, the LL write-back and
   `pricing_placed`. The paper now says what the database knows.
6. **The interface.** `lib/rentalPricing.ts` and its tests; the strip; both
   drawers; the phone sheet; `/my-defaults`' second tab.
7. **The documents.** `ROADMAP.md`'s Slice 31 section rewritten from *planned* to
   what was built, and the *What remains* index emptied.

Steps 1–5 are independently reviewable and cannot regress the interface. Step 2
is the one to review hardest: it is where a number that has meant one thing for
twenty-nine slices starts meaning another.

## Phase 0 — Research

Eight questions in [research.md](research.md): the exact cells in `LL.xlsx`
(R1), where that file states its VAT rate — only inside formulas (R2), why event
pricing cannot ride on `PATCH /events/{id}` (R3), where the pricing block must be
computed so no export can miss it (R4), what the rename touches (R5), step down
versus interpolate (R6), why an import replaces the rate card rather than
respecting `is_manual` (R7), and where a user-scoped setting lives (R8).

## Phase 1 — Design & Contracts

- [data-model.md](data-model.md) — the table, the eight columns, the cascade's
  resolution order, and why `users.default_*` appears nowhere in it.
- [contracts/pricing-api.md](contracts/pricing-api.md) — five new routes, the
  renamed field, the `pricing` block, and the export report's new outcome.
- [quickstart.md](quickstart.md) — how to see it work, including the case the
  slice exists for and the three that must not break.

### Constitution re-check, post-design

Unchanged: **pass**. The design added one table, five routes, no package, no
dependency and no `components/ui/` file.

Two things are worth restating after design. **Principle IV** is not merely
satisfied but advanced: the LL export now fills in the two cells that file was
built to have filled, and reports when it cannot — which is the same duty the
principle already places on lines. And **Principle II**: the rate card is data,
so the one thing that would have violated it — a hard-coded 25% for LL imports,
or a hard-coded curve — was rejected in research (R2, R6) rather than defended
here.

## Complexity Tracking

No violations. Nothing to record.
