-- Output signal-flow graph: output_devices becomes the general Device
-- node (input/output port counts, a connector type per side, a per-event
-- canvas position); output_cables is the graph's edges — a cable
-- connects one output port to one input port, where a port is
-- identified by (kind, id, index) with kind selecting which table id
-- resolves against (mixer output channel / stagebox / stage multi /
-- device). No separate ports table: every node's port count already
-- lives on a row that exists (see specs/011-output-signal-graph/
-- research.md R2). output_chain_hops is intentionally untouched here —
-- the one-time Go conversion (db.convertOutputChainHopsToGraph) reads it
-- before migration 026 drops it.

ALTER TABLE output_devices ADD COLUMN input_port_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE output_devices ADD COLUMN input_connector_type TEXT;
ALTER TABLE output_devices ADD COLUMN output_port_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE output_devices ADD COLUMN output_connector_type TEXT;
ALTER TABLE output_devices ADD COLUMN position_x REAL NOT NULL DEFAULT 0;
ALTER TABLE output_devices ADD COLUMN position_y REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS output_cables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  from_kind TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  from_port INTEGER NOT NULL,
  to_kind TEXT NOT NULL,
  to_id INTEGER NOT NULL,
  to_port INTEGER NOT NULL,
  cable_item_id INTEGER REFERENCES inventory_items(id),
  UNIQUE(from_kind, from_id, from_port),
  UNIQUE(to_kind, to_id, to_port)
);
