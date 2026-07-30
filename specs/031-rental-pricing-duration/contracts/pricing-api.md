# Contract · Pricing API

Five routes added, one payload renamed, one payload extended, two payloads
grown. Every existing route keeps its path, method, status codes and auth.

| Route | Change |
|---|---|
| `GET /api/v1/pricing-defaults` | **new** — user-scoped |
| `PUT /api/v1/pricing-defaults` | **new** — user-scoped |
| `GET /api/v1/inventories/{id}/pricing` | **new** — owner-guarded |
| `PUT /api/v1/inventories/{id}/pricing` | **new** — owner-guarded |
| `POST /api/v1/inventories/{id}/rent-factors` | **new** — owner-guarded |
| `PATCH /api/v1/inventories/{id}/rent-factors/{factorID}` | **new** |
| `DELETE /api/v1/inventories/{id}/rent-factors/{factorID}` | **new** |
| `PUT /api/v1/events/{id}/pricing` | **new** — viewer-forbidden |
| `GET /api/v1/events/{id}/rentals` | payload: rename + `pricing` |
| `GET /api/v1/events/{id}/rental-export/report` | payload: `pricing` outcome |
| `GET /api/v1/events/{id}` · `/events` | payload: four fields |
| `POST /api/v1/inventories/{id}/import` | result: rate-card warnings |

Auth is inherited, not re-implemented: the inventory routes sit inside the
existing `RequireInventoryOwner` group, the event route inside
`RequireEventAccess` — which already forbids every mutating method to a viewer
— and `/pricing-defaults` inside the authenticated group, scoped to
`UserFromContext` like `/reference-templates`.

---

## 1 · `GET|PUT /pricing-defaults`

What a catalog adopts when it is imported into. Read once, at import; never part
of live resolution (data-model.md).

```json
{ "charged_days": "onsite", "vat_percent": 25 }
```

`PUT` takes the same object and returns the stored result. `400` when
`charged_days` is neither `"onsite"` nor `"show"`, or `vat_percent` is negative.

Every signed-in user has these: the columns are `NOT NULL DEFAULT`, so a user who
has never opened the page reads `onsite` / `25`.

---

## 2 · `GET|PUT /inventories/{id}/pricing`

The catalog's own rule and its rate card, ordered by `days` ascending.

```json
{
  "charged_days": "onsite",
  "vat_percent": 25,
  "factors": [
    { "id": 41, "days": 1, "factor": 1 },
    { "id": 42, "days": 2, "factor": 1.5 },
    { "id": 55, "days": 30, "factor": 6.6 }
  ]
}
```

`PUT` carries **only** `charged_days` and `vat_percent`; `factors` is ignored if
sent. The rate card is edited row by row through §3, so a drawer that is mid-edit
cannot post a stale copy of the whole curve over somebody else's row.

`404` when the caller does not own the catalog — the middleware's answer, not a
403, so ownership is not disclosed.

---

## 3 · Rate-card rows

```
POST   /inventories/{id}/rent-factors              { "days": 45, "factor": 8 }
PATCH  /inventories/{id}/rent-factors/{factorID}   { "days": 45, "factor": 8.2 }
DELETE /inventories/{id}/rent-factors/{factorID}
```

`POST` returns `201` with the created row. `PATCH` accepts either field or both.
`DELETE` returns `204`.

| Status | When |
|---|---|
| `400` | `days` < 1, `days` not an integer, `factor` ≤ 0 |
| `404` | the row does not exist, or belongs to another catalog |
| `409` | another row in this catalog already holds that `days` |

The `409` carries the day count in its message and comes from the existing
`db.ErrDuplicate`, the same path a duplicate reference value takes.

---

## 4 · `PUT /events/{id}/pricing`

This event's four departures. Its own route because `PATCH /events/{id}` is a
whole-object replace and would wipe them (research.md R3).

```json
{
  "charged_days": null,
  "rent_factor_override": null,
  "vat_percent": null,
  "discount_percent": 25
}
```

`null` on the first three means *follow the catalog*. `discount_percent` is
required and takes `0`. Returns the updated `Event`.

| Status | When |
|---|---|
| `400` | `charged_days` not one of `onsite` / `show` / `null`; `discount_percent` outside 0–100; `rent_factor_override` ≤ 0; `vat_percent` negative |
| `403` | viewer, from the middleware |

---

## 5 · `GET /events/{id}/rentals` — the renamed field and the new block

### Before

```json
{
  "items": [ ... ],
  "total_items": 62,
  "total_quantity": 214,
  "total_ex_vat": 12480,
  "has_over_stock": false
}
```

### After

```json
{
  "items": [ ... ],
  "total_items": 62,
  "total_quantity": 214,
  "subtotal_ex_vat": 12480,
  "has_over_stock": false,
  "pricing": {
    "billed_days": 5,
    "charged_days": "onsite",
    "charged_days_source": "inventory",
    "first_day": "2026-08-12",
    "last_day": "2026-08-16",
    "rent_factor": 2.2,
    "rent_factor_source": "table",
    "rent_factor_days": 5,
    "discount_percent": 25,
    "discount_amount": 3120,
    "subtotal_ex_vat": 12480,
    "total_ex_vat": 20592,
    "vat_percent": 25,
    "vat_source": "inventory",
    "vat_amount": 5148,
    "total_inc_vat": 25740
  }
}
```

`items` is **untouched**. Every line keeps its `price_ex_vat` and
`subtotal_ex_vat` as day rates (FR-016).

`total_ex_vat` → `subtotal_ex_vat` is a **breaking rename**, deliberately: it
means what it always meant, and the rename is what makes the compiler visit all
nine sites that show money (research.md R5).

`pricing.subtotal_ex_vat` repeats the summary's own field so the ledger is
readable from one object. `rent_factor_source` is `"none"` with `rent_factor`
`1.0` when the catalog has no rate card — which is what the strip renders in
amber.

---

## 6 · `GET /events/{id}/rental-export/report`

The LL export's report gains the pricing outcome. Principle IV: *lines that
cannot be represented faithfully MUST be reported, never silently dropped* — the
same is now true of the two cells.

```json
{
  "filename": "Hyrorder - Sommarfestivalen - 2026-08-13.xlsx",
  "placed_lines": 62,
  "unplaced_lines": [],
  "pricing_placed": true,
  "pricing_note": "this event's VAT is 12%, but LL.xlsx computes 25% — its own formulas are unchanged"
}
```

| Field | Meaning |
|---|---|
| `pricing_placed` | both `Rabatt utrustning` and `Hyresfaktor (Antal dagar)` were found and written |
| `pricing_note` | present only when there is something to say: the labels were not found, or the event's VAT disagrees with the file's |

`pricing_placed: false` never fails the export. The quantities are written as
before and the file is returned; the note is what the tab renders where it
renders unplaced lines.

---

## 7 · `Event` payload

Four fields, on both the list and the single-event routes:

```json
{
  "id": 12,
  "name": "Sommarfestivalen",
  "loadInDate": "2026-08-12",
  "startDate": "2026-08-13",
  "endDate": "2026-08-15",
  "loadOutDate": "2026-08-16",
  "chargedDays": null,
  "rentFactorOverride": null,
  "vatPercent": null,
  "discountPercent": 25,
  "inventoryId": 3
}
```

The three nullables are `omitempty` — absent and `null` both mean *follow the
catalog*. `discountPercent` is always present, because `0` is a stated fact and
the drawer's field must render it.

`POST /events` and `PATCH /events/{id}` **ignore** all four. An event is created
with the defaults and priced afterwards, which is what keeps §4 the only writer.

---

## 8 · Import result

`InventoryImportResult` is unchanged in shape. Rate-card problems arrive as
existing `warnings` strings:

```json
{
  "categories_imported": 21,
  "items_imported": 308,
  "format": "ll",
  "warnings": [
    "rent factor row 24: days \"tre\" is not a number - row skipped",
    "rent factor: days 5 appears twice; the last row wins"
  ]
}
```

A rate-card problem is **never** an `ImportValidationError`: the catalog's items
import regardless (FR-007).
