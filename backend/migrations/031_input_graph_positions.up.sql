-- Stageboxes and stage multis are shared nodes between the Output graph
-- (Slice 11) and the Input graph (Slice 12), but their existing
-- position_x/position_y columns were built for the Output graph alone —
-- reused as-is for the Input graph, moving a shared node in one graph
-- silently moved it in the other too. Each graph now gets its own
-- position pair; position_x/position_y keep meaning "Output graph
-- position" unchanged.
ALTER TABLE stageboxes ADD COLUMN input_position_x REAL NOT NULL DEFAULT 0;
ALTER TABLE stageboxes ADD COLUMN input_position_y REAL NOT NULL DEFAULT 0;
ALTER TABLE stage_multis ADD COLUMN input_position_x REAL NOT NULL DEFAULT 0;
ALTER TABLE stage_multis ADD COLUMN input_position_y REAL NOT NULL DEFAULT 0;
