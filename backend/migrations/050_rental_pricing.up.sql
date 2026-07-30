-- Slice 31. A day rate is not a price. Between the two sit a table the supplier
-- publishes, a discount somebody negotiated, and a VAT rate — and until now the
-- schema held none of them, so a festival that loads in on Wednesday and loads
-- out on Sunday was quoted at the price of a Tuesday afternoon.
--
-- Purely additive. Every column below takes a constant default, so there is no
-- data conversion and no entry needed in db.go's staged-Migrate(N) sequencing:
-- every existing row means exactly what it meant before, and every existing
-- order prices at x1.00 and 0% until a rate card arrives. That is the same
-- property migration 046 relied on.

-- The supplier's own curve: days -> multiplier. LL.xlsx publishes sixteen rows
-- of it on a sheet PatchPlanner has been opening and ignoring since Slice 2.
--
-- UNIQUE (inventory_id, days) is the domain statement that this table is ONE
-- CURVE and not a set of independent rows. Two factors for five days is not a
-- conflict to resolve at read time; it is a row that cannot exist. That is also
-- why there is no is_manual here, unlike inventory_items: an import replaces
-- this table wholesale, because a hand-typed 5-day factor and an imported one
-- are one fact disagreeing, not two things that can coexist.
CREATE TABLE inventory_rent_factors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  days         INTEGER NOT NULL,
  factor       REAL    NOT NULL,
  UNIQUE (inventory_id, days)
);

CREATE INDEX idx_inventory_rent_factors_inventory ON inventory_rent_factors(inventory_id);

-- The two answers a new catalog starts with. Read once, when a catalog is
-- CREATED, and never again — not at import. These columns are NOT NULL, so
-- there is no "unset" state an import could detect, and an import that
-- re-applied a default would silently undo the edit the catalog's own drawer
-- exists to allow. What an import applies is what the FILE states.
ALTER TABLE users ADD COLUMN default_charged_days TEXT NOT NULL DEFAULT 'onsite';
ALTER TABLE users ADD COLUMN default_vat_percent  REAL NOT NULL DEFAULT 25;

-- The supplier's terms. 'onsite' bills load-in through load-out; 'show' bills
-- the show days only. Some rental houses charge for the truck and some charge
-- for the stage, and both are ordinary.
ALTER TABLE inventories ADD COLUMN charged_days TEXT NOT NULL DEFAULT 'onsite';
ALTER TABLE inventories ADD COLUMN vat_percent  REAL NOT NULL DEFAULT 25;

-- This job's own terms. NULL on the first three means "follow the catalog",
-- exactly as NULL on the three date columns added by 046 means "derives from
-- its neighbour" — so a catalog corrected after the fact corrects every event
-- that never disagreed with it, and an event that did disagree keeps its answer.
--
-- discount_percent is the one that is NOT NULL DEFAULT 0, because there is
-- nothing above it to inherit from: a discount is a fact about a negotiation,
-- and no negotiation means none.
ALTER TABLE events ADD COLUMN charged_days         TEXT;
ALTER TABLE events ADD COLUMN rent_factor_override REAL;
ALTER TABLE events ADD COLUMN vat_percent          REAL;
ALTER TABLE events ADD COLUMN discount_percent     REAL NOT NULL DEFAULT 0;

-- No CHECK constraints, deliberately, and for 046's reason. charged_days takes
-- 'onsite' or 'show'; days is >= 1; factor is > 0; discount is 0-100; vat is
-- >= 0. All of it is enforced in internal/api, where the messages naming the
-- offending value already live. A CHECK would be a second implementation of a
-- rule that already has one.
