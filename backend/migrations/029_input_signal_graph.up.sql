-- Audio input signal-flow graph (Slice 12), mirroring Slice 11's output
-- graph in reverse: input_sources is the graph's origin nodes (a mic on
-- a stand, or a bare line/instrument output); input_devices is the
-- Processing-zone node (a DI box, same shape as output_devices but a
-- separate table so the two independent directional graphs never share
-- a mutable resource, see specs/012-input-signal-graph/research.md R3);
-- input_cables is the graph's edges. audio_patch_inputs is renamed to
-- input_channels — its legacy source-only columns are intentionally
-- left intact here, since the one-time Go conversion
-- (db.convertLegacyInputChannels) still needs to read them before
-- migration 030 drops them.

ALTER TABLE audio_patch_inputs RENAME TO input_channels;

CREATE TABLE IF NOT EXISTS input_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  mic_item_id INTEGER REFERENCES inventory_items(id),
  stand_item_id INTEGER REFERENCES inventory_items(id),
  phantom_power INTEGER NOT NULL DEFAULT 0,
  connector_type TEXT NOT NULL,
  width TEXT NOT NULL DEFAULT 'mono',
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS input_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  inventory_item_id INTEGER REFERENCES inventory_items(id),
  owned_item_id INTEGER REFERENCES owned_items(id),
  input_port_count INTEGER NOT NULL DEFAULT 0,
  input_connector_type TEXT,
  output_port_count INTEGER NOT NULL DEFAULT 0,
  output_connector_type TEXT,
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0
);

-- UNIQUE(to_kind, to_id, to_port) is unconditional — every to_kind
-- (stagebox/stage_multi/device/channel) stays one-cable-per-port, no
-- exception (research.md's data-model.md). The from-side needs a
-- partial index instead of an inline UNIQUE, since only 'source' is
-- exempt (FR-006 — a Source's port may originate more than one cable at
-- once, mirroring the Output graph's mixer-port exemption from
-- migration 027, but decided from the start here rather than retrofitted).
CREATE TABLE IF NOT EXISTS input_cables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  from_kind TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  from_port INTEGER NOT NULL,
  to_kind TEXT NOT NULL,
  to_id INTEGER NOT NULL,
  to_port INTEGER NOT NULL,
  cable_item_id INTEGER REFERENCES inventory_items(id),
  UNIQUE(to_kind, to_id, to_port)
);

CREATE UNIQUE INDEX ux_input_cables_from_port ON input_cables(from_kind, from_id, from_port) WHERE from_kind != 'source';

INSERT INTO reference_values (vocabulary, value, label) VALUES
  ('preamp_connectors', 'mini_jack_3_5mm', '3.5mm TRS (mini-jack)');
