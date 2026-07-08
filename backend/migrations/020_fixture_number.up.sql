-- Console (GrandMA) fixture ID per rig fixture. Optional planning data:
-- no default, no backfill (existing fixtures are simply unnumbered), no
-- uniqueness constraint (duplicates are flagged in the UI, never blocked,
-- so renumbering can pass through duplicate states).
ALTER TABLE lighting_fixtures ADD COLUMN fixture_number INTEGER;
