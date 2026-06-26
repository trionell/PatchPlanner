-- SQLite does not support DROP COLUMN before 3.35; recreate table instead
CREATE TABLE stage_multis_new AS SELECT id, event_id, name, length_m, channels, connector_type FROM stage_multis;
DROP TABLE stage_multis;
ALTER TABLE stage_multis_new RENAME TO stage_multis;
