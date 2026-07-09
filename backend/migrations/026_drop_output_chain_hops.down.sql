-- Best-effort: recreates the table structure only. Row data converted by
-- output_graph_migration.go is not recoverable from this reversal —
-- same convention as every other lossy down-migration in this project.
CREATE TABLE IF NOT EXISTS output_chain_hops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  output_id INTEGER NOT NULL REFERENCES audio_patch_outputs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  hop_kind TEXT NOT NULL DEFAULT 'device',
  cable_item_id INTEGER REFERENCES inventory_items(id),
  cable_item_id_b INTEGER REFERENCES inventory_items(id),
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
