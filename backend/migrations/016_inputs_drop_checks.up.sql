-- Rebuild audio_patch_inputs without the CHECK constraints on signal_type and
-- mic_stand: those vocabularies are now editable reference_values rows, so
-- the schema must accept user-added values. Runs inside the transaction the
-- migrate driver wraps around each file; defer_foreign_keys is the only FK
-- switch that works there (foreign_keys=OFF is a silent no-op inside a tx).
PRAGMA defer_foreign_keys = ON;

CREATE TABLE audio_patch_inputs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  channel_number INTEGER NOT NULL,
  channel_name TEXT,
  signal_type TEXT DEFAULT 'mic',
  preamp_connector TEXT DEFAULT 'xlr',
  stagebox_id INTEGER REFERENCES stageboxes(id),
  stagebox_channel INTEGER,
  stage_multi_id INTEGER REFERENCES stage_multis(id),
  stage_multi_channel INTEGER,
  mic_model TEXT,
  cable_type TEXT DEFAULT 'xlr',
  cable_length_m REAL,
  mic_stand TEXT,
  phantom_power INTEGER DEFAULT 0,
  dca_groups TEXT,
  notes TEXT,
  mic_item_id INTEGER REFERENCES inventory_items(id)
);

INSERT INTO audio_patch_inputs_new (
  id, event_id, channel_number, channel_name, signal_type, preamp_connector,
  stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel,
  mic_model, cable_type, cable_length_m, mic_stand, phantom_power,
  dca_groups, notes, mic_item_id
)
SELECT
  id, event_id, channel_number, channel_name, signal_type, preamp_connector,
  stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel,
  mic_model, cable_type, cable_length_m, mic_stand, phantom_power,
  dca_groups, notes, mic_item_id
FROM audio_patch_inputs;

DROP TABLE audio_patch_inputs;

ALTER TABLE audio_patch_inputs_new RENAME TO audio_patch_inputs;
