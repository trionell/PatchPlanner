# Phase 1 — Data Model

One new table, eight new columns, one migration pair (**050**). Every column has
a constant default, so every existing row means exactly what it meant before —
the same property migration 046 relied on.

## The new table

```sql
CREATE TABLE inventory_rent_factors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  days         INTEGER NOT NULL,
  factor       REAL    NOT NULL,
  UNIQUE (inventory_id, days)
);
```

`UNIQUE (inventory_id, days)` is the model's statement that **the table is a
curve**: two factors for five days is not a conflict to resolve later, it is a
row that cannot exist. `ON DELETE CASCADE` because a rate card has no meaning
without its catalog, matching every other `inventory_id` child.

No `is_manual`. See research.md R7 — an import replaces the table wholesale, so
there is no origin to record and no upsert to protect.

## The new columns

```sql
ALTER TABLE users       ADD COLUMN default_charged_days TEXT NOT NULL DEFAULT 'onsite';
ALTER TABLE users       ADD COLUMN default_vat_percent  REAL NOT NULL DEFAULT 25;

ALTER TABLE inventories ADD COLUMN charged_days TEXT NOT NULL DEFAULT 'onsite';
ALTER TABLE inventories ADD COLUMN vat_percent  REAL NOT NULL DEFAULT 25;

ALTER TABLE events      ADD COLUMN charged_days         TEXT;   -- NULL = follow the catalog
ALTER TABLE events      ADD COLUMN rent_factor_override REAL;   -- NULL = look it up
ALTER TABLE events      ADD COLUMN vat_percent          REAL;   -- NULL = follow the catalog
ALTER TABLE events      ADD COLUMN discount_percent     REAL NOT NULL DEFAULT 0;
```

**NULL means "follow the thing above me"** on the event's three, exactly as it
means "derives from its neighbour" on the event's three date columns. That is
what makes a catalog correctable after the fact: an event that never disagreed
holds no copy to become stale.

`discount_percent` is the one event column that is `NOT NULL DEFAULT 0`, because
there is nothing above it to inherit from — a discount is a fact about a
negotiation, and no negotiation means none.

**No CHECK constraints.** `charged_days` takes `'onsite'` or `'show'`, the
percentages have ranges, and all of it is enforced in the API — the same call
migration 046 made and for the same reason: a CHECK would be a second
implementation of a rule that already lives in one place.

## The cascade, resolved

| Value | Resolution order |
|---|---|
| Charged days | `events.charged_days` → `inventories.charged_days` |
| VAT % | `events.vat_percent` → `inventories.vat_percent` |
| Rent factor | `events.rent_factor_override` → the rate card, stepped down → `1.0` |
| Discount % | `events.discount_percent` |

`users.default_*` appears nowhere in this table on purpose: it is read **once**,
when an import writes to a catalog, and never again. A default that participated
in the live resolution would make every historical catalog change retroactively
when the user changed their mind.

## Derived values — stored nowhere

```
billed_days   = onsite ? loadOut - loadIn + 1 : end - start + 1     (inclusive)
              = 1 when the event has no start_date
factor        = override ?? stepDown(rateCard, billed_days) ?? 1.0
subtotal      = Σ line.subtotal_ex_vat                              (unchanged)
discounted    = subtotal - subtotal × discount/100
total_ex_vat  = discounted × factor
vat_amount    = total_ex_vat × vat/100
total_inc_vat = total_ex_vat + vat_amount
```

Both dates come from `Event.Resolve()`, which already fills every absent date
from its neighbour, so the day count needs no null handling of its own and
cannot disagree with the timeline, the dashboard or the clash sweep.

`stepDown` returns the factor of the highest row with `days ≤ billed_days`;
below the first row it returns the first row's; above the last, the last's; on an
empty card it returns nothing and the caller uses `1.0`.

## Entities

### `domain.RentFactor`

```go
type RentFactor struct {
    ID     int64   `json:"id"`
    Days   int     `json:"days"`
    Factor float64 `json:"factor"`
}
```

Ordered by `days` ascending everywhere — by the query, not by the caller, so the
lookup may assume it and the drawer renders a curve rather than an insertion log.

### `domain.InventoryPricing`

```go
type InventoryPricing struct {
    ChargedDays string       `json:"charged_days"`   // "onsite" | "show"
    VATPercent  float64      `json:"vat_percent"`
    Factors     []RentFactor `json:"factors"`
}
```

### `domain.Event` (extended)

Four fields, three of them pointers because `NULL` is a meaning here and not an
absence:

```go
ChargedDays        *string  `json:"chargedDays,omitempty"`
RentFactorOverride *float64 `json:"rentFactorOverride,omitempty"`
VATPercent         *float64 `json:"vatPercent,omitempty"`
DiscountPercent    float64  `json:"discountPercent"`
```

`DiscountPercent` is not `omitempty`: a zero discount is a stated fact and the
drawer's field has to render `0`, not empty.

### `domain.RentalPricing`

The derived block. Every field the ledger, the strip and the three exports need,
so none of them recomputes anything:

```go
type RentalPricing struct {
    BilledDays        int     `json:"billed_days"`
    ChargedDays       string  `json:"charged_days"`         // effective
    ChargedDaysSource string  `json:"charged_days_source"`  // "inventory" | "event"
    FirstDay          string  `json:"first_day,omitempty"`  // the two dates counted
    LastDay           string  `json:"last_day,omitempty"`
    RentFactor        float64 `json:"rent_factor"`
    RentFactorSource  string  `json:"rent_factor_source"`   // "table" | "override" | "none"
    RentFactorDays    int     `json:"rent_factor_days,omitempty"` // the row used
    DiscountPercent   float64 `json:"discount_percent"`
    DiscountAmount    float64 `json:"discount_amount"`
    SubtotalExVAT     float64 `json:"subtotal_ex_vat"`
    TotalExVAT        float64 `json:"total_ex_vat"`
    VATPercent        float64 `json:"vat_percent"`
    VATSource         string  `json:"vat_source"`           // "inventory" | "event"
    VATAmount         float64 `json:"vat_amount"`
    TotalIncVAT       float64 `json:"total_inc_vat"`
}
```

The three `*_source` fields are why the drawer can say *LL · the 5-day row*
rather than only *×2.20*. A number whose origin is invisible is a number nobody
will trust the first time it looks wrong.

`RentFactorDays` is the row that produced the factor, which is how the drawer
distinguishes an exact hit from a step-down: `billed_days 17, rent_factor_days
14`.

### `domain.RentalSummary` (changed)

```go
TotalExVAT float64 → SubtotalExVAT float64  `json:"subtotal_ex_vat"`
Pricing    RentalPricing                    `json:"pricing"`
```

The renamed field keeps its meaning exactly — the sum of every line's day rate —
and the rename is what forces all nine call sites to be visited (research.md R5).
`Pricing` is a value, not a pointer: every order has a price, even if the price
is ×1.00 and 0%.

### `domain.PricingDefaults`

```go
type PricingDefaults struct {
    ChargedDays string  `json:"charged_days"`
    VATPercent  float64 `json:"vat_percent"`
}
```

## Validation

Enforced in `internal/api`, returning 400 with the offending value named:

| Field | Rule |
|---|---|
| `charged_days` | `"onsite"` or `"show"`; on an event, also `null` |
| `days` | integer ≥ 1 |
| `factor` | > 0 |
| `discount_percent` | 0 ≤ n ≤ 100 |
| `vat_percent` | ≥ 0 |
| duplicate `days` | 409 via the existing `db.ErrDuplicate` |

On **import**, the same rules produce warnings rather than errors (FR-007): a
malformed factor row must never reject a 308-item price list.

## What is not modelled

- **Currency.** Everything is SEK, as it already is.
- **Labour and transport.** `Sammanställning` has rows for both; PatchPlanner
  models neither, and the factor applies to equipment only.
- **Price history.** An order states today's price. Nothing is versioned, and a
  catalog re-import changes what an old event's order says — which is already
  true of every line on it.
- **Per-line factors.** Rejected in the mockup: the line is a day rate.
- **Owned gear.** Outside pricing entirely.
