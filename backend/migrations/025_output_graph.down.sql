DROP TABLE output_cables;

ALTER TABLE output_devices DROP COLUMN position_y;
ALTER TABLE output_devices DROP COLUMN position_x;
ALTER TABLE output_devices DROP COLUMN output_connector_type;
ALTER TABLE output_devices DROP COLUMN output_port_count;
ALTER TABLE output_devices DROP COLUMN input_connector_type;
ALTER TABLE output_devices DROP COLUMN input_port_count;
