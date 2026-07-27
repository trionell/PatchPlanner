-- Reverses 042: the desk goes back to being one float column on events.
-- The position is copied back from each event's lowest-id console, which is
-- the row the up migration created, so a round trip preserves the original
-- value even if further consoles were added afterwards.

ALTER TABLE events ADD COLUMN output_mixer_position_y REAL NOT NULL DEFAULT 0;

UPDATE events SET output_mixer_position_y = COALESCE((
  SELECT c.position_y FROM event_consoles c
  WHERE c.event_id = events.id
  ORDER BY c.id ASC
  LIMIT 1
), 0);

ALTER TABLE input_channels DROP COLUMN console_id;
ALTER TABLE audio_patch_outputs DROP COLUMN console_id;

DROP TABLE IF EXISTS event_consoles;
