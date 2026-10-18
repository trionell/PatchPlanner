-- The rows attached to their event's only desk stay attached: that is what
-- the single-desk default writes on the next save anyway.
ALTER TABLE input_channels DROP COLUMN strip_pool;
ALTER TABLE event_consoles DROP COLUMN bus_mode;
ALTER TABLE event_consoles DROP COLUMN desk_model;
