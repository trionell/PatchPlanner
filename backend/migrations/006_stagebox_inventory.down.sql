-- SQLite does not support DROP COLUMN before 3.35; recreate table instead
CREATE TABLE stageboxes_new AS SELECT id, event_id, name, model, input_count, output_count, connection_type FROM stageboxes;
DROP TABLE stageboxes;
ALTER TABLE stageboxes_new RENAME TO stageboxes;
