# Feature Specification: Rental pricing by duration

**Feature Branch**: `031-rental-pricing-duration`

**Created**: 2026-07-30

**Status**: Draft — design approved 2026-07-30

**Input**: The roadmap's Slice 31 brief, plus five instructions from the user:

> "The LL.xlsx file contain a sheet with a rent-factor called *Hyresfaktor*.
> This maps days to a multiplication of the rental price. The more days you rent
> the cheaper it will be per day. When a LL.xlsx is imported, this map should
> also be imported. The rental-factor should therefore belong to the inventory
> instance."
> "The generic excel sheet can have an optional sheet with the same purpose.
> Make sure to update the template."
> "It should be possible to manually add rental-factor to an inventory. Just
> like how it works for rental items."
> "Some rental places only charge for the days the event covers, not including
> extra load-in and load-out days. Make it an option per event (or inventory if
> that makes more sense). I also want a rental-factor override per event in the
> case another rental-factor calculation applies."
> "LL.xlsx supports a discount percentage in the *Sammanställning* sheet. I want
> that manual input per event. Also implement for the generic excel and the pdf
> export."

Four decisions were taken with the user before the design was drawn, and two
more when it was approved:

> "Step down to the row below" — 17 days is billed at the 14-day factor, and
> past the last row the factor holds.
> "Add a global user-scoped setting for the default behavior. That will be the
> setting that each inventory adopts when imported. After the import the user
> can change it for that inventory and then have event specific overrides."
> "Replace the whole table" — an import carrying a rate card wins outright.
> "The factor is applied to total", "rename sounds good", "correct assumption"
> (owned gear is outside pricing), and:
> "I missed VAT in my original prompt. It is an important part. Just like rent
> factor, import it from the excel sheets (both LL.xlsx and the generic format)
> if available. Otherwise manual input. Same cascade pattern as which days to
> count."

The approved design is [mockup.html](mockup.html), revision 2.

## Context

Slice 30 gave an event a length and named, as a decision, what it did not do:

> "The order quotes a five-day hire as a one-day hire, which it did before too —
> what changed is that the tool now *knows* the duration, which is why it is the
> next slice."

**A day rate is not a price.** Between the two sit a table the supplier
publishes, a discount somebody negotiated, and a VAT rate. PatchPlanner has held
none of them, so a festival that loads in on Wednesday and loads out on Sunday
is quoted at the price of a Tuesday afternoon — on screen, on the Overview
figure, and in all three exports.

### The file already knew

`LL.xlsx` ships three sheets and PatchPlanner reads one. The other two are the
whole of this slice's arithmetic, already written by the supplier:

| Sheet | What it holds | Read today |
|---|---|---|
| `Prislista LL` | 308 items, their stock and their day rates | yes |
| `Hyresfaktor` | 16 rows of `days → multiplier`: 1→1.0, 5→2.2, 14→4.0, 21→5.4, 30→6.6 | **no** |
| `Sammanställning` | `Rabatt utrustning` and `Hyresfaktor (Antal dagar)` — the two cells a human types — and `Summa utrustning ex = (B2 − B2×B4) × B5` | **no** |

The supplier's own formula is the one this slice implements, in that order:
**subtotal → discount → factor**. VAT is in that file too, but never as a value:
it is `*1.25` inside seven formulas.

### The four numbers, and the three places each may live

| Number | User default | Catalog | Event |
|---|---|---|---|
| Charged days | `default_charged_days` | copied at import, editable | overridable (`NULL` = follow the catalog) |
| VAT % | `default_vat_percent` | **the file's rate if it states one**, else the user's, editable | overridable |
| Rent factor | — | the rate card itself | the *resulting number* is overridable |
| Discount % | — | — | typed here only, default 0 |

A catalog **copies** the user's default when it is imported into; changing the
default afterwards never reaches back. An event **references** its catalog until
it disagrees, so a catalog corrected after the fact corrects every event that
never departed from it. This is Slice 17's snapshot rule and Slice 22's
`is_manual` rule applied to a third thing.

### What a rate card is

It is read by **stepping down**: the factor is the one on the highest row whose
day count is at or below the billed days. Below the first row, the first row.
Above the last row, the last row. This was settled against interpolation: a
supplier cannot be asked to honour a rate they never published.

An empty rate card means **×1.00** and says so. That is the honest answer for a
supplier who does not price this way, and it is what every catalog in the
database means today.

## User Scenarios

### US1 — A five-day hire is priced as five days (Priority: P1)

The technician opens the rental order for a festival with four dates. The strip
states what the hire costs, and how it got there: the day rate it has always
shown, the number of days being charged, the supplier's multiplier for that many
days, the discount if there is one, and the total.

**Why this priority**: it is the slice. Every other story exists to feed this
number or to carry it somewhere.

**Independent Test**: bind an event with `load_in 2026-08-12` and
`load_out 2026-08-16` to a catalog holding a rate card, and read the strip.

**Acceptance Scenarios**:

1. **Given** an event spanning 12–16 August on a catalog whose rate card has
   `5 → 2.2`, **When** the rental order is opened, **Then** the strip states
   `5 days ×2.20` and a total of the day-rate subtotal × 2.20.
2. **Given** the same event and a catalog with **no** rate card, **When** the
   order is opened, **Then** the factor is `×1.00`, the total equals the day-rate
   subtotal, and the strip says so in amber words without changing its tint.
3. **Given** an event with only a `start_date`, **When** the order is opened,
   **Then** the billed days are `1` and the factor is the 1-day row.
4. **Given** an event with no dates at all, **When** the order is opened,
   **Then** the billed days are `1`, nothing errors, and nothing is blocked.

---

### US2 — The catalog carries the supplier's rate card (Priority: P1)

Importing `LL.xlsx` brings the `Hyresfaktor` sheet in with the price list. A
catalog built any other way gets the same table from the generic template's
optional sheet, or typed by hand into the catalog's own Pricing drawer.

**Why this priority**: US1 has nothing to multiply by without it.

**Independent Test**: import the real `LL.xlsx` and read
`GET /inventories/{id}/pricing` — 16 rows and a VAT rate of 25.

**Acceptance Scenarios**:

1. **Given** the real `LL.xlsx`, **When** it is imported, **Then** the catalog
   holds 16 rate-card rows and the catalog's VAT is 25%.
2. **Given** a catalog with a hand-typed rate card, **When** a file carrying a
   rate card is imported into it, **Then** the whole table is replaced.
3. **Given** the same catalog, **When** a file carrying **no** rate card is
   imported, **Then** the table is left exactly as it was.
4. **Given** a rate-card row that will not parse, **When** the file is imported,
   **Then** the catalog imports and the row is reported as a **warning** — never
   as an error that rejects a 308-item price list.
5. **Given** any catalog, **When** its owner adds, edits or deletes a rate-card
   row, **Then** it persists and every event bound to that catalog prices
   against it immediately.
6. **Given** a contributor or viewer, **When** they open the catalog's Pricing
   drawer, **Then** they read the rate card and are offered no control to change
   it.

---

### US3 — This job's own terms (Priority: P1)

One festival was agreed at 25% off. One client only pays for show days. One hire
was priced by a formula nobody here can reconstruct, and the number was 3.4. All
three are typed on the event, next to the order they change.

**Why this priority**: the discount is half the user's original request, and
without the two overrides the cascade has no bottom.

**Independent Test**: type a discount and an override on one event and confirm
neither reaches the catalog nor any other event.

**Acceptance Scenarios**:

1. **Given** an order subtotalling 12 480.00/day over 5 days at ×2.20,
   **When** a discount of 25% is typed, **Then** the total is
   `(12 480 − 3 120) × 2.20 = 20 592.00` — discount first, then factor, in the
   supplier's own order.
2. **Given** the same event, **When** a rent-factor override of 3.4 is typed,
   **Then** the order prices at ×3.40 and the drawer says the number is this
   event's, not the catalog's.
3. **Given** the same event, **When** the override field is emptied, **Then**
   the catalog's table decides again.
4. **Given** an event set to *show days only*, **When** the order is priced,
   **Then** the billed days are `end − start + 1` and the catalog's own rule is
   untouched.
5. **Given** a viewer, **When** they open the Pricing drawer, **Then** they read
   every number and are offered no field.

---

### US4 — VAT, imported where the file states it (Priority: P2)

Every total in the application is ex VAT and says so. This story adds the second
total without moving the first.

**Why this priority**: a quote a client sees carries VAT; a plan a technician
works from does not. Both are needed, and the ex-VAT figure must not move.

**Independent Test**: import `LL.xlsx` into a fresh catalog and confirm its VAT
is 25% without anyone typing it.

**Acceptance Scenarios**:

1. **Given** the real `LL.xlsx`, **When** it is imported, **Then** the catalog's
   VAT is 25%, read from the `Summa utrustning ink` row's `=B6*1.25` formula.
2. **Given** a file whose formula cannot be read, **When** it is imported,
   **Then** the catalog adopts the **user's** default VAT and nothing fails.
3. **Given** a generic file whose Pricing sheet states `VAT % 25`, **When** it is
   imported, **Then** the catalog's VAT is 25%.
4. **Given** an order totalling 20 592.00 ex VAT at 25%, **When** it is read
   anywhere, **Then** VAT is 5 148.00 and the inc-VAT total is 25 740.00.
5. **Given** any surface that showed a total before this slice, **When** it is
   read after, **Then** its ex-VAT figure means the **priced** total and is
   still labelled ex VAT.

---

### US5 — Every export carries the price (Priority: P2)

The standing invariant since Slice 6 is that every planned item appears on the
order and in every export. Pricing takes the same rule: a total that appears on
screen and not on the paper is a quote nobody can send.

**Why this priority**: the PDF *is* the rental tab's paper — the tab has no
print sheet for exactly this reason.

**Independent Test**: take all three exports of one priced event and find the
same four figures in each.

**Acceptance Scenarios**:

1. **Given** a priced order, **When** the PDF is exported, **Then** the existing
   TOTAL row is labelled *per day* and is followed by discount, rent factor,
   the priced total, VAT and the inc-VAT total.
2. **Given** a priced order, **When** the generic spreadsheet is exported,
   **Then** the same six figures appear as rows under the existing TOTAL, in the
   same columns.
3. **Given** a priced order on an LL catalog, **When** the price-list export is
   taken, **Then** `Rabatt utrustning` and `Hyresfaktor (Antal dagar)` are
   written into `Sammanställning` **in both the Ljud and Ljus columns**, located
   by their row label, and the file's own formulas produce every figure below.
4. **Given** an LL file whose labels have been renamed, **When** the export is
   taken, **Then** the quantities are written as before and the export report
   states that the pricing could not be placed.
5. **Given** an event whose VAT override disagrees with the rate its LL file
   states, **When** the export is taken, **Then** the report names both numbers
   and the file's `*1.25` formulas are left untouched.

---

### US6 — The user's defaults (Priority: P2)

`/my-defaults` is where a user says what a new thing should start as. It gains
the two answers a catalog adopts when it is imported into.

**Why this priority**: without it the cascade's top is a hard-coded constant,
and the user asked for it explicitly.

**Independent Test**: change the default, import a new catalog, and read that
catalog's Pricing drawer.

**Acceptance Scenarios**:

1. **Given** a user whose default is *show days only*, **When** they import into
   a new catalog, **Then** that catalog's rule is *show days only*.
2. **Given** an existing catalog, **When** the user changes their default,
   **Then** that catalog is unchanged and the page says so.
3. **Given** a file stating its own VAT rate, **When** it is imported, **Then**
   the file's rate wins over the user's default.

---

### US7 — The phone (Priority: P3)

A discount is typed in a loading bay as often as at a desk.

**Why this priority**: patterns §7g requires it — everything that is a form over
a row has a phone form — but nothing is unusable without it.

**Independent Test**: open the rental order at 375 px and price the hire.

**Acceptance Scenarios**:

1. **Given** a phone, **When** the rental panel's overflow is opened, **Then**
   *Pricing* is among its entries and opens a sheet with the same four controls
   and the same ledger.
2. **Given** a phone, **When** the catalog is opened, **Then** its Pricing
   drawer is reachable the same way.
3. **Given** a phone, **When** the strip is read, **Then** it carries the same
   derivation as the desktop's.

### Edge Cases

- **A rate card with one row.** Legal. Every hire prices at that factor.
- **Duplicate days in an imported table.** The last row wins and a warning names
  the day count. The table is a curve; two answers for five days is a typo.
- **`days` of 0 or negative, `factor` of 0 or negative.** Rejected — as a
  warning on import, as a 400 from the API.
- **A discount of 100%.** Legal, and priced at zero. Above 100 or below 0 is
  rejected.
- **A VAT rate of 0.** Legal — some hires are exempt. Negative is rejected.
- **An event with no bound catalog's rate card and an override typed.** The
  override wins; it is the whole point of it.
- **An event whose dates are out of order.** Already refused by the API since
  Slice 30, so billed days can never be negative. A same-day span is 1.
- **A catalog deleted while an event points at it.** Already refused since
  Slice 16; unchanged here.
- **Owned gear.** Outside pricing entirely. No factor, no discount, no VAT
  touches it, and the Equipment tab is untouched.

## Requirements

### The rate card (US2)

- **FR-001** An inventory holds an ordered set of rate-card rows, each a positive
  integer `days` and a positive `factor`. `days` is unique within an inventory.
- **FR-002** The lookup steps down: the factor is that of the highest row with
  `days ≤ billed days`; below the first row the first row's; above the last row
  the last row's; with no rows at all, **1.0**.
- **FR-003** The lookup is one pure function on each side — `domain` on the
  server, `lib/` in the browser — tested against: exact hit, between rows, below
  the first, above the last, single row, and empty.
- **FR-004** An LL import reads the `Hyresfaktor` sheet, locating its columns by
  the headers `Antal dagar` and `Hyresfaktor` rather than by position.
- **FR-005** A generic import reads an optional `Pricing` sheet, locating the
  rate card by a `Days`/`Factor` heading row and the VAT rate by a `VAT %` row
  label. Sheet and both labels are matched case-insensitively with the Swedish
  aliases the LL sheet uses.
- **FR-006** An import that carries **one or more** rate-card rows replaces every
  row in the catalog's table. An import that carries none leaves the table
  untouched. There is no `is_manual` here: the table is one curve, not a set of
  independent rows.
- **FR-007** A malformed rate-card row is a **warning** on the existing
  `InventoryImportResult.Warnings`, never a validation error. The catalog's items
  import regardless.
- **FR-008** The catalog's owner can create, edit and delete rate-card rows.
  A duplicate `days` is refused with 409.
- **FR-009** The blank generated template gains the `Pricing` sheet with its
  labels and no values, so uploading it untouched carries nothing and therefore
  replaces nothing. The round-trip test binds it to the parser.

### Billed days (US1, US3)

- **FR-010** Billed days are **derived, never typed**: inclusive of both ends,
  from `Event.Resolve()`, so every absent date already falls back to its
  neighbour.
- **FR-011** `onsite` counts `load-out − load-in + 1`; `show` counts
  `end − start + 1`. An event with no `start_date` is 1 day.
- **FR-012** The rule is `users.default_charged_days` → copied to
  `inventories.charged_days` when a catalog is imported into → `events.charged_days`,
  where `NULL` means *follow the catalog*.

### The event's own terms (US3)

- **FR-013** An event carries `discount_percent` (0–100, default 0),
  `rent_factor_override` (`NULL` = look it up), `vat_percent` (`NULL` = follow
  the catalog) and `charged_days` (`NULL` = follow the catalog).
- **FR-014** Nothing an event stores reaches its catalog or any other event.
- **FR-015** The order is the supplier's own:
  `total_ex_vat = (subtotal − subtotal × discount) × factor`, then
  `vat_amount = total_ex_vat × vat`, then `total_inc_vat`.
- **FR-016** The factor multiplies the **order**, not the line. Every line keeps
  its day rate on every surface and in every export, so each stays checkable
  against the supplier's published list.

### VAT (US4)

- **FR-017** VAT follows the same three stores as the charged-days rule, with one
  difference: **a file stating its own rate beats the user's default** at import.
- **FR-018** An LL import reads the rate from the `Summa utrustning ink` row's
  formula in `Sammanställning`, taking the multiplier from `=B6*1.25` as 25%. It
  is a heuristic: if the row or the formula cannot be read, the file carries no
  rate and the user's default is adopted. **Nothing fails.**
- **FR-019** Every existing ex-VAT figure keeps its label and its emphasis, and
  now means the priced total. The inc-VAT total is stated beside it, never
  instead of it.

### What the surfaces say (US1, US3, US7)

- **FR-020** The rental panel's bar gains one `xs outline` **Pricing** button in
  the drawer slot patterns §1 specifies — after search, before the exports.
- **FR-021** The Pricing drawer holds four cards that can be acted on — billed
  days, rent factor, discount, VAT — and one that cannot: the ledger.
- **FR-022** The ledger states every operation, not only its result: subtotal per
  day, discount, factor, total ex VAT, VAT, total inc VAT. It is `GearSpecs` rows
  in a `GearCard` — **no new component**.
- **FR-023** The strip states the derivation left to right and ends on the ex-VAT
  total at full contrast, with the inc-VAT total following it muted. `5 days
  ×2.20` always appears; `−25%` only when a discount was typed.
- **FR-024** A catalog with no rate card renders `×1.00 no rate card` in amber
  **text** on the strip. The strip's **tint** stays the stock verdict it has
  always been.
- **FR-025** The catalog's own bar gains a **Pricing** drawer beside *Categories*
  and *Import*, holding the charged-days rule, the VAT rate and the rate card.
- **FR-026** Every control on both drawers is **absent** for a role that cannot
  use it (P7), the read view being identical for everyone.
- **FR-027** Both drawers reach the phone through the panel's overflow, as a
  `ui/Sheet` with 44 px controls and the same ledger.

### The exports (US5)

- **FR-028** The PDF's existing TOTAL row is labelled *per day* and is followed
  by discount, rent factor (naming the day count and the row it came from), the
  priced total, VAT and the inc-VAT total. All strings stay cp1252-representable:
  `x` not `×`, `-` not `−`.
- **FR-029** The generic spreadsheet gains the same six figures as rows under its
  existing TOTAL, as values rather than formulas.
- **FR-030** The LL export writes `Rabatt utrustning` and `Hyresfaktor (Antal
  dagar)` into `Sammanställning` in **both** value columns, located by row label
  in column A, never by address.
- **FR-031** The LL export **does not** write VAT and does not rewrite the file's
  `*1.25` formulas. Filling in the two cells a human types is a different act
  from editing someone else's model.
- **FR-032** `RentalExportReport` gains the pricing outcome: whether the two
  cells were placed, and, when the event's VAT disagrees with the file's, both
  numbers. The rental tab renders it where it renders unplaced lines.

### The wire (US1, US4)

- **FR-033** `RentalSummary.total_ex_vat` is **renamed** `subtotal_ex_vat` and
  keeps its meaning: the sum of every line's day rate. The rename is deliberate
  — it makes the compiler visit every surface that shows money so none can
  quietly keep showing the day rate.
- **FR-034** `RentalSummary` gains `pricing`, carrying the billed days and the
  dates they came from, the effective rule and where it came from, the factor and
  which row produced it, the discount, both totals, and the VAT rate and amount.
- **FR-035** `db.GetRentalSummary` fills `pricing`. It is the single place, which
  is what makes the invariant structural: every export already calls it, so none
  can ship without the price.

### The user's defaults (US6)

- **FR-036** `/my-defaults` becomes two tabs — **Vocabularies** and **Rental
  pricing** — each owning a panel, which is the shape patterns §1 already
  specifies for one page holding two kinds of thing. The existing panel is
  untouched behind the first tab.
- **FR-037** The Rental pricing tab states that a catalog adopts these at import
  and that changing them changes nothing that already exists.

### Boundaries

- **FR-038** No `design/` file is edited. Every construction here — Drawer,
  GearList, StatusStrip, Select, Input, page tabs, the phone sheet — is already
  in the language, and the ledger is composed from `GearSpecs` and `GearCard`.
- **FR-039** No existing rental line, quantity, aggregation arm or export column
  changes. This slice adds a total; it does not touch how the order is derived.

### Key Entities

- **Rate-card row** — `(inventory_id, days, factor)`, unique on the pair.
- **Inventory pricing** — the catalog's charged-days rule and VAT rate.
- **Event pricing** — this event's four departures, three of them nullable.
- **User pricing defaults** — the two values a catalog adopts at import.
- **Rental pricing** — the derived block on the summary. Stored nowhere.

## Assumptions

1. **Discount before factor.** `Sammanställning`'s own formula. The two are both
   multiplicative so the total is the same either way; the order is stated
   because the ledger prints it and the LL file computes it that way.
2. **The factor applies to equipment only.** `LL.xlsx` applies it to
   `Utrustning`, not to `Lön` or `Transport`, neither of which PatchPlanner
   models.
3. **VAT 25% is the seed value** for existing rows and for a user who has never
   set one. It is Sweden's standard rate and the rate `LL.xlsx` itself uses.
4. **`onsite` is the seed rule** for existing rows: you have the gear in the
   truck on the days you have it.
5. **The LL VAT heuristic is allowed to fail.** It reads one formula in one row
   of one sheet. Failure means "this file states no rate", never an error.
6. **Rounding is presentational.** Money is computed in `float64` and formatted
   to two decimals at each surface, exactly as every existing total is.

## Out of Scope

- **Pricing owned gear.** Confirmed with the user: gear you own is not hired.
- **Rewriting `LL.xlsx`'s VAT formulas**, or writing a total into any cell that
  holds a formula.
- **Interpolating between rate-card rows.** Rejected with the user.
- **Per-line period pricing.** Rejected: the line is a day rate everywhere.
- **A second currency.** Everything is SEK, as it already is.
- **Labour and transport**, which `Sammanställning` has columns for and
  PatchPlanner does not model.
- **Pricing history.** An order states today's price; nothing is versioned.

## Success Criteria

- **SC-001** An event spanning 12–16 August on the real `LL.xlsx` catalog, with
  25% agreed, prices at 20 592.00 ex VAT / 25 740.00 inc VAT from a 12 480.00
  day-rate subtotal — on the strip, in the drawer, on the Overview figure and in
  all three exports, with no figure disagreeing.
- **SC-002** Importing the real `LL.xlsx` produces 16 rate-card rows and a 25%
  VAT rate with nothing typed.
- **SC-003** A catalog with no rate card prices every hire at ×1.00, says so, and
  blocks nothing.
- **SC-004** No surface in the application shows an unpriced total after this
  slice; the rename in FR-033 is what proves it, since the build fails until each
  is visited.
- **SC-005** Every existing rental, import and export test passes unchanged
  except where it asserts a total's name or value.
- **SC-006** `design/` is untouched.
