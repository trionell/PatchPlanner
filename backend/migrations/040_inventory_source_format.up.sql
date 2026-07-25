-- Slice 22: an inventory records how it was populated, so the
-- supplier-specific export can be offered only where it was earned
-- (research.md R1). Values: 'll' (imported from an LL price list, whose
-- bytes are in source_xlsx), 'generic' (imported from the generic
-- spreadsheet format, no file retained), or NULL (created empty and/or
-- populated by hand).
--
-- Until now "has a stored template" and "was populated from the LL price
-- list" were the same statement, because the LL importer was the only
-- thing that ever wrote source_xlsx. A second importer breaks that
-- equivalence, so the distinction has to become explicit rather than
-- inferred.
ALTER TABLE inventories ADD COLUMN source_format TEXT;

-- Deterministic backfill: every existing blob came from the LL importer,
-- so this is exact and needs no per-user judgment — the same reasoning
-- that kept 038_inventory_ownership's backfill in pure SQL.
UPDATE inventories SET source_format = 'll' WHERE source_xlsx IS NOT NULL;
