-- Best-effort downgrade: restore reference_values to its pre-migration
-- shape, keeping only the shared-seed rows (event_id IS NULL) — the
-- fanned-out per-event copies can't fit back under a
-- UNIQUE(vocabulary, value) constraint (multiple events' copies of the
-- same pair would collide), so they're dropped, matching this project's
-- existing down-migration precedent of not reconstructing pre-migration
-- state beyond schema.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE reference_values_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vocabulary TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE(vocabulary, value)
);

INSERT INTO reference_values_old (id, vocabulary, value, label)
SELECT id, vocabulary, value, label FROM reference_values WHERE event_id IS NULL;

DROP TABLE reference_values;

ALTER TABLE reference_values_old RENAME TO reference_values;

DROP TABLE reference_templates;
