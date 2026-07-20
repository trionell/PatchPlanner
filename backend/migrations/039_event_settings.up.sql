-- Slice 17: planning vocabularies move from one table shared by every
-- user and every event to two independently-scoped homes: a personal
-- template per user (reference_templates), and the event's own copy
-- (reference_values, extended with event_id). research.md R1/R2.

CREATE TABLE reference_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocabulary TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE(owner_user_id, vocabulary, value)
);

-- Rebuild reference_values: SQLite can't ALTER TABLE a unique
-- constraint, so this follows the same create-copy-drop-rename pattern
-- already used in migrations 017/018/023. event_id stays nullable — the
-- pre-existing rows (every value seeded across migrations 014/021) keep
-- NULL permanently as the shared seed source (research.md R4/R5), read
-- by both the fan-out below and by EnsureUserHasReferenceTemplate for
-- every future first login.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE reference_values_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  vocabulary TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE(event_id, vocabulary, value)
);

INSERT INTO reference_values_new (id, vocabulary, value, label)
SELECT id, vocabulary, value, label FROM reference_values;

DROP TABLE reference_values;

ALTER TABLE reference_values_new RENAME TO reference_values;

-- Pre-existing-event fan-out (research.md R4): every event that exists
-- at migration time gets its own full, independent copy of the
-- pre-migration global vocabulary — deliberately pure SQL, not a Go
-- conversion, since it depends on no runtime/login-order state (same
-- shape as 021_groups_dcas.up.sql's per-event mixer_groups seed).
INSERT INTO reference_values (event_id, vocabulary, value, label)
SELECT e.id, r.vocabulary, r.value, r.label
FROM events e
CROSS JOIN reference_values r
WHERE r.event_id IS NULL;
