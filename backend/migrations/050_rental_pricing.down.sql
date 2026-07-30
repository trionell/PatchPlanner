-- Reversing this loses every price the schema learned to hold: each catalog's
-- rate card in full, each supplier's charged-days rule and VAT rate, and every
-- discount and override agreed on an event. The orders themselves survive
-- untouched — they revert to quoting a five-day hire at the one-day rate, which
-- is what they did before Slice 31.
--
-- Unavoidable rather than careless: there is nowhere else in the schema for any
-- of it to go. It is the reason to rehearse this on a copy before running it
-- anywhere real.
ALTER TABLE events DROP COLUMN discount_percent;
ALTER TABLE events DROP COLUMN vat_percent;
ALTER TABLE events DROP COLUMN rent_factor_override;
ALTER TABLE events DROP COLUMN charged_days;

ALTER TABLE inventories DROP COLUMN vat_percent;
ALTER TABLE inventories DROP COLUMN charged_days;

ALTER TABLE users DROP COLUMN default_vat_percent;
ALTER TABLE users DROP COLUMN default_charged_days;

DROP INDEX IF EXISTS idx_inventory_rent_factors_inventory;
DROP TABLE inventory_rent_factors;
