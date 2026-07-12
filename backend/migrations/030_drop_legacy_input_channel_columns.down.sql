-- Best-effort: recreates the dropped columns' shape only. Row data
-- converted by input_signal_graph_migration.go is not recoverable from
-- this reversal — same convention as every other lossy down-migration in
-- this project (e.g. Slice 11's 026).
ALTER TABLE input_channels ADD COLUMN signal_type TEXT DEFAULT 'mic';
ALTER TABLE input_channels ADD COLUMN preamp_connector TEXT DEFAULT 'xlr';
ALTER TABLE input_channels ADD COLUMN stagebox_id INTEGER REFERENCES stageboxes(id);
ALTER TABLE input_channels ADD COLUMN stagebox_channel INTEGER;
ALTER TABLE input_channels ADD COLUMN stage_multi_id INTEGER REFERENCES stage_multis(id);
ALTER TABLE input_channels ADD COLUMN stage_multi_channel INTEGER;
ALTER TABLE input_channels ADD COLUMN mic_item_id INTEGER REFERENCES inventory_items(id);
ALTER TABLE input_channels ADD COLUMN mic_model TEXT;
ALTER TABLE input_channels ADD COLUMN cable_item_id INTEGER REFERENCES inventory_items(id);
ALTER TABLE input_channels ADD COLUMN stand_item_id INTEGER REFERENCES inventory_items(id);
ALTER TABLE input_channels ADD COLUMN cable_type TEXT;
ALTER TABLE input_channels ADD COLUMN cable_length_m REAL;
ALTER TABLE input_channels ADD COLUMN mic_stand TEXT;
ALTER TABLE input_channels ADD COLUMN phantom_power INTEGER DEFAULT 0;
ALTER TABLE input_channels ADD COLUMN stagebox_id_b INTEGER REFERENCES stageboxes(id);
ALTER TABLE input_channels ADD COLUMN stagebox_channel_b INTEGER;
ALTER TABLE input_channels ADD COLUMN stage_multi_id_b INTEGER REFERENCES stage_multis(id);
ALTER TABLE input_channels ADD COLUMN stage_multi_channel_b INTEGER;
ALTER TABLE input_channels ADD COLUMN source_cable_item_id INTEGER REFERENCES inventory_items(id);
ALTER TABLE input_channels ADD COLUMN source_cabling TEXT NOT NULL DEFAULT 'two_cables';
