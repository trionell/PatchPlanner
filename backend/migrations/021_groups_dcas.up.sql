CREATE TABLE IF NOT EXISTS mixer_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  UNIQUE(event_id, name)
);

CREATE TABLE IF NOT EXISTS mixer_dcas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  color TEXT,
  UNIQUE(event_id, name)
);

CREATE TABLE IF NOT EXISTS audio_input_groups (
  input_id INTEGER NOT NULL REFERENCES audio_patch_inputs(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES mixer_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (input_id, group_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS audio_input_dcas (
  input_id INTEGER NOT NULL REFERENCES audio_patch_inputs(id) ON DELETE CASCADE,
  dca_id INTEGER NOT NULL REFERENCES mixer_dcas(id) ON DELETE CASCADE,
  PRIMARY KEY (input_id, dca_id)
) WITHOUT ROWID;

-- The built-in LR main group exists on every event.
INSERT INTO mixer_groups (event_id, name, is_builtin)
SELECT id, 'LR', 1 FROM events;

-- Pre-existing channels get the same LR default new channels will get.
INSERT INTO audio_input_groups (input_id, group_id)
SELECT i.id, g.id
FROM audio_patch_inputs i
JOIN mixer_groups g ON g.event_id = i.event_id AND g.is_builtin = 1;

-- One-time conversion of the free-text dca_groups field: every trimmed,
-- non-empty comma-separated token becomes a DCA of the channel's event.
-- The NOCASE unique index makes INSERT OR IGNORE dedupe case-insensitively
-- (first-seen casing wins).
INSERT OR IGNORE INTO mixer_dcas (event_id, name)
WITH RECURSIVE split(input_id, event_id, token, rest) AS (
  SELECT id, event_id, '', COALESCE(dca_groups, '') || ','
  FROM audio_patch_inputs
  WHERE dca_groups IS NOT NULL AND TRIM(dca_groups) <> ''
  UNION ALL
  SELECT input_id, event_id,
         TRIM(substr(rest, 1, instr(rest, ',') - 1)),
         substr(rest, instr(rest, ',') + 1)
  FROM split WHERE rest <> ''
)
SELECT event_id, token FROM split WHERE token <> '';

INSERT OR IGNORE INTO audio_input_dcas (input_id, dca_id)
WITH RECURSIVE split(input_id, event_id, token, rest) AS (
  SELECT id, event_id, '', COALESCE(dca_groups, '') || ','
  FROM audio_patch_inputs
  WHERE dca_groups IS NOT NULL AND TRIM(dca_groups) <> ''
  UNION ALL
  SELECT input_id, event_id,
         TRIM(substr(rest, 1, instr(rest, ',') - 1)),
         substr(rest, instr(rest, ',') + 1)
  FROM split WHERE rest <> ''
)
SELECT s.input_id, d.id
FROM split s
JOIN mixer_dcas d ON d.event_id = s.event_id AND d.name = s.token
WHERE s.token <> '';

ALTER TABLE audio_patch_inputs DROP COLUMN dca_groups;

-- Console channel-strip colors (palette values from channel_colors).
ALTER TABLE audio_patch_inputs ADD COLUMN color TEXT;
ALTER TABLE audio_patch_outputs ADD COLUMN color TEXT;

INSERT INTO reference_values (vocabulary, value, label) VALUES
  ('channel_colors', '#ef4444', 'Red'),
  ('channel_colors', '#f97316', 'Orange'),
  ('channel_colors', '#eab308', 'Yellow'),
  ('channel_colors', '#22c55e', 'Green'),
  ('channel_colors', '#06b6d4', 'Cyan'),
  ('channel_colors', '#3b82f6', 'Blue'),
  ('channel_colors', '#a855f7', 'Purple'),
  ('channel_colors', '#9ca3af', 'Grey');
