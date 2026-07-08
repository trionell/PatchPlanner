-- Best-effort downgrade: restore the CHECK constraints. Rows using
-- user-added vocabulary values will fail the copy, as inherent to
-- re-imposing the removed constraints.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE audio_patch_inputs_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  channel_number INTEGER NOT NULL,
  channel_name TEXT,
  signal_type TEXT DEFAULT 'mic' CHECK(signal_type IN ('mic','line','di','return','aux')),
  preamp_connector TEXT DEFAULT 'xlr',
  stagebox_id INTEGER REFERENCES stageboxes(id),
  stagebox_channel INTEGER,
  stage_multi_id INTEGER REFERENCES stage_multis(id),
  stage_multi_channel INTEGER,
  mic_model TEXT,
  cable_type TEXT DEFAULT 'xlr',
  cable_length_m REAL,
  mic_stand TEXT CHECK(mic_stand IN ('straight','boom','low','desk','clip','none','')),
  phantom_power INTEGER DEFAULT 0,
  dca_groups TEXT,
  notes TEXT,
  mic_item_id INTEGER REFERENCES inventory_items(id)
);

INSERT INTO audio_patch_inputs_old (
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

ALTER TABLE audio_patch_inputs_old RENAME TO audio_patch_inputs;
