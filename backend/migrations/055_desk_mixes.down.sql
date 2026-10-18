-- Rebuilds the event-level groups and DCAs from the desks' mixes. Copies of
-- one group on two desks merge back by name; monitors, FX, matrices, mute
-- groups, Fed by and the recorder have no home there and are lost.
CREATE TABLE mixer_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  UNIQUE(event_id, name)
);
CREATE TABLE mixer_dcas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  color TEXT,
  UNIQUE(event_id, name)
);
CREATE TABLE audio_input_groups (
  input_id INTEGER NOT NULL REFERENCES input_channels(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES mixer_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (input_id, group_id)
) WITHOUT ROWID;
CREATE TABLE audio_input_dcas (
  input_id INTEGER NOT NULL REFERENCES input_channels(id) ON DELETE CASCADE,
  dca_id INTEGER NOT NULL REFERENCES mixer_dcas(id) ON DELETE CASCADE,
  PRIMARY KEY (input_id, dca_id)
) WITHOUT ROWID;

INSERT INTO mixer_groups (event_id, name, is_builtin) SELECT id, 'LR', 1 FROM events;
INSERT OR IGNORE INTO mixer_groups (event_id, name, color)
SELECT event_id, name, color FROM desk_mixes WHERE kind = 'subgroup' AND name <> '' ORDER BY id;
INSERT OR IGNORE INTO mixer_dcas (event_id, name, color)
SELECT event_id, name, color FROM desk_mixes WHERE kind = 'dca' AND name <> '' ORDER BY id;

INSERT OR IGNORE INTO audio_input_groups (input_id, group_id)
SELECT r.src_id, g.id FROM desk_routes r
JOIN desk_mixes m ON m.id = r.dst_id
JOIN mixer_groups g ON g.event_id = m.event_id AND ((m.kind = 'main' AND m.slot = 1 AND g.is_builtin = 1) OR (m.kind = 'subgroup' AND g.name = m.name))
WHERE r.src_kind = 'channel' AND r.dst_kind = 'mix';
INSERT OR IGNORE INTO audio_input_dcas (input_id, dca_id)
SELECT r.src_id, d.id FROM desk_routes r
JOIN desk_mixes m ON m.id = r.dst_id AND m.kind = 'dca'
JOIN mixer_dcas d ON d.event_id = m.event_id AND d.name = m.name
WHERE r.src_kind = 'channel' AND r.dst_kind = 'mix';

DROP TABLE desk_routes;
DROP TABLE desk_mixes;
ALTER TABLE event_consoles DROP COLUMN recorder_tracks;
ALTER TABLE event_consoles DROP COLUMN recorder;
