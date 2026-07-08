-- Rebuild audio_patch_outputs without the CHECK on output_type (now an
-- editable vocabulary). The destination_type CHECK stays: local/stagebox/
-- stage_multi selects code paths, not terminology.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE audio_patch_outputs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  output_number INTEGER NOT NULL,
  output_name TEXT,
  output_type TEXT DEFAULT 'foh',
  destination_type TEXT DEFAULT 'local' CHECK(destination_type IN ('local','stagebox','stage_multi')),
  stagebox_id INTEGER REFERENCES stageboxes(id),
  stagebox_channel INTEGER,
  stage_multi_id INTEGER REFERENCES stage_multis(id),
  stage_multi_channel INTEGER,
  amplifier_item_id INTEGER REFERENCES inventory_items(id),
  speaker_item_id INTEGER REFERENCES inventory_items(id),
  cable_type TEXT DEFAULT 'xlr',
  cable_length_m REAL,
  notes TEXT
);

INSERT INTO audio_patch_outputs_new (
  id, event_id, output_number, output_name, output_type, destination_type,
  stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel,
  amplifier_item_id, speaker_item_id, cable_type, cable_length_m, notes
)
SELECT
  id, event_id, output_number, output_name, output_type, destination_type,
  stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel,
  amplifier_item_id, speaker_item_id, cable_type, cable_length_m, notes
FROM audio_patch_outputs;

DROP TABLE audio_patch_outputs;

ALTER TABLE audio_patch_outputs_new RENAME TO audio_patch_outputs;
