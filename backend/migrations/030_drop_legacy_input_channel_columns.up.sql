-- Applied only after db.convertLegacyInputChannels has converted every
-- input_channels row's legacy fields into input_sources/input_devices/
-- input_cables rows (see internal/db/db.go's runMigrations sequencing
-- and internal/db/input_signal_graph_migration.go) — never against
-- unconverted data. None of these columns carry a CHECK constraint, so
-- this doesn't need the table-rebuild dance migration 027 needed.
ALTER TABLE input_channels DROP COLUMN signal_type;
ALTER TABLE input_channels DROP COLUMN preamp_connector;
ALTER TABLE input_channels DROP COLUMN stagebox_id;
ALTER TABLE input_channels DROP COLUMN stagebox_channel;
ALTER TABLE input_channels DROP COLUMN stage_multi_id;
ALTER TABLE input_channels DROP COLUMN stage_multi_channel;
ALTER TABLE input_channels DROP COLUMN mic_item_id;
ALTER TABLE input_channels DROP COLUMN mic_model;
ALTER TABLE input_channels DROP COLUMN cable_item_id;
ALTER TABLE input_channels DROP COLUMN stand_item_id;
ALTER TABLE input_channels DROP COLUMN cable_type;
ALTER TABLE input_channels DROP COLUMN cable_length_m;
ALTER TABLE input_channels DROP COLUMN mic_stand;
ALTER TABLE input_channels DROP COLUMN phantom_power;
ALTER TABLE input_channels DROP COLUMN stagebox_id_b;
ALTER TABLE input_channels DROP COLUMN stagebox_channel_b;
ALTER TABLE input_channels DROP COLUMN stage_multi_id_b;
ALTER TABLE input_channels DROP COLUMN stage_multi_channel_b;
ALTER TABLE input_channels DROP COLUMN source_cable_item_id;
ALTER TABLE input_channels DROP COLUMN source_cabling;
