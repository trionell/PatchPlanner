-- Best-effort reverse of 023_output_chains: reconstructs the pre-023
-- flat destination/amplifier/speaker/cable shape from each output's
-- hops. Lossy for chains with more than one device hop, any owned-gear
-- hop, or more than one route hop — only the first hop of each relevant
-- kind (by position) survives, which is exact for every row this project
-- had before 023 shipped (none used more than one hop of any kind).

PRAGMA defer_foreign_keys = ON;

-- One row per output: its first route hop (if any) and first device hops
-- (shared vs plain), picked by position. Temporary, dropped at the end.
CREATE TEMP TABLE _first_route AS
SELECT h.output_id, h.stagebox_id, h.stagebox_channel, h.stagebox_id_b, h.stagebox_channel_b,
       h.stage_multi_id, h.stage_multi_channel, h.stage_multi_id_b, h.stage_multi_channel_b,
       h.cable_item_id, h.cable_type, h.cable_length_m
FROM output_chain_hops h
JOIN (
  SELECT output_id, MIN(position) AS pos FROM output_chain_hops WHERE hop_kind = 'route' GROUP BY output_id
) first ON first.output_id = h.output_id AND first.pos = h.position
WHERE h.hop_kind = 'route';

CREATE TEMP TABLE _first_shared AS
SELECT h.output_id, od.inventory_item_id, h.cable_item_id, h.cable_type, h.cable_length_m
FROM output_chain_hops h
JOIN output_devices od ON od.id = h.output_device_id
JOIN (
  SELECT output_id, MIN(position) AS pos FROM output_chain_hops WHERE hop_kind = 'device' AND device_source = 'shared' GROUP BY output_id
) first ON first.output_id = h.output_id AND first.pos = h.position
WHERE h.hop_kind = 'device' AND h.device_source = 'shared';

CREATE TEMP TABLE _first_plain_device AS
SELECT h.output_id, h.inventory_item_id, h.cable_item_id, h.cable_type, h.cable_length_m
FROM output_chain_hops h
JOIN (
  SELECT output_id, MIN(position) AS pos FROM output_chain_hops WHERE hop_kind = 'device' AND device_source = 'inventory' GROUP BY output_id
) first ON first.output_id = h.output_id AND first.pos = h.position
WHERE h.hop_kind = 'device' AND h.device_source = 'inventory';

CREATE TABLE audio_patch_outputs_old (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  output_number INTEGER NOT NULL,
  output_name TEXT,
  output_type TEXT DEFAULT 'foh',
  destination_type TEXT DEFAULT 'local' CHECK(destination_type IN ('local','stagebox','stage_multi')),
  stagebox_id INTEGER REFERENCES stageboxes(id),
  stagebox_channel INTEGER,
  stage_multi_id INTEGER REFERENCES stage_multis(id),
  stage_multi_channel INTEGER,
  amplifier_item_id INTEGER REFERENCES inventory_items(id),
  speaker_item_id INTEGER REFERENCES inventory_items(id),
  cable_type TEXT DEFAULT 'xlr',
  cable_length_m REAL,
  notes TEXT,
  cable_item_id INTEGER REFERENCES inventory_items(id),
  color TEXT,
  width TEXT NOT NULL DEFAULT 'mono',
  stagebox_id_b INTEGER REFERENCES stageboxes(id),
  stagebox_channel_b INTEGER,
  stage_multi_id_b INTEGER REFERENCES stage_multis(id),
  stage_multi_channel_b INTEGER
);

INSERT INTO audio_patch_outputs_old (
  id, event_id, output_number, output_name, output_type, destination_type,
  stagebox_id, stagebox_channel, stage_multi_id, stage_multi_channel,
  amplifier_item_id, speaker_item_id, cable_type, cable_length_m, notes,
  cable_item_id, color, width, stagebox_id_b, stagebox_channel_b,
  stage_multi_id_b, stage_multi_channel_b
)
SELECT
  o.id, o.event_id, o.output_number, o.output_name, o.output_type,
  CASE
    WHEN r.stagebox_id IS NOT NULL THEN 'stagebox'
    WHEN r.stage_multi_id IS NOT NULL THEN 'stage_multi'
    ELSE 'local'
  END,
  r.stagebox_id, r.stagebox_channel, r.stage_multi_id, r.stage_multi_channel,
  s.inventory_item_id, p.inventory_item_id,
  COALESCE(r.cable_type, s.cable_type, p.cable_type),
  COALESCE(r.cable_length_m, s.cable_length_m, p.cable_length_m),
  o.notes,
  COALESCE(r.cable_item_id, s.cable_item_id, p.cable_item_id),
  o.color, o.width, r.stagebox_id_b, r.stagebox_channel_b, r.stage_multi_id_b, r.stage_multi_channel_b
FROM audio_patch_outputs o
LEFT JOIN _first_route r ON r.output_id = o.id
LEFT JOIN _first_shared s ON s.output_id = o.id
LEFT JOIN _first_plain_device p ON p.output_id = o.id;

DROP TABLE _first_route;
DROP TABLE _first_shared;
DROP TABLE _first_plain_device;

DROP TABLE output_chain_hops;
DROP TABLE output_devices;
DROP TABLE audio_patch_outputs;

ALTER TABLE audio_patch_outputs_old RENAME TO audio_patch_outputs;
