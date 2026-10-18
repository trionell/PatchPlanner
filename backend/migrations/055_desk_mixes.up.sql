-- Slice 48: mixes belong to a desk, and every connection inside a desk is a
-- route between two (kind, id, port) ports — the audio graphs' convention
-- (constitution Principle I). Today's event-level groups and DCAs move onto
-- the desks that play them, with every membership kept.

CREATE TABLE desk_mixes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- NULL only for mixes found on an event with no desk; the first desk adopts them.
  console_id INTEGER REFERENCES event_consoles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  slot INTEGER NOT NULL,
  width TEXT NOT NULL DEFAULT 'mono',
  name TEXT NOT NULL DEFAULT '',
  color TEXT
);
CREATE INDEX desk_mixes_console ON desk_mixes(console_id);

-- Port ids are polymorphic, so they carry no foreign key; deleting a channel,
-- a mix or an output clears every route naming it in the same transaction.
CREATE TABLE desk_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  console_id INTEGER REFERENCES event_consoles(id) ON DELETE CASCADE,
  src_kind TEXT NOT NULL,
  src_id INTEGER NOT NULL,
  src_port INTEGER NOT NULL DEFAULT 0,
  dst_kind TEXT NOT NULL,
  dst_id INTEGER NOT NULL,
  dst_port INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT '',
  UNIQUE (src_kind, src_id, src_port, dst_kind, dst_id, dst_port)
);
CREATE INDEX desk_routes_console ON desk_routes(console_id);

ALTER TABLE event_consoles ADD COLUMN recorder INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_consoles ADD COLUMN recorder_tracks INTEGER NOT NULL DEFAULT 0;

-- Main LR on every desk, and a waiting one on every event with no desk.
INSERT INTO desk_mixes (event_id, console_id, kind, slot, width, name)
SELECT event_id, id, 'main', 1, 'stereo', 'LR' FROM event_consoles;
INSERT INTO desk_mixes (event_id, console_id, kind, slot, width, name)
SELECT e.id, NULL, 'main', 1, 'stereo', 'LR' FROM events e
WHERE NOT EXISTS (SELECT 1 FROM event_consoles c WHERE c.event_id = e.id);

-- Where each group and DCA is copied to: every desk holding one of its
-- channels; a bus none of the desk's channels is on goes to the first desk.
CREATE TABLE _bus_copy (kind TEXT, old_id INTEGER, event_id INTEGER, console_id INTEGER, name TEXT, color TEXT, new_id INTEGER);

INSERT INTO _bus_copy (kind, old_id, event_id, console_id, name, color)
SELECT DISTINCT 'subgroup', g.id, g.event_id, c.console_id, g.name, g.color
FROM mixer_groups g
JOIN audio_input_groups ag ON ag.group_id = g.id
JOIN input_channels c ON c.id = ag.input_id
WHERE g.is_builtin = 0 AND c.console_id IS NOT NULL;
INSERT INTO _bus_copy (kind, old_id, event_id, console_id, name, color)
SELECT 'subgroup', g.id, g.event_id, (SELECT MIN(c.id) FROM event_consoles c WHERE c.event_id = g.event_id), g.name, g.color
FROM mixer_groups g
WHERE g.is_builtin = 0 AND NOT EXISTS (SELECT 1 FROM _bus_copy b WHERE b.kind = 'subgroup' AND b.old_id = g.id);

INSERT INTO _bus_copy (kind, old_id, event_id, console_id, name, color)
SELECT DISTINCT 'dca', d.id, d.event_id, c.console_id, d.name, d.color
FROM mixer_dcas d
JOIN audio_input_dcas ad ON ad.dca_id = d.id
JOIN input_channels c ON c.id = ad.input_id
WHERE c.console_id IS NOT NULL;
INSERT INTO _bus_copy (kind, old_id, event_id, console_id, name, color)
SELECT 'dca', d.id, d.event_id, (SELECT MIN(c.id) FROM event_consoles c WHERE c.event_id = d.event_id), d.name, d.color
FROM mixer_dcas d
WHERE NOT EXISTS (SELECT 1 FROM _bus_copy b WHERE b.kind = 'dca' AND b.old_id = d.id);

-- Slots in id order per desk. Every desk is Generic after 054, so width costs
-- nothing and nothing is over until a model is picked.
INSERT INTO desk_mixes (event_id, console_id, kind, slot, width, name, color)
SELECT event_id, console_id, kind,
       ROW_NUMBER() OVER (PARTITION BY event_id, console_id, kind ORDER BY old_id),
       'mono', name, color
FROM _bus_copy;
UPDATE _bus_copy SET new_id = (
  SELECT m.id FROM desk_mixes m
  WHERE m.event_id = _bus_copy.event_id AND m.console_id IS _bus_copy.console_id
    AND m.kind = _bus_copy.kind AND m.name = _bus_copy.name
);

-- Memberships: each channel to its own desk's copy. A channel on no desk of
-- an event that has desks keeps none (Slice 48: a deskless channel has no routes).
INSERT OR IGNORE INTO desk_routes (event_id, console_id, src_kind, src_id, dst_kind, dst_id)
SELECT c.event_id, c.console_id, 'channel', c.id, 'mix', m.id
FROM audio_input_groups ag
JOIN mixer_groups g ON g.id = ag.group_id AND g.is_builtin = 1
JOIN input_channels c ON c.id = ag.input_id
JOIN desk_mixes m ON m.event_id = c.event_id AND m.console_id IS c.console_id AND m.kind = 'main' AND m.slot = 1;

INSERT OR IGNORE INTO desk_routes (event_id, console_id, src_kind, src_id, dst_kind, dst_id)
SELECT c.event_id, c.console_id, 'channel', c.id, 'mix', b.new_id
FROM audio_input_groups ag
JOIN input_channels c ON c.id = ag.input_id
JOIN _bus_copy b ON b.kind = 'subgroup' AND b.old_id = ag.group_id AND b.console_id IS c.console_id;

INSERT OR IGNORE INTO desk_routes (event_id, console_id, src_kind, src_id, dst_kind, dst_id)
SELECT c.event_id, c.console_id, 'channel', c.id, 'mix', b.new_id
FROM audio_input_dcas ad
JOIN input_channels c ON c.id = ad.input_id
JOIN _bus_copy b ON b.kind = 'dca' AND b.old_id = ad.dca_id AND b.console_id IS c.console_id;

-- Today's model cannot say a group is off Main, so every subgroup feeds it.
INSERT OR IGNORE INTO desk_routes (event_id, console_id, src_kind, src_id, dst_kind, dst_id)
SELECT b.event_id, b.console_id, 'mix', b.new_id, 'mix', m.id
FROM _bus_copy b
JOIN desk_mixes m ON m.event_id = b.event_id AND m.console_id IS b.console_id AND m.kind = 'main' AND m.slot = 1
WHERE b.kind = 'subgroup';

-- Fed by only where an output's name is exactly a mix's on its desk: guessing
-- from the output type is what the user replaced.
INSERT OR IGNORE INTO desk_routes (event_id, console_id, src_kind, src_id, dst_kind, dst_id)
SELECT o.event_id, o.console_id, 'mix', m.id, 'output', o.id
FROM audio_patch_outputs o
JOIN desk_mixes m ON m.console_id = o.console_id AND m.kind IN ('main', 'subgroup')
  AND m.name = o.output_name COLLATE NOCASE
WHERE o.console_id IS NOT NULL AND COALESCE(o.output_name, '') <> '';

DROP TABLE _bus_copy;
DROP TABLE audio_input_groups;
DROP TABLE audio_input_dcas;
DROP TABLE mixer_groups;
DROP TABLE mixer_dcas;
