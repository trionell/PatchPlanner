-- Output signal chains: replace the flat destination/amplifier/speaker/
-- cable shape on audio_patch_outputs with an ordered chain of hops
-- (output_chain_hops), plus a per-event declared shared device
-- (output_devices) that several channels' chains can reference without
-- being double-counted. See specs/010-output-chains/research.md R1-R7.
--
-- Ordering note: the conversion (steps 1-5 below) must run AFTER the
-- audio_patch_outputs rebuild, not before. With foreign keys enforced,
-- SQLite's DROP TABLE performs an implicit "DELETE FROM" on the dropped
-- table first, which cascades through output_chain_hops.output_id's
-- ON DELETE CASCADE and would silently wipe every hop already inserted.
-- A temp snapshot of the old columns lets the conversion run safely
-- after the rebuild, once nothing referencing the old table remains.

CREATE TABLE IF NOT EXISTS output_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  inventory_item_id INTEGER REFERENCES inventory_items(id),
  owned_item_id INTEGER REFERENCES owned_items(id)
);

CREATE TABLE IF NOT EXISTS output_chain_hops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  output_id INTEGER NOT NULL REFERENCES audio_patch_outputs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  hop_kind TEXT NOT NULL DEFAULT 'device',
  cable_item_id INTEGER REFERENCES inventory_items(id),
  cable_type TEXT,
  cable_length_m REAL,
  device_source TEXT,
  inventory_item_id INTEGER REFERENCES inventory_items(id),
  owned_item_id INTEGER REFERENCES owned_items(id),
  output_device_id INTEGER REFERENCES output_devices(id),
  stagebox_id INTEGER REFERENCES stageboxes(id),
  stagebox_channel INTEGER,
  stagebox_id_b INTEGER REFERENCES stageboxes(id),
  stagebox_channel_b INTEGER,
  stage_multi_id INTEGER REFERENCES stage_multis(id),
  stage_multi_channel INTEGER,
  stage_multi_id_b INTEGER REFERENCES stage_multis(id),
  stage_multi_channel_b INTEGER
);

-- Snapshot every column the conversion below needs, before the rebuild
-- drops them from the real table.
CREATE TEMP TABLE _old_outputs AS
SELECT id, event_id, output_number, output_name, destination_type,
       stagebox_id, stagebox_channel, stagebox_id_b, stagebox_channel_b,
       stage_multi_id, stage_multi_channel, stage_multi_id_b, stage_multi_channel_b,
       amplifier_item_id, speaker_item_id, cable_item_id, cable_type, cable_length_m
FROM audio_patch_outputs;

-- Rebuild audio_patch_outputs without the now-superseded columns.
-- destination_type carries a CHECK constraint, so a direct DROP COLUMN is
-- not permitted by SQLite — same rebuild technique as migration 017.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE audio_patch_outputs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  output_number INTEGER NOT NULL,
  output_name TEXT,
  output_type TEXT DEFAULT 'foh',
  width TEXT NOT NULL DEFAULT 'mono',
  color TEXT,
  notes TEXT
);

INSERT INTO audio_patch_outputs_new (id, event_id, output_number, output_name, output_type, width, color, notes)
SELECT id, event_id, output_number, output_name, output_type, width, color, notes
FROM audio_patch_outputs;

DROP TABLE audio_patch_outputs;

ALTER TABLE audio_patch_outputs_new RENAME TO audio_patch_outputs;

-- From here on, output_chain_hops.output_id refers to the new (final)
-- audio_patch_outputs table — no further DROP TABLE on it in this
-- migration, so cascade-on-drop can no longer touch the hops we're about
-- to insert.

-- Temporary pairing column: lets each one-off migrated shared device be
-- joined back to the exact output row it came from (never deduplicated
-- across rows, so per-row rental counting stays identical). Dropped once
-- the conversion below is done.
ALTER TABLE output_devices ADD COLUMN migrated_output_id INTEGER;

-- 1. Amplifiers become one-off shared devices (never double, matching the
--    old amplifier_item_id rule) plus a hop at position 0 carrying the
--    row's cable.
INSERT INTO output_devices (event_id, name, inventory_item_id, migrated_output_id)
SELECT o.event_id,
       COALESCE(NULLIF(o.output_name, ''), 'Output ' || o.output_number) || ' amplifier',
       o.amplifier_item_id, o.id
FROM _old_outputs o
WHERE o.amplifier_item_id IS NOT NULL;

INSERT INTO output_chain_hops (output_id, position, hop_kind, device_source, output_device_id, cable_item_id, cable_type, cable_length_m)
SELECT od.migrated_output_id, 0, 'device', 'shared', od.id, o.cable_item_id, o.cable_type, o.cable_length_m
FROM output_devices od
JOIN _old_outputs o ON o.id = od.migrated_output_id;

-- 2. Speakers become plain (non-shared) device hops, doubling on stereo
--    like today's speaker_item_id. Position 1 if an amplifier hop exists
--    for this row, else 0. The legacy cable only attaches here if no
--    amplifier hop already carries it.
INSERT INTO output_chain_hops (output_id, position, hop_kind, device_source, inventory_item_id, cable_item_id, cable_type, cable_length_m)
SELECT o.id,
       CASE WHEN o.amplifier_item_id IS NOT NULL THEN 1 ELSE 0 END,
       'device', 'inventory', o.speaker_item_id,
       CASE WHEN o.amplifier_item_id IS NULL THEN o.cable_item_id END,
       CASE WHEN o.amplifier_item_id IS NULL THEN o.cable_type END,
       CASE WHEN o.amplifier_item_id IS NULL THEN o.cable_length_m END
FROM _old_outputs o
WHERE o.speaker_item_id IS NOT NULL;

-- 3. destination_type = 'stagebox' rows become a route hop, positioned
--    after any amplifier/speaker hops for that row. Legacy cable only
--    attaches here if neither an amplifier nor a speaker hop exists.
INSERT INTO output_chain_hops (output_id, position, hop_kind, stagebox_id, stagebox_channel, stagebox_id_b, stagebox_channel_b, cable_item_id, cable_type, cable_length_m)
SELECT o.id,
       (CASE WHEN o.amplifier_item_id IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN o.speaker_item_id IS NOT NULL THEN 1 ELSE 0 END),
       'route', o.stagebox_id, o.stagebox_channel, o.stagebox_id_b, o.stagebox_channel_b,
       CASE WHEN o.amplifier_item_id IS NULL AND o.speaker_item_id IS NULL THEN o.cable_item_id END,
       CASE WHEN o.amplifier_item_id IS NULL AND o.speaker_item_id IS NULL THEN o.cable_type END,
       CASE WHEN o.amplifier_item_id IS NULL AND o.speaker_item_id IS NULL THEN o.cable_length_m END
FROM _old_outputs o
WHERE o.destination_type = 'stagebox';

-- 4. destination_type = 'stage_multi' rows: same as step 3, for stage multis.
INSERT INTO output_chain_hops (output_id, position, hop_kind, stage_multi_id, stage_multi_channel, stage_multi_id_b, stage_multi_channel_b, cable_item_id, cable_type, cable_length_m)
SELECT o.id,
       (CASE WHEN o.amplifier_item_id IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN o.speaker_item_id IS NOT NULL THEN 1 ELSE 0 END),
       'route', o.stage_multi_id, o.stage_multi_channel, o.stage_multi_id_b, o.stage_multi_channel_b,
       CASE WHEN o.amplifier_item_id IS NULL AND o.speaker_item_id IS NULL THEN o.cable_item_id END,
       CASE WHEN o.amplifier_item_id IS NULL AND o.speaker_item_id IS NULL THEN o.cable_type END,
       CASE WHEN o.amplifier_item_id IS NULL AND o.speaker_item_id IS NULL THEN o.cable_length_m END
FROM _old_outputs o
WHERE o.destination_type = 'stage_multi';

-- 5. Leftover: a 'local' row with a cable (picked or legacy text) but no
--    amplifier and no speaker — a bare cable-only device hop, so nothing
--    is silently dropped.
INSERT INTO output_chain_hops (output_id, position, hop_kind, cable_item_id, cable_type, cable_length_m)
SELECT o.id, 0, 'device', o.cable_item_id, o.cable_type, o.cable_length_m
FROM _old_outputs o
WHERE o.destination_type = 'local'
  AND o.amplifier_item_id IS NULL
  AND o.speaker_item_id IS NULL
  AND (o.cable_item_id IS NOT NULL OR (o.cable_type IS NOT NULL AND o.cable_type <> '') OR o.cable_length_m IS NOT NULL);

ALTER TABLE output_devices DROP COLUMN migrated_output_id;

DROP TABLE _old_outputs;
