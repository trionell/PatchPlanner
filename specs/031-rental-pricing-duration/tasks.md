---
description: "Task list for Slice 31 — rental pricing by duration"
---

# Tasks: Rental pricing by duration

**Input**: Design documents from `/specs/031-rental-pricing-duration/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/pricing-api.md](contracts/pricing-api.md),
[quickstart.md](quickstart.md), [mockup.html](mockup.html) (approved, revision 2)

**Tests**: Included, on the arithmetic, the parsers, the payloads and the pure
module — never on the rendering. That is the constitution's pragmatic-testing
rule and the shape every slice since 027 has taken.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: which user story the task serves (US1–US7)

## Path conventions

Web application: `backend/` (Go) and `frontend/src/` (React/TS), per
[plan.md](plan.md) § Project Structure.

## Commits

Seven, matching plan.md's delivery order. Each leaves the tree green.

| # | What | Stories |
|---|---|---|
| 1 | the schema and the arithmetic | — |
| 2 | the summary, and the rename | US1, US4 |
| 3 | the routes | US2, US3, US6 |
| 4 | the parsers and the template | US2, US4 |
| 5 | the exports | US5 |
| 6 | the interface | US1, US3, US6, US7 |
| 7 | the documents | — |

**Commit 2 is the one to review hardest.** It is where a number that has meant
the same thing for twenty-nine slices starts meaning another, and where all four
renderers of an order are touched at once.

**The gates, run before every commit:**

```bash
cd backend  && gofmt -l . && go vet ./... && go test ./...
cd frontend && npx tsc -b && npx eslint src && npx vitest run && npx vite build
```

`tsc -b`, never `tsc --noEmit` — the root tsconfig is references-only and
`--noEmit` checks nothing.

---

## Phase 1: Foundational — the schema and the arithmetic

**Nothing renders differently. Nothing calls any of it yet.**

- [X] **T001** Write `backend/migrations/050_rental_pricing.up.sql`:
      `inventory_rent_factors` with `UNIQUE (inventory_id, days)` and
      `ON DELETE CASCADE`, plus the eight columns from
      [data-model.md](data-model.md). Every column takes a constant default, so
      there is no data conversion and no entry needed in `db.go`'s staged
      `Migrate(N)` sequencing. Write the header comment the way 046's is written:
      what `NULL` means, and why there are no CHECK constraints.
- [X] **T002** Write `050_rental_pricing.down.sql`: `ALTER TABLE ... DROP COLUMN`
      for all eight, in reverse order, then `DROP TABLE inventory_rent_factors`.
      That is what 040, 041 and 046 all do. Say in the header, as 046 does, what
      reversing costs: every rate card and every agreed discount goes with it.
- [X] **T003** [P] `backend/internal/domain/pricing.go` — `RentFactor`,
      `InventoryPricing`, `PricingDefaults`, `RentalPricing`, and the two charged-days
      constants. Structs only; no logic yet.
- [X] **T004** `domain.LookupRentFactor(factors []RentFactor, days int) (factor float64, row int, found bool)`
      — steps down to the highest row with `days ≤ billed`, clamps below the first
      row and above the last, returns `found=false` on an empty card. Assumes
      ascending order and says so in its comment; the query guarantees it.
- [X] **T005** `domain.BilledDays(event Event, chargedDays string) (days int, first, last string)`
      — inclusive of both ends, over `event.Resolve()`, returning 1 for an event
      with no `start_date`. Never negative: the API has refused out-of-order dates
      since Slice 30.
- [X] **T006** `domain.ComputePricing(...) RentalPricing` — the supplier's own
      order: discount, then factor, then VAT. Fills the three `*_source` fields.
- [X] **T007** `backend/internal/domain/pricing_test.go` — table-driven, and the
      six lookup cases FR-003 names by name: exact hit, between rows (17 → the
      14-day row), below the first, above the last, single row, empty card. Plus
      **`BilledDays`' four cases** (FR-011): onsite over four dates, show days
      over the same, an event carrying only a `start_date` → 1, an event with no
      dates → 1. Plus the arithmetic against the worked example:
      `12 480 → −25% → ×2.20 → 20 592 → +25% VAT → 25 740`.
- [X] **T008** `backend/internal/db/pricing.go` — the rate card's CRUD (returning
      `ErrDuplicate` on the unique violation, ordered by `days` ascending),
      `GetInventoryPricing`/`SetInventoryPricing`,
      `GetPricingDefaults`/`SetPricingDefaults`, `UpdateEventPricing`.
- [X] **T009** `backend/internal/db/events.go` — scan the four new columns into
      `domain.Event`. **Leave `UpdateEvent` alone**: it is a whole-object replace
      and adding pricing to it is exactly the bug research.md R3 found.
- [X] **T010** `backend/internal/db/pricing_test.go` — the cascade resolves as
      data-model.md's table says; a duplicate `days` is refused; deleting a
      catalog takes its rate card; an event's departure does not touch its
      catalog.

**Checkpoint** — gates green. Commit 1.

---

## Phase 2: US1 + US4 — the summary, and the rename

- [X] **T011** `domain/rental.go` — `TotalExVAT` → `SubtotalExVAT`
      (`json:"subtotal_ex_vat"`), and add `Pricing RentalPricing`
      (`json:"pricing"`). A value, not a pointer: every order has a price.
- [X] **T012** `db.GetRentalSummary` — after the lines, load the event, its
      catalog's pricing and the rate card, and fill `Pricing` via
      `domain.ComputePricing`. Two extra queries. Document *why here*: its four
      callers are the whole set of places an order is rendered (research.md R4).
- [X] **T013** Follow the rename through Go: `service/rental_xlsx.go:105`,
      `service/rental_pdf.go:250`, `db/rental.go`'s accumulation, and the
      assertions in `db/rental_test.go` and `db/owned_test.go`. **Neither export
      prints the new block yet** — that is commit 5.
- [X] **T014** `backend/internal/db/rental_test.go` — the summary carries a
      pricing block; a catalog with no rate card gives `rent_factor 1.0` and
      `rent_factor_source "none"`; an event with no dates gives `billed_days 1`;
      an override beats the table. And **FR-016 as an assertion**: with a factor
      and a discount applied, every line's `price_ex_vat` and `subtotal_ex_vat`
      are byte-for-byte what they were before — the factor multiplies the order,
      not the line, and nothing else in this slice says so out loud.
- [X] **T015** [P] `frontend/src/types/index.ts` — `RentalPricing`, the rename on
      `RentalSummary`, the four fields on `Event`, `InventoryPricing`,
      `RentFactor`, `PricingDefaults`.
- [X] **T016** Follow the rename through TypeScript — `lib/eventSummary.ts:295`
      and `components/event/RentalStatusRail.tsx:68`, plus
      `lib/eventSummary.test.ts`. **`eventSummary` must read
      `pricing.total_ex_vat`**, not the subtotal: the Overview number band has
      shown a day rate labelled *RENTAL, EX VAT* since Wave 4, and this task is
      where that stops being true.

**Checkpoint** — gates green, every existing rental test passing. Commit 2.

---

## Phase 3: US2 + US3 + US6 — the routes

- [X] **T017** `backend/internal/api/pricing.go` — `PricingHandler` with
      `Register` (`/pricing-defaults`), `RegisterOwned` (the inventory's pricing
      and rate-card rows) and the event's `PUT /pricing`, per
      [contracts/pricing-api.md](contracts/pricing-api.md).
- [X] **T018** Validation, in the handler, returning 400 with the offending value
      named: `charged_days` ∈ {onsite, show, (null on an event)}, `days ≥ 1`,
      `factor > 0`, `0 ≤ discount ≤ 100`, `vat ≥ 0`. Duplicate `days` → 409 from
      `ErrDuplicate`.
- [X] **T019** Wire the routes: `router.go` (the auth group), `inventories.go`'s
      `RegisterOwned`, `events.go`'s `RegisterEvent`. No new middleware — the
      three groups already carry the right guards.
- [X] **T020** `frontend/src/api/pricingDefaults.ts` [P] and the additions to
      `api/inventories.ts` and `api/rentals.ts`. Nothing imports them yet.
- [X] **T021** `backend/internal/api/pricing_test.go` — each validation case; the
      409; a viewer's `PUT /events/{id}/pricing` is 403 from the middleware; a
      non-owner's inventory pricing is 404, not 403.
- [X] **T022** `backend/internal/api/events_dates_test.go` (or beside it) — a
      `PATCH /events/{id}` carrying no pricing fields **leaves the discount
      intact**. This is research.md R3's finding, made a regression test.

**Checkpoint** — gates green. Commit 3.

---

## Phase 4: US2 + US4 — the parsers and the template

- [X] **T023** `backend/internal/service/inventory_pricing_sheet.go` — one
      parser, both importers: find the sheet by name (aliases `pricing`,
      `rent factor`, `rental factor`, `hyresfaktor`), find the `Days`/`Factor`
      header row by label (aliases including `antal dagar`), and read the rows.
      The optional `VAT %` row (aliases including `moms`) is **generic-only** —
      LL states its rate in `Sammanställning`, not in `Hyresfaktor`, which is why
      T024 is a separate reader rather than a branch in here. Returns rows, an
      optional rate, and warnings. Reuses `normalizeHeader`.
- [X] **T024** The VAT formula heuristic — locate the `Summa utrustning ink` row
      in `Sammanställning` by label, read `GetCellFormula`, take the multiplier
      from `\*\s*([0-9]+(?:[.,][0-9]+)?)`, convert `1.25 → 25`. Every failure
      path means *this file states no rate*; none of them is an error
      (research.md R2).
- [X] **T025** `inventory_import.go` — the LL importer calls both, replacing the
      rate card only when rows were found (FR-006) and the catalog's VAT only
      when the file stated one (FR-017). Neither ever reads a user default.
- [X] **T026** `inventory_import_generic.go` — the same, from the optional
      `Pricing` sheet. A rate-card problem is a **warning**, never an
      `ImportValidationError` (FR-007).
- [X] **T027** `db.CreateInventory` seeds `charged_days` and `vat_percent` from
      the **creating user's** defaults. Creation, not import: the columns are
      `NOT NULL`, so there is no unset state an import could detect, and an
      import that re-applied a default would undo the edit the drawer exists to
      allow (data-model.md). Add the *"VAT 25% read from the file"* line to the
      import result's warnings — the only place that provenance is ever
      reported (FR-017a).
- [X] **T028** `inventory_template.go` — the blank `Pricing` sheet: the `VAT %`
      label, the `Days`/`Factor` header, no values. Extend the instructions on
      the `Example` sheet.
- [X] **T029** `inventory_template_test.go` — extend the round-trip test so the
      template and the parser cannot drift, and assert the **blank** template
      carries no rows and therefore replaces nothing.
- [X] **T030** `inventory_pricing_sheet_test.go` — against the real `LL.xlsx` at
      the repository root: 16 rows, `5 → 2.2`, `30 → 6.6`, and VAT 25 from the
      formula. Plus a file with no such sheet, a malformed row, and duplicate
      days (last wins, with a warning).

**Checkpoint** — gates green; importing the real `LL.xlsx` produces a priced
catalog with nothing typed. Commit 4.

---

## Phase 5: US5 — the exports

- [X] **T031** `rental_pdf.go` — the TOTAL row gains *per day*; a block follows
      it with discount, rent factor (naming the day count and the row it came
      from), the priced total, VAT and the inc-VAT total. **cp1252 only**: `x`
      not `×`, `-` not `−`, per that file's own header comment.
- [X] **T032** `rental_xlsx.go` — the same six figures as rows under the existing
      TOTAL, in the same columns, as values rather than formulas.
- [X] **T033** `rental_export.go` — `writePricingCells`: locate `Rabatt
      utrustning` and `Hyresfaktor (Antal dagar)` by normalized label in column A
      of `Sammanställning`, write both value columns. **Never** write VAT, and
      never touch a formula (FR-031).
- [X] **T034** `domain.RentalExportReport` gains `pricing_placed` and
      `pricing_notes` — a **list**, since the labels being absent and the VAT
      disagreeing are independent. A failure to place never fails the export.
- [X] **T035** `rental_pdf_test.go`, `rental_export_test.go`,
      `rental_export_formats_test.go` — the figures appear; a renamed label
      still exports the quantities and reports the miss; the `*1.25` formulas are
      byte-identical after a write.

**Checkpoint** — gates green; all three exports agree with the screen. Commit 5.

---

## Phase 6: US1 + US3 + US6 + US7 — the interface

- [X] **T036** `frontend/src/lib/rentalPricing.ts` — the ledger's rows, the words
      for each `*_source`, and the browser's own step-down lookup (FR-003). Pure.
- [X] **T037** [P] `lib/rentalPricing.test.ts` — the same six lookup cases as
      T007, and the ledger's rows for: a discount, no discount, no rate card.
      The two implementations are tested against the same table on purpose.
- [X] **T038** `RentalStatusRail.tsx` — the derivation, left to right, ending on
      the ex-VAT total at full contrast with the inc-VAT total muted after it.
      `−25%` only when a discount was typed; `5 days ×2.20` always;
      `×1.00 no rate card` in amber **text**. The strip's **tint** stays the
      stock verdict (FR-024).
- [X] **T039** `components/event/PricingDrawer.tsx` — four cards that act and one
      that does not, per the mockup §04. `ui/Drawer` + `ui/GearList`; the ledger
      is `GearSpecs` rows in a `GearCard`. Every control **absent** for a viewer
      (P7).
- [X] **T040** `RentalTab.tsx` — the **Pricing** button in the bar's drawer slot,
      after search and before the exports (patterns §1), and the matching
      overflow entry on the phone. Render `pricing_notes` where the tab already
      renders unplaced lines, in both branches (FR-032) — the block exists twice
      there already, and a note that appears only on the desktop is a note the
      person in the loading bay does not get.
- [X] **T041** ~~`components/mobile/MobilePricingSheet.tsx`~~ — **not built, and
      not needed.** `ui/Drawer` branches to `ui/Sheet` on a phone itself, for the
      reason its own comment gives: six drawers should acquire a phone form at
      once rather than six call sites answering the same question. T039's drawer
      therefore already has one, reached from the overflow entry in T040. The
      language had solved this before the task was written.
- [X] **T042** `components/inventory/InventoryDrawers.tsx` — the catalog's
      **Pricing** drawer: the charged-days rule, the VAT rate, and the rate card
      with add / edit-on-blur / delete. Beside Categories and Import in the bar.
- [X] **T043** `pages/Inventories.tsx` — the button. **Desktop only**, matching
      its two siblings: the phone's catalog surface offers *Manage* and nothing
      else, and has never reached Categories or Import either. Adding one of the
      three there alone would make the other two look deliberately withheld.
      Recorded as FR-027a — a gap in that surface, not in this slice.
- [X] **T044** `pages/MyDefaults.tsx` — two tabs, **Vocabularies** and **Rental
      pricing**, each owning a panel (patterns §1). The existing panel is
      untouched behind the first.
- [X] **T045** Read the built pages against the mockup at 1440 px and at 375 px:
      bar order, tier, the strip's phrasing, the drawer's density, 44 px targets.

**Checkpoint** — gates green; quickstart.md §1–§8 all pass. Commit 6.

---

## Phase 7: the documents

- [X] **T046** `ROADMAP.md` — Slice 31's section rewritten from *planned* to what
      was built, with the decisions worth keeping: step down and clamp, the
      cascade, replace-on-import, the factor on the order not the line, the VAT
      formula heuristic, and the rename.
- [X] **T047** `ROADMAP.md` — the **What remains** index. Slice 31 was its only
      row; say what the file is now.
- [X] **T048** Confirm `design/` is untouched (`git diff --stat design/` empty).
      If it is not, the second Frontend Design Workflow trigger fired and the
      change needs approval before it lands.

**Checkpoint** — gates green. Commit 7.

---

## Dependencies

- **T004–T006** need T003's structs. **T007** needs all three.
- **T027** touches `db.CreateInventory`, so it needs T008's defaults reader. It
  is listed in Phase 4 because it lands with the importers it is easiest to
  review beside, not because it depends on them.
- **T012** needs T004–T006 and T008.
- **T013/T016** must land in the same commit as T011: the rename does not compile
  by halves.
- **T025–T027** need T023 and T024.
- **T031–T033** need T012 — they read `summary.Pricing`.
- **T036–T044** need T015 and T017–T020.
- **T045** needs the whole of Phase 6.
- **T048** is last on purpose: it is a check, not a change.

## Parallel opportunities

- T003 with T001/T002 (different files, no shared symbol).
- T015 with the whole of Phase 2's Go work — the type file has no Go dependency.
- T020 with T017–T019, once the contract is written rather than implemented.
- T037 with T038–T044.

## MVP

**Phases 1, 2 and 4** are the smallest thing that is worth shipping: the rate
card imports, the summary prices, and the API tells the truth. The interface can
follow, and the exports can follow — but only until somebody sends one, which is
why they are commits 5 and 6 rather than a later slice.
