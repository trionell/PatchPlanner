-- SQLite does not support DROP COLUMN before 3.35; recreate tables instead
CREATE TABLE stageboxes_new AS SELECT id, event_id, name, model, input_count, output_count, connection_type FROM stageboxes;
DROP TABLE stageboxes;
ALTER TABLE stageboxes_new RENAME TO stageboxes;

CREATE TABLE stage_multis_new AS SELECT id, event_id, name, length_m, channels, connector_type FROM stage_multis;
DROP TABLE stage_multis;
ALTER TABLE stage_multis_new RENAME TO stage_multis;
