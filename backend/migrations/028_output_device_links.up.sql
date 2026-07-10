-- Link-out ports for destination devices: real speaker gear is very
-- often daisy-chained (a sub's "link out" jack passes the same signal on
-- to the next box; a stereo active sub might carry two independent
-- channels, each with its own link out to a different downstream
-- speaker). A link port is NOT a processing output — it never changes a
-- device's derived role (input_port_count/output_port_count still
-- decide source/processing/destination, unchanged), it's a distinct,
-- separately-addressed ("device_link" from_kind) port list a destination
-- device can additionally declare, always targeting another device's
-- ordinary input side. See specs decision: dedicated link-out port
-- count, not a repurposing of output_port_count.
ALTER TABLE output_devices ADD COLUMN link_port_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE output_devices ADD COLUMN link_connector_type TEXT;
