DROP INDEX IF EXISTS ux_output_cables_from_port;

PRAGMA defer_foreign_keys = ON;

CREATE TABLE output_cables_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  from_kind TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  from_port INTEGER NOT NULL,
  to_kind TEXT NOT NULL,
  to_id INTEGER NOT NULL,
  to_port INTEGER NOT NULL,
  cable_item_id INTEGER REFERENCES inventory_items(id),
  UNIQUE(from_kind, from_id, from_port),
  UNIQUE(to_kind, to_id, to_port)
);

-- Best-effort: a mixer port with more than one cable (only possible
-- after this migration's up.sql) cannot satisfy the old blanket UNIQUE
-- constraint. Keep only the earliest cable per (from_kind, from_id,
-- from_port) — the rest are dropped, same lossy-down-migration
-- convention as everywhere else in this project.
INSERT INTO output_cables_old (id, event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id)
SELECT id, event_id, from_kind, from_id, from_port, to_kind, to_id, to_port, cable_item_id
FROM output_cables o
WHERE o.id = (
  SELECT MIN(o2.id) FROM output_cables o2
  WHERE o2.from_kind = o.from_kind AND o2.from_id = o.from_id AND o2.from_port = o.from_port
);

DROP TABLE output_cables;
ALTER TABLE output_cables_old RENAME TO output_cables;

ALTER TABLE events DROP COLUMN output_mixer_position_y;
ALTER TABLE stage_multis DROP COLUMN position_y;
ALTER TABLE stage_multis DROP COLUMN position_x;
ALTER TABLE stageboxes DROP COLUMN position_y;
ALTER TABLE stageboxes DROP COLUMN position_x;
