-- Dropped in reverse order of addition. Losing where the socket box sat is the
-- only consequence: no cable, channel or output references these columns.

ALTER TABLE event_consoles DROP COLUMN local_input_position_y;
ALTER TABLE event_consoles DROP COLUMN local_input_position_x;
ALTER TABLE event_consoles DROP COLUMN local_position_y;
ALTER TABLE event_consoles DROP COLUMN local_position_x;
