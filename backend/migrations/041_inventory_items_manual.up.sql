-- Slice 22: separates rows the user typed in from rows an import owns
-- (research.md R2). Imports may discontinue and overwrite the rows they
-- own; hand-entered rows are none of their business.
--
-- No backfill: every row that exists at migration time came from an
-- import, so the DEFAULT 0 is already correct for all of them.
ALTER TABLE inventory_items ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0;
