# Phase 0 — Research

Eight questions. Five were answered by reading the user's real `LL.xlsx` and the
code that consumes it; three are decisions with the reasoning kept.

---

## R1 · Where are the values in `LL.xlsx`, exactly?

Read from the real file at the repository root, raw cell values.

**`Hyresfaktor`** — rows 1–18 are empty. The table starts at **row 19**:

| Row | A | B |
|---|---|---|
| 19 | `Antal dagar` | `Hyresfaktor` |
| 20–33 | 1 … 14 | 1, 1.5, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4 |
| 34 | 21 | 5.4 |
| 35 | 30 | 6.6 |

**Sixteen rows, and the day counts are not contiguous** — 14 jumps to 21 jumps
to 30. That gap is what forced R6.

The eighteen blank rows above the header are why the parser must **find the
header row** rather than assume row 1 — the same rule `locateGenericColumns`
already follows for the generic format, and the same rule
`locateQuantityColumns` follows for the price list's order columns.

**`Sammanställning`** — column A is the label, B is *LL Ljud*, C is *LL Ljus*:

| Row | Label (A) | B | Formula |
|---|---|---|---|
| 2 | `Utrustning ex` | 0 | `=B3*0.8` |
| 4 | `Rabatt utrustning` | 0.5 | **typed** |
| 5 | `Hyresfaktor (Antal dagar)` | 1 | **typed** |
| 6 | `Summa utrustning ex` | 0 | `=(B2-(B2*B4))*B5` |
| 7 | `Summa utrustning ink` | 0 | `=B6*1.25` |

Two cells per column are typed by a human and everything else computes. The
export therefore writes **four cells** — B4, C4, B5, C5 — and the supplier's own
file produces every figure below them.

**Decision:** locate rows by their normalized label in column A, never by
address. `normalizeHeader` already exists in `rental_export.go` and does exactly
the right normalization (collapse whitespace, lowercase).

---

## R2 · Where does `LL.xlsx` state its VAT rate?

**Nowhere, as a value.** The string "25" does not appear as a VAT cell. The rate
exists only as the literal `1.25` inside seven formulas:
`=B6*1.25`, `=B10*1.25`, `=B13*1.25`, `=B20*1.25`, `=B23*1.25`, `=B26*1.25`,
and `=B21*1.25`.

`excelize.GetCellFormula` returns the stored formula string, so the rate is
recoverable: take the `Summa utrustning ink` row, read its formula, extract the
multiplier with `\*\s*([0-9]+(?:[.,][0-9]+)?)`, and convert `1.25 → 25%`.

**Decision:** do it, and treat it as the heuristic it is. `Summa utrustning ink`
is chosen over the six other candidates because it is the equipment row — the
only part of that sheet PatchPlanner models. If the row is missing, the formula
is absent, the multiplier does not parse, or the result is not `> 1`, the file
**carries no rate** and the catalog adopts the user's default. Nothing fails,
nothing is guessed from a partial read.

**Rejected:** hard-coding 25% for every LL import. It would be right today and
silently wrong the year a rate changes or a non-Swedish supplier's file arrives,
and it would make the "imported from the file" half of the user's instruction a
lie.

---

## R3 · Can event pricing ride on `PATCH /events/{id}`?

**No.** `db.UpdateEvent` is a whole-object replace:

```go
UPDATE events SET name = ?, load_in_date = ?, start_date = ?, end_date = ?,
                  load_out_date = ?, venue = ?, notes = ?, ... WHERE id = ?
```

Every column is written from the decoded struct on every call. Adding the four
pricing columns to that statement means **`EventDetailsDrawer`'s Save wipes the
discount** — the drawer sends name, venue, four dates and notes, and would send
zeroes for everything else.

**Decision:** `PUT /events/{eventID}/pricing`, its own handler and its own
`UPDATE` touching only the four pricing columns. The viewer guard is free:
`RequireEventAccess` already forbids every mutating method to a viewer.

**Rejected:** converting `UpdateEvent` to a partial patch. It is a real
improvement and it is not this slice's — changing how every event field is
written, in a slice about money, is how an unrelated regression gets shipped.

---

## R4 · Where must the pricing block be computed?

`db.GetRentalSummary` has exactly four callers:

| Caller | What it produces |
|---|---|
| `api/rental.go` `getSummary` | the JSON the tab and the strip read |
| `service/rental_export.go` | the LL price-list file |
| `service/rental_pdf.go` | the PDF order |
| `service/rental_xlsx.go` | the generic spreadsheet |

That is the entire set of places an order is rendered, and the roadmap's standing
invariant since Slice 6 — *every planned item appears on the order and in every
export* — is exactly the shape of guarantee needed here for the price.

**Decision:** `GetRentalSummary` loads the event, the catalog's pricing and its
rate card, and fills `Summary.Pricing`. Two extra queries per call, and **no
export can be written that omits the price**, because none of them can reach the
lines without it. Putting the computation in the API layer would leave three
exports free to disagree.

The arithmetic itself is pure and lives in `domain`: `LookupRentFactor`,
`BilledDays`, `ComputePricing`. `db` composes; it does not decide.

---

## R5 · What does the rename touch?

`RentalSummary.TotalExVAT` → `SubtotalExVAT`. Every reference, found:

**Go** — `domain/rental.go:34` (the field), `db/rental.go:140` (the sum),
`service/rental_xlsx.go:105` (the TOTAL row), `service/rental_pdf.go:250` (the
TOTAL line); tests in `db/rental_test.go` and `db/owned_test.go`.

**TypeScript** — `types/index.ts:465`, `lib/eventSummary.ts:295` (the Overview
number band's `rentalTotalExVAT`), `components/event/RentalStatusRail.tsx:68`
(the strip); tests in `lib/eventSummary.test.ts`.

**Nine call sites, and the Overview figure is one of them** — the number band
has been showing a day rate labelled *RENTAL, EX VAT* since Wave 4. That is the
argument for the rename over adding a field beside the old one: a new field
leaves all nine sites compiling and eight of them wrong.

---

## R6 · Step down, or interpolate?

The rate card jumps 14 → 21 → 30. A 17-day hire has no row.

| | 17 days | 45 days |
|---|---|---|
| Step down, clamp | ×4.00 | ×6.60 |
| Interpolate | ×4.60 | ×8.70 |

**Decided with the user: step down, clamp at both ends.** A rate card is a step
function everywhere else in the trade — you get the last rate you qualified for
— and an interpolated factor is a number the supplier never published and cannot
be asked to honour.

The clamp's cost is known and accepted: a 60-day hire prices at the 30-day
factor. A supplier who cares will publish a 60-day row, and now there is
somewhere to put it.

---

## R7 · Why does an import replace the whole rate card?

The catalog's items carry `is_manual` (Slice 22) precisely so an import cannot
overwrite a hand-typed row. The obvious move is to do the same here, and it is
wrong.

**An item is an independent object; a rate card is one curve.** A hand-typed
`5 → 2.0` and an imported `5 → 2.2` are not two things that can coexist — they
are one fact, disagreeing. `is_manual` would make the disagreement permanent and
invisible, and the shadowed row would keep pricing every future hire.

**Decided with the user: an import carrying one or more rows replaces the table;
an import carrying none leaves it alone.** The second half is what makes the
blank generated template harmless — uploading it untouched carries nothing, and
a table it does not carry it cannot replace.

---

## R8 · Where does a user-scoped setting live?

`ReferenceTemplateHandler` is the precedent, registered in the authenticated
group and scoped to `middleware.UserFromContext` rather than to a URL parameter:

```go
r.Route("/reference-templates", ...)   // GET, POST, PATCH, DELETE
```

**Decision:** `GET /pricing-defaults` and `PUT /pricing-defaults`, same shape,
same group, two scalar values. `/my-defaults` is already the page for exactly
this kind of thing and already says what it means — *"every new event starts
with a copy of these — editing them changes no existing event"* — which is the
sentence this slice needs, one noun changed.

The columns live on `users` rather than in a settings table: two scalars owned
by a row that already exists is not a table (Principle V).
